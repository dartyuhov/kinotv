import type { ItemDetails, WatchingItem } from '../api/types';
import { resumePoint } from './resume';

/** What Play/Resume on a title page plays. The same shape as the player screen's params, minus the item. */
export interface PlayTarget {
  /** Series only. */
  season?: number;
  /** The episode for series; the part for films with more than one. Left out for a one-part film. */
  episode?: number;
  /** Seconds into the video. */
  startAt: number;
  /** True when it continues a video the viewer stopped part-way through (Resume rather than Play). */
  resume: boolean;
}

/** One playable video of a title, in watching order. */
export interface PlayableVideo {
  season: number | null;
  number: number;
}

/** A title's videos in watching order: a film's parts, or every episode season by season. */
export function playableVideos(item: ItemDetails): PlayableVideo[] {
  if (item.seasons) {
    return item.seasons.flatMap((season) => season.episodes.map((e) => ({ season: season.number, number: e.number })));
  }
  return (item.videos ?? []).map((v) => ({ season: null, number: v.number }));
}

/**
 * Where Play/Resume starts (spec §4): the video the viewer last stopped part-way through, at its saved
 * position; after a finished video, the next one from the start; otherwise the first video.
 * `watching` is GET /v1/watching for the title, or undefined if it couldn't be loaded.
 */
export function playTarget(item: ItemDetails, watching: WatchingItem | undefined): PlayTarget {
  const videos = playableVideos(item);
  const point = watching ? resumePoint(watching) : null;
  const at = point ? videos.findIndex((v) => v.season === point.season && v.number === point.number) : -1;

  if (point && at >= 0 && point.fraction < 1 && point.time > 0) return target(videos, at, point.time, true);
  if (at >= 0 && at + 1 < videos.length) return target(videos, at + 1, 0, false);
  return target(videos, 0, 0, false);
}

function target(videos: PlayableVideo[], index: number, startAt: number, resume: boolean): PlayTarget {
  const video = videos[index];
  if (!video) return { startAt: 0, resume: false };
  if (video.season !== null) return { season: video.season, episode: video.number, startAt, resume };
  return videos.length > 1 ? { episode: video.number, startAt, resume } : { startAt, resume };
}
