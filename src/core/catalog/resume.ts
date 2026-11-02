import type { WatchingItem, WatchingVideo } from '../api/types';

/** Where the viewer left a title: the part or episode they watched last, and how far into it. */
export interface ResumePoint {
  /** Set for series. */
  season: number | null;
  /** Episode number for series; part number for films. */
  number: number;
  /** 0..1 of the video watched. */
  fraction: number;
}

/**
 * The most recently watched part or episode of a title (GET /v1/watching), or null if the viewer has
 * never started it.
 */
export function resumePoint(item: WatchingItem): ResumePoint | null {
  let best: { video: WatchingVideo; season: number | null } | null = null;
  const consider = (video: WatchingVideo, season: number | null) => {
    if (video.updated === null) return;
    if (!best || video.updated > (best.video.updated ?? 0)) best = { video, season };
  };
  for (const video of item.videos ?? []) consider(video, null);
  for (const season of item.seasons ?? []) for (const video of season.episodes) consider(video, season.number);
  if (!best) return null;

  const { video, season } = best as { video: WatchingVideo; season: number | null };
  const fraction = video.status === 1 ? 1 : video.duration > 0 ? Math.min(1, Math.max(0, video.time / video.duration)) : 0;
  return { season, number: video.number, fraction };
}
