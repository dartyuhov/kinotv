import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import type { ItemSummary } from '../../../core/api/types';
import { splitTitle } from '../../../core/catalog/titles';
import { t } from '../../../core/i18n';
import { artwork } from '../../components/artwork';
import { Card, type CardSlot } from '../../components/Card';
import { Row } from '../../components/Row';
import { screenStack } from '../../nav/stack';
import { shortcutQuery } from '../home/homeQueries';
import { Keyboard } from './Keyboard';
import { searchQuery } from './searchQueries';
import { useKeyboardLayout, useSearchStore } from './searchStore';
import './SearchTab.css';

const SEARCH_FOCUS_KEY = 'search';
const KEYBOARD_FOCUS_KEY = 'search:keyboard';
/** Search runs this long after typing stops, and only from this many characters (spec §5.2). */
const DEBOUNCE_MS = 300;
const MIN_LENGTH = 2;

/**
 * Search (spec §4, §5.2): the query field, the RU/US keyboard and a row of results below it. When
 * nothing matches, a message and a "Popular right now" row instead (spec §8).
 */
export function SearchTab() {
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const setLayout = useSearchStore((s) => s.setLayout);
  const layout = useKeyboardLayout();

  const term = useDebounced(query.trim(), DEBOUNCE_MS);
  const searching = Array.from(term).length >= MIN_LENGTH;
  // While the next results load, the previous ones stay up. A superseded request is cancelled.
  const found = useQuery({ ...searchQuery(term), enabled: searching, placeholderData: keepPreviousData });
  const nothingFound = searching && !found.isPlaceholderData && found.data?.length === 0;
  const popular = useQuery({ ...shortcutQuery('popular'), enabled: nothingFound });

  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({
    focusKey: SEARCH_FOCUS_KEY,
    preferredChildFocusKey: KEYBOARD_FOCUS_KEY,
  });
  const openTitle = useCallback((item: ItemSummary) => screenStack.push('title', { id: item.id }), []);

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="search">
        <h1 className="search__heading">{t('tabs.search')}</h1>
        <div className="search__field">
          <span role="searchbox" aria-label={t('search.field')} className="search__query">
            {query}
          </span>
          <span className="search__caret" aria-hidden />
          {!query && <span className="search__placeholder">{t('search.placeholder')}</span>}
          <span className="search__badge">{layout.toUpperCase()}</span>
        </div>
        <Keyboard focusKey={KEYBOARD_FOCUS_KEY} value={query} onChange={setQuery} layout={layout} onLayoutChange={setLayout} />
        {searching && (
          <div className="search__results">
            {nothingFound ? (
              <>
                <p className="search__message">{t('search.nothing', { query: term })}</p>
                <Row
                  focusKey="search:popular"
                  title={t('search.popular')}
                  variant="poster"
                  items={popular.data ?? []}
                  message={popular.isError ? t('home.rowFailed') : undefined}
                  itemKey={itemId}
                  renderCard={renderPosterCard}
                  onItemPress={openTitle}
                />
              </>
            ) : (
              <Row
                // Per query, so each new search starts at its first result, and Back finds the one it left.
                focusKey={`search:results:${term}`}
                title={t('search.results')}
                variant="poster"
                items={found.data ?? []}
                message={found.isError ? t('search.failed') : found.data ? undefined : t('search.searching')}
                itemKey={itemId}
                renderCard={renderPosterCard}
                onItemPress={openTitle}
              />
            )}
          </div>
        )}
      </div>
    </FocusContext.Provider>
  );
}

/** `value`, once it has stopped changing for `ms`. Starts out equal to `value`, so a remount shows results at once. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(value, settled)) return;
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, settled, ms]);
  return settled;
}

const itemId = (item: ItemSummary) => item.id;

function renderPosterCard(item: ItemSummary, slot: CardSlot) {
  const { title } = splitTitle(item.title);
  return <Card {...slot} label={title} title={title} image={artwork(item.posters, 'poster')} />;
}
