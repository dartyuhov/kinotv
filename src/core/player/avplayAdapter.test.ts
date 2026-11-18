import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AvPlay, AvPlayListener } from '../platform/avplay';
import type { PlaybackSource, PlayerAdapter } from './types';
import { streamCandidates } from './streams';
import { fallbackChoices, fixedQualities } from './playbackChoices';
import { parseManifest } from './manifestTracks';
import type { VideoFile } from '../api/types';

const source = (type: PlaybackSource['type']): PlaybackSource => ({
  type, url: `https://media.invalid/sopranos-s4e1-85477-1080-hevc/${type}.m3u8`,
});

// Node-only suite: the adapter needs an object surface, not a browser/media implementation.
function stubDocument() {
  const surfaces = new Set<object>();
  const classList = { add: vi.fn(), remove: vi.fn() };
  vi.stubGlobal('document', {
    createElement: () => { const surface = { remove: () => surfaces.delete(surface) }; return surface; },
    documentElement: { classList },
    querySelector: () => surfaces.values().next().value ?? null,
  });
  return { appendChild: (surface: object) => surfaces.add(surface) } as unknown as HTMLElement;
}

function platform() {
  let state: ReturnType<AvPlay['getState']> = 'NONE';
  let seeking = false;
  let time = 0;
  const preparations: { ok: () => void; fail: (error: unknown) => void; listener: AvPlayListener }[] = [];
  const seeks: { ok: () => void; fail: (error: unknown) => void }[] = [];
  let listener: AvPlayListener = {};
  const check = () => { if (seeking) throw new Error('Native API called during pending seek'); };
  const api: AvPlay = {
    open: vi.fn(() => { check(); state = 'IDLE'; }),
    close: vi.fn(() => { check(); state = 'NONE'; }),
    prepareAsync: vi.fn((ok, fail) => {
      check();
      preparations.push({ ok: () => { state = 'READY'; ok(); }, fail, listener });
    }),
    setListener: vi.fn((value) => { check(); listener = value; }),
    setDisplayRect: vi.fn(check), setDisplayMethod: vi.fn(check),
    setStreamingProperty: vi.fn(check), setTimeoutForBuffering: vi.fn(check),
    getState: vi.fn(() => { check(); return state; }),
    getDuration: vi.fn(() => { check(); return 3_600_000; }),
    getCurrentTime: vi.fn(() => { check(); return time; }),
    play: vi.fn(() => { check(); state = 'PLAYING'; }),
    pause: vi.fn(() => { check(); state = 'PAUSED'; }),
    seekTo: vi.fn((milliseconds, ok, fail) => {
      check(); seeking = true;
      seeks.push({ ok: () => { seeking = false; time = milliseconds; ok(); }, fail: (error) => { seeking = false; fail(error); } });
    }),
    getTotalTrackInfo: vi.fn(() => { check(); return []; }),
    getCurrentStreamInfo: vi.fn(() => { check(); return []; }),
    setSelectTrack: vi.fn(check), setSilentSubtitle: vi.fn(check),
    setExternalSubtitlePath: vi.fn(check), setSubtitlePosition: vi.fn(check),
    suspend: vi.fn(check), restoreAsync: vi.fn((_url, _time, _prepare, ok) => { check(); ok(); }),
  };
  vi.stubGlobal('webapis', {
    avplay: api, systeminfo: { isSupportedVideoCodec: () => true },
    productinfo: { isUdPanelSupported: () => true }, avinfo: { isHdrTvSupport: () => true },
  });
  return { api, preparations, seeks };
}

let players: PlayerAdapter[];
let create: () => PlayerAdapter;
let native: ReturnType<typeof platform>;
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(async () => {
  vi.useFakeTimers();
  // Isolate the module's singleton lane between independent native process simulations.
  vi.resetModules();
  const host = stubDocument();
  native = platform();
  players = [];
  const { avplayFactory } = await import('./avplayAdapter');
  create = () => { const player = avplayFactory.create(host); players.push(player); return player; };
});

