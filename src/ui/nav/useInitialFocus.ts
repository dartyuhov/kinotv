import { doesFocusableExist, FocusContext, getCurrentFocusKey, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useContext, useEffect, useRef } from 'react';

/**
 * Initial focus for a screen whose content loads after it mounts (spec §4: "each screen declares its
 * initial focus").
 *
 * If the content is there at mount (e.g. from the query cache), ScreenHost already focuses the screen,
 * which descends the `preferredChildFocusKey` chain, or restores the focus recorded before a push. This
 * covers the other case: once `ready` turns true, it focuses `target`, unless focus has meanwhile gone
 * somewhere real. "Nowhere real" is the screen host itself, `ownKey` (the screen's own container, which
 * Norigin focuses as a leaf while it has no children), or a key that no longer exists.
 *
 * Call it from a screen component rendered directly inside its ScreenHost.
 */
export function useInitialFocus(ready: boolean, target: string, ownKey: string): void {
  const hostKey = useContext(FocusContext);
  const readyAtMount = useRef(ready);
  useEffect(() => {
    if (!ready || readyAtMount.current) return;
    const current = getCurrentFocusKey();
    if (current === hostKey || current === ownKey || !doesFocusableExist(current)) void setFocus(target);
    // Only the transition to ready matters; the keys are stable for the screen's lifetime.
  }, [ready]);
}
