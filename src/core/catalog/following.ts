import type { WatchingMovie, WatchingSerial } from '../api/types';

/** The viewer follows (`follow`) or unfollows a series. */
export interface FollowChange {
  series: WatchingMovie;
  follow: boolean;
}

/**
 * The followed list with `change` made. Idempotent: following a followed series, or unfollowing one that
 * isn't followed, changes nothing. A newly followed series has no episode counts until the server's list
 * is fetched again.
 */
export function applyFollow(list: readonly WatchingSerial[], { series, follow }: FollowChange): WatchingSerial[] {
  const has = list.some((s) => s.id === series.id);
  if (follow) {
    if (has) return [...list];
    const { id, type, subtype, title, posters } = series;
    return [...list, { id, type, subtype, title, posters, total: 0, watched: 0, new: 0 }];
  }
  return list.filter((s) => s.id !== series.id);
}

/**
 * I Watch order (spec §4): series with new episodes first, most new episodes first. Ties keep the
 * server's order.
 */
export function newEpisodesFirst<T extends Pick<WatchingSerial, 'new'>>(serials: readonly T[]): T[] {
  return [...serials].sort((a, b) => b.new - a.new);
}

/** The followed series that have new episodes, for Home's New episodes row. */
export function withNewEpisodes<T extends Pick<WatchingSerial, 'new'>>(serials: readonly T[]): T[] {
  return newEpisodesFirst(serials).filter((s) => s.new > 0);
}
