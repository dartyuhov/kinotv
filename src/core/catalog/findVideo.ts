import type { ItemDetails, Video } from '../api/types';

/**
 * The video the player params point at (see ScreenParams['player']): a series episode for `season` +
 * `episode`, a film part for `episode` alone, and the film's first video for neither.
 */
export function findVideo(item: ItemDetails, season: number | undefined, episode: number | undefined): Video | null {
  if (season !== undefined) {
    return item.seasons?.find((s) => s.number === season)?.episodes.find((e) => e.number === episode) ?? null;
  }
  const videos = item.videos ?? [];
  return (episode === undefined ? videos[0] : videos.find((v) => v.number === episode)) ?? null;
}
