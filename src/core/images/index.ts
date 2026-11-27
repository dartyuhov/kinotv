import { createBrowserImageStore, createSelectedImageStore, type ImageStore } from '../platform/imageStore';
import { storage, type KeyValueStore } from '../platform/storage';
import { createTizenImageStore, discardTizenImageFiles, probeTizenImageStore, type ImageFilesystem } from '../platform/tizenImageStore';
import { tizen } from '../platform/tizenGlobals';
import { createImageCache, type ImageCache } from './cache';

let cache: ImageCache | undefined;
export function imageCache(): ImageCache {
  if (cache) return cache;
  const fs = tizen()?.filesystem;
  const tv = fs ? tvImageStore(fs) : undefined;
  return cache = createImageCache({ store: tv ?? createBrowserImageStore(),
    // Local browser acceptance can inject a deterministic tiny logical budget.
    ...(import.meta.env.VITE_PLAYER === 'fake' ? (globalThis as typeof globalThis & {
      __kinotvImageOptions?: { budget?: number };
    }).__kinotvImageOptions : {}) });
}


/** Remembers, per web engine (user agent), whether the TV's private files can hold the cache. */
export const IMAGE_STORE_KEY = 'kinotv:image-store';

/**
 * On the TV the cache keeps its files in the app's private directory, unless that filesystem fails the
 * probe (Tizen 6.0 does, see probeTizenImageStore). Then it uses IndexedDB, which works there, and the
 * unusable directory is removed. The probe runs once per engine version; firmware updates re-probe.
 */
export function tvImageStore(fs: ImageFilesystem, kv: KeyValueStore = storage, engine = navigator.userAgent): ImageStore & { usesFiles(): Promise<boolean> } {
  let decision: Promise<boolean> | undefined;
  const usesFiles = () => decision ??= (async () => {
    const saved = kv.get<{ engine: string; files: boolean }>(IMAGE_STORE_KEY);
    if (saved?.engine === engine) return saved.files;
    const files = await probeTizenImageStore(fs);
    kv.set(IMAGE_STORE_KEY, { engine, files });
    if (!files) await discardTizenImageFiles(fs);
    return files;
  })();
  return Object.assign(createSelectedImageStore(createTizenImageStore(fs), usesFiles, () => createBrowserImageStore()), { usesFiles });
}
