import { createBrowserImageStore } from '../platform/imageStore';
import { createTizenImageStore } from '../platform/tizenImageStore';
import { tizen } from '../platform/tizenGlobals';
import { createImageCache, type ImageCache } from './cache';

let cache: ImageCache | undefined;
export function imageCache(): ImageCache {
  return cache ??= createImageCache({ store: tizen()?.filesystem
    ? createTizenImageStore(tizen()!.filesystem!) : createBrowserImageStore(),
    // Local browser acceptance can inject a deterministic tiny logical budget.
    ...(import.meta.env.VITE_PLAYER === 'fake' ? (globalThis as typeof globalThis & {
      __kinotvImageOptions?: { budget?: number };
    }).__kinotvImageOptions : {}) });
}
