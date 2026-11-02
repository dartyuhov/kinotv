import { useEffect, useRef } from 'react';
import { remoteBus, type BackHandler } from '../../core/input/remoteBus';

/**
 * Handles Back while the component is mounted (and `enabled`). Handlers registered later sit on top,
 * so a dialog that mounts over a screen gets Back before the screen does, and the screen gets it
 * before the navigator pops. Return `false` to pass Back down to the next layer.
 */
export function useBackHandler(handler: BackHandler, enabled = true): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!enabled) return;
    return remoteBus.pushBackHandler(() => latest.current());
  }, [enabled]);
}
