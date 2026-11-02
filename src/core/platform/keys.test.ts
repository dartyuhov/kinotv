import { afterEach, describe, expect, it } from 'vitest';
import { normaliseKey, registerRemoteKeys } from './keys';

// Builds the subset of a KeyboardEvent that normaliseKey reads.
function ev(key: string, keyCode = 0, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey', boolean>> = {}) {
  return { key, keyCode, metaKey: false, ctrlKey: false, altKey: false, ...mods };
}

describe('normaliseKey', () => {
  it.each([
    ['ArrowUp', 38, 'up'],
    ['ArrowDown', 40, 'down'],
    ['ArrowLeft', 37, 'left'],
    ['ArrowRight', 39, 'right'],
    ['Enter', 13, 'ok'],
  ] as const)('maps the D-pad key %s to %s', (key, keyCode, expected) => {
    expect(normaliseKey(ev(key, keyCode))).toBe(expected);
  });

  it.each([
    [10009, 'back'],
    [10252, 'playPause'],
    [415, 'play'],
    [19, 'pause'],
    [412, 'rewind'],
    [417, 'fastForward'],
    [413, 'stop'],
    [427, 'channelUp'],
    [428, 'channelDown'],
  ] as const)('maps the Tizen keycode %i to %s', (keyCode, expected) => {
    // Tizen reports vendor key names (e.g. XF86Back); the keycode is what we rely on.
    expect(normaliseKey(ev('Unidentified', keyCode))).toBe(expected);
  });

  it.each([
    ['Backspace', 8, 'back'],
    ['Escape', 27, 'back'],
    [' ', 32, 'playPause'],
    ['[', 219, 'rewind'],
    [']', 221, 'fastForward'],
    ['PageUp', 33, 'channelUp'],
    ['PageDown', 34, 'channelDown'],
  ] as const)('maps the desktop key %j to %s', (key, keyCode, expected) => {
    expect(normaliseKey(ev(key, keyCode))).toBe(expected);
  });

  it('ignores keys that are not on the remote', () => {
    expect(normaliseKey(ev('a', 65))).toBeNull();
    expect(normaliseKey(ev('Tab', 9))).toBeNull();
  });

  it('ignores browser shortcuts such as Cmd+[ so desktop history and reload keep working', () => {
    expect(normaliseKey(ev('[', 219, { metaKey: true }))).toBeNull();
    expect(normaliseKey(ev('ArrowLeft', 37, { altKey: true }))).toBeNull();
    expect(normaliseKey(ev('Escape', 27, { ctrlKey: true }))).toBeNull();
  });
});

// A stand-in for tizen.tvinputdevice: like the real one, it throws for a key the remote doesn't have.
function fakeTv(supported: string[]) {
  const registered: string[] = [];
  const tvinputdevice = {
    getSupportedKeys: () => supported.map((name, i) => ({ name, code: 1000 + i })),
    registerKey(name: string) {
      if (!supported.includes(name)) throw new Error(`InvalidValuesError: ${name}`);
      registered.push(name);
    },
  };
  (globalThis as { tizen?: unknown }).tizen = { tvinputdevice };
  return { registered };
}

const MEDIA_AND_CHANNEL_KEYS = [
  'MediaPlayPause',
  'MediaPlay',
  'MediaPause',
  'MediaRewind',
  'MediaFastForward',
  'MediaStop',
  'ChannelUp',
  'ChannelDown',
];

describe('registerRemoteKeys', () => {
  afterEach(() => {
    delete (globalThis as { tizen?: unknown }).tizen;
  });

  it('registers the media and channel keys on a TV, and nothing the app does not handle', () => {
    // Exit must keep closing the app and the volume keys must keep working (Samsung policy).
    const tv = fakeTv([...MEDIA_AND_CHANNEL_KEYS, 'Exit', 'VolumeUp', 'VolumeDown', 'ColorF0Red', '1', 'Info']);

    registerRemoteKeys();

    expect(tv.registered.sort()).toEqual([...MEDIA_AND_CHANNEL_KEYS].sort());
  });

  it('registers what the remote has when some media keys are missing', () => {
    // The Smart Remote has one play/pause key and no separate Play, Pause or Stop.
    const tv = fakeTv(['MediaPlayPause', 'MediaRewind', 'MediaFastForward', 'ChannelUp', 'ChannelDown']);

    expect(() => registerRemoteKeys()).not.toThrow();

    expect(tv.registered.sort()).toEqual(['ChannelDown', 'ChannelUp', 'MediaFastForward', 'MediaPlayPause', 'MediaRewind']);
  });

  it('does nothing in a desktop browser, where there is no tizen object', () => {
    expect(() => registerRemoteKeys()).not.toThrow();
  });
});
