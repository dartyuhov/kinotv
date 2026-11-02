import type { Http } from './http';
import type {
  ItemDetails,
  ItemSummary,
  Page,
  Pagination,
  User,
  WatchingItem,
  WatchingMovie,
  WatchingSerial,
  WatchingVideo,
  WatchStatus,
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
      return res.item;
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
  };
}

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
