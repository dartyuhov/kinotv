import { expect, it } from 'vitest';
import { serviceAudioSources } from './audioSources';
import type { Audio, VideoFile } from '../api/types';

const audios: Audio[] = [
  { id: 15508, index: 4, lang: 'rus', codec: 'aac', channels: 2, type: { id: 5, title: 'Авторский', short_title: 'AVO' }, author: { id: 4, title: 'Гаврилов', short_title: null } },
  { id: 15504, index: 2, lang: 'eng', codec: 'aac', channels: 2, type: null, author: null },
];
const file: VideoFile = { codec: 'h264', w: 1920, h: 800, quality: '1080p', quality_id: 3,
  urls: { hls: 'https://cdn.test/signed/file.mp4/master-v1a1.m3u8?loc=de', hls2: 'https://cdn.test/hls2' } };

it('uses explicit service container numbers, never service IDs, array positions or native indices', () => {
  const options = serviceAudioSources(audios, [file], { streams: ['hls2', 'hls'], hevc: true });
  expect(options.map(o => ({ id: o.id, lang: o.lang, label: o.label, url: o.sources[0]?.url }))).toEqual([
    { id: 'service-audio:15508:4', lang: 'rus', label: 'rus · Авторский · Гаврилов · AAC · 2ch', url: 'https://cdn.test/signed/file.mp4/master-v1a4.m3u8?loc=de' },
    { id: 'service-audio:15504:2', lang: 'eng', label: 'eng · AAC · 2ch', url: 'https://cdn.test/signed/file.mp4/master-v1a2.m3u8?loc=de' },
  ]);
});

it('fails closed for unsupported URL shapes and ambiguous or absent container numbers', () => {
  const caps = { streams: ['hls'] as const, hevc: true };
  expect(serviceAudioSources(audios, [{ ...file, urls: { hls: 'https://cdn.test/master.m3u8' } }], caps)).toEqual([]);
  expect(serviceAudioSources([{ ...audios[0]!, index: 0 }], [file], caps)).toEqual([]);
  expect(serviceAudioSources([audios[0]!, { ...audios[1]!, index: 4 }], [file], caps)).toEqual([]);
});
