import { tizen } from './tizenGlobals';

const ROOT = 'wgt-private-tmp/kinotv-subtitles';
const MAX_BYTES = 2 * 1024 * 1024;
const activeFiles = new Set<string>();
type Failure = (error: unknown) => void;
const callback = <T>(start: (ok: (value: T) => void, fail: Failure) => void) => new Promise<T>(start);

/** Private temporary files, separate from the artwork cache. Only this namespace is ever cleaned. */
export function createSubtitleFiles() {
  const fs = tizen()?.filesystem;
  let ready: Promise<void> | undefined;
  const paths = new Set<string>();
  let disposed = false;
  const remove = async (path: string) => {
    if (!fs) return;
    try { await callback<string>((ok, fail) => fs.deleteFile(path, ok, fail)); paths.delete(path); activeFiles.delete(path); } catch { /* retry on disposal/next startup */ }
  };
  const initialize = () => ready ??= (async () => {
    if (!fs?.toURI) throw new Error('Subtitle storage unavailable');
    try { await callback<string[]>((ok, fail) => fs.listDirectory(ROOT, ok, fail)); }
    catch (error) {
      if ((error as { name?: string }).name !== 'NotFoundError') throw error;
      await callback<string>((ok, fail) => fs.createDirectory(ROOT, false, ok, fail));
    }
    // Recover leftovers from an interrupted app; names are generated locally, never from a URL.
    const names = await callback<string[]>((ok, fail) => fs.listDirectory(ROOT, ok, fail));
    for (const name of names.filter((name) => /^subtitle-[a-f0-9-]+\.(srt|vtt|ttml)$/.test(name))) {
      const path = `${ROOT}/${name}`;
      if (!activeFiles.has(path)) await remove(path);
    }
  })();
  return {
    available: Boolean(fs?.toURI),
    async download(url: string, signal: AbortSignal): Promise<{ path: string; retain(): void; release(): Promise<void> }> {
      if (!fs || disposed || !/^https?:\/\//i.test(url)) throw new Error('Subtitle unavailable');
      await initialize();
      signal.throwIfAborted();
      const response = await fetch(url, { signal, credentials: 'omit' });
      if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) throw new Error('Subtitle download failed');
      const reader = response.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) throw new Error('Subtitle too large');
          chunks.push(new Uint8Array(value));
        }
      } finally { await reader.cancel().catch(() => undefined); }
      if (size === 0 || disposed) throw new Error('Subtitle unavailable');
      signal.throwIfAborted();
      const extension = new URL(url).pathname.match(/\.(srt|vtt|ttml)$/i)?.[1]?.toLowerCase();
      if (!extension) throw new Error('Unsupported subtitle format');
      const path = `${ROOT}/subtitle-${crypto.randomUUID()}.${extension}`;
      paths.add(path);
      activeFiles.add(path);
      try {
        const handle = fs.openFile(path, 'w', true);
        try { await callback<void>((ok, fail) => handle.writeBlobNonBlocking(new Blob(chunks), ok, fail)); }
        finally { await callback<void>((ok, fail) => handle.closeNonBlocking(ok, fail)); }
        signal.throwIfAborted();
        if (disposed) throw new Error('Subtitle unavailable');
        // Samsung filesystem.toURI resolves virtual paths. AVPlay requires the native absolute path.
        const uri = new URL(fs.toURI!(path));
        if (uri.protocol !== 'file:' || uri.host) throw new Error('Subtitle path unavailable');
        return { path: decodeURIComponent(uri.pathname), retain: () => { paths.delete(path); }, release: () => remove(path) };
      } catch { await remove(path); throw new Error('Subtitle preparation failed'); }
    },
    async dispose() { disposed = true; await Promise.all([...paths].map(remove)); },
  };
}
