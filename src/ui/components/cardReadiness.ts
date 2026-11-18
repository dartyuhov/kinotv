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

/** Scroll/load an incoming container without leaving focus on an invisible leaf. */
export function useArtworkFocus(key: string, ready: ReadonlySet<string>, preferred?: string) {
  const pending = useRef<{ from: string; navigation: number; target?: string }>();
  const [revision, retry] = useState(0);
  useEffect(() => {
    if (!observers++) window.addEventListener('keydown', beforeNavigation, true);
    return () => { if (!--observers) window.removeEventListener('keydown', beforeNavigation, true); };
  }, []);
  const enter = useCallback(() => {
    if (getCurrentFocusKey() !== key) return;
    if (preferred ? ready.has(preferred) : ready.size) { void setFocus(preferred ?? ready.values().next().value!); return; }
    pending.current = { from: previousFocus, navigation, target: preferred };
    if (previousFocus && previousFocus !== key) void setFocus(previousFocus, { artworkRestore: true });
    retry(value => value + 1);
  }, [key, ready, preferred]);
  useEffect(() => {
    const request = pending.current;
    if (!request || !(request.target ? ready.has(request.target) : ready.size)) return;
    pending.current = undefined;
    if (request.navigation === navigation && getCurrentFocusKey() === request.from) void setFocus(request.target ?? key);
  }, [key, ready, revision]);
  const request = useCallback((target: string) => {
    pending.current = { from: getCurrentFocusKey(), navigation, target };
    retry(value => value + 1);
  }, []);
  return { enter, request };
}
