import { describe, expect, it } from 'vitest';
import type { WatchingVideo } from '../api/types';
import { resumePoint } from './resume';

const video = (number: number, over: Partial<WatchingVideo> = {}): WatchingVideo => ({
  id: number,
  number,
  title: '',
  duration: 1000,
  time: 0,
  status: -1,
  updated: null,
  ...over,
});

describe('resumePoint', () => {
  it('is null for a title the viewer never started', () => {
    expect(resumePoint({ id: 1, type: 'movie', title: '', videos: [video(1)] })).toBeNull();
  });

  it('is the most recently watched episode across seasons, with how far into it', () => {
    const point = resumePoint({
      id: 1,
      type: 'serial',
      title: '',
      seasons: [
        { id: 10, number: 1, episodes: [video(1, { status: 1, time: 1000, updated: 100 }), video(2, { time: 250, status: 0, updated: 300 })] },
        { id: 20, number: 2, episodes: [video(1, { time: 900, status: 0, updated: 200 })] },
      ],
    });
    expect(point).toEqual({ season: 1, number: 2, fraction: 0.25, time: 250 });
  });

  it('counts a watched video as complete whatever its saved time', () => {
    const point = resumePoint({ id: 1, type: 'movie', title: '', videos: [video(1, { status: 1, time: 0, updated: 5 })] });
    expect(point).toEqual({ season: null, number: 1, fraction: 1, time: 0 });
  });
});
