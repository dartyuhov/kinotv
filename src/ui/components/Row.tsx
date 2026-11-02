import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { Fragment, useCallback, useRef, type ReactNode } from 'react';
import { CARD_SIZE, type CardSlot, type CardVariant } from './Card';
import { useRowMemory } from './rowMemory';
import './Row.css';

// Layout in 1080p logical pixels; keep in step with --card-gap and --screen-gutter in tokens.css.
const STAGE_WIDTH = 1920;
const GUTTER = 96;
const GAP = 32;

/** Focus key of the card for `itemKey` in the row `rowKey`: `<rowKey>:<itemKey>`, e.g. `home:row:popular:123`. */
export const rowCardKey = (rowKey: string, itemKey: string | number) => `${rowKey}:${itemKey}`;

export interface RowProps<T> {
  /** Stable, data-derived focus key, e.g. `home:row:popular`. Also keys the row's focus memory. */
  focusKey: string;
  title: string;
  variant: CardVariant;
  items: readonly T[];
  /** Unique within the row and stable across refetches, e.g. the item id. */
  itemKey(item: T): string | number;
  /** Renders one card: spread `slot` onto <Card>. */
  renderCard(item: T, slot: CardSlot): ReactNode;
  onItemFocus?(item: T, index: number): void;
  onItemPress(item: T, index: number): void;
  /** Focus has entered the row. Receives the row's focus key; pass a stable function. */
  onRowFocus?(rowKey: string): void;
  /** Shown instead of the cards, e.g. when the list failed to load. */
  message?: string;
}

/**
 * A titled horizontal row of cards (spec §5.1, §6.3).
 *
 * - Focus memory: the focused index is kept in useRowMemory, so coming back to the row (Up/Down, or
 *   Back from a pushed screen) lands on the same card even though cards unmount.
 * - Scroll: the track is translated so the focused card sits in the second slot (the first one at the
 *   start of the row). The offset follows from the index alone, so restoring the index restores it.
 * - Virtualised: only the visible cards plus one screen's worth either side are rendered. Cards are
 *   positioned with `left`, not transforms, so Norigin measures their real positions.
 */
export function Row<T>({
  focusKey: rowKey,
  title,
  variant,
  items,
  itemKey,
  renderCard,
  onItemFocus,
  onItemPress,
  onRowFocus,
  message,
}: RowProps<T>) {
  const remembered = useRowMemory((s) => s.index[rowKey] ?? 0);
  const remember = useRowMemory((s) => s.remember);
  const index = Math.min(remembered, Math.max(0, items.length - 1));
  const preferred = items[index];

  const onFocus = useCallback(() => onRowFocus?.(rowKey), [onRowFocus, rowKey]);
  const { ref, focusKey } = useFocusable<object, HTMLElement>({
    focusKey: rowKey,
    // A row with no cards (loading, failed or empty) is skipped by Up/Down.
    focusable: !message && items.length > 0,
    preferredChildFocusKey: preferred === undefined ? undefined : rowCardKey(rowKey, itemKey(preferred)),
    onFocus,
  });

  // Card callbacks stay stable across renders (cards are memoised); the latest props are read from a ref.
  const latest = useRef({ items, onItemFocus, onItemPress });
  latest.current = { items, onItemFocus, onItemPress };
  const onFocusIndex = useCallback(
    (i: number) => {
      remember(rowKey, i);
      const item = latest.current.items[i];
      if (item !== undefined) latest.current.onItemFocus?.(item, i);
    },
    [remember, rowKey],
  );
  const onPressIndex = useCallback((i: number) => {
    const item = latest.current.items[i];
    if (item !== undefined) latest.current.onItemPress(item, i);
  }, []);

  const pitch = CARD_SIZE[variant].width + GAP;
  const offset = scrollOffset(index, items.length, pitch);
  const { first, last } = renderWindow(offset, items.length, pitch);

  const cards: ReactNode[] = [];
  for (let i = first; i < last; i++) {
    const item = items[i]!;
    const key = itemKey(item);
    const slot: CardSlot = {
      focusKey: rowCardKey(rowKey, key),
      index: i,
      variant,
      style: { left: i * pitch },
      onFocusIndex,
      onPressIndex,
    };
    cards.push(<Fragment key={key}>{renderCard(item, slot)}</Fragment>);
  }

  return (
    <FocusContext.Provider value={focusKey}>
      <section ref={ref} className="row" aria-label={title} data-row={rowKey}>
        <h2 className="row__title">{title}</h2>
        <div
          className={`row__track row__track--${variant}`}
          style={{ width: Math.max(0, items.length * pitch - GAP), transform: `translate3d(${-offset}px, 0, 0)` }}
        >
          {message ? <p className="row__message">{message}</p> : cards}
        </div>
      </section>
    </FocusContext.Provider>
  );
}

/** How far the track is scrolled when card `index` is focused: that card in the second slot, clamped to the ends. */
function scrollOffset(index: number, count: number, pitch: number): number {
  const visibleWidth = STAGE_WIDTH - 2 * GUTTER;
  const max = Math.max(0, count * pitch - GAP - visibleWidth);
  return Math.min(max, Math.max(0, (index - 1) * pitch));
}

/** The cards to render: those on screen at `offset`, plus one screen either side (spec §6.3). */
function renderWindow(offset: number, count: number, pitch: number): { first: number; last: number } {
  const perScreen = Math.ceil(STAGE_WIDTH / pitch);
  const firstVisible = Math.floor(Math.max(0, offset - GUTTER) / pitch);
  return {
    first: Math.max(0, firstVisible - perScreen),
    last: Math.min(count, firstVisible + 2 * perScreen + 1),
  };
}
