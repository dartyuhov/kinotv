import type { WatchingItem } from '../../src/core/api/types';
import { seriesProgress, type EpisodeMark, type FakeItem } from './catalog';
import type { FakeApi, FakeResponse } from './fakeApi';

/** Stateful account substitute, isolated from the default non-persisting progress fixture. */
export function fakeWatched(api: FakeApi, series: FakeItem, marks: EpisodeMark[] = []) {
  const state = structuredClone((seriesProgress(series, marks).json as { item: WatchingItem }).item);
  const failures = new Map<number, 'reject' | 'lost'>();
  let gate: Promise<void> | undefined;
  api.on('GET', '/v1/watching', () => ({ json: { item: state } }));
  api.on('GET', '/v1/watching/toggle', async ({ query }): Promise<FakeResponse> => {
    await gate;
    const episode = state.seasons?.find((s) => s.number === Number(query.season))?.episodes.find((e) => e.number === Number(query.video));
    if (!episode) return { status: 404 };
    const failure = failures.get(episode.number);
    if (failure === 'reject') return { status: 400, json: { error: 'rejected' } };
    episode.status = episode.status === 1 ? -1 : 1;
    if (failure === 'lost') return { networkError: true };
    return { json: { watched: episode.status === 1 ? 1 : 0 } };
  });
  return { state, failures, hold(promise: Promise<void>) { gate = promise; } };
}