afterEach(async () => {
  players.forEach((player) => player.destroy());
  // Also let the old implementation drain after a RED run, avoiding leaked promises/timers.
  native.seeks.forEach((seek) => seek.ok());
  native.preparations.forEach((prepare) => prepare.ok());
  await flush();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('starts TV adaptive Auto on the HLS2 4K master using native adapter preferences', async () => {
  const player = create();
  const files: VideoFile[] = [1080, 2160].map((h) => ({
    codec: 'h265', quality: `${h}p`, quality_id: h === 2160 ? 4 : 3, w: h * 16 / 9, h,
    urls: { hls4: `https://media.invalid/${h}/hls4`, hls2: `https://media.invalid/${h}/hls2` },
  }));
  // Match TV startup: inspect the first two supplied adaptive candidates, then select Auto.
  const manifests = streamCandidates(files, player.capabilities).filter((s) => s.type !== 'http').slice(0, 2)
    .map((s) => ({ ...s, manifest: parseManifest('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=12000000,RESOLUTION=3840x2160\n4k.m3u8') }));
  const choices = fallbackChoices(files, player.capabilities, 'auto', manifests);
  expect(choices[0]).toMatchObject({ type: 'hls2', quality: '2160p', fixed: false, url: 'https://media.invalid/2160/hls2' });
  const loaded = player.load(choices[0]!, { startAt: 0 });
  await flush();
  expect(native.api.open).toHaveBeenCalledExactlyOnceWith('https://media.invalid/2160/hls2');
  native.preparations[0]!.ok();
  await loaded;
});

it('keeps native audio pending until current-stream confirmation and preserves supplied names', async () => {
  const player = create();
  const inventory = [
    { type: 'AUDIO' as const, index: 9, extra_info: JSON.stringify({ language: 'ru', name: 'Студия А', channels: '2' }) },
    { type: 'AUDIO' as const, index: 3, extra_info: JSON.stringify({ language: 'en', title: 'Original', channels: '6' }) },
  ];
  vi.mocked(native.api.getTotalTrackInfo).mockReturnValue(inventory);
  vi.mocked(native.api.getCurrentStreamInfo).mockReturnValue([inventory[1]!]);
  const loaded = player.load(source('hls'), { startAt: 0 });
  await flush(); native.preparations[0]!.ok(); await loaded;
  player.play(); await flush();
  const russian = player.getTracks().audio.find(track => track.lang === 'rus')!;
  expect(russian.label).toContain('Студия А');
  player.selectAudio(russian.id); await flush();
  expect(native.api.setSelectTrack).toHaveBeenCalledExactlyOnceWith('AUDIO', 9);
  expect(player.getTracks().audio.find(track => track.id === russian.id)).toMatchObject({ selected: false, pending: true });
  vi.mocked(native.api.getCurrentStreamInfo).mockReturnValue([inventory[0]!]);
  native.preparations[0]!.listener.onbufferingcomplete?.(); await flush();
  expect(player.getTracks().audio.find(track => track.id === russian.id)).toMatchObject({ selected: true, pending: false });
});

it('treats a rejected audio switch as a track failure without stopping working playback', async () => {
  const player = create();
  const inventory = [0, 7].map(index => ({ type: 'AUDIO' as const, index, extra_info: '{"language":"ru"}' }));
  vi.mocked(native.api.getTotalTrackInfo).mockReturnValue(inventory);
  vi.mocked(native.api.getCurrentStreamInfo).mockReturnValue([inventory[0]!]);
  const errors = vi.fn(); player.on('error', errors);
  const loaded = player.load(source('hls'), { startAt: 0 });
  await flush(); native.preparations[0]!.ok(); await loaded;
  player.play(); await flush();
  vi.mocked(native.api.setSelectTrack).mockImplementationOnce(() => { throw { name: 'NotSupportedError' }; });
  player.selectAudio(player.getTracks().audio[1]!.id); await flush();
  expect(errors).not.toHaveBeenCalled();
  expect(native.api.close).toHaveBeenCalledTimes(1);
  expect(player.getTracks().audio[0]).toMatchObject({ selected: true });
  expect(player.getTracks().audio[1]).toMatchObject({ selected: false, pending: false });
});

it('keeps native fixed qualities bound to each preferred master and its own bandwidths', () => {
  const player = create();
  const files: VideoFile[] = [{ codec: 'h265', quality: '2160p', quality_id: 4, w: 3840, h: 2160,
    urls: { hls4: 'https://media.invalid/hls4', hls2: 'https://media.invalid/hls2' } }];
  const manifests = streamCandidates(files, player.capabilities).map((s) => ({ ...s, manifest: parseManifest(s.type === 'hls2'
    ? '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=12000000,RESOLUTION=3840x1600\n4k.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x800\nhd.m3u8'
    : '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Original",LANGUAGE="en"\n#EXT-X-STREAM-INF:BANDWIDTH=14000000,RESOLUTION=3840x1600,AUDIO="audio"\n4k.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x800,AUDIO="audio"\nhd.m3u8') }));
  expect(fixedQualities(files, player.capabilities, manifests)).toEqual(['2160p', '1080p']);
  expect(fallbackChoices(files, player.capabilities, '2160p', manifests).map(({ url, type, quality, fixed, fixedBandwidth, manifest }) =>
    ({ url, type, quality, fixed, fixedBandwidth, audioGroups: manifest?.tracks.length }))).toEqual([
    { url: 'https://media.invalid/hls2', type: 'hls2', quality: '2160p', fixed: true, fixedBandwidth: 12000000, audioGroups: 0 },
    { url: 'https://media.invalid/hls4', type: 'hls4', quality: '2160p', fixed: true, fixedBandwidth: 14000000, audioGroups: 1 },
    { url: 'https://media.invalid/hls2', type: 'hls2', quality: '1080p', fixed: true, fixedBandwidth: 4000000, audioGroups: 0 },
    { url: 'https://media.invalid/hls4', type: 'hls4', quality: '1080p', fixed: true, fixedBandwidth: 5000000, audioGroups: 1 },
  ]);
  expect(fallbackChoices(files, player.capabilities, '1080p', manifests).map((s) => s.fixedBandwidth)).toEqual([4000000, 5000000]);
});

it('retains native transport alternatives and Auto fallback when manifest metadata is unavailable', () => {
  const player = create();
  const files: VideoFile[] = [{ codec: 'h265', quality: '2160p', quality_id: 4, w: 3840, h: 2160,
    urls: { hls4: 'https://media.invalid/hls4', hls2: 'https://media.invalid/hls2', hls: 'https://media.invalid/hls', http: 'https://media.invalid/file.mp4' } }];
  const candidates = streamCandidates(files, player.capabilities);
  expect(candidates.map(({ type, quality }) => [type, quality])).toEqual([
    ['hls2', '2160p'], ['hls4', '2160p'], ['hls', '2160p'], ['http', '2160p'],
  ]);
  const manifests = candidates.slice(0, 2).map((s) => ({ ...s, manifest: parseManifest('') }));
  expect(fallbackChoices(files, player.capabilities, 'auto', manifests).map((s) => s.type)).toEqual(['hls2', 'hls4', 'hls']);
  expect(fixedQualities(files, player.capabilities, manifests)).toEqual([]);
  expect(fallbackChoices(files.map((f) => ({ ...f, urls: { hls: f.urls!.hls } })), player.capabilities, 'auto')[0])
    .toMatchObject({ type: 'hls', inspectBeforeLoad: true });
  expect(streamCandidates(files.map((f) => ({ ...f, urls: { http: f.urls!.http } })), player.capabilities)[0])
    .toMatchObject({ type: 'http', quality: '2160p' });
});

it('closes a callback-less IDLE prepare and lets hls2 fallback play on the same singleton', async () => {
  const player = create();
  let failure: unknown;
  let fallbackReady = false;
  const fallback = player.load(source('hls4'), { startAt: 0 }).catch((error: unknown) => {
    failure = error;
    if ((error as { detail?: string })?.detail?.includes('TimeoutError')) throw error;
    return player.load(source('hls2'), { startAt: 0 });
  }).then(() => { fallbackReady = true; });
  void fallback.catch(() => undefined);
  await flush();
  expect(native.preparations).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(native.api.open).toHaveBeenLastCalledWith(source('hls2').url);
  // The coordinator stops on TimeoutError (unsafe lane), but continues after confirmed close.
  expect(failure).toMatchObject({ kind: 'network', detail: 'AVPlay: prepare timed out' });
  expect(native.preparations).toHaveLength(2);
  native.preparations[1]!.ok();
  await flush();
  expect(fallbackReady).toBe(true);
  await fallback;
  player.play();
  await flush();
  expect(native.api.play).toHaveBeenCalledOnce();
});

it('keeps a working hls4 source and clears its prepare deadline', async () => {
  const player = create();
  const errors = vi.fn();
  player.on('error', errors);
  const loaded = player.load(source('hls4'), { startAt: 0 });
  await flush();
  native.preparations[0]!.ok();
  await loaded;
  await vi.advanceTimersByTimeAsync(31_000);
  player.play();
  await flush();
  expect(native.api.open).toHaveBeenCalledExactlyOnceWith(source('hls4').url);
  expect(native.api.play).toHaveBeenCalledOnce();
  expect(errors).not.toHaveBeenCalled();
  expect(player.capabilities.hevc).toBe(true);
});

it('ignores late prepare success/error and listener events without touching the replacement', async () => {
  const player = create();
  const errors = vi.fn();
  const states = vi.fn();
  player.on('error', errors);
  player.on('state', states);
  const first = player.load(source('hls4'), { startAt: 90 }).catch((error: unknown) => error);
  await flush();
  const stale = native.preparations[0]!;
  const replacement = player.load(source('hls2'), { startAt: 0 });
  await flush();
  expect(await first).toMatchObject({ detail: 'AVPlay: operation superseded' });
  native.preparations[1]!.ok();
  await replacement;
  const closeCount = vi.mocked(native.api.close).mock.calls.length;
  const durationReads = vi.mocked(native.api.getDuration).mock.calls.length;
  stale.ok();
  stale.fail('PLAYER_ERROR_CONNECTION_FAILED');
  stale.listener.onerror?.('PLAYER_ERROR_CONNECTION_FAILED');
  stale.listener.onbufferingcomplete?.();
  stale.listener.oncurrentplaytime?.(999_000);
  stale.listener.onstreamcompleted?.();
  await vi.advanceTimersByTimeAsync(31_000);
  expect(errors).not.toHaveBeenCalled();
  expect(states).toHaveBeenLastCalledWith('paused');
  expect(native.api.close).toHaveBeenCalledTimes(closeCount);
  expect(native.api.getDuration).toHaveBeenCalledTimes(durationReads);
  expect(native.api.seekTo).not.toHaveBeenCalled();
});

it('releases pending prepare on destroy and fences old-screen cleanup after remount', async () => {
  const old = create();
  const first = old.load(source('hls4'), { startAt: 0 }).catch((error: unknown) => error);
  await flush();
  const stale = native.preparations[0]!;
  old.destroy();
  const player = create();
  const loaded = player.load(source('hls2'), { startAt: 0 });
  await flush();
  expect(native.preparations).toHaveLength(2);
  native.preparations[1]!.ok();
  await loaded;
  expect(await first).toMatchObject({ detail: 'AVPlay: operation superseded' });
  const closes = vi.mocked(native.api.close).mock.calls.length;
  old.destroy();
  stale.ok();
  stale.listener.onerror?.('PLAYER_ERROR_CONNECTION_FAILED');
  await flush();
  expect(native.api.close).toHaveBeenCalledTimes(closes);
  player.play();
  await flush();
  expect(native.api.play).toHaveBeenCalledOnce();
});

it('supersedes a previous owner preparing even before its screen destroys', async () => {
  const old = create();
  const first = old.load(source('hls4'), { startAt: 0 }).catch((error: unknown) => error);
  await flush();
  const player = create();
  const second = player.load(source('hls2'), { startAt: 0 });
  await flush();
  expect(native.preparations).toHaveLength(2);
  old.destroy();
  await flush();
  native.preparations[1]!.ok();
  await second;
  expect(await first).toMatchObject({ detail: 'AVPlay: operation superseded' });
  player.play();
  await flush();
  expect(native.api.play).toHaveBeenCalledOnce();
});

it('opens only the latest source when loads and unmount race before the lane starts', async () => {
  const old = create();
  const first = old.load(source('hls4'), { startAt: 0 }).catch((error: unknown) => error);
  const second = old.load(source('hls2'), { startAt: 0 }).catch((error: unknown) => error);
  old.destroy();
  const player = create();
  const loaded = player.load(source('hls'), { startAt: 0 });
  await flush();
  expect(native.api.open).toHaveBeenCalledExactlyOnceWith(source('hls').url);
  native.preparations[0]!.ok();
  await loaded;
  expect(await first).toMatchObject({ detail: 'AVPlay: operation superseded' });
  expect(await second).toMatchObject({ detail: 'AVPlay: operation superseded' });
});

it('releases a failed prepare for immediate fallback without waiting for its deadline', async () => {
  const player = create();
  const failed = player.load(source('hls4'), { startAt: 0 }).catch((error: unknown) => error);
  await flush();
  native.preparations[0]!.fail('NotSupportedError');
  await flush();
  expect(await failed).toMatchObject({ kind: 'unsupported' });
  const loaded = player.load(source('hls2'), { startAt: 0 });
  await flush();
  expect(native.preparations).toHaveLength(2);
  native.preparations[1]!.ok();
  await loaded;
});

it('cancels a callback-less prepare on native listener error, allowing retry', async () => {
  const player = create();
  const failed = player.load(source('hls4'), { startAt: 0 }).catch((error: unknown) => error);
  await flush();
  native.preparations[0]!.listener.onerror?.('PLAYER_ERROR_CONNECTION_FAILED');
  await flush();
  expect(await failed).toMatchObject({ kind: 'network' });
  const loaded = player.load(source('hls2'), { startAt: 0 });
  await flush();
  expect(native.preparations).toHaveLength(2);
  native.preparations[1]!.ok();
  await loaded;
});

it('fences callbacks dispatched synchronously by close during prepare cancellation', async () => {
  const player = create();
  const errors = vi.fn();
  player.on('error', errors);
  const failed = player.load(source('hls4'), { startAt: 120 }).catch((error: unknown) => error);
  await flush();
  const close = vi.mocked(native.api.close).getMockImplementation()!;
  vi.mocked(native.api.close).mockImplementationOnce(() => {
    native.preparations[0]!.ok();
    native.preparations[0]!.fail('UnknownError');
    native.preparations[0]!.listener.onerror?.('PLAYER_ERROR_CONNECTION_FAILED');
    close();
  });
  const loaded = player.load(source('hls2'), { startAt: 0 });
  await flush();
  expect(native.preparations).toHaveLength(2);
  native.preparations[1]!.ok();
  await loaded;
  expect(await failed).toMatchObject({ detail: 'AVPlay: operation superseded' });
  expect(native.api.seekTo).not.toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
});

it('does not release the lane when cancellation close throws; a callback is still required', async () => {
  const player = create();
  const failed = player.load(source('hls4'), { startAt: 0 }).catch((error: unknown) => error);
  await flush();
  const close = vi.mocked(native.api.close).getMockImplementation()!;
  vi.mocked(native.api.close).mockImplementation(() => { throw new Error('native close failed'); });
  await vi.advanceTimersByTimeAsync(15_000);
  expect(await failed).toMatchObject({ detail: 'AVPlay: TimeoutError' });
  const loaded = player.load(source('hls2'), { startAt: 0 });
  void loaded.catch(() => undefined);
  await flush();
  expect(native.preparations).toHaveLength(1);
  vi.mocked(native.api.close).mockImplementation(close);
  native.preparations[0]!.ok();
  await flush();
  expect(native.preparations).toHaveLength(2);
  native.preparations[1]!.ok();
  await loaded;
});

it.each(['start-position', 'playback'] as const)('protects a pending %s seek across timeout, reload and destroy', async (kind) => {
  const player = create();
  const loaded = player.load(source('hls4'), { startAt: kind === 'start-position' ? 120 : 0 })
    .catch((error: unknown) => error);
  await flush();
  native.preparations[0]!.ok();
  await flush();
  if (kind === 'playback') {
    await loaded;
    player.seekTo(120);
    await flush();
  }
  expect(native.seeks).toHaveLength(1);
  const closes = vi.mocked(native.api.close).mock.calls.length;
  const reads = vi.mocked(native.api.getState).mock.calls.length;
  await vi.advanceTimersByTimeAsync(31_000);
  // Reads, queued commands, lifecycle cleanup and another owner must all stay behind the seek.
  player.getTracks();
  player.pause();
  player.destroy();
  const replacement = create();
  const next = replacement.load(source('hls2'), { startAt: 0 });
  await flush();
  expect(native.api.close).toHaveBeenCalledTimes(closes);
  expect(native.api.getState).toHaveBeenCalledTimes(reads);
  expect(native.preparations).toHaveLength(1);
  native.seeks[0]!.ok();
  await flush();
  expect(native.preparations).toHaveLength(2);
  native.preparations[1]!.ok();
  await next;
  await loaded;
});
