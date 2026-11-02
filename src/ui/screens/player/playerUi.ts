import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PlayerAdapter } from '../../../core/player/types';
import type { PlaybackSnapshot } from './usePlayback';

/** Controls hide after this long without input while playing (spec §5.3). */
export const CONTROLS_HIDE_MS = 4_000;

/**
 * What overlay layers get from the player screen. A layer is a component the screen renders above the
 * controls: the settings panel (ticket 08), the next-episode card (ticket 09). A layer:
 * - reads `playback` and drives `player` (e.g. selectAudio);
 * - handles Back with `useBackHandler`: it mounts after the screen, so it gets Back first
 *   ("close panel → hide controls → exit");
 * - calls `usePlayerKeyCapture(true)` while it wants the arrows and OK (e.g. a focusable panel). The
 *   screen then ignores keys and keeps the controls up.
 */
export interface PlayerUi {
  player: PlayerAdapter;
  playback: PlaybackSnapshot;
  controlsVisible: boolean;
  /** Shows the controls and restarts the auto-hide timer. */
  showControls(): void;
  hideControls(): void;
  /** Takes the remote from the player. Call the returned function to give it back. */
  captureKeys(): () => void;
}

export const PlayerUiContext = createContext<PlayerUi | null>(null);

export function usePlayerUi(): PlayerUi {
  const ui = useContext(PlayerUiContext);
  if (!ui) throw new Error('usePlayerUi outside the player screen');
  return ui;
}

/** While `active`, the player screen leaves the remote's keys (except Back) to this layer. */
export function usePlayerKeyCapture(active: boolean): void {
  const { captureKeys } = usePlayerUi();
  useEffect(() => (active ? captureKeys() : undefined), [active, captureKeys]);
}

/**
 * Controls visibility: shown on any key, hidden after CONTROLS_HIDE_MS without input while playing.
 * They stay up while paused, while `hold` is set (a layer has the keys, a seek preview is showing).
 */
export function useControlsVisibility({ playing, hold }: { playing: boolean; hold: boolean }) {
  const [visible, setVisible] = useState(true);
  const [shownAt, setShownAt] = useState(0);
  const show = useCallback(() => {
    setVisible(true);
    setShownAt((n) => n + 1);
  }, []);
  const hide = useCallback(() => setVisible(false), []);

  useEffect(() => {
    if (!visible || !playing || hold) return;
    const timer = setTimeout(() => setVisible(false), CONTROLS_HIDE_MS);
    return () => clearTimeout(timer);
  }, [visible, playing, hold, shownAt]);

  return { visible, show, hide };
}

/** A counter of layers holding the remote, with a stable `capture` for the context. */
export function useKeyCaptures() {
  const count = useRef(0);
  const [captured, setCaptured] = useState(false);
  const capture = useCallback(() => {
    count.current += 1;
    setCaptured(true);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      count.current -= 1;
      setCaptured(count.current > 0);
    };
  }, []);
  const isCaptured = useCallback(() => count.current > 0, []);
  return { captured, isCaptured, capture };
}
