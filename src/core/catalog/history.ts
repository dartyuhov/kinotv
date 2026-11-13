import type { HistoryEntry, ItemDetails, WatchingItem } from '../api/types';
import { WATCHED_AT } from '../sync/progressReporter';

/** Match by media identity in current detail data, never by title, array offset, or next-unwatched. */
export function historyTarget(item: ItemDetails, entry: HistoryEntry, watching?: WatchingItem) {
  for (const season of item.seasons ?? []) {
    const video = season.episodes.find((v) => v.id === entry.mediaId);
    if (!video) continue;
    const status = watching?.seasons?.find((s) => s.number === season.number)?.episodes.find((e) => e.number === video.number)?.status;
    return { itemId: item.id, season: season.number, episode: video.number, startAt: start(entry, video.duration, status) };
  }
  const video = item.videos?.find((v) => v.id === entry.mediaId);
  if (!video) return null;
  const status = watching?.videos?.find((v) => v.number === video.number)?.status;
  return { itemId: item.id, episode: video.number, startAt: start(entry, video.duration, status) };
}

function start(entry: HistoryEntry, duration: number, status?: number) {
  return status === 1 || (duration > 0 && entry.time >= duration * WATCHED_AT) ? 0 : entry.time;
}
