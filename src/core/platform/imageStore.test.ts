import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageCache } from '../images/cache';
import { encodeRecord, responseMetadata } from '../images/records';
import { createBrowserImageStore, type ImageStore } from './imageStore';
import { createTizenImageStore, type ImageFilesystem, type ImageFileHandle } from './tizenImageStore';

const KEY = 'a'.repeat(64);
const TEMP = 'tmp-abcd';

/** Local device simulation: callback scheduling, private paths, nonblocking I/O and move publication. */
export class LocalImageFilesystem implements ImageFilesystem {
  readonly files = new Map<string, Blob>();
  readonly directories = new Set(['wgt-private']);
  failWrites = false;
  failMove = false;
  failInitialization = false;
  private missing(): never { throw Object.assign(new Error('Missing local file'), { name: 'NotFoundError' }); }
  private later<T>(operation: () => T, success: (value: T) => void, failure: (error: unknown) => void): void {
    queueMicrotask(() => { try { success(operation()); } catch (error) { failure(error); } });
  }
  openFile(path: string, mode: 'r' | 'w'): ImageFileHandle {
    if (!this.directories.has(path.slice(0, path.lastIndexOf('/')))) this.missing();
    if (mode === 'r' && !this.files.has(path)) this.missing();
    if (mode === 'w') this.files.set(path, new Blob());
    let closed = false;
    return {
      readBlobNonBlocking: (success, failure) => this.later(() => {
        if (closed) throw new Error('Closed');
        return this.files.get(path) ?? this.missing();
      }, success, failure),
      writeBlobNonBlocking: (blob, success, failure) => this.later(() => {
        if (closed || this.failWrites) throw new Error('Local disk full');
        this.files.set(path, blob);
      }, success, failure),
      closeNonBlocking: (success, failure) => this.later(() => { closed = true; }, success, failure),
    };
  }
  listDirectory(path: string, success: (names: string[]) => void, failure: (error: unknown) => void): void {
    this.later(() => {
      if (this.failInitialization) throw new Error('Storage unavailable');
      if (!this.directories.has(path)) this.missing();
      return [...this.files.keys()].filter((name) => name.startsWith(`${path}/`) && !name.slice(path.length + 1).includes('/')).map((name) => name.slice(path.length + 1));
    }, success, failure);
  }
  createDirectory(path: string, _parents: boolean, success: (path: string) => void, failure: (error: unknown) => void): void {
    this.later(() => { this.directories.add(path); return path; }, success, failure);
  }
  rename(from: string, name: string, success: (path: string) => void, failure: (error: unknown) => void): void {
    this.later(() => {
      if (this.failMove) throw new Error('Local rename failure');
      if (name.includes('/')) throw new Error('Invalid basename');
      const to = `${from.slice(0, from.lastIndexOf('/'))}/${name}`;
      if (this.files.has(to)) throw new Error('Conflicting name');
      const value = this.files.get(from) ?? this.missing();
      this.files.set(to, value);
      this.files.delete(from);
      return to;
    }, success, failure);
  }
  moveFile(from: string, directory: string, overwrite: boolean, success: (path: string) => void, failure: (error: unknown) => void): void {
    this.later(() => {
      if (!this.directories.has(directory)) this.missing();
      const to = `${directory}/${from.slice(from.lastIndexOf('/') + 1)}`;
      if (!overwrite && this.files.has(to)) throw new Error('Conflicting name');
      const value = this.files.get(from) ?? this.missing();
      this.files.set(to, value);
      this.files.delete(from);
      return to;
    }, success, failure);
  }
  deleteFile(path: string, success: (path: string) => void, failure: (error: unknown) => void): void {
    this.later(() => { if (!this.files.delete(path)) this.missing(); return path; }, success, failure);
  }
}

