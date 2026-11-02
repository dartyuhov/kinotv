import type { FakeApi, FakeResponse } from './fakeApi';
import { FAKE_CDN_BASE_URL } from './fakeCdn';

// Catalog fixtures: made-up titles, artwork on the fake CDN, shapes as kino.watch sends them
// (research 10-kp-api §6, §7), including its quirks (some numbers arrive as strings).

export interface FakePosters {
  small: string;
  medium: string;
  big: string;
  wide?: string;
}

/** An item as list endpoints return it (ItemSummary). Only the fields the app reads are filled in. */
export interface FakeItem {
  id: number;
  type: string;
  subtype: string;
  /** "Russian / Original" in one string, as the API sends it. */
  title: string;
  year: number;
  genres: { id: number; title: string }[];
  plot: string;
  quality: number;
  imdb_rating: number | null;
  kinopoisk_rating: number | null;
  posters: FakePosters;
}

/** An entry of GET /v1/watching/serials. `total` and `watched` arrive as strings. */
export interface FakeSerialProgress {
  id: number;
  type: string;
  subtype: string;
  title: string;
  posters: FakePosters;
  total: string;
  watched: string;
  new: string;
}

/** Artwork for item `id` on the fake CDN. `wide` (backdrop art) can be missing, as on the real API. */
export function fakePosters(id: number, { wide = true }: { wide?: boolean } = {}): FakePosters {
  const base = `${FAKE_CDN_BASE_URL}/poster/${id}`;
  return {
    small: `${base}/small.jpg`,
    medium: `${base}/medium.jpg`,
    big: `${base}/big.jpg`,
    ...(wide ? { wide: `${FAKE_CDN_BASE_URL}/wide/${id}.jpg` } : {}),
  };
}

export function fakeItem(id: number, title = `Фильм ${id} / Film ${id}`, extra: Partial<FakeItem> = {}): FakeItem {
  return {
    id,
    type: 'movie',
    subtype: '',
    title,
    year: 2018 + (id % 7),
    genres: [{ id: 8, title: 'Драма' }],
    plot: `Выдуманный сюжет номер ${id}.`,
    quality: 1080,
    imdb_rating: 7.2,
    kinopoisk_rating: 7.5,
    posters: fakePosters(id),
    ...extra,
  };
}

/** `count` items numbered from `firstId`, e.g. for a long row. */
export function fakeItems(firstId: number, count: number): FakeItem[] {
  return Array.from({ length: count }, (_, i) => fakeItem(firstId + i));
}

/** A series the viewer has started: `watched` of `total` episodes seen. */
export function fakeSerialProgress(item: FakeItem, watched: number, total: number): FakeSerialProgress {
  return {
    id: item.id,
    type: item.type,
    subtype: item.subtype,
    title: item.title,
    posters: item.posters,
    total: String(total),
    watched: String(watched),
    new: '0',
  };
}

/** GET /v1/watching?id= for a film stopped at `time` of `duration` seconds. */
export function filmProgress(item: FakeItem, time: number, duration: number): FakeResponse {
  return {
    json: {
      status: 200,
      item: {
        id: item.id,
        title: item.title,
        type: item.type,
        videos: [{ id: item.id * 10, number: 1, title: '', duration, time, status: 0, updated: 1_790_000_000 }],
      },
    },
  };
}

/** GET /v1/watching?id= for a series last watched at `season`/`episode`, stopped at `time` of `duration`. */
export function episodeProgress(item: FakeItem, season: number, episode: number, time: number, duration: number): FakeResponse {
  const episodes = Array.from({ length: Math.max(episode, 4) }, (_, i) => {
    const number = i + 1;
    const watched = number < episode;
    return {
      id: item.id * 100 + number,
      number,
      title: `Серия ${number}`,
      duration,
      time: number === episode ? time : watched ? duration : 0,
      status: watched ? 1 : number === episode ? 0 : -1,
      updated: number <= episode ? 1_790_000_000 + number : null,
    };
  });
  return {
    json: {
      status: 200,
      item: { id: item.id, title: item.title, type: item.type, seasons: [{ id: item.id * 10 + season, number: season, status: 0, episodes }] },
    },
  };
}

