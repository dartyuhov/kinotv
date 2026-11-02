import type { Http } from './http';
import type {
  BookmarkFolder,
  ItemDetails,
  ItemSummary,
  Page,
  Pagination,
  Ref,
  Season,
  User,
  Video,
  WatchingItem,
  WatchingMovie,
  WatchingSerial,
  WatchingVideo,
  WatchStatus,
  ContentType,
  Genre,
} from './types';

/** The device's entry in the account's device list (research 10-kp-api §1.5). */
export interface DeviceDescription {
  title: string;
  hardware: string;
  software: string;
}

/** Server-ranked catalog lists (research 10-kp-api §6.2). */
export type Shortcut = 'fresh' | 'hot' | 'popular';

export interface ShortcutQuery {
  /** Required by the API. Several types (e.g. `['movie', 'serial']`) give one merged, ranked feed. */
  types: readonly string[];
  /** 1-based. */
  page?: number;
  perpage?: number;
}

/** GET /v1/items filters (research 10-kp-api §6.1). Unset filters are left out of the request. */
export interface ItemsQuery {
  /** A content type id from GET /v1/types. Left out: every type. */
  type?: string;
  genre?: number;
  country?: number;
  /** A year (`2024`) or a range of years (`2010-2019`). */
  year?: string;
  /** A field with `-` appended for descending order, e.g. `created-`. */
  sort?: string;
  /** 1-based. */
  page?: number;
  perpage?: number;
}

/**
 * The typed kino.watch API v1 (spec §3, §7.3). Every method resolves with parsed data or rejects with
 * an ApiError. Requests carry the session's access token, and a 401 is refreshed and retried once.
 *
 * To add an endpoint: add a method here that calls `http` with the path and params, unwrap the
 * response envelope, and add its response type to ./types.ts. Use GET for reads (they are retried on
 * network, timeout and 5xx errors) and POST with `form` for writes.
 */
export interface ApiClient {
  /** The signed-in account and its subscription. */
  user(): Promise<User>;
  /** Registers this device in the account's device list, or updates its entry. */
  deviceNotify(device: DeviceDescription): Promise<void>;
  /** Removes this device from the account's device list. */
  deviceUnlink(): Promise<void>;
  /** GET /v1/items/{fresh|hot|popular}: one page of a server-ranked list. */
  shortcut(kind: Shortcut, query: ShortcutQuery): Promise<Page<ItemSummary>>;
  /** GET /v1/items/{id}: one title's details. */
  item(id: number): Promise<ItemDetails>;
  /** GET /v1/watching/movies: films the viewer started and hasn't finished. */
  watchingMovies(): Promise<WatchingMovie[]>;
  /** GET /v1/watching/serials: followed series (`subscribed`) or every series with unwatched episodes. */
  watchingSerials(subscribed: boolean): Promise<WatchingSerial[]>;
  /** GET /v1/watching?id=: the viewer's saved position in each part or episode of a title. */
  watching(id: number): Promise<WatchingItem>;
  /** GET /v1/items: one page of the catalog, filtered and sorted. */
  items(query: ItemsQuery): Promise<Page<ItemSummary>>;
  /** GET /v1/types: the catalog's content types. */
  types(): Promise<ContentType[]>;
  /** GET /v1/genres?type=: the genres of a content type's family. */
  genres(type: string): Promise<Genre[]>;
  /** GET /v1/countries. */
  countries(): Promise<Ref[]>;
  /**
   * GET /v1/watching/togglewatchlist?id=: follows the series if the viewer doesn't, unfollows it if they
   * do (I Watch). Resolves with whether the series is followed now. A toggle, so it is never retried.
   */
  toggleWatchlist(id: number): Promise<boolean>;
  /** GET /v1/items/search: titles whose name matches `q`, ranked by the server (research 10-kp-api §6.3). */
  search(q: string, options?: SearchOptions): Promise<Page<ItemSummary>>;
  /** GET /v1/bookmarks: the viewer's bookmark folders. */
  bookmarkFolders(): Promise<BookmarkFolder[]>;
  /** GET /v1/bookmarks/{id}: every title in one folder (all pages), newest first. */
  bookmarkFolderItems(folderId: number): Promise<ItemSummary[]>;
  /** GET /v1/bookmarks/get-item-folders: the ids of the folders that hold a title. */
  itemBookmarkFolders(itemId: number): Promise<number[]>;
  /** POST /v1/bookmarks/add: puts a title in a folder. */
  addBookmark(itemId: number, folderId: number): Promise<void>;
  /** POST /v1/bookmarks/remove-item: takes a title out of a folder. */
  removeBookmark(itemId: number, folderId: number): Promise<void>;
}

