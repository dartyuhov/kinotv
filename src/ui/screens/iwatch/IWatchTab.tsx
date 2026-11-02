import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import type { ItemSummary } from '../../../core/api/types';
import { t } from '../../../core/i18n';
import { followingQuery } from '../../app/following';
import { Row } from '../../components/Row';
import { screenStack } from '../../nav/stack';
import { useRootBackdrop } from '../../root/rootBackdrop';
import { popularSeriesQuery } from './iwatchQueries';
import { renderSeriesCard } from './seriesCard';
import './IWatchTab.css';

/**
 * I Watch (spec §4): the series the viewer follows, those with new episodes first, each with a badge
 * counting them. Re-fetched whenever the tab is shown (spec §7.4). With nothing followed, it says how to
 * follow a series and suggests popular ones (spec §8, empty states).
 *
 * One row for now; the poster grid of ticket 10 can replace it.
 */
export function IWatchTab() {
  const following = useQuery(followingQuery);
  const empty = following.data?.length === 0;
  const [focused, setFocused] = useState<ItemSummary | null>(null);
  useRootBackdrop((focused ?? following.data?.[0])?.posters ?? null);

  const onItemFocus = useCallback((item: ItemSummary) => setFocused(item), []);
  const openTitle = useCallback((item: ItemSummary) => screenStack.push('title', { id: item.id }), []);

  return (
    <div className="iwatch">
      <h1 className="iwatch__title">{t('tabs.iwatch')}</h1>
      {/* Minimal on purpose: retry and recovery come with the errors ticket (18). */}
      {following.isError && <p className="iwatch__message">{t('iwatch.failed')}</p>}
      {empty ? (
        <EmptyIWatch onItemFocus={onItemFocus} onItemPress={openTitle} />
      ) : (
        <div className="iwatch__rows">
          <Row
            focusKey="iwatch:row:following"
            title={t('tabs.iwatch')}
            hideTitle
            variant="poster"
            items={following.data ?? []}
            itemKey={itemId}
            renderCard={renderSeriesCard}
            onItemFocus={onItemFocus}
            onItemPress={openTitle}
          />
        </div>
      )}
    </div>
  );
}

interface EmptyIWatchProps {
  onItemFocus(item: ItemSummary): void;
  onItemPress(item: ItemSummary): void;
}

/** Nothing followed yet: how to follow a series, and popular series to start from. */
function EmptyIWatch({ onItemFocus, onItemPress }: EmptyIWatchProps) {
  const popular = useQuery(popularSeriesQuery);
  return (
    <>
      <p className="iwatch__empty">{t('iwatch.empty')}</p>
      <p className="iwatch__hint">{t('iwatch.emptyHint')}</p>
      <div className="iwatch__rows">
        <Row
          focusKey="iwatch:row:suggestions"
          title={t('iwatch.suggestions')}
          variant="poster"
          items={popular.data ?? []}
          message={popular.isError ? t('home.rowFailed') : undefined}
          itemKey={itemId}
          renderCard={renderSeriesCard}
          onItemFocus={onItemFocus}
          onItemPress={onItemPress}
        />
      </div>
    </>
  );
}

const itemId = (item: ItemSummary) => item.id;
