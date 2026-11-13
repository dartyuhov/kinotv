import { afterEach, expect, it, vi } from 'vitest';
import { avplayFactory } from './avplayAdapter';
import type { AvPlay } from '../platform/avplay';

afterEach(() => vi.unstubAllGlobals());

it('reports external subtitles pending in async READY until activation commands succeed on play', async () => {
  let state: ReturnType<AvPlay['getState']> = 'NONE';
  const calls: string[] = [];
  const api: AvPlay = {
    open: () => { state = 'IDLE'; }, close: () => { state = 'NONE'; },
    prepareAsync: (ok) => { state = 'READY'; ok(); }, getState: () => state,
    getDuration: () => 600_000, getCurrentTime: () => 0,
    play: () => { state = 'PLAYING'; }, pause: () => { state = 'PAUSED'; },
    seekTo: (_to, ok) => ok(), restoreAsync: (_url, _position, _prepare, ok) => ok(), suspend() {},
    getTotalTrackInfo: () => [], getCurrentStreamInfo: () => [],
    setListener() {}, setDisplayRect() {}, setDisplayMethod() {}, setStreamingProperty() {}, setTimeoutForBuffering() {}, setSelectTrack() {},
    setExternalSubtitlePath: () => { calls.push('path'); },
    setSubtitlePosition: () => { calls.push('shift'); },
    setSilentSubtitle: (silent) => { if (!silent) { expect(['PLAYING', 'PAUSED']).toContain(state); calls.push('visible'); } },
  };
  vi.stubGlobal('webapis', { avplay: api });
  vi.stubGlobal('document', { createElement: () => ({ remove() {} }), querySelector: () => null,
    documentElement: { classList: { add() {}, remove() {} } } });
  const player = avplayFactory.create({ appendChild() {} } as unknown as HTMLElement);
  await player.load({ url: 'https://stream.test/film', type: 'hls' }, { startAt: 0 });
  await player.setExternalSubtitle!('/tmp/subtitle.srt', 1);
  expect(calls).toEqual(['path']);
  expect(player.getTracks().externalSubtitle).toEqual({ selected: false, pending: true, path: undefined });
  player.play();
  await vi.waitFor(() => expect(player.getTracks().externalSubtitle).toEqual({ selected: true, pending: false, path: '/tmp/subtitle.srt' }));
  expect(calls).toEqual(['path', 'shift', 'visible']);
  player.destroy();
  await Promise.resolve();
});

it('holds the native singleton until deferred prepare completes before a replacement live adapter opens', async () => {
  const calls: string[] = [];
  const prepared: Array<() => void> = [];
  let state: ReturnType<AvPlay['getState']> = 'NONE';
  const api: AvPlay = {
    open: (url) => { calls.push(`open:${url}`); state = 'IDLE'; },
    close: () => { calls.push('close'); state = 'NONE'; },
    prepareAsync: (ok) => { calls.push('prepare'); prepared.push(() => { state = 'READY'; ok(); }); },
    getState: () => state, getDuration: () => 600_000, getCurrentTime: () => 123_000,
    play: () => { calls.push('play'); state = 'PLAYING'; }, pause: () => { state = 'PAUSED'; },
    seekTo: (_to, ok) => { calls.push('seek'); ok(); },
    restoreAsync: (_url, _position, _prepare, ok) => { calls.push('restore'); ok(); },
    suspend: () => { calls.push('suspend'); },
    getTotalTrackInfo: () => [], getCurrentStreamInfo: () => [],
    setListener() {}, setDisplayRect() {}, setDisplayMethod() {}, setStreamingProperty() {},
    setTimeoutForBuffering() {}, setSelectTrack() {}, setSilentSubtitle() {}, setExternalSubtitlePath() {}, setSubtitlePosition() {},
  };
  vi.stubGlobal('webapis', { avplay: api });
  vi.stubGlobal('document', { createElement: () => ({ remove() {} }), querySelector: () => null,
    documentElement: { classList: { add() {}, remove() {} } } });
  const host = { appendChild() {} } as unknown as HTMLElement;
  const a = avplayFactory.create(host);
  const loadA = a.load({ url: 'https://live.test/a', type: 'hls' }, { startAt: 0 }).catch(() => undefined);
  await vi.waitFor(() => expect(prepared).toHaveLength(1));
  a.destroy();
  const b = avplayFactory.create(host);
  const loadB = b.load({ url: 'https://live.test/b', type: 'hls' }, { startAt: 0 });
  await Promise.resolve();
  expect(calls).toEqual(['close', 'open:https://live.test/a', 'prepare']);
  prepared[0]!();
  await vi.waitFor(() => expect(prepared).toHaveLength(2));
  expect(calls).toEqual(['close', 'open:https://live.test/a', 'prepare', 'close', 'close', 'open:https://live.test/b', 'prepare']);
  prepared[1]!();
  await Promise.all([loadA, loadB]);
  // READY stays paused until the screen explicitly asks to play. Finite native duration is irrelevant.
  expect(calls).not.toContain('play');
  expect(calls).not.toContain('seek');
  expect(calls).not.toContain('restore');
  b.play();
  await vi.waitFor(() => expect(calls).toContain('play'));
  b.destroy();
  await Promise.resolve();
});