for (const platform of ['IndexedDB', 'Tizen simulation'] as const) {
  describe(`${platform} image storage contract`, () => {
    let create: () => ImageStore;
    let filesystem: LocalImageFilesystem | undefined;
    beforeEach(() => {
      if (platform === 'IndexedDB') {
        globalThis.indexedDB = new IDBFactory();
        create = () => createBrowserImageStore('contract');
      } else {
        filesystem = new LocalImageFilesystem();
        create = () => createTizenImageStore(filesystem!);
      }
    });
    it('publishes binary records across adapter restarts and accounts for temporary bytes', async () => {
      const store = create();
      const binary = new Blob([new Uint8Array([0, 255, 17, 0, 99])]);
      expect(await store.read(KEY)).toBeUndefined();
      await store.writeTemporary(TEMP, binary);
      expect(await store.list()).toEqual([{ key: TEMP, size: 5 }]);
      expect(await store.read(KEY)).toBeUndefined();
      await store.commit(TEMP, KEY);
      const restarted = create();
      expect(await restarted.list()).toEqual([{ key: KEY, size: 5 }]);
      expect(new Uint8Array(await (await restarted.read(KEY))!.arrayBuffer())).toEqual(new Uint8Array([0, 255, 17, 0, 99]));
    });
    it('keeps the previous record if publication fails and removes only selected cache files', async () => {
      const store = create();
      await store.writeTemporary(TEMP, new Blob(['old']));
      await store.commit(TEMP, KEY);
      await expect(store.commit('tmp-missing', KEY)).rejects.toBeDefined();
      expect(await (await store.read(KEY))!.text()).toBe('old');
      await store.writeTemporary(TEMP, new Blob(['replacement']));
      expect((await store.list()).reduce((sum, file) => sum + file.size, 0)).toBe(14);
      await store.commit(TEMP, KEY);
      expect(await (await create().read(KEY))!.text()).toBe('replacement');
      await store.remove(KEY);
      await store.remove(KEY);
      expect(await store.list()).toEqual([]);
    });
    it('retries initialization on the same adapter after temporary unavailability', async () => {
      const store = create();
      const open = vi.spyOn(indexedDB, 'open');
      if (filesystem) filesystem.failInitialization = true;
      else open.mockImplementationOnce(() => { throw new Error('Unavailable'); });
      await expect(store.list()).rejects.toThrow();
      if (filesystem) filesystem.failInitialization = false;
      expect(await store.list()).toEqual([]);
      open.mockRestore();
    });
    it('publishes metadata independently and retains the original payload across restarts', async () => {
      const store = create();
      await store.writeTemporary(TEMP, new Blob(['compressed payload']));
      await store.commit(TEMP, KEY);
      await store.writeTemporary(TEMP, new Blob(['fresh metadata']));
      await store.commitMetadata(TEMP, KEY);
      expect(await (await create().read(KEY))!.text()).toBe('compressed payload');
      expect(await (await create().readMetadata(KEY))!.text()).toBe('fresh metadata');
      expect((await store.list()).reduce((sum, file) => sum + file.size, 0)).toBe(32);
    });
  });
}

