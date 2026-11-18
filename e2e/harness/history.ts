import type { FakeApi } from './fakeApi';
import { fakeTitle, type FakeItem, type FakeVideo } from './catalog';

export interface FakeHistoryEntry {
  item: FakeItem;
  media: FakeVideo | null;
  time: number;
  last_seen: number;
  first_seen: number;
  counter: number;
}

export const historyEntry = (item: FakeItem, media: FakeVideo | null, time: number, last_seen: number): FakeHistoryEntry =>
  ({ item, media, time, last_seen, first_seen: 100, counter: 1 });

/** Paged history with persisted marktime writes; no real account or default fixture state. */
export function fakeHistory(api: FakeApi, pages: FakeHistoryEntry[][]) {
  const state = { pages };
  let now = 2_000_000_000;
  for (const entry of pages.flat()) fakeTitle(api, entry.item);
  api.on('GET', '/v1/history', ({ query }) => ({ json: {
    history: state.pages[Number(query.page) - 1] ?? [],
    pagination: { current: Number(query.page), total: state.pages.length, perpage: 50 },
  } }));
  api.on('GET', '/v1/watching/marktime', ({ query }) => {
    const entry = state.pages.flat().find((e) => e.item.id === Number(query.id) && e.media?.number === Number(query.video)
      && (e.media?.snumber || 0) === Number(query.season || 0));
    if (entry) { entry.time = Number(query.time); entry.last_seen = now++; }
    return { json: { status: 200 } };
  });
  return state;
}
