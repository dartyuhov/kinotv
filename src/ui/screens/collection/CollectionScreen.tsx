import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import type { ItemSummary } from '../../../core/api/types';
import { splitTitle } from '../../../core/catalog/titles';
import { t } from '../../../core/i18n';
import { artwork } from '../../components/artwork';
import { Backdrop } from '../../components/Backdrop';
import { Card, type CardSlot } from '../../components/Card';
import { Grid } from '../../components/Grid';
import { screenStack, type ScreenParams } from '../../nav/stack';
import { loadedItems } from '../catalog/catalogQueries';
import { collectionItemsQuery } from './collectionQueries';
import './CollectionScreen.css';

// The stage is 1080 px tall; the header takes the top. Keep HEADER_HEIGHT in step with CollectionScreen.css.
const STAGE_HEIGHT = 1080;
const HEADER_HEIGHT = 184;

/** The grid of collection `id`, also the key of its focus memory. Reset it to open the collection at the top. */
export const collectionGridKey = (id: number) => `collection:${id}:grid`;

/**
 * A curated collection (spec §4): its name over a poster grid of its titles, loaded page by page, with the
 * focused title's art behind. Focus starts on the first title (the one it had, after Back from a title page).
 */
export function CollectionScreen({ params }: { params: ScreenParams['collection'] }) {
  const gridKey = collectionGridKey(params.id);
  const query = useInfiniteQuery(collectionItemsQuery(params.id));
  const items = useMemo(() => loadedItems(query.data?.pages), [query.data]);
  const name = query.data?.pages[0]?.collection.title || t('collection.title');

  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({
    focusKey: `collection:${params.id}`,
    preferredChildFocusKey: gridKey,
  });

  const [focused, setFocused] = useState<ItemSummary | null>(null);
  const backdropItem = focused ?? items[0];

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const openTitle = useCallback((item: ItemSummary) => screenStack.push('title', { id: item.id }), []);

  // Minimal on purpose: retry and recovery come with the errors ticket (18). Back still works.
  const message = query.isError
    ? t('collection.failed')
    : query.isSuccess && items.length === 0
      ? t('collection.empty')
      : undefined;

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="collection">
        {backdropItem && <Backdrop posters={backdropItem.posters} />}
        <header className="collection__header">
          <h1 className="collection__title">{name}</h1>
        </header>
        <Grid
          focusKey={gridKey}
          title={name}
          height={STAGE_HEIGHT - HEADER_HEIGHT}
          items={items}
          itemKey={itemId}
          renderCard={renderPosterCard}
          onItemFocus={setFocused}
          onItemPress={openTitle}
          message={message}
          hasMore={hasNextPage}
          onLoadMore={loadMore}
        />
      </div>
    </FocusContext.Provider>
  );
}

const itemId = (item: ItemSummary) => item.id;

function renderPosterCard(item: ItemSummary, slot: CardSlot) {
  const { title } = splitTitle(item.title);
  return <Card {...slot} label={title} title={title} image={artwork(item.posters, 'poster')} />;
}
