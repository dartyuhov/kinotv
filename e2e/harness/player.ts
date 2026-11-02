import type { Page } from '@playwright/test';

// The e2e build plays through the FakePlayer (VITE_PLAYER=fake, see playwright.config.ts). It exposes a
// control object on `window.__kinotvFakePlayer` (src/core/player/fakePlayer.ts). This class is the only
// test code that talks to it, so tests read like a script for the player: what it was asked to do, and
// cues for what the stream does next.

/** One call the app made to the player, in order. Times are seconds. */
export type PlayerCall =
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

export type PlayerState = 'idle' | 'loading' | 'paused' | 'playing' | 'ended' | 'error';

/** What the next `load` finds. Set it before the player screen opens. */
export interface PlayerScript {
  /** Seconds. Default: the duration kino.watch gives for the video. */
  duration?: number;
  /** Make the next load fail with this error kind. */
  loadError?: 'network' | 'media' | 'unsupported';
  /** Scripted tracks the stream reports once loaded. */
  tracks?: {
    audio?: Array<{ id: string; label: string; lang: string }>;
    subtitles?: Array<{ id: string; label: string; lang: string }>;
    qualities?: Array<{ id: string; label: string }>;
  };
}

interface FakePlayerControl {
  calls: PlayerCall[];
  state: PlayerState;
  position: number;
  duration: number;
  script(next: PlayerScript): void;
  time(seconds: number): void;
  buffering(on: boolean): void;
  end(): void;
  fail(kind: string): void;
}

type FakeWindow = Window & { __kinotvFakePlayer: FakePlayerControl };

/** Reads what the FakePlayer was asked to do and gives it cues (time, buffering, end, errors). */
export class FakePlayerRemote {
  constructor(private readonly page: Page) {}

  /** Every call the app made to the player, in order. */
  calls(): Promise<PlayerCall[]> {
    return this.page.evaluate(() => (window as unknown as FakeWindow).__kinotvFakePlayer.calls);
  }

  /** The `load` calls: which stream was opened, and where it started. */
  async loads(): Promise<Array<{ url: string; startAt: number }>> {
    return (await this.calls()).flatMap((c) => (c.op === 'load' ? [{ url: c.url, startAt: c.startAt }] : []));
  }

  /** The seek targets, in seconds, in order. */
  async seeks(): Promise<number[]> {
    return (await this.calls()).flatMap((c) => (c.op === 'seek' ? [c.to] : []));
  }

  state(): Promise<PlayerState> {
    return this.page.evaluate(() => (window as unknown as FakeWindow).__kinotvFakePlayer.state);
  }

  /** Current playback position in whole seconds. */
  position(): Promise<number> {
    return this.page.evaluate(() => Math.floor((window as unknown as FakeWindow).__kinotvFakePlayer.position));
  }

  /** Sets up the next load (duration, tracks, or a failure). */
  async script(next: PlayerScript): Promise<void> {
    await this.page.evaluate((s) => (window as unknown as FakeWindow).__kinotvFakePlayer.script(s), next);
  }

  /** Playback reaches `seconds`, as if the video had played (or the stream jumped) there. */
  async time(seconds: number): Promise<void> {
    await this.page.evaluate((s) => (window as unknown as FakeWindow).__kinotvFakePlayer.time(s), seconds);
  }

  async buffering(on: boolean): Promise<void> {
    await this.page.evaluate((b) => (window as unknown as FakeWindow).__kinotvFakePlayer.buffering(b), on);
  }

  /** The video plays to its end. */
  async end(): Promise<void> {
    await this.page.evaluate(() => (window as unknown as FakeWindow).__kinotvFakePlayer.end());
  }

  /** The stream fails mid-playback. */
  async fail(kind: 'network' | 'media' = 'network'): Promise<void> {
    await this.page.evaluate((k) => (window as unknown as FakeWindow).__kinotvFakePlayer.fail(k), kind);
  }
}

/**
 * The TV going to the background and back (Home button, standby). In the browser that is the page's
 * visibility, which is what the app listens to on both platforms.
 */
export async function setAppVisible(page: Page, visible: boolean): Promise<void> {
  await page.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'visible' : 'hidden') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !v });
    document.dispatchEvent(new Event('visibilitychange'));
  }, visible);
}
