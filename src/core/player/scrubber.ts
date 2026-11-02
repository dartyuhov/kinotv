// Seeking with the remote (spec §5.1): ◀▶ step through the video, faster the longer they are held
// (10 s → 30 s → 60 s steps); ⏪ ⏩ jump a fixed −10 s / +30 s. Steps add up to a preview target, shown
// on the progress bar (time only: kino.watch has no thumbnails, epic note 5), and the player seeks once
// the keys stop. One seek per burst suits AVPlay, whose seeks are slow and must not overlap.

/** Presses closer together than this are one hold (a held key repeats every ~100–200 ms on the TV). */
export const HOLD_GAP_MS = 800;
/** The player seeks this long after the last seek key. */
export const COMMIT_DELAY_MS = 800;

/** The step for the n-th press of a hold (1-based). */
export function holdStep(press: number): number {
  if (press <= 3) return 10;
  if (press <= 6) return 30;
  return 60;
}

export interface ScrubberOptions {
  /** The player's position now, seconds. */
  position(): number;
  /** Seconds; 0 while unknown. */
  duration(): number;
  /** The previewed target, or null once there is none. */
  onPreview(target: number | null): void;
  seek(target: number): void;
  now?: () => number;
}

export interface Scrubber {
  /** ◀ (-1) or ▶ (+1), accelerating while held. */
  step(direction: 1 | -1): void;
  /** A fixed jump, e.g. -10 for ⏪. */
  jump(seconds: number): void;
  /** Seeks to the previewed target right away, if there is one. */
  commit(): void;
  dispose(): void;
}

export function createScrubber({ position, duration, onPreview, seek, now = Date.now }: ScrubberOptions): Scrubber {
  let target: number | null = null;
  let hold = { direction: 0, presses: 0, at: -Infinity };
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clamp = (t: number) => {
    const d = duration();
    // Not the very last second: seeking onto the end races the "ended" event on some engines.
    return Math.max(0, d > 0 ? Math.min(t, Math.max(0, d - 1)) : t);
  };

  function move(by: number) {
    target = clamp((target ?? Math.floor(position())) + by);
    onPreview(target);
    if (timer) clearTimeout(timer);
    timer = setTimeout(commit, COMMIT_DELAY_MS);
  }

  function commit() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (target === null) return;
    const to = target;
    target = null;
    hold = { direction: 0, presses: 0, at: -Infinity };
    seek(to);
    onPreview(null);
  }

  return {
    step(direction) {
      const t = now();
      const continues = hold.direction === direction && t - hold.at <= HOLD_GAP_MS;
      hold = { direction, presses: continues ? hold.presses + 1 : 1, at: t };
      move(direction * holdStep(hold.presses));
    },
    jump(seconds) {
      hold = { direction: 0, presses: 0, at: -Infinity };
      move(seconds);
    },
    commit,
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
