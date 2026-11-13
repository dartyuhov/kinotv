import { queryOptions } from '@tanstack/react-query';
import type { WatchedVideo } from '../../../core/api/client';
import type { WatchingItem, WatchingVideo } from '../../../core/api/types';
import { api, preparePlaybackSettings, watchedActions } from '../../../core/services';
import { createProgressReporter, WATCHED_AT, type ProgressReporter } from '../../../core/sync/progressReporter';
import { queryClient, watchingQuery } from '../../app/queries';
import { invalidateProgress } from '../../app/progressInvalidation';

/**
 * A video's stream links. They are signed and expire, so they are fetched each time the player opens
 * and never reused from the cache.
 */
export const mediaLinksQuery = (mediaId: number) =>
  queryOptions({
    queryKey: ['media-links', mediaId],
    queryFn: async () => { await preparePlaybackSettings(); return api.mediaLinks(mediaId); },
    staleTime: Infinity, // one fetch per player: a refetch must not reload the stream
    gcTime: 0,
  });

/**
 * The progress reporter for one video, wired to kino.watch (spec §7.5): marktime saves, the watched
 * mark at 90% (only if the server doesn't already have it, because the API toggles), and cache
 * refreshes after each write.
 */
export function startProgressSync(where: WatchedVideo, startAt: number): ProgressReporter {
  const watched = watchedActions();
  return createProgressReporter({
    startAt,
    save: (seconds) => api.markTime(where, seconds),
    markWatched: () => watched.mark(where),
    onWritten() {
      void invalidateProgress(where.id);
    },
  });
}

/**
 * Shows the new position on the title page straight away when the player closes, before the server's
 * answer comes back (the write is still in flight then).
 */
export function showSavedPosition(where: WatchedVideo, seconds: number, duration: number): void {
  queryClient.setQueryData(watchingQuery(where.id).queryKey, (old: WatchingItem | undefined) => {
    if (!old) return old;
    const update = (v: WatchingVideo): WatchingVideo =>
      v.number === where.video
        ? { ...v, time: Math.floor(seconds), status: v.status === 1 || (duration > 0 && seconds >= duration * WATCHED_AT) ? 1 : 0, updated: Math.floor(Date.now() / 1000) }
        : v;
    if (where.season === undefined) return { ...old, videos: old.videos?.map(update) };
    return { ...old, seasons: old.seasons?.map((s) => (s.number === where.season ? { ...s, episodes: s.episodes.map(update) } : s)) };
  });
}
