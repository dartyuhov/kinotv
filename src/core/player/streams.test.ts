import { describe, expect, it } from 'vitest';
import type { VideoFile } from '../api/types';
import { pickStream } from './streams';

// kino.watch lists one file per quality and codec, each with several stream kinds (research 10-kp-api §6.5).
const file = (quality: string, quality_id: number, codec: string, kinds: Partial<Record<'http' | 'hls' | 'hls2' | 'hls4', string>>): VideoFile => ({
  codec,
  quality,
  quality_id,
  w: 0,
  h: 0,
  urls: kinds,
});

const FILES: VideoFile[] = [
  file('720p', 2, 'h264', { http: 'https://cdn.test/720.mp4', hls4: 'https://cdn.test/720.m3u8' }),
  file('2160p', 4, 'h265', { http: 'https://cdn.test/2160-hevc.mp4', hls4: 'https://cdn.test/2160-hevc.m3u8' }),
  file('1080p', 3, 'h264', { http: 'https://cdn.test/1080.mp4', hls4: 'https://cdn.test/1080.m3u8' }),
];

describe('pickStream (Auto quality)', () => {
  it('takes the best file the player can decode, in its favourite stream kind', () => {
    expect(pickStream(FILES, { streams: ['hls4', 'http'], hevc: true })).toEqual({
      url: 'https://cdn.test/2160-hevc.m3u8',
      type: 'hls4',
      quality: '2160p',
    });
  });

  it('skips HEVC files for a player without HEVC', () => {
    expect(pickStream(FILES, { streams: ['hls4', 'http'], hevc: false })?.url).toBe('https://cdn.test/1080.m3u8');
  });

  it('falls back to the progressive MP4 for a browser without HLS', () => {
    expect(pickStream(FILES, { streams: ['http'], hevc: false })).toEqual({
      url: 'https://cdn.test/1080.mp4',
      type: 'http',
      quality: '1080p',
    });
  });

  it('does not offer an unsupported HEVC file even when there is nothing else', () => {
    const onlyHevc = [file('1080p', 3, 'hevc', { hls4: 'https://cdn.test/hevc.m3u8' })];
    expect(pickStream(onlyHevc, { streams: ['hls4'], hevc: false })).toBeNull();
  });

  it('accepts the details view `url` key as well as media-links `urls`', () => {
    const detail: VideoFile = { codec: 'h264', quality: '720p', quality_id: 2, w: 0, h: 0, url: { hls2: 'https://cdn.test/a.m3u8' } };
    expect(pickStream([detail], { streams: ['hls4', 'hls2'], hevc: false })?.url).toBe('https://cdn.test/a.m3u8');
  });

  it('gives nothing when no file has a stream the player plays', () => {
    expect(pickStream(FILES, { streams: ['hls2'], hevc: true })).toBeNull();
    expect(pickStream([], { streams: ['hls4'], hevc: true })).toBeNull();
  });
});
