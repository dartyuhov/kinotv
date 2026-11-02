import type { Locale } from '../../../core/i18n';

/**
 * The on-screen keyboard's layouts and movement (spec §5.2, mockup keyboard-v2.html). Pure: the
 * Keyboard component renders these rows and asks `moveFocus` where each arrow goes.
 */

export type LayoutId = 'ru' | 'en';

export type KeyboardKey =
  | { kind: 'char'; char: string }
  | { kind: 'layout' }
  | { kind: 'space' }
  | { kind: 'delete' }
  | { kind: 'clear' };

/** A key's place: row 0 is the digits row, the last row holds the function keys. */
export interface KeyPos {
  row: number;
  col: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

const chars = (s: string): KeyboardKey[] => Array.from(s, (char) => ({ kind: 'char', char }));

const DIGITS = chars('1234567890-');
const FUNCTION_ROW: KeyboardKey[] = [{ kind: 'layout' }, { kind: 'space' }, { kind: 'delete' }, { kind: 'clear' }];

const LAYOUTS: Record<LayoutId, KeyboardKey[][]> = {
  ru: [DIGITS, chars('йцукенгшщзхъ'), chars('фывапролджэ'), chars('ячсмитьбюё'), FUNCTION_ROW],
  en: [DIGITS, chars('qwertyuiop'), chars("asdfghjkl'"), chars('zxcvbnm.:'), FUNCTION_ROW],
};

/** Width in key units: the function keys are wider, and space widest (as in the mockup). */
export function keyWidth(key: KeyboardKey): number {
  return key.kind === 'space' ? 4 : key.kind === 'char' ? 1 : 2;
}

export function keyboardRows(layout: LayoutId): readonly (readonly KeyboardKey[])[] {
  return LAYOUTS[layout];
}

export function keyAt(layout: LayoutId, { row, col }: KeyPos): KeyboardKey | undefined {
  return LAYOUTS[layout][row]?.[col];
}

export function nextLayout(layout: LayoutId): LayoutId {
  return layout === 'ru' ? 'en' : 'ru';
}

/** The layout the keyboard opens in: the one used last, or else the UI language's. */
export function initialLayout(stored: unknown, uiLocale: Locale): LayoutId {
  return stored === 'ru' || stored === 'en' ? stored : uiLocale;
}

/** The query after pressing `key`. The language key doesn't change it. */
export function applyKey(query: string, key: KeyboardKey): string {
  switch (key.kind) {
    case 'char':
      return query + key.char;
    case 'space':
      return `${query} `;
    case 'delete':
      return Array.from(query).slice(0, -1).join('');
    case 'clear':
      return '';
    case 'layout':
      return query;
  }
}

/**
 * Where an arrow moves focus from `from`. Left and right wrap around the row. Up and down go to the key
 * in the next row that sits under (or over) the key's centre; rows are centred, so a centre can fall on
 * the boundary between two keys, and then down takes the left one and up the right one, which makes
 * down-then-up come back to the same key. Returns null when the move leaves the keyboard: up from the
 * digits row, down from the function keys.
 */
export function moveFocus(layout: LayoutId, from: KeyPos, dir: Direction): KeyPos | null {
  const rows = LAYOUTS[layout];
  const row = rows[from.row]!;
  if (dir === 'left' || dir === 'right') {
    const step = dir === 'left' ? -1 : 1;
    return { row: from.row, col: (from.col + step + row.length) % row.length };
  }
  const target = from.row + (dir === 'up' ? -1 : 1);
  if (target < 0 || target >= rows.length) return null;

  const x = spans(row)[from.col]!.centre;
  const candidates = spans(rows[target]!);
  const containing = candidates.filter((s) => s.left <= x && x <= s.right);
  if (containing.length > 0) {
    const pick = dir === 'down' ? containing[0]! : containing[containing.length - 1]!;
    return { row: target, col: pick.col };
  }
  // The target row is narrower than this key's position: the nearest key at its edge.
  const nearest = candidates.reduce((best, s) => (Math.abs(s.centre - x) < Math.abs(best.centre - x) ? s : best));
  return { row: target, col: nearest.col };
}

/** Each key's horizontal extent, in key units, with the row centred on 0. */
function spans(row: readonly KeyboardKey[]): { col: number; left: number; right: number; centre: number }[] {
  const total = row.reduce((sum, key) => sum + keyWidth(key), 0);
  let left = -total / 2;
  return row.map((key, col) => {
    const width = keyWidth(key);
    const span = { col, left, right: left + width, centre: left + width / 2 };
    left += width;
    return span;
  });
}