export interface SearchOptions {
  perpage?: number;
  /** Cancels the request, e.g. when the viewer has typed more. */
  signal?: AbortSignal;
}

export function createApiClient(http: Http): ApiClient {
  return {
    async user() {
      const res = await http<{ user: User }>({ method: 'GET', path: '/v1/user' });
      return res.user;
    },
    async deviceNotify(device) {
      await http({ method: 'POST', path: '/v1/device/notify', form: { ...device } });
    },
    async deviceUnlink() {
      await http({ method: 'POST', path: '/v1/device/unlink' });
    },
    async shortcut(kind, { types, page = 1, perpage }) {
      const res = await http<{ items?: ItemSummary[]; pagination?: Partial<Record<keyof Pagination, unknown>> }>({
        method: 'GET',
        path: `/v1/items/${kind}`,
        query: { type: types.join(','), page, perpage },
      });
      return { items: res.items ?? [], pagination: pagination(res.pagination) };
    },
    async item(id) {
      const res = await http<{ item: ItemDetails }>({ method: 'GET', path: `/v1/items/${id}`, query: { nolinks: 1 } });
      return details(res.item);
    },
    async watchingMovies() {
      const res = await http<{ items?: WatchingMovie[] }>({ method: 'GET', path: '/v1/watching/movies' });
      return res.items ?? [];
    },
    async watchingSerials(subscribed) {
      const res = await http<{ items?: Array<WatchingMovie & Record<'total' | 'watched' | 'new', unknown>> }>({
        method: 'GET',
        path: '/v1/watching/serials',
        query: { subscribed: subscribed ? 1 : 0 },
      });
      return (res.items ?? []).map((s) => ({ ...s, total: num(s.total), watched: num(s.watched), new: num(s.new) }));
    },
    async watching(id) {
      const res = await http<{ item: WatchingItem }>({ method: 'GET', path: '/v1/watching', query: { id } });
      const { item } = res;
      return {
        ...item,
        videos: item.videos?.map(video),
        seasons: item.seasons?.map((s) => ({ ...s, number: num(s.number), episodes: (s.episodes ?? []).map(video) })),
      };
    },
    async items({ type, genre, country, year, sort, page = 1, perpage }) {
      const res = await http<{ items?: ItemSummary[]; pagination?: Partial<Record<keyof Pagination, unknown>> }>({
        method: 'GET',
        path: '/v1/items',
        query: { type, genre, country, year, sort, page, perpage },
      });
      return { items: res.items ?? [], pagination: pagination(res.pagination) };
    },
    // Reference lists come wrapped as {status, items} (research 10-kp-api §5).
    async types() {
      const res = await http<{ items?: ContentType[] }>({ method: 'GET', path: '/v1/types' });
      return (res.items ?? []).map((type) => ({ id: String(type.id), title: type.title }));
    },
    async genres(type) {
      const res = await http<{ items?: Genre[] }>({ method: 'GET', path: '/v1/genres', query: { type } });
      return (res.items ?? []).map((genre) => ({ id: num(genre.id), title: genre.title }));
    },
    async countries() {
      const res = await http<{ items?: Ref[] }>({ method: 'GET', path: '/v1/countries' });
      return (res.items ?? []).map((country) => ({ id: num(country.id), title: country.title }));
    },
    async toggleWatchlist(id) {
      const res = await http<{ watching?: unknown }>({ method: 'GET', path: '/v1/watching/togglewatchlist', query: { id }, retry: false });
      return Boolean(res.watching);
    },
    async search(q, { perpage, signal } = {}) {
      // field=title, as other kino.watch TV clients send for their search box: ranked title matches only.
      const res = await http<{ items?: ItemSummary[]; pagination?: Partial<Record<keyof Pagination, unknown>> }>({
        method: 'GET',
        path: '/v1/items/search',
        query: { q, field: 'title', perpage },
        signal,
      });
      return { items: res.items ?? [], pagination: pagination(res.pagination) };
    },
    async bookmarkFolders() {
      const res = await http<{ items?: Array<Record<keyof BookmarkFolder, unknown>> }>({ method: 'GET', path: '/v1/bookmarks' });
      return (res.items ?? []).map((f) => ({ id: num(f.id), title: String(f.title ?? ''), count: num(f.count) }));
    },
    async bookmarkFolderItems(folderId) {
      const items: ItemSummary[] = [];
      // Folders are paged; a viewer's folder is rarely long, so it is fetched whole (up to a cap).
      for (let page = 1; page <= MAX_BOOKMARK_PAGES; page++) {
        const res = await http<{ items?: ItemSummary[]; pagination?: Partial<Record<keyof Pagination, unknown>> }>({
          method: 'GET',
          path: `/v1/bookmarks/${folderId}`,
          query: { page, perpage: BOOKMARK_PAGE_SIZE },
        });
        items.push(...(res.items ?? []));
        if (page >= num(res.pagination?.total)) break;
      }
      return items;
    },
    async itemBookmarkFolders(itemId) {
      const res = await http<{ folders?: Array<{ id: unknown }> }>({
        method: 'GET',
        path: '/v1/bookmarks/get-item-folders',
        query: { item: itemId },
      });
      return (res.folders ?? []).map((f) => num(f.id));
    },
    // Bookmark writes ignore ids in the query string ("item not found"): they go in the form body.
    async addBookmark(itemId, folderId) {
      await http({ method: 'POST', path: '/v1/bookmarks/add', form: { item: itemId, folder: folderId } });
    },
    async removeBookmark(itemId, folderId) {
      await http({ method: 'POST', path: '/v1/bookmarks/remove-item', form: { item: itemId, folder: folderId } });
    },
  };
}

