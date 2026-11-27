import { describe, expect, it } from 'vitest';
import { createApiClient } from './client';
import type { Http, HttpRequest } from './http';

type Row = { item: { id: number; title: string }; media: { id: number; duration: number }; time: number; last_seen: number };
const row = (id: number, lastSeen: number, mediaId = id * 10): Row =>
  ({ item: { id, title: `T${id}` }, media: { id: mediaId, duration: 100 }, time: 10, last_seen: lastSeen });

/** A fake /v1/history over `pages`; each page answers after `delays[page]` ms and in-flight requests are counted. */
function server(pages: Row[][], { delays = {} as Record<number, number>, total = () => pages.length, fail = new Set<number>() } = {}) {
  const requested: number[] = [];
  let inFlight = 0;
  let peak = 0;
  const http = (async (request: HttpRequest) => {
    const page = Number(request.query?.page);
    requested.push(page);
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, delays[page] ?? 1));
    inFlight--;
    if (fail.has(page)) throw new Error(`page ${page} failed`);
    return { history: pages[page - 1] ?? [], pagination: { total: total(), current: page, perpage: 50 } };
  }) as Http;
  return { api: createApiClient(http), requested, peak: () => peak };
}

describe('history', () => {
  it('reads page 1, then the rest at most six at a time, merging latest per title in last_seen order', async () => {
    const pages = Array.from({ length: 12 }, (_, p) => [row(p + 1, 1000 - p), row(100, p === 7 ? 5000 : 1, 999 + p)]);
    // Later pages answer first, so arrival order differs from page order.
    const delays = Object.fromEntries(Array.from({ length: 12 }, (_, p) => [p + 1, 30 - p * 2]));
    const { api, requested, peak } = server(pages, { delays });
    const history = await api.history();
    expect(requested[0]).toBe(1);
    expect([...requested].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, p) => p + 1));
    expect(peak()).toBe(6);
    expect(history.map((e) => e.item.id)).toEqual([100, ...Array.from({ length: 12 }, (_, p) => p + 1)]);
    expect(history[0]).toMatchObject({ lastSeen: 5000, mediaId: 1006 });
  });

  it('reads an empty or single-page history with one request', async () => {
    const empty = server([]);
    expect(await empty.api.history()).toEqual([]);
    expect(empty.requested).toEqual([1]);
    const single = server([[row(1, 5), row(2, 9)]]);
    expect((await single.api.history()).map((e) => e.item.id)).toEqual([2, 1]);
    expect(single.requested).toEqual([1]);
  });

  it('fails as a whole when a page fails, and starts no page after the failure', async () => {
    const pages = Array.from({ length: 20 }, (_, p) => [row(p + 1, p)]);
    const { api, requested } = server(pages, { fail: new Set([3]), delays: { 3: 1 } });
    await expect(api.history()).rejects.toThrow('page 3 failed');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requested.length).toBeLessThan(20);
  });

  it('skips pages past a total that shrank during the read', async () => {
    const pages = [[row(1, 3)], [row(2, 2)], [row(3, 1)]];
    let reads = 0;
    const { api } = server(pages, { total: () => (reads++ === 0 ? 3 : 2) });
    expect((await api.history()).map((e) => e.item.id)).toEqual([1, 2]);
  });

  it('rejects unsupported pagination', async () => {
    await expect(server([[row(1, 1)]], { total: () => 201 }).api.history()).rejects.toThrow('History pagination unsupported');
  });
});
