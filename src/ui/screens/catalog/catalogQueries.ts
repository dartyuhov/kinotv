import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import type { ItemSummary } from '../../../core/api/types';
import { itemsQuery, type CatalogFilter } from '../../../core/catalog/catalogFilter';
import { api } from '../../../core/services';

/** Six rows of seven posters: a few screens of the grid per request. */
export const CATALOG_PAGE_SIZE = 42;

/**
 * A Movies or Series grid: GET /v1/items, one page per request, cached for 10 minutes (spec §7.4) so Back
 * from a title page finds every page it had. `pagination.total` counts pages (research 10-kp-api §2.1).
 */
export const catalogItemsQuery = (filter: CatalogFilter) =>
  infiniteQueryOptions({
    queryKey: ['items', 'catalog', filter],
    queryFn: ({ pageParam }) => api.items({ ...itemsQuery(filter), page: pageParam, perpage: CATALOG_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last, _pages, page) => (last.items.length > 0 && page < last.pagination.total ? page + 1 : undefined),
  });

/**
 * The titles of every loaded page, in order. The catalog can shift between page requests, so a title can
 * come twice; it is kept once, because its id is its key.
 */
export function loadedItems(pages: readonly { items: ItemSummary[] }[] | undefined): ItemSummary[] {
  const seen = new Set<number>();
  const out: ItemSummary[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

// The filters' choices: reference lists, cached for 10 minutes like the rest of the catalog.

export const typesQuery = queryOptions({ queryKey: ['types'], queryFn: () => api.types() });

/** Genres of a type's family. GET /v1/genres takes lower-case type ids (`3d`, not `3D`). */
export const genresQuery = (type: string) =>
  queryOptions({ queryKey: ['genres', type.toLowerCase()], queryFn: () => api.genres(type.toLowerCase()) });

export const countriesQuery = queryOptions({ queryKey: ['countries'], queryFn: () => api.countries() });
