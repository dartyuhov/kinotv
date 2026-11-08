import {
  FocusContext,
  getCurrentFocusKey,
  setFocus,
  useFocusable,
  type Direction,
  type NextFocusResolver,
} from '@noriginmedia/norigin-spatial-navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { remoteBus } from '../../core/input/remoteBus';
import { CARD_SIZE, type CardSlot, type CardVariant } from './Card';
import { useRowMemory } from './rowMemory';
import './Grid.css';

// Layout in 1080p logical pixels; keep in step with Grid.css and --card-gap / --screen-gutter in tokens.css.
const STAGE_WIDTH = 1920;
const GUTTER = 96;
const GAP = 32;
const ROW_GAP = 48;
/** Room above and below the cards for the focused card's scale and lift (.grid__track margin). */
const EDGE = 28;

/** Focus key of the card for `itemKey` in the grid `gridKey`: `<gridKey>:<itemKey>`, e.g. `movies:grid:123`. */
export const gridCardKey = (gridKey: string, itemKey: string | number) => `${gridKey}:${itemKey}`;

export interface GridProps<T> {
  /** Stable focus key, e.g. `movies:grid`. Also keys the grid's focus memory (useRowMemory). */
  focusKey: string;
  /** Names the grid's region. */
  title: string;
  variant?: CardVariant;
  /** Height of the grid's viewport, in logical pixels. */
  height: number;
  items: readonly T[];
  /** Unique in the grid and stable across pages and refetches, e.g. the item id. */
  itemKey(item: T): string | number;
  /** Renders one card: spread `slot` onto <Card>. */
  renderCard(item: T, slot: CardSlot): ReactNode;
  onItemFocus?(item: T, index: number): void;
  onItemPress(item: T, index: number): void;
  /** Shown instead of the cards, e.g. when the list failed to load or is empty. */
  message?: string;
  /** More items can be loaded (a paged query has a next page). */
  hasMore?: boolean;
  /**
   * Asks for the next page. Called while `hasMore` once focus is within a screen of rows of the end, and
   * again on later moves, so ignore calls while a page is on its way.
   */
  onLoadMore?(): void;
}

/**
 * A virtualised grid of cards, fed page by page (spec §4, §6.3).
 *
 * - Focus: every card is a direct child of one focus container, and arrows move by index (Up/Down keep
 *   the column), so moving never measures the cards (research 40-norigin §6.6). Up from the first row and
 *   Left/Right at the edges leave the grid for whatever is beside it.
 * - Memory: the focused index is kept in useRowMemory under the grid's key, so the grid comes back to the
 *   same card, scrolled the same way, after Back from a pushed screen. Reset it with
 *   `useRowMemory.getState().remember(key, 0)`.
 * - Scroll follows from the index alone: the focused card's row is at the top of the viewport.
 * - Only the rows on screen plus a screen of rows either side are rendered. Cards are placed with
 *   `left`/`top`, not transforms.
 * - Paging: near the end it calls `onLoadMore`. CH ▲▼ move focus a screen of rows up or down.
 * - Loading: with no items and no `message` the grid can take focus itself, so entering it early works;
 *   it hands focus to its card when the items arrive. With a `message` it can't be focused.
 */