for (const platform of ['IndexedDB', 'Tizen simulation'] as const) {
  describe(`${platform} image cache recovery`, () => {
    let create: () => ImageStore;
    let filesystem: LocalImageFilesystem | undefined;
    beforeEach(() => {
      if (platform === 'IndexedDB') {
        globalThis.indexedDB = new IDBFactory();
        create = () => createBrowserImageStore('contract');
      } else {
        filesystem = new LocalImageFilesystem();
        create = () => createTizenImageStore(filesystem!);
      }
    });
    it('reconciles interrupted publication, damaged metadata and missing payloads without deleting unrelated data', async () => {
      const store = create();
      await store.writeTemporary(TEMP, new Blob(['unfinished']));
      await store.writeTemporary('tmp-bad', new Blob(['damaged index']));
      await store.commit('tmp-bad', KEY);
      if (filesystem) filesystem.files.set('wgt-private/kinotv-images/preferences', new Blob(['keep']));
      else await store.writeTemporary('preferences', new Blob(['keep']));
      const source = 'https://artwork.test/missing';
      const payload = new Blob(['payload'], { type: 'image/png' });
      const record = encodeRecord(responseMetadata(source, payload, new Headers(), 1000), payload);
      await store.writeTemporary('tmp-eeee', record.slice(0, record.size - payload.size));
      await store.commit('tmp-eeee', 'b'.repeat(64));
      const cache = createImageCache({ store: create(), transport: async () => new Response(payload), validate: async () => undefined });
      expect(await cache.usage()).toEqual({ managedBytes: 0, entries: 0, persistenceAvailable: true });
      const lease = cache.acquire(source);
      expect(await lease.ready).toMatch(/^blob:/);
      expect((await cache.usage()).entries).toBe(1);
      lease.release();
      await cache.clear();
      if (filesystem) expect(await filesystem.files.get('wgt-private/kinotv-images/preferences')!.text()).toBe('keep');
      else expect(await (await store.read('preferences'))!.text()).toBe('keep');
    });
    it('retries actual exhausted storage once, displays transient artwork and cleans interrupted files on restart', async () => {
      const store = create();
      const original = IDBObjectStore.prototype.put;
      let writes = 0;
      if (filesystem) filesystem.failWrites = true;
      else IDBObjectStore.prototype.put = function () { writes++; throw new DOMException('Full', 'QuotaExceededError'); };
      try {
        const write = vi.spyOn(store, 'writeTemporary');
        const cache = createImageCache({ store, transport: async () => new Response(new Blob(['image'], { type: 'image/png' })), validate: async () => undefined });
        const lease = cache.acquire('https://artwork.test/full');
        expect(await lease.ready).toMatch(/^blob:/);
        expect(write).toHaveBeenCalledTimes(2);
        expect(await cache.usage()).toEqual({ managedBytes: 0, entries: 0, persistenceAvailable: false });
        lease.release();
        if (!filesystem) expect(writes).toBe(2);
      } finally { IDBObjectStore.prototype.put = original; if (filesystem) filesystem.failWrites = false; }
      await store.writeTemporary(TEMP, new Blob(['interrupted']));
      const restarted = createImageCache({ store: create(), validate: async () => undefined });
      expect((await restarted.usage()).managedBytes).toBe(0);
    });
    it('persists metadata-only validation with a protected payload and recovers obsolete sidecars', async () => {
      const store = create();
      const source = 'https://artwork.test/metadata';
      const seed = createImageCache({ store, budget: 12000, validate: async () => undefined, now: () => 1000,
        transport: async () => new Response(new Uint8Array(10000), { headers: {
          'Content-Type': 'image/png', 'Cache-Control': 'max-age=0, must-revalidate', ETag: '"one"',
        } }),
      });
      const original = seed.acquire(source); await original.ready; original.release();
      const transport = vi.fn(async () => new Response(null, { status: 304, headers: { 'Cache-Control': 'max-age=3600' } }));
      const cache = createImageCache({ store, budget: 12000, validate: async () => undefined, now: () => 2000, transport });
      const lease = cache.acquire(source); expect(await lease.ready).toMatch(/^blob:/); lease.release();
      expect((await cache.usage()).managedBytes).toBeLessThanOrEqual(12000);
      const fresh = createImageCache({ store: create(), budget: 12000, validate: async () => undefined, now: () => 3000, transport });
      const hit = fresh.acquire(source); expect(await hit.ready).toMatch(/^blob:/); hit.release();
      expect(transport).toHaveBeenCalledTimes(1);
      const key = (await store.list()).find((file) => file.key.endsWith('-meta'))!.key.slice(0, -5);
      const payload = new Blob(['new representation'], { type: 'image/png' });
      await store.writeTemporary(TEMP, encodeRecord(responseMetadata(source, payload, new Headers({ 'Cache-Control': 'max-age=0, must-revalidate' }), 4000), payload));
      await store.commit(TEMP, key); // Simulate interruption before the obsolete sidecar is removed.
      const fetchNew = vi.fn(async () => new Response(payload, { headers: { 'Content-Type': 'image/png' } }));
      const recovered = createImageCache({ store: create(), budget: 12000, validate: async () => undefined, now: () => 5000, transport: fetchNew });
      const next = recovered.acquire(source); await next.ready; next.release();
      expect(fetchNew).toHaveBeenCalledTimes(1);
    });
    it('clear retries failed initialization using the same cache and storage adapter', async () => {
      const store = create();
      const open = vi.spyOn(indexedDB, 'open');
      if (filesystem) filesystem.failInitialization = true;
      else open.mockImplementation(() => { throw new Error('Temporarily unavailable'); });
      const cache = createImageCache({ store, validate: async () => undefined });
      expect((await cache.usage()).persistenceAvailable).toBe(false);
      await expect(cache.clear()).rejects.toThrow('Image cache could not be cleared');
      if (filesystem) filesystem.failInitialization = false;
      open.mockRestore();
      await cache.clear();
      expect(await cache.usage()).toEqual({ managedBytes: 0, entries: 0, persistenceAvailable: true });
    });
  });
}

