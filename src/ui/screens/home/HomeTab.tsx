import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ItemSummary } from '../../../core/api/types';
import { resumePoint } from '../../../core/catalog/resume';
import { splitTitle } from '../../../core/catalog/titles';
import { t } from '../../../core/i18n';
import { withNewEpisodes } from '../../../core/catalog/following';
import { followingQuery } from '../../app/following';
import { watchingQuery } from '../../app/queries';
import { artwork } from '../../components/artwork';
import { Card, type CardSlot, type CardVariant } from '../../components/Card';
import { Row } from '../../components/Row';
import { renderSeriesCard } from '../iwatch/seriesCard';
import { screenStack } from '../../nav/stack';
import { useRootBackdrop } from '../../root/rootBackdrop';
import { Hero } from './Hero';
import { continueWatchingQuery, FEATURED_COUNT, shortcutQuery } from './homeQueries';
import { useHomeStore } from './homeStore';
import { CollectionsRow } from '../collection/CollectionsRow';
import './HomeTab.css';

const ROWS_FOCUS_KEY = 'home:rows';
const HERO_ROTATE_MS = 8_000;

interface HomeRow {
  id: string;
  title: string;
  variant: CardVariant;
  query: UseQueryResult<ItemSummary[]>;
  /** The row's own card; poster cards otherwise (Continue watching has its own too). */
  renderCard?(item: ItemSummary, slot: CardSlot): ReactNode;
}

/**
 * Home (spec §4): a hero of featured titles over full-bleed art, then rows of Continue watching, New
 * releases and Popular. While a card has focus, the hero and the backdrop describe that card's title.
 */
export function HomeTab() {
  const rows: HomeRow[] = [
    { id: 'continue', title: t('home.continue'), variant: 'landscape', query: useQuery(continueWatchingQuery) },
    {
      id: 'new',
      title: t('home.newEpisodes'),
      variant: 'poster',
      query: useQuery({ ...followingQuery, select: withNewEpisodes }),
      renderCard: renderSeriesCard,
    },
    { id: 'fresh', title: t('home.fresh'), variant: 'poster', query: useQuery(shortcutQuery('fresh')) },
    { id: 'popular', title: t('home.popular'), variant: 'poster', query: useQuery(shortcutQuery('popular')) },
  ];
  // Nothing to continue: no row at all, rather than an empty one.
  const shown = rows.filter((row) => !(row.id === 'continue' && row.query.data?.length === 0));
  // New episodes only shows when there are some (not while loading, nor when the list failed).
  const shownRows = shown.filter((row) => row.id !== 'new' || (row.query.data?.length ?? 0) > 0);

  const featured = useQuery(shortcutQuery('hot')).data?.slice(0, FEATURED_COUNT) ?? [];
  const heroIndex = useHomeStore((s) => s.heroIndex) % Math.max(1, featured.length);
  const featuredItem = featured[heroIndex];

  // The focused card's title, while focus is in the rows.
  const [focusedItem, setFocusedItem] = useState<ItemSummary | null>(null);
  const [inRows, setInRows] = useState(false);
  const subject = (inRows && focusedItem) || featuredItem;
  useRootBackdrop(subject?.posters ?? null);

  // The hero cycles its featured titles while it has focus or Home is idle (focus on the tab bar), never
  // while the viewer browses the rows. Coming back up restarts the wait.
  const featuredCount = featured.length;
  useEffect(() => {
    if (inRows || featuredCount < 2) return;
    const timer = setInterval(() => {
      useHomeStore.setState((s) => ({ heroIndex: (s.heroIndex + 1) % featuredCount }));
    }, HERO_ROTATE_MS);
    return () => clearInterval(timer);
  }, [inRows, featuredCount]);

  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({
    focusKey: ROWS_FOCUS_KEY,
    onFocus: () => setInRows(true),
    onBlur: () => setInRows(false),
  });
  const openTitle = useCallback((item: ItemSummary) => screenStack.push('title', { id: item.id }), []);
  const openFeatured = useCallback(() => featuredItem && openTitle(featuredItem), [featuredItem, openTitle]);
  const onItemFocus = useCallback((item: ItemSummary) => setFocusedItem(item), []);
  const onRowFocus = useCallback((rowKey: string) => useHomeStore.setState({ activeRow: rowKey }), []);
  const { trackRef, offsetY, animate } = useRowsScroll(shownRows.map((row) => row.id).join());

  return (
    <div className="home">
      <Hero
        item={subject}
        featuredCount={featured.length}
        index={heroIndex}
        showingCard={subject !== featuredItem}
        // Both open the title page for now: playback (ticket 06) and the bookmark folder picker (ticket 12)
        // aren't built yet, and the title page is where both will live too.
        onPlay={openFeatured}
        onBookmark={openFeatured}
      />
      <FocusContext.Provider value={focusKey}>
        <div ref={ref} className="home__rows">
          <div
            ref={trackRef}
            className={animate ? 'home__rows-track home__rows-track--animated' : 'home__rows-track'}
            style={{ transform: `translate3d(0, ${-offsetY}px, 0)` }}
          >
            {shownRows.map((row) => (
              <Row
                key={row.id}
                focusKey={`home:row:${row.id}`}
                title={row.title}
                variant={row.variant}
                items={row.query.data ?? []}
                // Minimal on purpose: retry and recovery per row come with the errors ticket (18).
                message={row.query.isError ? t('home.rowFailed') : undefined}
                itemKey={itemId}
                renderCard={row.renderCard ?? (row.id === 'continue' ? renderContinueCard : renderPosterCard)}
                onItemFocus={onItemFocus}
                onItemPress={openTitle}
                onRowFocus={onRowFocus}
              />
            ))}
            <CollectionsRow onItemFocus={onItemFocus} onRowFocus={onRowFocus} />
          </div>
        </div>
      </FocusContext.Provider>
    </div>
  );
}

