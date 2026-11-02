import type { WatchingItem, WatchingVideo } from '../api/types';

/** How far the viewer got in one episode or film part. */
export interface VideoProgress {
  /** 0..1; 1 once it is marked watched. */
  fraction: number;
  watched: boolean;
  /** Saved position in seconds. */
  time: number;
}

/** Looks up progress by season (null for films) and episode or part number; null if never started. */
export type ProgressLookup = (season: number | null, number: number) => VideoProgress | null;

/** Indexes GET /v1/watching for a title (undefined if it isn't loaded) by season and episode. */
export function progressLookup(watching: WatchingItem | undefined): ProgressLookup {
  const byKey = new Map<string, VideoProgress>();
  const add = (season: number | null, video: WatchingVideo) => {
    const progress = videoProgress(video);
    if (progress) byKey.set(`${season ?? 0}:${video.number}`, progress);
  };
  for (const video of watching?.videos ?? []) add(null, video);
  for (const season of watching?.seasons ?? []) for (const video of season.episodes) add(season.number, video);
  return (season, number) => byKey.get(`${season ?? 0}:${number}`) ?? null;
}

function videoProgress(video: WatchingVideo): VideoProgress | null {
  if (video.status === 1) return { fraction: 1, watched: true, time: video.time };
  if (video.time <= 0 || video.duration <= 0) return null;
  return { fraction: Math.min(1, video.time / video.duration), watched: false, time: video.time };
}
