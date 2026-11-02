import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { api } from '../../../core/services';

const ROW_LENGTH = 40;
/** Six rows of seven posters, like the Movies and Series grids. */
const PAGE_SIZE = 42;

/** Home's Collections row: the newest curated collections, cached for 10 minutes like the catalog (spec §7.4). */
export const collectionsQuery = queryOptions({
  queryKey: ['collections', 'newest'],
  queryFn: async () => (await api.collections({ sort: 'created-', perpage: ROW_LENGTH })).items,
});

/**
 * A collection's titles, one page per request, cached for 10 minutes so Back from a title page finds every
 * page it had. Each page also carries the collection (its name). `pagination.total` counts pages.
 */
export const collectionItemsQuery = (id: number) =>
  infiniteQueryOptions({
    queryKey: ['collections', 'view', id],
    queryFn: ({ pageParam }) => api.collection(id, { page: pageParam, perpage: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last, _pages, page) => (last.items.length > 0 && page < last.pagination.total ? page + 1 : undefined),
  });
