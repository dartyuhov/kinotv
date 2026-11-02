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

/** GET /v1/items/{id} → `item`. Videos, seasons and files are added by the title page ticket. */
export type ItemDetails = ItemSummary;
