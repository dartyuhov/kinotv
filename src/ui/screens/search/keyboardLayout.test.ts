import { describe, expect, it } from 'vitest';
import { applyKey, initialLayout, keyAt, keyboardRows, moveFocus, nextLayout, type KeyboardKey, type LayoutId } from './keyboardLayout';

// What each row shows: a character, or the name of a function key. Expected values come from the
// approved mockup (keyboard-v2.html) and spec §5.2.
const show = (key: KeyboardKey | undefined) => (key === undefined ? undefined : key.kind === 'char' ? key.char : key.kind);
const rows = (layout: LayoutId) => keyboardRows(layout).map((row) => row.map(show).join(' '));

describe('keyboard layouts', () => {
  it('Russian is ЙЦУКЕН with ё and ъ, under a digits row, over the function keys', () => {
    expect(rows('ru')).toEqual([
      '1 2 3 4 5 6 7 8 9 0 -',
      'й ц у к е н г ш щ з х ъ',
      'ф ы в а п р о л д ж э',
      'я ч с м и т ь б ю ё',
      'layout space delete clear',
    ]);
  });

  it("US English is QWERTY plus ' . :, with the same digits and function keys", () => {
    expect(rows('en')).toEqual([
      '1 2 3 4 5 6 7 8 9 0 -',
      'q w e r t y u i o p',
      "a s d f g h j k l '",
      'z x c v b n m . :',
      'layout space delete clear',
    ]);
  });

  it('the language key toggles between the two', () => {
    expect(nextLayout('ru')).toBe('en');
    expect(nextLayout('en')).toBe('ru');
  });

  it('opens in the remembered layout, else in the UI language', () => {
    expect(initialLayout(null, 'ru')).toBe('ru');
    expect(initialLayout(null, 'en')).toBe('en');
    expect(initialLayout('en', 'ru')).toBe('en');
    expect(initialLayout('ru', 'en')).toBe('ru');
    expect(initialLayout('de', 'en')).toBe('en'); // unknown stored value
  });
});

describe('moving around the keyboard', () => {
  const move = (layout: LayoutId, row: number, col: number, dir: 'up' | 'down' | 'left' | 'right') => {
    const to = moveFocus(layout, { row, col }, dir);
    return to && show(keyAt(layout, to));
  };

  it('left and right wrap from one edge of a row to the other', () => {
    expect(move('ru', 1, 0, 'left')).toBe('ъ');
    expect(move('ru', 1, 11, 'right')).toBe('й');
    expect(move('ru', 0, 0, 'left')).toBe('-');
    expect(move('en', 3, 8, 'right')).toBe('z');
    expect(move('en', 4, 0, 'left')).toBe('clear');
    expect(move('en', 4, 3, 'right')).toBe('layout');
    expect(move('ru', 2, 4, 'right')).toBe('р');
    expect(move('ru', 2, 4, 'left')).toBe('а');
  });

  it('up and down go to the key below or above, rows being centred', () => {
    expect(move('ru', 1, 0, 'up')).toBe('1');
    expect(move('ru', 1, 11, 'up')).toBe('-');
    expect(move('ru', 0, 0, 'down')).toBe('й');
    expect(move('en', 0, 0, 'down')).toBe('q');
    expect(move('en', 0, 10, 'down')).toBe('p');
    expect(move('en', 1, 0, 'down')).toBe('a');
    expect(move('ru', 3, 0, 'down')).toBe('layout');
    expect(move('ru', 3, 4, 'down')).toBe('space');
    expect(move('ru', 3, 9, 'down')).toBe('clear');
    expect(move('en', 4, 3, 'up')).toBe(':');
    expect(move('en', 4, 0, 'up')).toBe('z');
  });

  it('between rows of different lengths, down then up comes back to the same key', () => {
    // д sits between б and ю in the shorter row below it.
    expect(move('ru', 2, 8, 'down')).toBe('б');
    expect(move('ru', 3, 7, 'up')).toBe('д');
    expect(move('ru', 3, 7, 'down')).toBe('delete');
    expect(move('ru', 1, 5, 'down')).toBe('п');
    expect(move('ru', 2, 4, 'up')).toBe('н');
  });

  it('up from the digits row and down from the bottom row leave the keyboard', () => {
    expect(moveFocus('ru', { row: 0, col: 3 }, 'up')).toBeNull();
    expect(moveFocus('en', { row: 4, col: 1 }, 'down')).toBeNull();
  });
});

describe('typing', () => {
  const char = (c: string): KeyboardKey => ({ kind: 'char', char: c });

  it('characters and space append, delete removes the last character, clear empties', () => {
    expect(applyKey('ти', char('х'))).toBe('тих');
    expect(applyKey('ocean', char("'"))).toBe("ocean'");
    expect(applyKey('тихая', { kind: 'space' })).toBe('тихая ');
    expect(applyKey('тихая', { kind: 'delete' })).toBe('тиха');
    expect(applyKey('', { kind: 'delete' })).toBe('');
    expect(applyKey('тихая гавань', { kind: 'clear' })).toBe('');
  });
});
