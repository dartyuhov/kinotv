import { describe, expect, it } from 'vitest';
import { markEpisodesWatched } from './markWatched';
import type { WatchingItem } from '../api/types';

describe('mark episodes watched through service progress', () => {
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
});