/** What Home is built from. */
export interface HomeCatalog {
  /** GET /v1/items/hot: the hero's featured titles. */
  hot: FakeItem[];
  /** GET /v1/items/fresh: New releases. */
  fresh: FakeItem[];
  /** GET /v1/items/popular: Popular. */
  popular: FakeItem[];
  /** GET /v1/watching/movies: films the viewer hasn't finished. */
  movies: FakeItem[];
  /** GET /v1/watching/serials?subscribed=0: series with unwatched episodes. */
  serials: FakeSerialProgress[];
  /** GET /v1/watching?id=<id>, per item id. Items without an entry have no saved position. */
  progress: Record<number, FakeResponse>;
}

const NORTH_WIND = fakeItem(101, 'Северный ветер / North Wind', { type: 'serial', year: 2024, genres: [{ id: 9, title: 'Триллер' }], quality: 2160 });
const QUIET_HARBOUR = fakeItem(102, 'Тихая гавань / Quiet Harbour', { type: 'serial', year: 2022, genres: [{ id: 8, title: 'Драма' }, { id: 4, title: 'Детектив' }] });
const DARK_CITY = fakeItem(103, 'Город без света / City Without Light', { year: 2021 });
const HUNDRED_DAYS = fakeItem(104, 'Сто дней / A Hundred Days', { year: 2023 });
const SLOW_RIVER = fakeItem(105, 'Медленная река / Slow River', { posters: fakePosters(105, { wide: false }) });

/** A small Home every signed-in test gets unless it routes its own (see `fakeHome`). */
export const DEFAULT_HOME: HomeCatalog = {
  hot: [NORTH_WIND, DARK_CITY, HUNDRED_DAYS],
  fresh: [HUNDRED_DAYS, SLOW_RIVER, ...fakeItems(201, 6)],
  popular: [DARK_CITY, NORTH_WIND, ...fakeItems(301, 6)],
  movies: [SLOW_RIVER, DARK_CITY],
  serials: [fakeSerialProgress(QUIET_HARBOUR, 2, 8)],
  progress: {
    [SLOW_RIVER.id]: filmProgress(SLOW_RIVER, 2400, 6000),
    [DARK_CITY.id]: filmProgress(DARK_CITY, 600, 6000),
    [QUIET_HARBOUR.id]: episodeProgress(QUIET_HARBOUR, 1, 3, 1800, 2400),
  },
};

const list = (items: unknown[]): FakeResponse => ({
  json: { status: 200, items, pagination: { total: 1, current: 1, perpage: Math.max(items.length, 1), total_items: items.length } },
});

/**
 * Routes everything Home calls, plus GET /v1/items/<id> for every item in it (the title page).
 * Missing parts of `catalog` come from DEFAULT_HOME. Route a part yourself afterwards to fail or delay it.
 */
export function fakeHome(api: FakeApi, catalog: Partial<HomeCatalog> = {}): HomeCatalog {
  const home: HomeCatalog = { ...DEFAULT_HOME, ...catalog };
  api.on('GET', '/v1/items/hot', list(home.hot));
  api.on('GET', '/v1/items/fresh', list(home.fresh));
  api.on('GET', '/v1/items/popular', list(home.popular));
  api.on('GET', '/v1/watching/movies', {
    json: { status: 200, items: home.movies.map(({ id, type, subtype, title, posters }) => ({ id, type, subtype, title, posters })) },
  });
  api.on('GET', '/v1/watching/serials', { json: { status: 200, items: home.serials } });
  api.on('GET', '/v1/watching', (req) => {
    const id = Number(req.query.id);
    return home.progress[id] ?? { json: { status: 200, item: { id, title: '', type: 'movie', videos: [] } } };
  });
  const everything = [...home.hot, ...home.fresh, ...home.popular, ...home.movies];
  for (const item of everything) fakeTitle(api, item);
  for (const serial of home.serials) {
    if (!everything.some((item) => item.id === serial.id)) fakeTitle(api, fakeItem(serial.id, serial.title, { type: serial.type, posters: serial.posters }));
  }
  return home;
}

/** GET /v1/items/<id>: the title's details. */
export function fakeTitle(api: FakeApi, item: FakeItem): void {
  api.on('GET', `/v1/items/${item.id}`, { json: { status: 200, item } });
}
