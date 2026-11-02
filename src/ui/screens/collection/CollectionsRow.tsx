import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Collection, ItemSummary } from '../../../core/api/types';
import { t } from '../../../core/i18n';
import { artwork } from '../../components/artwork';
import { Card, type CardSlot } from '../../components/Card';
import { Row } from '../../components/Row';
import { useRowMemory } from '../../components/rowMemory';
import { screenStack } from '../../nav/stack';
import { collectionsQuery } from './collectionQueries';
import { collectionGridKey } from './CollectionScreen';

export const COLLECTIONS_ROW_KEY = 'home:row:collections';

interface CollectionsRowProps {
  /**
   * A collection got focus. Receives it shaped as a title with only a name and art, for Home's hero and
   * backdrop to describe it the way they describe a focused title. Pass a stable function.
   */
  onItemFocus?(subject: ItemSummary): void;
  /** Focus has entered the row (Home scrolls its rows by it). Pass a stable function. */
  onRowFocus?(rowKey: string): void;
}

/**
 * Home's last row (spec §4): the newest curated collections, as landscape cards that show the collection's
 * name. Left out once it is known there are none; minimal message when it fails (recovery is ticket 18).
 */
export function CollectionsRow({ onItemFocus, onRowFocus }: CollectionsRowProps) {
  const query = useQuery(collectionsQuery);
  // Opened from Home, a collection starts at its first title (Back from a title page keeps its place).
  const openCollection = useCallback((collection: Collection) => {
    useRowMemory.getState().remember(collectionGridKey(collection.id), 0);
    screenStack.push('collection', { id: collection.id });
  }, []);
  const onCollectionFocus = useCallback(
    ({ id, title, posters }: Collection) => onItemFocus?.({ id, title, posters, type: '', subtype: '' }),
    [onItemFocus],
  );
  if (query.isSuccess && query.data.length === 0) return null;
  return (
    <Row
      focusKey={COLLECTIONS_ROW_KEY}
      title={t('home.collections')}
      variant="landscape"
      items={query.data ?? []}
      message={query.isError ? t('home.rowFailed') : undefined}
      itemKey={collectionId}
      renderCard={renderCollectionCard}
      onItemFocus={onCollectionFocus}
      onItemPress={openCollection}
      onRowFocus={onRowFocus}
    />
  );
}

const collectionId = (collection: Collection) => collection.id;

function renderCollectionCard(collection: Collection, slot: CardSlot) {
  return <Card {...slot} label={collection.title} title={collection.title} image={artwork(collection.posters, 'landscape')} />;
}
