import type { ItemsQuery } from '../api/client';

/** The two browsable catalog sections: the Movies and Series tabs (spec §4). */
export type CatalogSection = 'movies' | 'series';

export type CatalogSort = 'newest' | 'popular' | 'rating';

/** What a Movies or Series grid shows. `null` means "any". */
export interface CatalogFilter {
  /** A content type id from GET /v1/types. */
  type: string;
  genre: number | null;
  /** A year (`2024`) or a decade (`2010-2019`). */
  year: string | null;
  country: number | null;
  sort: CatalogSort;
}

// The `sort` values of GET /v1/items: a field with `-` for descending (research 10-kp-api §6.1).
// "Newest" is newest on kino.watch (like Home's New releases), not newest by release year.
const SORT_FIELD: Record<CatalogSort, string> = {
  newest: 'created-',
  popular: 'views-',
  rating: 'rating-',
};

const DEFAULT_TYPE: Record<CatalogSection, string> = { movies: 'movie', series: 'serial' };

/** A section's grid before the viewer picks anything: its main type, newest first. */
export function defaultFilter(section: CatalogSection): CatalogFilter {
  return { type: DEFAULT_TYPE[section], genre: null, year: null, country: null, sort: 'newest' };
}

/** Another type. The genre is cleared: genres belong to a family of types (research 10-kp-api §5). */
export function withType(filter: CatalogFilter, type: string): CatalogFilter {
  return { ...filter, type, genre: null };
}

/** Types whose titles have seasons and episodes (research 10-kp-api §6.5). */
const SERIES_TYPES = new Set(['serial', 'docuserial', 'tvshow']);

/** The content types a section offers, in the server's order: series types on Series, every other on Movies. */
export function sectionTypes<T extends { id: string }>(section: CatalogSection, types: readonly T[]): T[] {
  return types.filter((type) => SERIES_TYPES.has(type.id.toLowerCase()) === (section === 'series'));
}

const RECENT_YEARS = 5;
const OLDEST_DECADE = 1950;

/** The year filter's choices for `currentYear`: the last few years one by one, then decades (`2010-2019`). */
export function yearOptions(currentYear: number): string[] {
  const years = Array.from({ length: RECENT_YEARS }, (_, i) => String(currentYear - i));
  const decades: string[] = [];
  for (let start = Math.floor(currentYear / 10) * 10; start >= OLDEST_DECADE; start -= 10) decades.push(`${start}-${start + 9}`);
  return [...years, ...decades];
}

/** The GET /v1/items filters for `filter`, without paging. */
export function itemsQuery(filter: CatalogFilter): ItemsQuery {
  return {
    type: filter.type,
    genre: filter.genre ?? undefined,
    year: filter.year ?? undefined,
    country: filter.country ?? undefined,
    sort: SORT_FIELD[filter.sort],
  };
}
