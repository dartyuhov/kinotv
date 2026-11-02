import { createEmitter } from './emitter';
import type { PlaybackState, PlayerAdapter, PlayerErrorKind, PlayerFactory, Tracks } from './types';

// The FakePlayer (spec §10, the player seam): a PlayerAdapter with a scripted stream and no video.
// It is only in builds made with VITE_PLAYER=fake (the e2e build; see core/player/createPlayer.ts), and
// it is driven from tests through `window.__kinotvFakePlayer` (e2e/harness/player.ts wraps it).
//
// Playback moves with the page clock: while playing and not buffering, the position advances 0.25 s
// every 250 ms, so Playwright's clock drives both the video and the app's timers.

/** One call the app made, as tests read it. Times are seconds. */
export type FakePlayerCall =
  | { op: 'load'; url: string; startAt: number }
  | { op: 'play' }
  | { op: 'pause' }
  | { op: 'seek'; to: number }
  | { op: 'selectAudio'; id: string }
  | { op: 'selectSubtitle'; id: string | null }
  | { op: 'selectQuality'; id: string }
  | { op: 'suspend' }
  | { op: 'restore' }
  | { op: 'destroy' };

/** Set by tests before the player opens. Applies to every later load; `loadError` to the next one only. */
export interface FakePlayerScript {
  duration?: number;
  loadError?: PlayerErrorKind;
  tracks?: Partial<Tracks>;
}

/** What tests see on `window.__kinotvFakePlayer`. */
export interface FakePlayerControl {
  readonly calls: FakePlayerCall[];
  readonly state: PlaybackState;
  readonly position: number;
  readonly duration: number;
  script(next: FakePlayerScript): void;
  /** Playback reaches `seconds`. */
  time(seconds: number): void;
  buffering(on: boolean): void;
  /** Plays to the end. */
  end(): void;
  /** The stream fails. */
  fail(kind: PlayerErrorKind): void;
}

const TICK_MS = 250;
const DEFAULT_DURATION = 3600;
const NO_TRACKS: Tracks = { audio: [], subtitles: [], qualities: [] };

const calls: FakePlayerCall[] = [];
let script: FakePlayerScript = {};
let current: FakePlayer | null = null;

class FakePlayer implements PlayerAdapter {
  readonly capabilities = { streams: ['hls4', 'hls2', 'hls', 'http'] as const, hevc: true };
  state: PlaybackState = 'idle';
  position = 0;
  duration = 0;
  private buffering = false;
  private tracks: Tracks = NO_TRACKS;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private readonly events = createEmitter();
  readonly on = this.events.on;

  async load(source: { url: string; duration?: number }, { startAt }: { startAt: number }): Promise<void> {
    calls.push({ op: 'load', url: source.url, startAt });
    this.stopTicking();
    this.setState('loading');
    await Promise.resolve();
    const { loadError } = script;
    if (loadError) {
      script = { ...script, loadError: undefined };
      this.setState('error');
      throw { kind: loadError, detail: 'scripted load error' };
    }
    this.duration = script.duration ?? source.duration ?? DEFAULT_DURATION;
    this.position = Math.min(Math.max(0, startAt), this.duration);
    this.tracks = { ...NO_TRACKS, ...script.tracks };
    this.setState('paused');
    this.events.emit('tracks', undefined);
    this.emitTime();
  }

  play(): void {
    calls.push({ op: 'play' });
    if (this.state !== 'paused' && this.state !== 'ended') return;
    if (this.state === 'ended') this.position = 0;
    // The ticker starts before listeners hear "playing", so a timer they start (the 30 s progress save)
    // fires after the tick due at the same moment, as it would against a real clock.
    this.ticker ??= setInterval(() => this.tick(), TICK_MS);
    this.setState('playing');
  }

  pause(): void {
    calls.push({ op: 'pause' });
    if (this.state !== 'playing') return;
    this.stopTicking();
    this.setState('paused');
  }

  seekTo(seconds: number): void {
    calls.push({ op: 'seek', to: seconds });
    this.position = Math.min(Math.max(0, seconds), this.duration);
    if (this.state === 'ended' && this.position < this.duration) this.setState('paused');
    this.emitTime();
  }

  getTracks(): Tracks {
    return this.tracks;
  }

  selectAudio(id: string): void {
    calls.push({ op: 'selectAudio', id });
  }

  selectSubtitle(id: string | null): void {
    calls.push({ op: 'selectSubtitle', id });
  }

  async selectQuality(id: string): Promise<void> {
    calls.push({ op: 'selectQuality', id });
  }

  suspend(): void {
    calls.push({ op: 'suspend' });
  }

  restore(): void {
    calls.push({ op: 'restore' });
  }

  destroy(): void {
    calls.push({ op: 'destroy' });
    this.stopTicking();
    this.events.clear();
    this.state = 'idle';
    if (current === this) current = null;
  }

  // Cues from tests.

  cueTime(seconds: number): void {
    this.position = Math.min(Math.max(0, seconds), this.duration);
    if (this.position >= this.duration) this.finish();
    else this.emitTime();
  }

  cueBuffering(on: boolean): void {
    this.buffering = on;
    this.events.emit('buffering', on);
  }

  finish(): void {
    this.stopTicking();
    this.position = this.duration;
    this.emitTime();
    this.setState('ended');
    this.events.emit('ended', undefined);
  }

  fail(kind: PlayerErrorKind): void {
    this.stopTicking();
    this.setState('error');
    this.events.emit('error', { kind, detail: 'scripted error' });
  }

  private tick(): void {
    if (this.state !== 'playing' || this.buffering) return;
    this.position = Math.min(this.position + TICK_MS / 1000, this.duration);
    if (this.position >= this.duration) this.finish();
    else this.emitTime();
  }

  private stopTicking(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  private setState(state: PlaybackState): void {
    if (this.state === state) return;
    this.state = state;
    this.events.emit('state', state);
  }

  private emitTime(): void {
    this.events.emit('time', { position: this.position, duration: this.duration });
  }
}

export const fakePlayerFactory: PlayerFactory = {
  name: 'fake',
  available: () => true,
  create() {
    current = new FakePlayer();
    return current;
  },
};

/** Puts the control object on `window.__kinotvFakePlayer`. Called once at startup in fake builds. */
export function installFakePlayerControl(): void {
  const control: FakePlayerControl = {
    calls,
    get state() {
      return current?.state ?? 'idle';
    },
    get position() {
      return current?.position ?? 0;
    },
    get duration() {
      return current?.duration ?? 0;
    },
    script(next) {
      script = { ...script, ...next };
    },
    time: (seconds) => current?.cueTime(seconds),
    buffering: (on) => current?.cueBuffering(on),
    end: () => current?.finish(),
    fail: (kind) => current?.fail(kind),
  };
  (window as unknown as { __kinotvFakePlayer: FakePlayerControl }).__kinotvFakePlayer = control;
}
