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
  // Details only (GET /v1/items/<id>); see fakeFilm and fakeSeries.
  /** Seconds; `total` is the whole film (all parts) or series. */
  duration?: { average: number; total: number };
  /** Not a known API v1 field (research 10-kp-api §11): shown when the server sends it. */
  age_rating?: string | number | null;
  /** Films: one video per part. */
  videos?: FakeVideo[];
  /** Series. */
  seasons?: FakeSeason[];
}

/** An audio track of a video, as GET /v1/items/<id> lists it. */
export interface FakeAudio {
  id: number;
  index: number;
  codec: string;
  channels: number;
  /** ISO 639-2, e.g. "rus", "eng". */
  lang: string;
  type: { id: number; title: string; short_title: string | null } | null;
  author: { id: number; title: string; short_title: string | null } | null;
}

export interface FakeSubtitle {
  lang: string;
  shift: number;
  embed: boolean;
  url: string;
}

/** A film part or an episode in the item details. The viewer's progress comes from GET /v1/watching instead. */
export interface FakeVideo {
  id: number;
  number: number;
  snumber: number;
  title: string;
  thumbnail: string;
  /** Seconds. */
  duration: number;
  tracks: number;
  audios: FakeAudio[];
  subtitles: FakeSubtitle[];
  files: never[];
}

export interface FakeSeason {
  id: number;
  number: number;
  title: string;
  episodes: FakeVideo[];
}

/** What a video can be played with: audio languages (ISO 639-2) and subtitle languages. */
export interface FakeTracks {
  audio?: string[];
  subtitles?: string[];
}

function fakeVideo(id: number, snumber: number, number: number, title: string, duration: number, tracks: FakeTracks = {}): FakeVideo {
  const audio = tracks.audio ?? ['rus'];
  return {
    id,
    number,
    snumber,
    title,
    thumbnail: `${FAKE_CDN_BASE_URL}/thumb/${id}.jpg`,
    duration,
    tracks: audio.length,
    audios: audio.map((lang, i) => ({
      id: id * 10 + i,
      index: i + 1,
      codec: 'aac',
      channels: 2,
      lang,
      type: lang === 'rus' ? { id: 1, title: 'Дубляж', short_title: 'DUB' } : null,
      author: null,
    })),
    subtitles: (tracks.subtitles ?? []).map((lang, i) => ({ lang, shift: 0, embed: false, url: `${FAKE_CDN_BASE_URL}/sub/${id}-${i}.srt` })),
    files: [],
  };
}

/** A film's details: one part of `minutes` minutes, with the given audio and subtitle languages. */
export function fakeFilm(
  id: number,
  title: string,
  { minutes = 100, ...extra }: Partial<FakeItem> & FakeTracks & { minutes?: number } = {},
): FakeItem {
  const { audio, subtitles, ...item } = extra;
  const seconds = minutes * 60;
  return fakeItem(id, title, {
    type: 'movie',
    duration: { average: seconds, total: seconds },
    videos: [fakeVideo(id * 10, 0, 1, '', seconds, { audio, subtitles })],
    ...item,
  });
}

/**
 * A series' details. `seasons` lists each season's episode titles, e.g. `[['Возвращение', 'Причал'], ['Шторм']]`
 * is season 1 with two episodes and season 2 with one. Episodes run `minutes` minutes.
 */
export function fakeSeries(
  id: number,
  title: string,
  seasons: string[][],
  { minutes = 45, ...extra }: Partial<FakeItem> & FakeTracks & { minutes?: number } = {},
): FakeItem {
  const { audio, subtitles, ...item } = extra;
  return fakeItem(id, title, {
    type: 'serial',
    duration: { average: minutes * 60, total: minutes * 60 * seasons.flat().length },
    seasons: seasons.map((titles, s) => ({
      id: id * 100 + s + 1,
      number: s + 1,
      title: '',
      episodes: titles.map((episodeTitle, e) =>
        fakeVideo(id * 10_000 + (s + 1) * 100 + e + 1, s + 1, e + 1, episodeTitle, minutes * 60, { audio, subtitles }),
      ),
    })),
    ...item,
  });
}

/** Where the viewer is in one episode: watched to the end, or stopped after this many seconds. */
export type EpisodeMark = [season: number, episode: number, progress: 'watched' | number];