it('Tizen storage failures propagate and unrelated private data remains untouched', async () => {
  const fs = new LocalImageFilesystem();
  fs.files.set('wgt-private/session', new Blob(['session']));
  const store = createTizenImageStore(fs);
  fs.failWrites = true;
  await expect(store.writeTemporary(TEMP, new Blob(['image']))).rejects.toThrow();
  fs.failWrites = false;
  await store.writeTemporary(TEMP, new Blob(['image']));
  fs.failMove = true;
  await expect(store.commit(TEMP, KEY)).rejects.toThrow();
  expect(await store.read(KEY)).toBeUndefined();
  for (const file of await store.list()) await store.remove(file.key);
  expect(await fs.files.get('wgt-private/session')!.text()).toBe('session');
  await expect(store.remove('../session')).rejects.toThrow('Invalid image file identity');
});

it('Tizen restores the old record when the publication rename fails, and recovers interrupted backups', async () => {
  const fs = new LocalImageFilesystem();
  const store = createTizenImageStore(fs);
  await store.writeTemporary(TEMP, new Blob(['old'])); await store.commit(TEMP, KEY);
  await store.writeTemporary(TEMP, new Blob(['new']));
  const rename = fs.rename.bind(fs);
  vi.spyOn(fs, 'rename').mockImplementation((path, name, ok, fail) => {
    if (path.endsWith(`/${TEMP}`)) { queueMicrotask(() => fail(new Error('Interrupted publication'))); return; }
    rename(path, name, ok, fail);
  });
  await expect(store.commit(TEMP, KEY)).rejects.toThrow('Interrupted publication');
  expect(await (await store.read(KEY))!.text()).toBe('old');
  fs.rename = rename;
  await new Promise<void>((ok, fail) => fs.rename(`wgt-private/kinotv-images/${KEY}`, `bak-${KEY}`, () => ok(), fail));
  const restarted = createTizenImageStore(fs);
  expect(await (await restarted.read(KEY))!.text()).toBe('old');
  expect((await restarted.list()).map((file) => file.key)).not.toContain(`bak-${KEY}`);
});

it('Tizen reconciles failed backup cleanup and failed rollback before retrying publication and clear', async () => {
  const fs = new LocalImageFilesystem();
  const store = createTizenImageStore(fs);
  const source = 'https://artwork.test/rollback';
  const payload = new Blob(['old'], { type: 'image/png' });
  const key = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)))]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  await store.writeTemporary(TEMP, encodeRecord(responseMetadata(source, payload, new Headers({ 'Cache-Control': 'max-age=0' }), 1000), payload));
  await store.commit(TEMP, key);
  const events: string[] = [];
  const rename = fs.rename.bind(fs);
  const remove = fs.deleteFile.bind(fs);
  vi.spyOn(fs, 'deleteFile').mockImplementation((path, ok, fail) => {
    if (path.endsWith(`/bak-${key}`) && !events.length) {
      events.push('backup delete failed'); queueMicrotask(() => fail(new Error('Delete failed'))); return;
    }
    remove(path, ok, fail);
  });
  vi.spyOn(fs, 'rename').mockImplementation((path, name, ok, fail) => {
    if (events.length === 1 && path.endsWith(`/${key}`) && name.startsWith('tmp-')) events.push('new returned to temporary');
    if (events.length === 2 && path.endsWith(`/bak-${key}`)) {
      events.push('restore failed'); queueMicrotask(() => fail(new Error('Restore failed'))); return;
    }
    rename(path, name, ok, fail);
  });
  const cache = createImageCache({ store, now: () => 2000, validate: async () => undefined,
    transport: async () => new Response(new Blob(['new'], { type: 'image/png' }), { headers: { 'Content-Type': 'image/png' } }),
  });
  const lease = cache.acquire(source);
  await lease.ready; await lease.settled;
  expect(events).toEqual(['backup delete failed', 'new returned to temporary', 'restore failed']);
  const physicalBytes = [...fs.files.values()].reduce((sum, blob) => sum + blob.size, 0);
  expect((await cache.usage()).managedBytes).toBe(physicalBytes);
  expect((await store.list()).map((file) => file.key)).toEqual([key]);
  lease.release();
  await cache.clear();
  expect(await store.list()).toEqual([]);
  expect(await store.read(key)).toBeUndefined();
  expect(await createTizenImageStore(fs).read(key)).toBeUndefined();
});

