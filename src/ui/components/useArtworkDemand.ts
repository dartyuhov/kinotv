import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import { useScreenStackStore } from '../nav/stack';

const visibility = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;
function observe(element: Element, listener: (visible: boolean) => void): () => void {
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) visibility.get(entry.target)?.(entry.isIntersecting);
  });
  visibility.set(element, listener);
  observer.observe(element);
  return () => {
    observer?.unobserve(element);
    visibility.delete(element);
    if (!visibility.size) { observer?.disconnect(); observer = undefined; }
  };
}

const onlineListeners = new Set<() => void>();
const notifyOnline = () => { for (const listener of onlineListeners) listener(); };
const subscribeOnline = (listener: () => void) => {
  if (!onlineListeners.size) {
    window.addEventListener('online', notifyOnline);
    window.addEventListener('offline', notifyOnline);
  }
  onlineListeners.add(listener);
  return () => {
    onlineListeners.delete(listener);
    if (!onlineListeners.size) {
      window.removeEventListener('online', notifyOnline);
      window.removeEventListener('offline', notifyOnline);
    }
  };
};
const isOnline = () => navigator.onLine;

// Small, global reversal buffer, not a second unbounded image cache.
const retained = new Map<Element, { bytes: number; evict(): void }>();
const RETAINED_BYTES = 8 * 1024 * 1024;
function trimRetained() {
  let bytes = [...retained.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  while (retained.size > 8 || bytes > RETAINED_BYTES) {
    const [element, entry] = retained.entries().next().value!;
    retained.delete(element);
    bytes -= entry.bytes;
    entry.evict();
  }
}

/** Hold loaded cards briefly through scroll reversal, within a shared pixel budget. */
export function useArtworkRetention(ref: RefObject<HTMLElement>, visible: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    retained.delete(element);
    if (visible) { setHeld(true); return; }
    const image = element.querySelector('img');
    if (!image?.naturalWidth || !image.getAttribute('src')) { setHeld(false); return; }
    const timer = setTimeout(() => { retained.delete(element); setHeld(false); }, 1500);
    retained.set(element, { bytes: image.naturalWidth * image.naturalHeight * 4,
      evict: () => { clearTimeout(timer); setHeld(false); } });
    trimRetained();
    return () => { clearTimeout(timer); retained.delete(element); };
  }, [ref, visible]);
  return visible || held;
}

/** One observer handles clipping for all cards, including translated Home rows. */
export function useArtworkVisibility(ref: RefObject<HTMLElement>): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return observe(element, setVisible);
  }, [ref]);
  return visible;
}

/** Two directional neighbors can warm their display lease before entering the viewport. */
export function useArtworkPrefetch(navigation?: string): boolean {
  const playing = useScreenStackStore((s) => s.stack[s.stack.length - 1]?.name === 'player');
  const online = useSyncExternalStore(subscribeOnline, isOnline);
  const [warm, setWarm] = useState(false);
  const eligible = !!navigation && online && !playing;
  useEffect(() => {
    setWarm(false);
    if (!eligible) return;
    const timer = setTimeout(() => setWarm(true), 150);
    return () => clearTimeout(timer);
  }, [eligible]);
  return eligible && warm;
}
