import { describe, expect, it } from 'vitest';
import { createWatchedActions, markEpisodesWatched, markVideoWatched } from './markWatched';
import type { WatchingItem } from '../api/types';
import { createProgressReporter } from '../sync/progressReporter';

describe('mark episodes watched through service progress', () => {
  it('sets unwatched state once across overlapping requests and reconciles a lost response', async () => {
    let status = 1;
    let toggles = 0;
    const owner = createWatchedActions({
      async watching(): Promise<WatchingItem> {
        const snapshot = status;
        await Promise.resolve();
        return { id: 8, type: 'serial', title: 'Series', seasons: [{ id: 90, number: 2, episodes: [
          { id: 100, number: 1, title: '', time: 0, duration: 100, status: snapshot as -1 | 1, updated: null },
        ] }] };
      },
      async toggleWatched() { toggles++; status = -1; throw new Error('lost response'); },
    });
    const where = { id: 8, season: 2, video: 1 };
    await Promise.all([owner.mark(where, false), owner.mark(where, false)]);
    expect(status).toBe(-1);
    expect(toggles).toBe(1);
  });

  it('retains partial unwatch success and skips episodes already unwatched', async () => {
    const statuses = [-1, 1, 1];
    const calls: number[] = [];
    const result = await markEpisodesWatched({
      async watching(): Promise<WatchingItem> {
        return { id: 8, type: 'serial', title: 'Series', seasons: [{ id: 90, number: 2,
          episodes: statuses.map((status, i) => ({ id: 100 + i, number: i + 1, title: '', time: 0, duration: 100, status: status as -1 | 1, updated: null })) }] };
      },
      async toggleWatched(where) {
        calls.push(where.video);
        if (where.video === 2) statuses[1] = -1;
        throw new Error('connection lost');
      },
    }, 8, 2, [1, 2, 3], undefined, false);
    expect(calls).toEqual([2, 3]);
    expect(result).toEqual({ confirmed: 2, failed: 1 });
    expect(statuses).toEqual([-1, -1, 1]);
  });

  it('serializes independent manual owners so concurrent season/episode requests never unwatch', async () => {
    let status = -1;
    let toggles = 0;
    const api = {
      async watching(): Promise<WatchingItem> {
        const snapshot = status;
        await Promise.resolve();
        return { id: 8, type: 'serial', title: 'Series', seasons: [{ id: 90, number: 2,
          episodes: [{ id: 100, number: 1, title: '', time: 0, duration: 100, status: snapshot as -1 | 1, updated: null }] }] };
      },
      async toggleWatched() { toggles++; status = status === 1 ? -1 : 1; return { watched: status === 1 }; },
    };
    const results = await Promise.all([markEpisodesWatched(api, 8, 2, [1]), markEpisodesWatched(api, 8, 2, [1])]);
    expect(results).toEqual([{ confirmed: 1, failed: 0 }, { confirmed: 1, failed: 0 }]);
    expect(toggles).toBe(1);
    expect(status).toBe(1);
  });
  it('skips fresh watched state, reconciles a lost response, and retains partial success', async () => {
    const statuses = [1, -1, -1];
    const calls: number[] = [];
    const watching = async (): Promise<WatchingItem> => ({ id: 8, type: 'serial', title: 'Series', seasons: [{ id: 90, number: 2,
      episodes: statuses.map((status, i) => ({ id: 100 + i, number: i + 1, title: '', time: 0, duration: 100, status: status as -1 | 1, updated: null })) }] });
    const result = await markEpisodesWatched({ watching, async toggleWatched(where) {
      calls.push(where.video);
      if (where.video === 2) statuses[1] = 1; // applied, but its response was lost
      throw new Error('connection lost');
    } }, 8, 2, [1, 2, 3]);
    expect(calls).toEqual([2, 3]);
    expect(result).toEqual({ confirmed: 2, failed: 1 });
    expect(statuses).toEqual([1, 1, -1]);
  });

  it('shares episode/season and playback owners across remounts, including film parts', async () => {
    for (const season of [undefined, 2]) {
      let status = -1;
      let toggles = 0;
      const where = { id: 8, season, video: 1 };
      const api = {
        async watching(): Promise<WatchingItem> {
          const video = { id: 100, number: 1, title: '', time: 0, duration: 100, status: status as -1 | 1, updated: null };
          await Promise.resolve();
          return { id: 8, type: 'serial', title: 'Title', videos: [video], seasons: [{ id: 90, number: 2, episodes: [video] }] };
        },
        async toggleWatched() { toggles++; status = status === 1 ? -1 : 1; return { watched: status === 1 }; },
      };
      const reporter = createProgressReporter({ startAt: 0, save: async () => {}, markWatched: () => markVideoWatched(api, where) });
      const manual = markVideoWatched(api, where);
      reporter.position(95, 100);
      const reopened = season === undefined ? markVideoWatched(api, where) : markEpisodesWatched(api, 8, season, [1]);
      await Promise.all([manual, reopened, reporter.flush()]);
      reporter.dispose();
      expect(toggles).toBe(1);
      expect(status).toBe(1);
    }
  });

  it('cancels old-account queued work and never toggles a fresh account from an old progress response', async () => {
    let active = true;
    let release!: (value: WatchingItem) => void;
    let toggles = 0;
    let reads = 0;
    const owner = createWatchedActions({
      watching: () => { reads++; return new Promise((resolve) => { release = resolve; }); },
      toggleWatched: async () => { toggles++; return { watched: true }; },
    }, () => active);
    const first = owner.mark({ id: 8, season: 2, video: 1 });
    const queued = owner.mark({ id: 8, season: 2, video: 2 });
    const results = Promise.allSettled([first, queued]);
    await Promise.resolve();
    await Promise.resolve();
    active = false;
    release({ id: 8, type: 'serial', title: 'Old account', seasons: [{ id: 90, number: 2, episodes: [
      { id: 100, number: 1, title: '', time: 0, duration: 100, status: -1, updated: null },
    ] }] });
    expect((await results).map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(reads).toBe(1);
    expect(toggles).toBe(0);
  });

  it('does not retry a mutation whose outcome cannot be reconciled', async () => {
    let reads = 0;
    let toggles = 0;
    const result = await markEpisodesWatched({
      async watching(): Promise<WatchingItem> {
        if (++reads > 1) throw new Error('offline');
        return { id: 8, type: 'serial', title: 'Series', seasons: [{ id: 90, number: 2, episodes: [
          { id: 100, number: 1, title: '', time: 0, duration: 100, status: -1, updated: null },
        ] }] };
      },
      async toggleWatched() { toggles++; throw new Error('lost response'); },
    }, 8, 2, [1, 1]);
    expect(result).toEqual({ confirmed: 0, failed: 1 });
    expect(toggles).toBe(1);
  });
});
