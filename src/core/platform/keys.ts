import { tizen } from './tizenGlobals';

/** Every input the app reacts to, independent of where it came from (TV remote or desktop keyboard). */
export type RemoteKey =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'ok'
  | 'back'
  | 'playPause'
  | 'play'
  | 'pause'
  | 'rewind'
  | 'fastForward'
  | 'stop'
  | 'channelUp'
  | 'channelDown';

export type DirectionKey = 'up' | 'down' | 'left' | 'right';

export function isDirection(key: RemoteKey): key is DirectionKey {
  return key === 'up' || key === 'down' || key === 'left' || key === 'right';
}

// Samsung remote keycodes (Tizen TV input device). Arrows and Enter use the standard codes.
const BY_KEYCODE: Record<number, RemoteKey> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'ok',
  10009: 'back',
  10252: 'playPause',
  415: 'play',
  19: 'pause',
  412: 'rewind',
  417: 'fastForward',
  413: 'stop',
  427: 'channelUp',
  428: 'channelDown',
};

// Desktop keyboard stand-ins for the remote (spec §5.1).
const BY_KEY: Record<string, RemoteKey> = {
  ArrowLeft: 'left',
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  Enter: 'ok',
  Backspace: 'back',
  Escape: 'back',
  ' ': 'playPause',
  '[': 'rewind',
  ']': 'fastForward',
  PageUp: 'channelUp',
  PageDown: 'channelDown',
};

export type KeyLike = Pick<KeyboardEvent, 'key' | 'keyCode' | 'metaKey' | 'ctrlKey' | 'altKey'>;

/** The single translation from a raw keyboard event to a RemoteKey. Returns null for anything else. */
export function normaliseKey(e: KeyLike): RemoteKey | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  return BY_KEYCODE[e.keyCode] ?? BY_KEY[e.key] ?? null;
}

// Media and channel keys only reach the app after registration (spec §2). Arrows, Enter and Back don't need it.
const TIZEN_KEYS_TO_REGISTER = [
  'MediaPlayPause',
  'MediaPlay',
  'MediaPause',
  'MediaRewind',
  'MediaFastForward',
  'MediaStop',
  'ChannelUp',
  'ChannelDown',
];

/** Registers the remote's media and channel keys on Tizen. A no-op in the browser. */
export function registerRemoteKeys(): void {
  const input = tizen()?.tvinputdevice;
  if (!input) return;
  for (const name of TIZEN_KEYS_TO_REGISTER) {
    try {
      input.registerKey(name);
    } catch {
      // Some models lack some keys; the rest still work.
    }
  }
}
