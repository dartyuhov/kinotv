import {
  doesFocusableExist,
  FocusContext,
  getCurrentFocusKey,
  setFocus,
  SpatialNavigation,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ItemSummary } from '../../../core/api/types';
import type { CatalogFilter, CatalogSection } from '../../../core/catalog/catalogFilter';
import { splitTitle } from '../../../core/catalog/titles';
import { t } from '../../../core/i18n';
import { artwork } from '../../components/artwork';
import { Card, type CardSlot } from '../../components/Card';
import { Grid, gridCardKey } from '../../components/Grid';
import { useRowMemory } from '../../components/rowMemory';
import { screenStack } from '../../nav/stack';
import { catalogItemsQuery, loadedItems } from './catalogQueries';
import { useCatalogStore } from './catalogStore';
import { FilterBar } from './FilterBar';
import './CatalogTab.css';

// The content region is 920 px tall (1080 minus --content-top); the header row takes the top of it.
const CONTENT_HEIGHT = 920;
const HEADER_HEIGHT = 112;

const TITLE_KEY = { movies: 'tabs.movies', series: 'tabs.series' } as const;

/**
 * The Movies or Series tab (spec §4): the title and a row of filters over a poster grid of the catalog.
 *
 * - Down from the tab bar lands in the grid (on the card it had, else the first); Up from the grid's
 *   first row reaches the filters.
 * - A new filter or sort refetches the grid from its first card and, once results are in, moves focus
 *   there (unless the viewer has moved on elsewhere meanwhile).
 * - Filters and the grid position live in stores, so they survive pushing a title page and coming back.
 */
export function CatalogTab({ section }: { section: CatalogSection }) {
  const gridKey = `${section}:grid`;
  const filter = useCatalogStore((s) => s.filters[section]);
  const query = useInfiniteQuery(catalogItemsQuery(filter));
  const items = useMemo(() => loadedItems(query.data?.pages), [query.data]);

  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({ focusKey: section, preferredChildFocusKey: gridKey });

  // After a filter change, the first card gets focus once the new results are in.
  const focusFirstCard = useRef(false);
  const onFilterChange = useCallback(
    (next: CatalogFilter) => {
      useRowMemory.getState().remember(gridKey, 0);
      useCatalogStore.getState().setFilter(section, next);
      focusFirstCard.current = true;
    },
    [gridKey, section],
  );
  const firstCardKey = query.isSuccess && items[0] ? gridCardKey(gridKey, items[0].id) : null;
  useEffect(() => {
    if (!focusFirstCard.current || !query.isSuccess) return;
    focusFirstCard.current = false;
    const current = getCurrentFocusKey();
    const stillHere = !doesFocusableExist(current) || SpatialNavigation.isDescendantOf(current, focusKey);
    if (firstCardKey && stillHere) void setFocus(firstCardKey);
  }, [query.isSuccess, firstCardKey, focusKey]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const openTitle = useCallback((item: ItemSummary) => screenStack.push('title', { id: item.id }), []);

  const title = t(TITLE_KEY[section]);
  // Minimal on purpose: retry and recovery come with the errors ticket (18).
  const message = query.isError
    ? t('catalog.failed')
    : query.isSuccess && items.length === 0
      ? t('catalog.empty')
      : undefined;

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="catalog">
        <header className="catalog__header">
          <h1 className="catalog__title">{title}</h1>
          <FilterBar section={section} filter={filter} onChange={onFilterChange} />
        </header>
        <Grid
          focusKey={gridKey}
          title={title}
          height={CONTENT_HEIGHT - HEADER_HEIGHT}
          items={items}
          itemKey={itemId}
          renderCard={renderPosterCard}
          onItemPress={openTitle}
          message={message}
          hasMore={hasNextPage}
          onLoadMore={loadMore}
        />
      </div>
    </FocusContext.Provider>
  );
}

export const MoviesTab = () => <CatalogTab section="movies" />;
export const SeriesTab = () => <CatalogTab section="series" />;

const itemId = (item: ItemSummary) => item.id;

function renderPosterCard(item: ItemSummary, slot: CardSlot) {
  const { title } = splitTitle(item.title);
  return <Card {...slot} label={title} title={title} image={artwork(item.posters, 'poster')} />;
}
