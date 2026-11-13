import { expect, it } from 'vitest';
import { createApiClient } from '../api/client';
import type { Http } from '../api/http';
import { historyTarget } from './history';
import type { HistoryEntry, ItemDetails } from '../api/types';

it('fetches all pages before newest-first title deduplication, without assuming page order', async () => {
  const pages: number[] = [];
  const http = (async ({ query }: { query: { page: number } }) => {
    pages.push(query.page);
    return { history: query.page === 1
      ? [{ item: { id: '7', title: 'Series' }, media: { id: '71' }, last_seen: '100', time: '20' },
        { item: { id: 8, title: 'Film' }, media: null, last_seen: 200, time: 0 }]
      : [{ item: { id: 7, title: 'Series' }, media: { id: 72 }, last_seen: 300, time: 80 }],
      pagination: { current: query.page, total: '2', perpage: '50' } };
  }) as unknown as Http;
  const entries = await createApiClient(http).history();
  expect(pages).toEqual([1, 2]);
  expect(entries.map((e) => [e.item.id, e.mediaId, e.time, e.lastSeen])).toEqual([[7, 72, 80, 300], [8, null, 0, 200]]);
});

it('resolves exact historical media id rather than next unwatched; completed episodes replay at zero', () => {
  const item = { id: 7, seasons: [{ number: 4, episodes: [{ id: 72, number: 2, duration: 100 }] }] } as ItemDetails;
  const entry = { item: { id: 7 }, mediaId: 72, time: 60, duration: 100, lastSeen: 300 } as HistoryEntry;
  expect(historyTarget(item, entry)).toEqual({ itemId: 7, season: 4, episode: 2, startAt: 60 });
  expect(historyTarget(item, { ...entry, time: 100 })).toEqual({ itemId: 7, season: 4, episode: 2, startAt: 0 });
  expect(historyTarget(item, { ...entry, mediaId: null })).toBeNull();
});

it('does not publish an apparently globally ordered prefix when a later page fails', async () => {
  const http = (async ({ query }: { query: { page: number } }) => {
    if (query.page === 2) throw new Error('offline');
    return { history: [{ item: { id: 7 }, media: { id: 72 }, last_seen: 100 }], pagination: { current: 1, total: 2 } };
  }) as unknown as Http;
  await expect(createApiClient(http).history()).rejects.toThrow('offline');
});

it('replays an explicitly watched episode from zero even when its historical saved time is partial', () => {
  const item = { id: 7, seasons: [{ number: 4, episodes: [{ id: 72, number: 2, duration: 100 }] }] } as ItemDetails;
  const entry = { item: { id: 7 }, mediaId: 72, time: 20, duration: 100, lastSeen: 300 } as HistoryEntry;
  const progress = { id: 7, type: 'serial', title: '', seasons: [{ id: 9, number: 4, episodes: [
    { id: 72, number: 2, title: '', duration: 100, time: 20, status: 1 as const, updated: 300 },
  ] }] };
  expect(historyTarget(item, entry, progress)).toEqual({ itemId: 7, season: 4, episode: 2, startAt: 0 });
});

it('rejects missing pagination rather than pretending the first page is complete history', async () => {
  const http = (async () => ({ history: [] })) as unknown as Http;
  await expect(createApiClient(http).history()).rejects.toThrow('pagination');
});