const BOOKMARK_PAGE_SIZE = 50;
const MAX_BOOKMARK_PAGES = 20;

// Numbers sometimes arrive as strings ("128") or are missing.
function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pagination(raw: Partial<Record<keyof Pagination, unknown>> | undefined): Pagination {
  return {
    total: num(raw?.total),
    current: num(raw?.current),
    perpage: num(raw?.perpage),
    ...(raw?.total_items === undefined ? {} : { total_items: num(raw.total_items) }),
  };
}

function video(v: WatchingVideo): WatchingVideo {
  return {
    ...v,
    number: num(v.number),
    duration: num(v.duration),
    time: num(v.time),
    status: num(v.status) as WatchStatus,
    updated: v.updated === null || v.updated === undefined ? null : num(v.updated),
  };
}

function details(item: ItemDetails): ItemDetails {
  const { duration } = item;
  return {
    ...item,
    ...(duration ? { duration: { average: num(duration.average), total: num(duration.total) } } : {}),
    videos: item.videos?.map(detailVideo),
    seasons: item.seasons?.map(
      (s): Season => ({ ...s, number: num(s.number), title: s.title ?? '', episodes: (s.episodes ?? []).map(detailVideo) }),
    ),
  };
}

function detailVideo(v: Video): Video {
  return {
    ...v,
    id: num(v.id),
    number: num(v.number),
    snumber: num(v.snumber),
    title: v.title ?? '',
    duration: num(v.duration),
    audios: v.audios ?? [],
    subtitles: v.subtitles ?? [],
  };
}