export function Grid<T>({
  focusKey: gridKey,
  title,
  variant = 'poster',
  height,
  items,
  itemKey,
  renderCard,
  onItemFocus,
  onItemPress,
  message,
  hasMore = false,
  onLoadMore,
}: GridProps<T>) {
  const remembered = useRowMemory((s) => s.index[gridKey] ?? 0);
  const remember = useRowMemory((s) => s.remember);
  const index = Math.min(remembered, Math.max(0, items.length - 1));
  const preferred = items[index];
  const [direction, setDirection] = useState(1);
  const previous = useRef(index);

  const layout = gridLayout(variant, height, items.length, index);
  const { columns, pitchX, pitchY, rows, offset, rowsPerScreen, pageRows, firstRow, lastRow } = layout;

  // The latest props and layout, for callbacks that must stay stable (cards are memoised; Norigin
  // re-registers on every new resolver).
  const latest = useRef({ items, itemKey, onItemFocus, onItemPress, columns, index, pageRows });
  latest.current = { items, itemKey, onItemFocus, onItemPress, columns, index, pageRows };

  const nextFocusResolver = useCallback<NextFocusResolver>(
    (direction, currentKey, siblings) => {
      const { items: all, itemKey: keyOf, columns: cols, index: remembered } = latest.current;
      const isCurrent = (item: T | undefined) => item !== undefined && gridCardKey(gridKey, keyOf(item)) === currentKey;
      // The focused card is normally the remembered one; search only if it isn't.
      const from = isCurrent(all[remembered]) ? remembered : all.findIndex(isCurrent);
      const to = from < 0 ? null : step(direction, from, cols, all.length);
      if (to === null) return null; // leave the grid
      const target = gridCardKey(gridKey, keyOf(all[to]!));
      return siblings.find((s) => s.focusKey === target) ?? null;
    },
    [gridKey],
  );

  const { ref, focusKey, hasFocusedChild } = useFocusable<object, HTMLElement>({
    focusKey: gridKey,
    trackChildren: true,
    // While the first items load, the grid takes focus itself (see below); with a message it is skipped.
    focusable: !message,
    preferredChildFocusKey: preferred === undefined ? undefined : gridCardKey(gridKey, itemKey(preferred)),
    nextFocusResolver,
    measureChildrenLayout: false,
  });

  const onFocusIndex = useCallback(
    (i: number) => {
      if (i !== previous.current) setDirection(i - previous.current);
      previous.current = i;
      remember(gridKey, i);
      const item = latest.current.items[i];
      if (item !== undefined) latest.current.onItemFocus?.(item, i);
    },
    [remember, gridKey],
  );
  const onPressIndex = useCallback((i: number) => {
    const item = latest.current.items[i];
    if (item !== undefined) latest.current.onItemPress(item, i);
  }, []);

  // Focused while still empty (e.g. Down from the tab bar before the first page arrived): pass focus on
  // to the remembered card as soon as there is one.
  const hasItems = items.length > 0;
  useEffect(() => {
    if (hasItems && getCurrentFocusKey() === gridKey) void setFocus(gridKey);
  }, [hasItems, gridKey]);

  // CH ▲▼, while a card of this grid has focus: the same column a page of rows up or down (spec §5.1).
  useEffect(
    () =>
      remoteBus.subscribe((key) => {
        if (key !== 'channelUp' && key !== 'channelDown') return;
        const { items: all, itemKey: keyOf, columns: cols, index: at, pageRows: page } = latest.current;
        const current = all[at];
        if (current === undefined || getCurrentFocusKey() !== gridCardKey(gridKey, keyOf(current))) return;
        const jump = page * cols;
        const to = key === 'channelDown' ? Math.min(all.length - 1, at + jump) : at >= jump ? at - jump : at % cols;
        if (to === at) return;
        remember(gridKey, to);
        // The target may still be outside the rendered window; Norigin focuses it as soon as it mounts.
        void setFocus(gridCardKey(gridKey, keyOf(all[to]!)));
      }),
    [gridKey, remember],
  );

  // Near the end: ask for the next page while there is still a screen of rows to move through.
  const nearEnd = hasMore && items.length > 0 && Math.floor(index / columns) >= rows - 1 - rowsPerScreen;
  const loadMore = useRef(onLoadMore);
  loadMore.current = onLoadMore;
  useEffect(() => {
    if (nearEnd) loadMore.current?.();
  }, [nearEnd, index, items.length]);

  // One style object per position, so memoised cards that stay in the window don't re-render.
  const styles = useMemo(() => new Map<number, CSSProperties>(), [columns, pitchX, pitchY]);
  for (const i of styles.keys()) if (i < firstRow * columns || i >= lastRow * columns) styles.delete(i);
  const styleAt = (i: number) => {
    let style = styles.get(i);
    if (!style) {
      style = { left: (i % columns) * pitchX, top: Math.floor(i / columns) * pitchY };
      styles.set(i, style);
    }
    return style;
  };

  const cards: ReactNode[] = [];
  const visibleFirst = Math.floor(offset / pitchY) * columns;
  const visibleEnd = Math.min(items.length, Math.ceil((offset + height - 2 * EDGE) / pitchY) * columns);
  // For vertical moves, continue in the same column; horizontal moves follow reading order.
  const stride = Math.abs(direction) >= columns ? columns : 1;
  const next = direction > 0
    ? visibleEnd + (stride === columns ? index % columns : 0)
    : visibleFirst - (stride === columns ? columns - index % columns : 1);
  const end = Math.min(items.length, lastRow * columns);
  for (let i = firstRow * columns; i < end; i++) {
    const item = items[i]!;
    const key = itemKey(item);
    const slot: CardSlot = {
      focusKey: gridCardKey(gridKey, key),
      index: i,
      variant,
      style: styleAt(i),
      prefetch: hasFocusedChild && (i === next || i === next + Math.sign(direction) * stride)
        ? `${gridKey}:${index}:${direction}` : undefined,
      onFocusIndex,
      onPressIndex,
    };
    cards.push(<Fragment key={key}>{renderCard(item, slot)}</Fragment>);
  }

  return (
    <FocusContext.Provider value={focusKey}>
      <section ref={ref} className="grid" aria-label={title} data-grid={gridKey} style={{ height }}>
        {message ? (
          <p className="grid__message">{message}</p>
        ) : (
          <div
            className="grid__track"
            style={{ height: Math.max(0, rows * pitchY - ROW_GAP), transform: `translate3d(0, ${-offset}px, 0)` }}
          >
            {cards}
          </div>
        )}
      </section>
    </FocusContext.Provider>
  );
}

