import type { Posters } from '../../core/api/types';

/**
 * Which of a title's artwork URLs to load for each use (spec §6.3, §6.4). The API has no size parameters,
 * only fixed sizes: small 165×250, medium 250×375, big 500×750, and `wide` backdrop art (up to 3840×2160),
 * which can be missing.
 *
 * - `backdrop`: full-bleed hero art, bounded to the 1080p UI plane by the image cache.
 * - `landscape`: 16:9 cards. Only `wide` is landscape; a portrait poster is cropped otherwise.
 * - `poster`: medium (250×375) covers 200×300 cards and their focus enlargement,
 *   with one quarter of big's decoded memory.
 * - `tiny`: the smallest image, upscaled for frosted and blurred surfaces (see FrostedImage).
 */
export type ArtworkUse = 'backdrop' | 'landscape' | 'poster' | 'tiny';

export function artwork(posters: Posters, use: ArtworkUse): string {
  switch (use) {
    case 'backdrop':
    case 'landscape':
      return posters.wide || posters.big || posters.medium || posters.small;
    case 'poster':
      return posters.medium || posters.small || posters.big;
    case 'tiny':
      return posters.small || posters.medium || posters.big;
  }
}
