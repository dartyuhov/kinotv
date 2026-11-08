import type { ImageStore } from './imageStore';

type Failure = (error: unknown) => void;
/** Tizen 5+ nonblocking filesystem API subset, also used by the local simulation. */
export interface ImageFileHandle {
  seekNonBlocking?(offset: number, success: (position: number) => void, failure: Failure, whence: 'END'): void;
  readBlobNonBlocking(success: (blob: Blob) => void, failure: Failure): void;
  writeBlobNonBlocking(blob: Blob, success: () => void, failure: Failure): void;
  closeNonBlocking(success: () => void, failure: Failure): void;
}
export interface ImageFilesystem {
  openFile(path: string, mode: 'r' | 'w', makeParents?: boolean): ImageFileHandle;
  listDirectory(path: string, success: (names: string[]) => void, failure: Failure): void;
  createDirectory(path: string, makeParents: boolean, success: (path: string) => void, failure: Failure): void;
  moveFile(from: string, to: string, overwrite: boolean, success: (path: string) => void, failure: Failure): void;
  rename(path: string, newName: string, success: (path: string) => void, failure: Failure): void;
  deleteFile(path: string, success: (path: string) => void, failure: Failure): void;
}

const ROOT = 'wgt-private/kinotv-images';
const validKey = (key: string) => /^(?:[a-f0-9]{64}(?:-meta)?|bak-[a-f0-9]{64}(?:-meta)?|tmp-[a-f0-9-]+)$/.test(key);
const notFound = (error: unknown) => (error as { name?: string })?.name === 'NotFoundError';
function callback<T>(start: (success: (value: T) => void, failure: Failure) => void): Promise<T> {
  return new Promise((resolve, reject) => start(resolve, reject));
}

export function createTizenImageStore(fs: ImageFilesystem): ImageStore {
  let ready: Promise<void> | undefined;
  const path = (key: string) => {
    if (!validKey(key)) throw new Error('Invalid image file identity');
    return `${ROOT}/${key}`;
  };
  function initialize(): Promise<void> {
    return ready ??= callback<string[]>((ok, fail) => fs.listDirectory(ROOT, ok, fail))
      .then(() => undefined, async (error) => {
        if (!notFound(error)) throw error;
        await callback<string>((ok, fail) => fs.createDirectory(ROOT, false, ok, fail));
      }).then(async () => {
        // An interrupted replacement leaves the old bytes under their backup name.
        const names = await callback<string[]>((ok, fail) => fs.listDirectory(ROOT, ok, fail));
        for (const backup of names.filter((name) => name.startsWith('bak-') && validKey(name))) {
          const key = backup.slice(4);
          if (names.includes(key)) await callback<string>((ok, fail) => fs.deleteFile(path(backup), ok, fail));
          else await callback<string>((ok, fail) => fs.rename(path(backup), key, ok, fail));
        }
      }).catch((error) => { ready = undefined; throw error; });
  }
  async function withHandle<T>(key: string, mode: 'r' | 'w', operation: (handle: ImageFileHandle) => Promise<T>, reconcile = true): Promise<T> {
    if (reconcile) await initialize();
    const handle = fs.openFile(path(key), mode);
    try { return await operation(handle); }
    finally { await callback<void>((ok, fail) => handle.closeNonBlocking(ok, fail)); }
  }
  const read = async (key: string): Promise<Blob | undefined> => {
    try { return await withHandle(key, 'r', (handle) => callback<Blob>((ok, fail) => handle.readBlobNonBlocking(ok, fail))); }
    catch (error) {
      if (!notFound(error)) throw error;
      // If rollback itself was interrupted, preserve read access to the old record.
      if (!key.startsWith('bak-') && !key.startsWith('tmp-')) return read(`bak-${key}`);
      return undefined;
    }
  };
  async function commit(temporary: string, key: string): Promise<void> {
    await initialize();
    const backup = `bak-${key}`;
    let replaced = false;
    try {
      await callback<string>((ok, fail) => fs.rename(path(key), backup, ok, fail));
      replaced = true;
    } catch (error) { if (!notFound(error)) throw error; }
    try {
      // rename takes a basename and refuses collisions. No unsupported overwrite semantics.
      await callback<string>((ok, fail) => fs.rename(path(temporary), key, ok, fail));
    } catch (error) {
      if (replaced) {
        try { await callback<string>((ok, fail) => fs.rename(path(backup), key, ok, fail)); }
        catch (rollback) { ready = undefined; throw rollback; }
      }
      throw error;
    }
    if (replaced) {
      try { await callback<string>((ok, fail) => fs.deleteFile(path(backup), ok, fail)); }
      catch (error) {
        // Do not report a failed replacement with the new bytes already published.
        try {
          await callback<string>((ok, fail) => fs.rename(path(key), temporary, ok, fail));
          await callback<string>((ok, fail) => fs.rename(path(backup), key, ok, fail));
        } finally {
          // Either rollback rename can fail. Reconcile before any further operation,
          // including the cache's temporary cleanup and retry on this same adapter.
          ready = undefined;
        }
        throw error;
      }
    }
  }
  return {
    async list() {
      // Failed recovery must not hide physical bytes from accounting or clear.
      try { await initialize(); } catch { /* Enumerating the directory below still reports I/O failures. */ }
      const names = await callback<string[]>((ok, fail) => fs.listDirectory(ROOT, ok, fail));
      const files = [];
      for (const key of names.filter(validKey)) {
        const size = await withHandle(key, 'r', async (handle) => {
          // Tizen 5+: the resulting END position is the byte size, without loading
          // every compressed image merely to account for managed files.
          if (handle.seekNonBlocking) return callback<number>((ok, fail) => handle.seekNonBlocking!(0, ok, fail, 'END'));
          return (await callback<Blob>((ok, fail) => handle.readBlobNonBlocking(ok, fail))).size;
        }, false);
        if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid image file size');
        files.push({ key, size });
      }
      return files;
    },
    read,
    writeTemporary: (key, blob) => withHandle(key, 'w', (handle) => callback<void>((ok, fail) => handle.writeBlobNonBlocking(blob, ok, fail))),
    commit,
    readMetadata: (key) => read(`${key}-meta`),
    commitMetadata: (temporary, key) => commit(temporary, `${key}-meta`),
    async remove(key) {
      path(key);
      try { await initialize(); } catch { /* Deletion must remain possible when a rollback rename keeps failing. */ }
      // list() reports physical backups when recovery fails. A later initialization
      // may restore them, so either identity must remove both possible locations.
      const canonical = key.startsWith('bak-') ? key.slice(4) : key;
      const keys = canonical.startsWith('tmp-') ? [canonical] : [`bak-${canonical}`, canonical];
      for (const file of keys) {
        try { await callback<string>((ok, fail) => fs.deleteFile(path(file), ok, fail)); }
        catch (error) { if (!notFound(error)) throw error; }
      }
    },
  };
}