it('Tizen accounts for and clears surviving backups even while restoration keeps failing', async () => {
  const fs = new LocalImageFilesystem();
  fs.directories.add('wgt-private/kinotv-images');
  fs.files.set(`wgt-private/kinotv-images/bak-${KEY}`, new Blob(['old bytes']));
  fs.files.set(`wgt-private/kinotv-images/bak-${KEY}-meta`, new Blob(['metadata']));
  fs.failMove = true;
  const store = createTizenImageStore(fs);
  expect(await store.list()).toEqual([{ key: `bak-${KEY}`, size: 9 }, { key: `bak-${KEY}-meta`, size: 8 }]);
  // Keep failed deletions observable in usage, then retry clear with deletion restored.
  const remove = fs.deleteFile.bind(fs);
  fs.deleteFile = (_path, _ok, fail) => queueMicrotask(() => fail(new Error('Unavailable')));
  const cache = createImageCache({ store, validate: async () => undefined });
  expect((await cache.usage()).managedBytes).toBe(17);
  await expect(cache.clear()).rejects.toThrow('Image cache could not be cleared');
  fs.deleteFile = remove;
  await cache.clear();
  expect(await cache.usage()).toEqual({ managedBytes: 0, entries: 0, persistenceAvailable: true });
  fs.failMove = false;
  expect(await store.read(KEY)).toBeUndefined();
  expect(await createTizenImageStore(fs).list()).toEqual([]);
});

it('Tizen clear removes backups whose restoration recovers between enumeration and removal', async () => {
  const fs = new LocalImageFilesystem();
  fs.directories.add('wgt-private/kinotv-images');
  fs.files.set(`wgt-private/kinotv-images/bak-${KEY}`, new Blob(['old bytes']));
  fs.files.set(`wgt-private/kinotv-images/bak-${KEY}-meta`, new Blob(['metadata']));
  fs.failMove = true;
  const store = createTizenImageStore(fs);
  const remove = fs.deleteFile.bind(fs);
  fs.deleteFile = (_path, _ok, fail) => queueMicrotask(() => fail(new Error('Unavailable')));
  const cache = createImageCache({ store, validate: async () => undefined });
  expect(await cache.usage()).toEqual({ managedBytes: 17, entries: 0, persistenceAvailable: false });
  fs.deleteFile = remove;
  const list = store.list.bind(store);
  const enumerate = vi.spyOn(store, 'list').mockImplementation(async () => {
    const files = await list();
    expect(files).toEqual([{ key: `bak-${KEY}`, size: 9 }, { key: `bak-${KEY}-meta`, size: 8 }]);
    // Recovery fails during clear's enumeration, then succeeds inside its first remove.
    fs.failMove = false;
    return files;
  });
  const rename = vi.spyOn(fs, 'rename');
  const deletion = vi.spyOn(fs, 'deleteFile');
  await cache.clear();
  expect(enumerate).toHaveBeenCalledTimes(1);
  expect(rename.mock.calls.map(([path, name]) => [path, name])).toEqual([
    [`wgt-private/kinotv-images/bak-${KEY}`, KEY],
    [`wgt-private/kinotv-images/bak-${KEY}`, KEY],
    [`wgt-private/kinotv-images/bak-${KEY}-meta`, `${KEY}-meta`],
  ]);
  expect(deletion.mock.calls.length).toBeLessThanOrEqual(4);
  expect(fs.files.size).toBe(0);
  expect(await cache.usage()).toEqual({ managedBytes: 0, entries: 0, persistenceAvailable: true });
  const restarted = createTizenImageStore(fs);
  expect(await restarted.list()).toEqual([]);
  expect(await restarted.read(KEY)).toBeUndefined();
  expect(await restarted.readMetadata(KEY)).toBeUndefined();
  expect(await createImageCache({ store: restarted, validate: async () => undefined }).usage())
    .toEqual({ managedBytes: 0, entries: 0, persistenceAvailable: true });
  expect(fs.files.size).toBe(0);
});

it('IndexedDB reopens a connection that was explicitly closed', async () => {
  globalThis.indexedDB = new IDBFactory();
  const open = indexedDB.open.bind(indexedDB);
  let connection: IDBDatabase | undefined;
  vi.spyOn(indexedDB, 'open').mockImplementation((...args) => {
    const request = open(...args);
    request.addEventListener('success', () => { connection = request.result; });
    return request;
  });
  const store = createBrowserImageStore('closed');
  await store.list(); connection!.close();
  await store.writeTemporary(TEMP, new Blob(['ok']));
  expect(await (await store.read(TEMP))!.text()).toBe('ok');
});
