import { fakeItem, type FakeItem } from './catalog';
import type { FakeApi, FakeResponse, RecordedRequest } from './fakeApi';

// The viewer's kino.watch bookmark folders (research 10-kp-api §8), kept as server state: writes change
// what later reads return, so a test can check what the app shows after a round trip.

export interface FakeFolder {
  id: number;
  title: string;
  /** Newest first, as the server lists them. */
  items: FakeItem[];
}

const CREATED = 1_790_000_000;

/**
 * A stateful fake of the bookmark endpoints. Like the real server, writes read `item` and `folder` from
 * the form body only: ids in the query string get "item not found" (research 10-kp-api §0.5).
 *
 * - `folders` is the server state; change it between visits to play "changed on another device".
 * - `holdWrites()` keeps add/remove answers back until the returned `release()` is called.
 * - Reject a write by routing it yourself afterwards, e.g. `api.on('POST', '/v1/bookmarks/add', { status: 500 })`.
 */
export class FakeBookmarks {
  private held: Array<() => void> | null = null;

  constructor(
    private readonly api: FakeApi,
    public folders: FakeFolder[],
    /** Titles the server can add to a folder, by id (others become a generic fakeItem). */
    private readonly catalog: FakeItem[] = [],
  ) {
    api.on('GET', '/v1/bookmarks', () => this.list());
    api.on('GET', '/v1/bookmarks/get-item-folders', (req) => this.itemFolders(Number(req.query.item)));
    api.on('POST', '/v1/bookmarks/add', (req) => this.write(req, (folder, item) => {
      if (!folder.items.some((i) => i.id === item)) folder.items.unshift(this.find(item));
    }));
    api.on('POST', '/v1/bookmarks/remove-item', (req) => this.write(req, (folder, item) => {
      folder.items = folder.items.filter((i) => i.id !== item);
    }));
    for (const folder of folders) this.routeFolder(folder.id);
  }

  /** Adds a folder, as if the viewer created it on another device. */
  addFolder(folder: FakeFolder): void {
    this.folders.push(folder);
    this.routeFolder(folder.id);
  }

  folder(id: number): FakeFolder {
    const folder = this.folders.find((f) => f.id === id);
    if (!folder) throw new Error(`no fake bookmark folder ${id}`);
    return folder;
  }

  /** Holds back the answers to add and remove until `release()`. */
  holdWrites(): () => void {
    this.held = [];
    return () => {
      const held = this.held ?? [];
      this.held = null;
      for (const answer of held) answer();
    };
  }

  private routeFolder(id: number): void {
    this.api.on('GET', `/v1/bookmarks/${id}`, () => {
      const folder = this.folders.find((f) => f.id === id);
      if (!folder) return { status: 404, json: { status: 404, error: 'not found' } };
      return {
        json: {
          status: 200,
          folder: summary(folder),
          items: folder.items,
          pagination: { total: 1, current: 1, perpage: Math.max(folder.items.length, 1), total_items: folder.items.length },
        },
      };
    });
  }

  private list(): FakeResponse {
    return { json: { status: 200, items: this.folders.map((f) => ({ ...summary(f), count: String(f.items.length) })) } };
  }

  private itemFolders(item: number): FakeResponse {
    return { json: { status: 200, folders: this.folders.filter((f) => f.items.some((i) => i.id === item)).map(summary) } };
  }

  private async write(req: RecordedRequest, change: (folder: FakeFolder, item: number) => void): Promise<FakeResponse> {
    if (this.held) await new Promise<void>((resolve) => this.held!.push(resolve));
    const body = (req.body ?? {}) as Record<string, string>;
    const folder = this.folders.find((f) => f.id === Number(body.folder));
    if (!body.item || !folder) return { status: 404, json: { status: 404, error: 'item not found' } };
    change(folder, Number(body.item));
    return { json: { status: 200 } };
  }

  private find(id: number): FakeItem {
    return this.catalog.find((i) => i.id === id) ?? fakeItem(id);
  }
}

function summary({ id, title }: FakeFolder) {
  return { id, title, views: 0, created: CREATED, updated: CREATED };
}

/** Routes the bookmark endpoints over `folders` (none by default). Every test gets an empty set of folders. */
export function fakeBookmarks(api: FakeApi, folders: FakeFolder[] = [], catalog: FakeItem[] = []): FakeBookmarks {
  return new FakeBookmarks(api, folders, catalog);
}