/** Where everything goes for `count` cards with card `index` focused, in a viewport `height` tall. */
function gridLayout(variant: CardVariant, height: number, count: number, index: number) {
  const size = CARD_SIZE[variant];
  const pitchX = size.width + GAP;
  const pitchY = size.height + ROW_GAP;
  const columns = Math.max(1, Math.floor((STAGE_WIDTH - 2 * GUTTER + GAP) / pitchX));
  const rows = Math.ceil(count / columns);
  const rowsPerScreen = Math.max(1, Math.ceil(height / pitchY));
  /** Rows wholly on screen: what CH ▲▼ moves by. */
  const pageRows = Math.max(1, Math.floor((height - 2 * EDGE + ROW_GAP) / pitchY));
  // The focused row on top, but no further than the last row reaching the bottom edge.
  const maxOffset = Math.max(0, rows * pitchY - ROW_GAP + 2 * EDGE - height);
  const offset = Math.min(Math.floor(index / columns) * pitchY, maxOffset);
  const topRow = Math.floor(offset / pitchY);
  return {
    columns,
    pitchX,
    pitchY,
    rows,
    offset,
    rowsPerScreen,
    pageRows,
    firstRow: Math.max(0, topRow - rowsPerScreen),
    lastRow: Math.min(rows, topRow + 2 * rowsPerScreen + 1),
  };
}

/** The index an arrow moves to from `from`, or null to leave the grid. Down onto a short last row lands on its end. */
function step(direction: Direction, from: number, columns: number, count: number): number | null {
  const column = from % columns;
  switch (direction) {
    case 'left':
      return column > 0 ? from - 1 : null;
    case 'right':
      return column < columns - 1 && from + 1 < count ? from + 1 : null;
    case 'up':
      return from >= columns ? from - columns : null;
    case 'down':
      if (from + columns < count) return from + columns;
      return Math.floor(from / columns) < Math.floor((count - 1) / columns) ? count - 1 : null;
  }
}
