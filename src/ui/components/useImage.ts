import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { imageCache } from '../../core/images';
import type { ImageLease, ImagePriority, ImageRole } from '../../core/images/cache';

/** Consumers own leases, never persistence or object URLs. Source guards obsolete completions. */
export function useImage(source: string, role: ImageRole = 'poster', enabled = true, priority: ImagePriority = 'visible'): string | undefined {
  const [display, setDisplay] = useState<{ source: string; url: string }>();
  const activeLease = useRef<ImageLease>();
  const currentPriority = useRef(priority);
  currentPriority.current = priority;
  useLayoutEffect(() => {
    setDisplay(undefined);
    if (!source || !enabled) return;
    let active = true;
    const lease = imageCache().acquire(source, role, currentPriority.current);
    activeLease.current = lease;
    const show = (url: string | undefined) => {
      if (active && url) setDisplay((current) => current?.source === source && current.url === url ? current : { source, url });
    };
    // subscribe delivers initial publication as well as refreshes. ready also
    // covers adapters that already published before subscription; dedupe both.
    const unsubscribe = lease.subscribe(show);
    void lease.ready.then(show);
    return () => { active = false; unsubscribe(); lease.release(); activeLease.current = undefined; };
  }, [source, role, enabled]);
  useEffect(() => { activeLease.current?.setPriority(priority); }, [priority]);
  return enabled && display?.source === source ? display.url : undefined;
}