/**
 * GET /v1/watching?id= for a series from fakeSeries. `marks` are listed oldest first: the last one is the
 * episode the viewer watched most recently. Episodes without a mark are unwatched.
 */
export function seriesProgress(series: FakeItem, marks: EpisodeMark[]): FakeResponse {
  const at = (s: number, e: number) => marks.findIndex(([ms, me]) => ms === s && me === e);
  return {
    json: {
      status: 200,
      item: {
        id: series.id,
        title: series.title,
        type: series.type,
        seasons: (series.seasons ?? []).map((season) => ({
          id: season.id,
          number: season.number,
          status: 0,
          episodes: season.episodes.map((episode) => {
            const i = at(season.number, episode.number);
            const progress = i < 0 ? null : marks[i]![2];
            return {
              id: episode.id,
              number: episode.number,
              title: episode.title,
              duration: episode.duration,
              time: progress === null ? 0 : progress === 'watched' ? episode.duration : progress,
              status: progress === null ? -1 : progress === 'watched' ? 1 : 0,
              updated: i < 0 ? null : 1_790_000_000 + i,
            };
          }),
        })),
      },
    },
  };
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

/** A series the viewer has started: `watched` of `total` episodes seen, `fresh` of them new since the viewer last watched. */
export function fakeSerialProgress(item: FakeItem, watched: number, total: number, fresh = 0): FakeSerialProgress {
  return {
    id: item.id,
    type: item.type,
    subtype: item.subtype,
    title: item.title,
    posters: item.posters,
    total: String(total),
    watched: String(watched),
    new: String(fresh),
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
  /**
   * GET /v1/watching/serials?subscribed=1: the series the viewer follows (I Watch). GET
   * /v1/watching/togglewatchlist follows and unfollows; assign a new array to change the list mid-test.
   */
  followed?: FakeSerialProgress[];
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
  api.on('GET', '/v1/watching/serials', (req) => ({
    json: { status: 200, items: req.query.subscribed === '1' ? (home.followed ?? []) : home.serials },
  }));
  api.on('GET', '/v1/watching/togglewatchlist', (req) => ({
    json: { status: 200, watching: toggleFollowed(home, Number(req.query.id)) },
  }));
  api.on('GET', '/v1/watching', (req) => {
    const id = Number(req.query.id);
    return home.progress[id] ?? { json: { status: 200, item: { id, title: '', type: 'movie', videos: [] } } };
  });
  const everything = [...home.hot, ...home.fresh, ...home.popular, ...home.movies];
  for (const item of everything) fakeTitle(api, item);
  for (const serial of [...home.serials, ...(home.followed ?? [])]) {
    if (!everything.some((item) => item.id === serial.id)) fakeTitle(api, fakeItem(serial.id, serial.title, { type: serial.type, posters: serial.posters }));
  }
  return home;
}

/** The fake server's togglewatchlist: follows or unfollows series `id` in `home.followed`; returns the new state. */
function toggleFollowed(home: HomeCatalog, id: number): boolean {
  const followed = home.followed ?? [];
  if (followed.some((s) => s.id === id)) {
    home.followed = followed.filter((s) => s.id !== id);
    return false;
  }
  const known = [...home.hot, ...home.fresh, ...home.popular].find((item) => item.id === id);
  const entry = known ? fakeSerialProgress(known, 0, 0) : home.serials.find((s) => s.id === id);
  if (entry) home.followed = [...followed, { ...entry, new: '0' }];
  return true;
}

/** GET /v1/items/<id>: the title's details. */
export function fakeTitle(api: FakeApi, item: FakeItem): void {
  api.on('GET', `/v1/items/${item.id}`, { json: { status: 200, item } });
}

// ---- Movies and Series tabs: GET /v1/items with filters, and the filter references ----

/** GET /v1/types: content types. Their ids are strings, and 3D's is upper case (research 10-kp-api §5). */
export const FAKE_TYPES = [
  { id: 'movie', title: 'Фильмы' },
  { id: 'serial', title: 'Сериалы' },
  { id: '3D', title: '3D' },
  { id: 'concert', title: 'Концерты' },
  { id: 'documovie', title: 'Документальные фильмы' },
  { id: 'docuserial', title: 'Документальные сериалы' },
  { id: 'tvshow', title: 'ТВ шоу' },
];

const MOVIE_GENRES = [
  { id: 1, title: 'Комедия' },
  { id: 8, title: 'Драма' },
  { id: 9, title: 'Триллер' },
];
const DOCU_GENRES = [
  { id: 31, title: 'Природа' },
  { id: 32, title: 'История' },
];

/** GET /v1/genres?type=<type>: genres per `type` value. Types of one family share their genres. */
export const FAKE_GENRES: Record<string, { id: number; title: string }[]> = {
  movie: MOVIE_GENRES,
  serial: MOVIE_GENRES,
  '3d': MOVIE_GENRES,
  documovie: DOCU_GENRES,
  docuserial: DOCU_GENRES,
  concert: [{ id: 41, title: 'Рок' }],
  tvshow: [{ id: 51, title: 'Реалити' }],
};

/** GET /v1/countries. */
export const FAKE_COUNTRIES = [
  { id: 1, title: 'США' },
  { id: 2, title: 'Россия' },
  { id: 3, title: 'Франция' },
];

/** The query string of a GET /v1/items request. */
export type ItemsQuery = Record<string, string>;

export interface FakeCatalog {
  types: { id: string; title: string }[];
  genres: Record<string, { id: number; title: string }[]>;
  countries: { id: number; title: string }[];
  /** Every title matching a GET /v1/items query, before paging. Default: DEFAULT_CATALOG_ITEMS of `query.type`. */
  items(query: ItemsQuery): FakeItem[];
}

/** 30 films and 30 series: more than one page of each. */
export const DEFAULT_CATALOG_ITEMS: FakeItem[] = [
  ...Array.from({ length: 30 }, (_, i) => fakeItem(5001 + i, `Кино ${i + 1} / Movie ${i + 1}`)),
  ...Array.from({ length: 30 }, (_, i) => fakeItem(6001 + i, `Сериал ${i + 1} / Series ${i + 1}`, { type: 'serial' })),
];

/**
 * Routes what the Movies and Series tabs call: GET /v1/types, /v1/genres, /v1/countries and /v1/items,
 * which pages `items(query)` by `page` and `perpage` like the real API. Each title it returns also gets
 * GET /v1/items/<id> (the title page). Every test gets the default catalog; pass parts to replace them.
 */
export function fakeCatalog(api: FakeApi, catalog: Partial<FakeCatalog> = {}): FakeCatalog {
  const full: FakeCatalog = {
    types: FAKE_TYPES,
    genres: FAKE_GENRES,
    countries: FAKE_COUNTRIES,
    items: (query) => DEFAULT_CATALOG_ITEMS.filter((item) => !query.type || item.type === query.type),
    ...catalog,
  };
  api.on('GET', '/v1/types', { json: { status: 200, items: full.types } });
  api.on('GET', '/v1/genres', (req) => {
    const type = req.query.type ?? '';
    return { json: { status: 200, items: (full.genres[type] ?? []).map((genre) => ({ ...genre, type })) } };
  });
  api.on('GET', '/v1/countries', { json: { status: 200, items: full.countries } });
  api.on('GET', '/v1/items', (req) => {
    const all = full.items(req.query);
    const perpage = Number(req.query.perpage ?? 20);
    const page = Number(req.query.page ?? 1);
    const items = all.slice((page - 1) * perpage, page * perpage);
    for (const item of items) fakeTitle(api, item);
    // `total` counts pages, not items, and the numbers may arrive as strings (research 10-kp-api §2.1).
    const pages = Math.max(1, Math.ceil(all.length / perpage));
    return {
      json: {
        status: 200,
        items,
        pagination: { total: String(pages), current: String(page), perpage: String(perpage), total_items: all.length },
      },
    };
  });
  return full;
}

/**
 * GET /v1/items/search (research 10-kp-api §6.3): `results` maps a query (`q`) to the titles found; any
 * other query finds nothing. Also routes the title page of every result.
 */
export function fakeSearch(api: FakeApi, results: Record<string, FakeItem[]>): void {
  api.on('GET', '/v1/items/search', (req) => list(results[req.query.q ?? ''] ?? []));
  for (const item of Object.values(results).flat()) fakeTitle(api, item);
}

/** One page of a list endpoint (items, search), for routing by hand, e.g. to answer a request late. */
export const fakeList = (items: FakeItem[]): FakeResponse => list(items);
