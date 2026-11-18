import { getCurrentFocusKey, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { createContext, useCallback, useEffect, useRef, useState } from 'react';

export const CardReadiness = createContext<(key: string, ready: boolean) => void>(() => undefined);

/** Track usable leaves without making loading cards focusable. */
export function useCardReadiness() {
  const [ready, setReady] = useState<ReadonlySet<string>>(() => new Set());
  const report = useCallback((key: string, usable: boolean) => {
    setReady(current => {
      if (current.has(key) === usable) return current;
      const next = new Set(current);
      if (usable) next.add(key); else next.delete(key);
      return next;
    });
  }, []);
  return { ready, report };
}

let previousFocus = '';
let navigation = 0;
let observers = 0;
const beforeNavigation = () => { previousFocus = getCurrentFocusKey(); navigation++; };
export const artworkNavigationOrigin = () => previousFocus;

const artworkRestorers = new Map<string, (target: string) => void>();

/** Restore a saved artwork leaf through its owner, after selecting a usable fallback. */
export function restoreArtworkFocus(target: string, fallback: string): boolean {
  for (const [key, restore] of artworkRestorers) {
    if (!target.startsWith(`${key}:`)) continue;
    void setFocus(fallback);
    restore(target);
    return true;
  }
  return false;
}

/** Scroll/load an incoming container without leaving focus on an invisible leaf. */
export function useArtworkFocus(key: string, ready: ReadonlySet<string>, preferred?: string, prepareRestore?: () => void) {
  const pending = useRef<{ from?: string; navigation: number; target?: string }>();
  const [revision, retry] = useState(0);
  useEffect(() => {
    if (!observers++) window.addEventListener('keydown', beforeNavigation, true);
    return () => { if (!--observers) window.removeEventListener('keydown', beforeNavigation, true); };
  }, []);
  const enter = useCallback(() => {
    // A scheduled fallback can enter this container after Back has already
    // requested a saved leaf. Keep that request rather than taking the first
    // card to decode (or replacing it with a generic container entry).
    if (pending.current?.target && pending.current.navigation === navigation) return;
    if (getCurrentFocusKey() !== key) return;
    if (preferred ? ready.has(preferred) : ready.size) { void setFocus(preferred ?? ready.values().next().value!); return; }
    pending.current = { from: previousFocus, navigation, target: preferred };
    if (previousFocus && previousFocus !== key) void setFocus(previousFocus, { artworkRestore: true });
    retry(value => value + 1);
  }, [key, ready, preferred]);
  useEffect(() => {
    const request = pending.current;
    if (request && request.navigation !== navigation) {
      pending.current = undefined;
      return;
    }
    if (!request || !(request.target ? ready.has(request.target) : ready.size)) return;
    pending.current = undefined;
    if (request.navigation === navigation && (request.from === undefined || getCurrentFocusKey() === request.from)) void setFocus(request.target ?? key);
  }, [key, ready, revision]);
  const request = useCallback((target: string) => {
    pending.current = { from: getCurrentFocusKey(), navigation, target };
    retry(value => value + 1);
  }, []);
  useEffect(() => {
    artworkRestorers.set(key, target => {
      prepareRestore?.();
      // The old screen's key can still be current while Norigin schedules the
      // fallback. Restoration is owned by this navigation until another key.
      pending.current = { navigation, target };
      retry(value => value + 1);
    });
    return () => { artworkRestorers.delete(key); };
  }, [key, request, prepareRestore]);
  return { enter, request };
}