/**
 * Vertical scroll of the rows: the active row (from the Home store) sits at the top of the rows' area.
 * The offset follows from which row is active, so a remounted Home (Back) comes back scrolled the same
 * way, without animating to it. `layout` changes when rows appear or disappear.
 */
function useRowsScroll(layout: string) {
  const activeRow = useHomeStore((s) => s.activeRow);
  const trackRef = useRef<HTMLDivElement>(null);
  const settled = useRef(false);
  const [scroll, setScroll] = useState({ offsetY: 0, animate: false });
  useLayoutEffect(() => {
    const el = activeRow ? trackRef.current?.querySelector<HTMLElement>(`[data-row="${activeRow}"]`) : null;
    const offsetY = el?.offsetTop ?? 0;
    const animate = settled.current;
    settled.current = true;
    setScroll((prev) => (prev.offsetY === offsetY ? prev : { offsetY, animate }));
  }, [activeRow, layout]);
  return { trackRef, ...scroll };
}

const itemId = (item: ItemSummary) => item.id;

function renderPosterCard(item: ItemSummary, slot: CardSlot) {
  const { title } = splitTitle(item.title);
  return <Card {...slot} label={title} title={title} image={artwork(item.posters, 'poster')} />;
}

function renderContinueCard(item: ItemSummary, slot: CardSlot) {
  return <ContinueCard item={item} slot={slot} />;
}

/** A Continue watching card: where the viewer stopped, loaded per card as it is rendered. */
function ContinueCard({ item, slot }: { item: ItemSummary; slot: CardSlot }) {
  const { data } = useQuery(watchingQuery(item.id));
  const resume = data ? resumePoint(data) : null;
  const { title } = splitTitle(item.title);
  const episode = resume?.season ? t('card.episode', { season: resume.season, episode: resume.number }) : undefined;
  return (
    <Card
      {...slot}
      label={episode ? `${title}, ${episode}` : title}
      title={title}
      subtitle={episode}
      image={artwork(item.posters, 'landscape')}
      progress={resume?.fraction}
    />
  );
}
