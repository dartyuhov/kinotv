import { queryOptions } from '@tanstack/react-query';
import type { Shortcut } from '../../../core/api/client';
import type { ItemSummary } from '../../../core/api/types';
import { api } from '../../../core/services';

/** Films and series together, as one feed the server ranks. */
const CATALOG_TYPES = ['movie', 'serial'] as const;
const ROW_LENGTH = 40;
/** How many hot titles the hero cycles through. */
export const FEATURED_COUNT = 5;

/** New releases, Popular and the hero's featured titles: catalog data, cached for 10 minutes (spec §7.4). */
export const shortcutQuery = (kind: Shortcut) =>
  queryOptions({
    queryKey: ['items', kind, CATALOG_TYPES],
    queryFn: async () => (await api.shortcut(kind, { types: CATALOG_TYPES, perpage: ROW_LENGTH })).items,
  });

/**
 * Continue watching: unfinished films, then series the viewer has started and not finished. Personal,
 * so it is re-fetched whenever Home mounts (spec §7.4). The two lists carry no dates, so they can't be
 * merged by recency.
 */
export const continueWatchingQuery = queryOptions({
  queryKey: ['home', 'continue'],
  queryFn: async (): Promise<ItemSummary[]> => {
    const [movies, serials] = await Promise.all([api.watchingMovies(), api.watchingSerials(false)]);
    const started = serials.filter((s) => s.watched > 0 && s.watched < s.total);
    return [...movies, ...started];
  },
  staleTime: 0,
});
