import { describe, expect, it } from 'vitest';
import type { VideoFile } from '../api/types';
import { fallbackChoices, fixedQualities, uniquePreference } from './playbackChoices';
import { parseManifestTracks, parseManifest, matchManifestGroup, semanticRenditionName } from './manifestTracks';

const files: VideoFile[] = [2160, 1080, 720].map((h, i) => ({ codec: 'h264', w: h * 16 / 9, h,
  quality: `${h}p`, quality_id: 4 - i, urls: { hls4: `https://cdn.test/${h}/master`, hls2: `https://cdn.test/${h}/alternate`, http: `https://cdn.test/${h}/file` } }));
const capabilities = { streams: ['hls4', 'hls2', 'http'] as const, hevc: true, uhd: true };

describe('playback choices', () => {
  it('keeps rendition groups and verifies independently distinguishable identities', () => {
    const manifest = parseManifest('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio1080",NAME="01RedHead",LANGUAGE="ru",CHANNELS="2"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio1080",NAME="02Original",LANGUAGE="en",CHANNELS="6"\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x800,AUDIO="audio1080"\nvideo.m3u8');
    expect(manifest.variants[0]).toMatchObject({ width: 1920, height: 800, bandwidth: 4000000, audioGroup: 'audio1080' });
    expect(matchManifestGroup(manifest, 'AUDIO', 1920, [{ lang: 'rus', channels: 2 }, { lang: 'eng', channels: 6 }]).map((t) => t?.name)).toEqual(['01RedHead', '02Original']);
    expect(matchManifestGroup(manifest, 'AUDIO', 1920, [{ lang: 'eng', channels: 2 }, { lang: 'rus', channels: 6 }])).toEqual([]);
    expect(matchManifestGroup(manifest, 'AUDIO', 1280, [{ lang: 'rus' }, { lang: 'eng' }])).toEqual([]);
    expect(matchManifestGroup(manifest, 'AUDIO', 1920, [{ lang: 'rus', channels: 6 }, { lang: 'eng', channels: 6 }])).toEqual([]);
    expect(matchManifestGroup(manifest, 'AUDIO', 1920, [{ lang: 'rus', channels: 2 }])).toEqual([]);
    expect(semanticRenditionName('01RedHead')).toBe('redhead');
    expect(semanticRenditionName('09 RedHead')).toBe('redhead');
  });
  it('pins real master bandwidths ahead of HTTP and labels cropped encodes by width rung', () => {
    const manifest = parseManifest('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=12000000,RESOLUTION=3840x1600,AUDIO="audio2160"\na.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x800,AUDIO="audio1080"\nb.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=1280x534\nc.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=720x300\nd.m3u8');
    const sources = [{ url: 'https://cdn.test/master', type: 'hls4' as const, quality: '2160p', manifest }];
    const native = { ...capabilities, adaptiveBitrate: true };
    expect(fixedQualities(files, native, sources)).toEqual(['2160p', '1080p', '720p', '480p']);
    const choices = fallbackChoices(files, native, '1080p', sources);
    expect(choices.filter((source) => !source.inspectBeforeLoad).map((source) => [source.type, source.fixedBandwidth])).toEqual([
      ['hls4', 4000000], ['hls4', 1800000], ['hls4', 800000],
    ]);
    expect(choices.filter((source) => source.inspectBeforeLoad).map((source) => source.url)).toContain('https://cdn.test/720/master');
    expect(fixedQualities(files, { ...native, uhd: false }, sources)).toEqual(['1080p', '720p', '480p']);
  });
  it('rejects repeated language/channel identity even when count and observed order match perfectly', () => {
    const manifest = parseManifest('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="01RedHead",LANGUAGE="ru",CHANNELS="2"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="02Kubik",LANGUAGE="ru",CHANNELS="2"\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x800,AUDIO="a"\nv.m3u8');
    expect(matchManifestGroup(manifest, 'AUDIO', 1920, [{ lang: 'rus', channels: 2 }, { lang: 'rus', channels: 2 }])).toEqual([undefined, undefined]);
  });
  it('reads quoted rendition names and channels without treating manifest order as a native index', () => {
    expect(parseManifestTracks('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English, Original",LANGUAGE="en",CHANNELS="6",URI="audio.m3u8"')).toEqual([
      { type: 'AUDIO', lang: 'eng', name: 'English, Original', channels: 6, group: 'audio' },
    ]);
  });
  it('reaches lower qualities after alternate deliveries instead of stopping at the highest three', () => {
    expect(fallbackChoices(files, capabilities, 'auto').map((s) => `${s.quality}:${s.type}`)).toEqual([
      '2160p:hls4', '2160p:hls2', '2160p:http', '1080p:hls4', '1080p:hls2', '1080p:http', '720p:hls4', '720p:hls2', '720p:http',
    ]);
  });
  it('uses encoded files for fixed resolution and never a multi-resolution master', () => {
    expect(fallbackChoices(files, capabilities, '1080p').map((s) => `${s.quality}:${s.type}`)).toEqual(['1080p:http', '720p:http']);
    expect(fixedQualities(files.map((file) => ({ ...file, urls: { hls4: file.urls!.hls4 } })), capabilities)).toEqual([]);
  });
  it('only reapplies a unique semantic preference', () => {
    expect(uniquePreference([{ preferenceKey: 'rus' }, { preferenceKey: 'rus' }], 'rus')).toBeUndefined();
    expect(uniquePreference([{ preferenceKey: 'eng' }], 'rus')).toBeUndefined();
    expect(uniquePreference([{ preferenceKey: 'eng' }], 'eng')).toEqual({ preferenceKey: 'eng' });
  });
});
