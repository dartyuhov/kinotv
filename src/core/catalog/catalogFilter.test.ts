import { describe, expect, it } from 'vitest';
import { defaultFilter, itemsQuery, sectionTypes, withType, yearOptions } from './catalogFilter';

const SERVER_TYPES = [
  { id: 'movie', title: 'Фильмы' },
  { id: 'serial', title: 'Сериалы' },
  { id: '3D', title: '3D' },
  { id: 'concert', title: 'Концерты' },
  { id: 'documovie', title: 'Документальные фильмы' },
  { id: 'docuserial', title: 'Документальные сериалы' },
  { id: 'tvshow', title: 'ТВ шоу' },
  { id: 'anime', title: 'Аниме' },
];

describe('sectionTypes', () => {
  it('gives Series the types that have episodes, in the server order', () => {
    expect(sectionTypes('series', SERVER_TYPES).map((t) => t.id)).toEqual(['serial', 'docuserial', 'tvshow']);
  });

  it('gives Movies every other type, including ones the app does not know yet', () => {
    expect(sectionTypes('movies', SERVER_TYPES).map((t) => t.id)).toEqual(['movie', '3D', 'concert', 'documovie', 'anime']);
  });
});

describe('yearOptions', () => {
  it('lists the last five years, then decades back to the 1950s', () => {
    expect(yearOptions(2026)).toEqual([
      '2026',
      '2025',
      '2024',
      '2023',
      '2022',
      '2020-2029',
      '2010-2019',
      '2000-2009',
      '1990-1999',
      '1980-1989',
      '1970-1979',
      '1960-1969',
      '1950-1959',
    ]);
  });
});

describe('the GET /v1/items filters', () => {
  it('leave out what is "any" and sort newest first by default', () => {
    expect(itemsQuery(defaultFilter('series'))).toEqual({ type: 'serial', sort: 'created-' });
  });

  it('send every filter that is set', () => {
    const filter = { type: 'documovie', genre: 32, year: '2010-2019', country: 3, sort: 'popular' as const };
    expect(itemsQuery(filter)).toEqual({ type: 'documovie', genre: 32, year: '2010-2019', country: 3, sort: 'views-' });
  });

  it('forget the genre when the type changes, since genres belong to a family of types', () => {
    const filter = { type: 'movie', genre: 8, year: '2024', country: 1, sort: 'rating' as const };
    expect(withType(filter, 'documovie')).toEqual({ type: 'documovie', genre: null, year: '2024', country: 1, sort: 'rating' });
  });
});
