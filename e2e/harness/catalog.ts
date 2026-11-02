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
  // The player's progress writes (research 10-kp-api §7). Route them again after fakeHome to change them.
  api.on('GET', '/v1/watching/marktime', { json: { status: 200 } });
  api.on('GET', '/v1/watching/toggle', { json: { status: 200, watched: 1 } });
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

/** GET /v1/items/<id>: the title's details. Also lets the player fetch stream links for its videos. */
export function fakeTitle(api: FakeApi, item: FakeItem): void {
  api.on('GET', `/v1/items/${item.id}`, { json: { status: 200, item } });
  fakeMediaLinks(api, [...(item.videos ?? []), ...(item.seasons ?? []).flatMap((s) => s.episodes)]);
}

/** The stream qualities every fake video comes in, best first. */
export const FAKE_QUALITIES = [
  { quality: '1080p', quality_id: 3, w: 1920, h: 1080 },
  { quality: '720p', quality_id: 2, w: 1280, h: 720 },
] as const;

/** Where the fake CDN serves a video's stream, e.g. `streamUrl(210, '1080p', 'hls4')`. Nothing is fetched from it. */
export function streamUrl(mid: number, quality: string, type: 'http' | 'hls' | 'hls2' | 'hls4'): string {
  return `${FAKE_CDN_BASE_URL}/${type}/${mid}/${quality}.${type === 'http' ? 'mp4' : 'm3u8'}`;
}

const mediaByApi = new WeakMap<FakeApi, Map<number, FakeVideo>>();

/**
 * GET /v1/items/media-links?mid=<video id>: the stream links of each video, in every FAKE_QUALITIES rung.
 * The body has no `status` and uses `urls`, as the real endpoint does (research 10-kp-api §6.6).
 */
export function fakeMediaLinks(api: FakeApi, videos: FakeVideo[]): void {
  let known = mediaByApi.get(api);
  if (!known) {
    const media = new Map<number, FakeVideo>();
    known = media;
    mediaByApi.set(api, media);
    api.on('GET', '/v1/items/media-links', (req) => {
      const video = media.get(Number(req.query.mid));
      if (!video) return { status: 404, json: { status: 404, error: 'not found' } };
      return {
        json: {
          files: FAKE_QUALITIES.map(({ quality, quality_id, w, h }) => ({
            codec: 'h264',
            w,
            h,
            quality,
            quality_id,
            file: `/${video.id}/${quality}.mp4`,
            urls: {
              http: streamUrl(video.id, quality, 'http'),
              hls: streamUrl(video.id, quality, 'hls'),
              hls2: streamUrl(video.id, quality, 'hls2'),
              hls4: streamUrl(video.id, quality, 'hls4'),
            },
          })),
          subtitles: video.subtitles,
        },
      };
    });
  }
  for (const video of videos) known.set(video.id, video);
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
