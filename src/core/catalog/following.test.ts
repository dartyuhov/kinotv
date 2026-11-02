import { describe, expect, it } from 'vitest';
import type { WatchingSerial } from '../api/types';
import { applyFollow, newEpisodesFirst, withNewEpisodes } from './following';

const posters = { small: 's', medium: 'm', big: 'b' };
const serial = (id: number, fresh: number): WatchingSerial => ({
  id,
  type: 'serial',
  subtype: '',
  title: `Series ${id}`,
  posters,
  total: 10,
  watched: 5,
  new: fresh,
});

describe('newEpisodesFirst', () => {
  it('puts the most new episodes first and keeps the server order otherwise', () => {
    const list = [serial(1, 0), serial(2, 1), serial(3, 0), serial(4, 3), serial(5, 1)];
    expect(newEpisodesFirst(list).map((s) => s.id)).toEqual([4, 2, 5, 1, 3]);
  });
});

describe('withNewEpisodes', () => {
  it('keeps only series with new episodes', () => {
    expect(withNewEpisodes([serial(1, 0), serial(2, 2)]).map((s) => s.id)).toEqual([2]);
  });
});

describe('applyFollow', () => {
  const { id, type, subtype, title } = serial(9, 0);
  const series = { id, type, subtype, title, posters };

  it('adds a followed series with no counts, and removes an unfollowed one', () => {
    expect(applyFollow([serial(1, 2)], { series, follow: true })).toEqual([serial(1, 2), { ...series, total: 0, watched: 0, new: 0 }]);
    expect(applyFollow([serial(1, 2), serial(9, 1)], { series, follow: false })).toEqual([serial(1, 2)]);
  });

  it('changes nothing when the list already agrees, so it can be applied again to a fresher list', () => {
    expect(applyFollow([serial(9, 4)], { series, follow: true })).toEqual([serial(9, 4)]);
    expect(applyFollow([serial(1, 0)], { series, follow: false })).toEqual([serial(1, 0)]);
  });
});
