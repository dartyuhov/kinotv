// Progress sync (spec §7.5): the viewer's position goes to kino.watch every 30 s while playing, and at
// once on pause, exit, episode change and the app going to the background. At ≥ 90% the video is
// marked watched, once. The reporter knows nothing about the API or React: the player screen gives it
// `save` and `markWatched`, feeds it the player's time and playing state, and flushes it on exit.

export const SAVE_EVERY_MS = 30_000;
/** Share of the video after which it counts as watched (kino.watch has no end-credits markers). */
export const WATCHED_AT = 0.9;

export interface ProgressReporterOptions {
  /** Saves the position in whole seconds (GET /v1/watching/marktime). */
  save(seconds: number): Promise<void>;
  /** Marks the video watched. Called once, when playback first reaches WATCHED_AT. */
  markWatched(): Promise<void>;
  /** Where playback started: already saved on the server, so it isn't saved again. */
  startAt: number;
  /** After every write settles (succeeded or not), e.g. to refresh cached progress. */
  onWritten?(): void;
}

export interface ProgressReporter {
  /** The player's latest position and duration, seconds. */
  position(position: number, duration: number): void;
  /** Playback started (true) or stopped: pause, end, error (false). Stopping saves at once. */
  playing(on: boolean): void;
  /** Saves now (exit, background) unless this position is already saved. Resolves when it's written. */
  flush(): Promise<void>;
  /** Stops the 30 s saves. Pending writes still finish. */
  dispose(): void;
}

export function createProgressReporter({ save, markWatched, startAt, onWritten }: ProgressReporterOptions): ProgressReporter {
  let current = Math.floor(startAt);
  let saved = current;
  let watchedSent = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let writing: Promise<void> = Promise.resolve();

  function write(task: () => Promise<void>): Promise<void> {
    // One write at a time, in order, so an older position never lands after a newer one.
    writing = writing
      .then(task)
      .catch((error: unknown) => console.warn('progress sync failed', error))
      .finally(() => onWritten?.());
    return writing;
  }

  function flush(): Promise<void> {
    if (current === saved) return writing;
    const seconds = current;
    saved = seconds;
    return write(() => save(seconds));
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    position(position, duration) {
      current = Math.floor(position);
      if (!watchedSent && duration > 0 && position >= duration * WATCHED_AT) {
        watchedSent = true;
        void flush();
        void write(markWatched);
      }
    },
    playing(on) {
      if (on) {
        timer ??= setInterval(() => void flush(), SAVE_EVERY_MS);
      } else {
        stopTimer();
        void flush();
      }
    },
    flush,
    dispose: stopTimer,
  };
}
