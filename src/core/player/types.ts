// The PlayerAdapter contract (spec §3): the only thing the player screen knows about the playback engine.
// Implementations: Html5Adapter (desktop, <video>), FakePlayer (e2e tests), AvPlayAdapter (TV, ticket 22).
// All times are SECONDS here, whatever the engine uses underneath (AVPlay works in ms).

/** kino.watch's stream kinds for one file (research 10-kp-api §6.5), from richest to simplest. */
export type StreamType = 'hls4' | 'hls2' | 'hls' | 'http';

/** What to play. */
export interface PlaybackSource {
  url: string;
  type: StreamType;
  /** Seconds, as kino.watch reports it. A hint until the engine knows the real duration. */
  duration?: number;
}

export interface AudioTrack {
  id: string;
  label: string;
  /** ISO 639-2 when known. */
  lang: string;
}

export interface SubtitleTrack {
  id: string;
  label: string;
  lang: string;
}

export interface Quality {
  id: string;
  label: string;
}

export interface Tracks {
  audio: AudioTrack[];
  subtitles: SubtitleTrack[];
  qualities: Quality[];
}

/**
 * - `network`: the stream couldn't be fetched (ticket 18: "Connection lost").
 * - `media`: it was fetched but couldn't be decoded or played.
 * - `unsupported`: the engine can't play this source at all (try another stream, ticket 08).
 */
export type PlayerErrorKind = 'network' | 'media' | 'unsupported';

export interface PlayerError {
  kind: PlayerErrorKind;
  /** For the diagnostics log only. Never shown to the viewer and never contains a URL. */
  detail: string;
}

/** `paused` is also "loaded and ready, not started". */
export type PlaybackState = 'idle' | 'loading' | 'paused' | 'playing' | 'ended' | 'error';

export interface PlayerEvents {
  /** Position and duration, in seconds, a few times a second while playing and after every seek. */
  time: { position: number; duration: number };
  /** True while the engine is waiting for data. */
  buffering: boolean;
  ended: undefined;
  error: PlayerError;
  state: PlaybackState;
  /** The tracks changed (for example once the stream is loaded). Read them with `getTracks()`. */
  tracks: undefined;
}

export type PlayerEvent = keyof PlayerEvents;

/** What an engine can play, so the screen can pick a stream it supports (see core/player/streams.ts). */
export interface PlayerCapabilities {
  /** Stream types it plays, in order of preference. */
  streams: readonly StreamType[];
  /** Whether it decodes HEVC; otherwise H.264 files are picked. */
  hevc: boolean;
}

export interface PlayerAdapter {
  readonly capabilities: PlayerCapabilities;
  /** Opens a source and prepares it at `startAt` seconds, paused. Rejects with a PlayerError. */
  load(source: PlaybackSource, opts: { startAt: number }): Promise<void>;
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  getTracks(): Tracks;
  selectAudio(id: string): void;
  selectSubtitle(id: string | null): void;
  /** May reload the stream, hence async. */
  selectQuality(id: string): Promise<void>;
  on<E extends PlayerEvent>(event: E, listener: (payload: PlayerEvents[E]) => void): () => void;
  /**
   * The app is going to the background (Home, standby). The screen has already paused and saved
   * progress. Engines that must release the decoder do it here (AVPlay `suspend()`, research 30 §9).
   */
  suspend?(): void;
  /** Back from the background. The screen keeps playback paused; the engine just reacquires itself. */
  restore?(): void;
  destroy(): void;
}

/** One way of making a player. The first available one in core/player/createPlayer.ts wins. */
export interface PlayerFactory {
  name: string;
  available(): boolean;
  /** `host` is the full-screen element the engine may draw into (a <video>, AVPlay's <object>). */
  create(host: HTMLElement): PlayerAdapter;
}
