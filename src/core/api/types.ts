// Response shapes of kino.watch API v1, as observed (research 10-kp-api §13). Fields the app doesn't use
// yet are left out; add them when a screen needs them. Some numbers arrive as strings: coerce with Number().

/** GET /v1/user → `user`. Account data: never log it. */
export interface User {
  username: string;
  /** Unix seconds. */
  reg_date: number;
  subscription: {
    active: boolean;
    /** Unix seconds. */
    end_time: number;
    /** Days left, fractional. */
    days: number;
  };
  profile: { name: string | null; avatar: string };
}

/**
 * Artwork URLs (research 10-kp-api §6.1): small 165×250, medium 250×375, big 500×750. `wide` is backdrop
 * art of varying size (up to 3840×2160) and may be missing. Pick one through ui/components/artwork.ts.
 */
export interface Posters {
  small: string;
  medium: string;
  big: string;
  wide?: string;
}

export interface Ref {
  id: number;
  title: string;
}

/** List paging. `total` counts PAGES, not items. Coerced to numbers by the client. */
export interface Pagination {
  total: number;
  /** 1-based. */
  current: number;
  perpage: number;
  total_items?: number;
}

export interface Page<T> {
  items: T[];
  pagination: Pagination;
}

/** An item in catalog lists (`/v1/items`, fresh, hot, popular, search, bookmarks). Lists carry no files. */
export interface ItemSummary {
  id: number;
  /** Content type id: movie, serial, documovie, docuserial, tvshow, concert, 3D… */
  type: string;
  subtype: string;
  /** "Russian / Original" in one string; see splitTitle in core/catalog/titles.ts. */
  title: string;
  year?: number;
  genres?: Ref[];
  plot?: string;
  /** Highest vertical resolution, e.g. 2160. */
  quality?: number;
  imdb_rating?: number | null;
  kinopoisk_rating?: number | null;
  posters: Posters;
}

/** GET /v1/watching/movies: a film the viewer started and hasn't finished. */
export interface WatchingMovie {
  id: number;
  type: string;
  subtype: string;
  title: string;
  posters: Posters;
}

/** GET /v1/watching/serials: a series with unwatched episodes. Counts are coerced to numbers by the client. */
export interface WatchingSerial extends WatchingMovie {
  /** Episodes in the series. */
  total: number;
  /** Episodes the viewer has watched. */
  watched: number;
  /** New episodes since the viewer last watched. */
  new: number;
}

/** -1 not watched, 0 started, 1 watched. */
export type WatchStatus = -1 | 0 | 1;

/** A film part or an episode in GET /v1/watching. Times are seconds, coerced to numbers. */
export interface WatchingVideo {
  id: number;
  /** 1-based episode or part number. */
  number: number;
  title: string;
  duration: number;
  /** Saved position. */
  time: number;
  status: WatchStatus;
  /** Unix seconds of the last change, or null if never watched. */
  updated: number | null;
}

export interface WatchingSeason {
  id: number;
  number: number;
  episodes: WatchingVideo[];
}

/** GET /v1/watching?id= → `item`: the viewer's position in each part (films) or episode (series). */
export interface WatchingItem {
  id: number;
  type: string;
  title: string;
  videos?: WatchingVideo[];
  seasons?: WatchingSeason[];
}

/** An audio track of a video (research 10-kp-api §6.5). `index` is its order in the stream. */
export interface Audio {
  id: number;
  index: number;
  codec: string;
  channels: number;
  /** ISO 639-2, e.g. "rus", "eng"; "unk" when unknown. */
  lang: string;
  /** Dubbing kind, e.g. "Дубляж" / "DUB". */
  type: { id: number; title: string; short_title: string | null } | null;
  /** The studio that made the dub. */
  author: { id: number; title: string; short_title: string | null } | null;
}

/** An external subtitle track. */
export interface Subtitle {
  /** ISO 639-2. */
  lang: string;
  /** Seconds to shift against the video. */
  shift: number;
  embed: boolean;
  url?: string;
}

/**
 * A film part or a series episode in the item details. Numbers are coerced by the client. The viewer's
 * position is NOT read from here (the details are cached for 10 minutes): use GET /v1/watching.
 */
export interface Video {
  /** Media id. */
  id: number;
  /** 1-based episode or part number: the `video=` of the watching calls. */
  number: number;
  /** Season number; 0 for films. */
  snumber: number;
  title: string;
  /** A 480×270 still, when there is one. */
  thumbnail?: string;
  /** Seconds. */
  duration: number;
  audios: Audio[];
  subtitles: Subtitle[];
}

export interface Season {
  id: number;
  number: number;
  /** Usually empty. */
  title: string;
  episodes: Video[];
}

/**
 * GET /v1/items/{id} → `item` (fetched with nolinks=1, so files carry no stream URLs). Films have
 * `videos` (one per part); series have `seasons`. Check which array is there rather than the type.
 */
export interface ItemDetails extends ItemSummary {
  /** Seconds: `total` is the whole film or series, `average` one part or episode. */
  duration?: { average: number; total: number };
  /** Not a documented API v1 field (only api2 has it, research 10-kp-api §11): shown when it is sent. */
  age_rating?: string | number | null;
  videos?: Video[];
  seasons?: Season[];
  /** Series: whether the viewer follows it (I Watch). The API sends both names for the same flag. */
  subscribed?: boolean;
  in_watchlist?: boolean;
}

/** GET /v1/bookmarks: one of the viewer's bookmark folders. `count` (titles in it) is coerced by the client. */
export interface BookmarkFolder {
  id: number;
  title: string;
  count: number;
}

/** GET /v1/types → `items`: a content type. Its id is a string: movie, serial, 3D, concert… */
export interface ContentType {
  id: string;
  title: string;
}

/** GET /v1/genres → `items`. Genres belong to a family of types; the same title can recur with another id. */
export interface Genre {
  id: number;
  title: string;
}
