import { afterEach, describe, expect, it } from 'vitest';
import { setLocale, tn } from '.';

describe('tn: counted strings', () => {
  afterEach(() => setLocale('ru'));

  it('picks the Russian plural form for the count', () => {
    setLocale('ru');
    expect([1, 2, 4, 5, 11, 12, 21, 22, 25, 101].map((n) => tn('title.seasons', n))).toEqual([
      '1 сезон',
      '2 сезона',
      '4 сезона',
      '5 сезонов',
      '11 сезонов',
      '12 сезонов',
      '21 сезон',
      '22 сезона',
      '25 сезонов',
      '101 сезон',
    ]);
  });

  it('picks the English plural form for the count', () => {
    setLocale('en');
    expect([1, 2, 5, 21].map((n) => tn('title.seasons', n))).toEqual(['1 season', '2 seasons', '5 seasons', '21 seasons']);
  });
});
