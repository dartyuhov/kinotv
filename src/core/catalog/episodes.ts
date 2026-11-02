import type { ItemDetails } from '../api/types';
import { playableVideos } from './playTarget';

/** One episode of a series, by its numbers (as in the player's params and kino.watch's watching calls). */
export interface EpisodeRef {
  season: number;
  episode: number;
}

/**
 * The episode `step` places away from `at` in watching order: 1 is the next, −1 the previous. It runs
 * across seasons (after a season's last episode comes the next season's first). Null past the first or
 * last episode, for a film, or if `at` isn't one of the series' episodes.
 */
export function adjacentEpisode(item: ItemDetails, at: EpisodeRef, step: 1 | -1): EpisodeRef | null {
  const episodes = playableVideos(item);
  const here = episodes.findIndex((v) => v.season === at.season && v.number === at.episode);
  if (here < 0) return null;
  const there = episodes[here + step];
  return there && there.season !== null ? { season: there.season, episode: there.number } : null;
}
