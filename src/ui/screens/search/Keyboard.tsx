import { FocusContext, getCurrentFocusKey, setFocus, SpatialNavigation, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { Delete, Globe, X } from 'lucide-react';
import { memo, useCallback, useEffect, useRef } from 'react';
import { t } from '../../../core/i18n';
import { remoteBus } from '../../../core/input/remoteBus';
import {
  applyKey,
  keyAt,
  keyboardRows,
  keyWidth,
  moveFocus,
  nextLayout,
  type Direction,
  type KeyboardKey,
  type KeyPos,
  type LayoutId,
} from './keyboardLayout';
import './Keyboard.css';

// Key size in 1080p logical pixels; a wide key spans several units and the gaps between them.
const KEY_WIDTH = 112;
const KEY_GAP = 12;

/** The first letter key: where the keyboard starts when nothing in it had focus yet. */
const START: KeyPos = { row: 1, col: 0 };

export interface KeyboardProps {
  /** Focus key of the keyboard; each key's is `<focusKey>:<row>:<col>`. */
  focusKey: string;
  value: string;
  onChange(value: string): void;
  layout: LayoutId;
  onLayoutChange(layout: LayoutId): void;
}

/**
 * The on-screen RU/US keyboard (spec §5.2, mockup keyboard-v2.html).
 *
 * - Arrows move between keys and wrap around each row; up from the digits row and down from the
 *   function keys leave the keyboard (to the tab bar, and to whatever is below it).
 * - OK types the focused key. While a key has focus, ⏪ deletes and ⏩ types a space.
 * - Keys are focused by position, so switching layout keeps focus on the language key.
 */
export function Keyboard({ focusKey: ownKey, value, onChange, layout, onLayoutChange }: KeyboardProps) {
  const keyFocusKey = useCallback((pos: KeyPos) => `${ownKey}:${pos.row}:${pos.col}`, [ownKey]);
  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({ focusKey: ownKey, preferredChildFocusKey: keyFocusKey(START) });

  // Keys stay memoised across typing: they read the latest state through this ref.
  const latest = useRef({ value, onChange, layout, onLayoutChange });
  latest.current = { value, onChange, layout, onLayoutChange };

  const press = useCallback((key: KeyboardKey) => {
    const { value: current, onChange: change, layout: shown, onLayoutChange: changeLayout } = latest.current;
    if (key.kind === 'layout') changeLayout(nextLayout(shown));
    else change(applyKey(current, key));
  }, []);

  const onPress = useCallback((pos: KeyPos) => {
    const key = keyAt(latest.current.layout, pos);
    if (key) press(key);
  }, [press]);

  /** Moves between keys; returns true to let the move leave the keyboard. */
  const onArrow = useCallback(
    (pos: KeyPos, dir: Direction) => {
      const to = moveFocus(latest.current.layout, pos, dir);
      if (!to) return true;
      void setFocus(keyFocusKey(to));
      return false;
    },
    [keyFocusKey],
  );

  useEffect(
    () =>
      remoteBus.subscribe((key) => {
        if (key !== 'rewind' && key !== 'fastForward') return;
        if (!SpatialNavigation.isDescendantOf(getCurrentFocusKey(), ownKey)) return;
        press({ kind: key === 'rewind' ? 'delete' : 'space' });
      }),
    [ownKey, press],
  );

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="keyboard">
        {keyboardRows(layout).map((row, r) => (
          <div key={r} className="keyboard__row">
            {row.map((key, c) => (
              <Key
                key={c}
                focusKey={keyFocusKey({ row: r, col: c })}
                row={r}
                col={c}
                keyboardKey={key}
                layout={layout}
                onPress={onPress}
                onArrow={onArrow}
              />
            ))}
          </div>
        ))}
      </div>
    </FocusContext.Provider>
  );
}

interface KeyProps {
  focusKey: string;
  row: number;
  col: number;
  keyboardKey: KeyboardKey;
  layout: LayoutId;
  onPress(pos: KeyPos): void;
  onArrow(pos: KeyPos, dir: Direction): boolean;
}

const Key = memo(function Key({ focusKey, row, col, keyboardKey, layout, onPress, onArrow }: KeyProps) {
  const { ref } = useFocusable<object, HTMLDivElement>({
    focusKey,
    onEnterPress: () => onPress({ row, col }),
    onArrowPress: (dir) => onArrow({ row, col }, dir as Direction),
  });
  const units = keyWidth(keyboardKey);
  const width = units * KEY_WIDTH + (units - 1) * KEY_GAP;
  return (
    <div ref={ref} role="button" className={`keyboard__key keyboard__key--${keyboardKey.kind}`} style={{ width }}>
      <KeyLabel keyboardKey={keyboardKey} layout={layout} />
    </div>
  );
});

function KeyLabel({ keyboardKey, layout }: { keyboardKey: KeyboardKey; layout: LayoutId }) {
  switch (keyboardKey.kind) {
    case 'char':
      return keyboardKey.char;
    case 'layout':
      return (
        <>
          <Globe className="keyboard__icon" aria-hidden strokeWidth={2.5} />
          {`${layout.toUpperCase()} → ${nextLayout(layout).toUpperCase()}`}
        </>
      );
    case 'space':
      return t('search.key.space');
    case 'delete':
      return (
        <>
          <Delete className="keyboard__icon" aria-hidden strokeWidth={2.5} />
          {t('search.key.delete')}
        </>
      );
    case 'clear':
      return (
        <>
          <X className="keyboard__icon" aria-hidden strokeWidth={2.5} />
          {t('search.key.clear')}
        </>
      );
  }
}
