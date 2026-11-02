import { doesFocusableExist, FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { registerScroller, scrollerFor, type StackEntry } from './stack';
import './ScreenHost.css';

const ScreenContext = createContext<number | null>(null);

/**
 * Returns a ref for the element that scrolls this screen vertically. The navigator records its
 * scrollTop on push and puts it back on pop. A screen has at most one.
 */
export function useScreenScroller(): (el: HTMLElement | null) => void {
  const entryId = useContext(ScreenContext);
  if (entryId === null) throw new Error('useScreenScroller must be used inside a ScreenHost');
  return useCallback((el: HTMLElement | null) => registerScroller(entryId, el), [entryId]);
}

/**
 * Hosts one stack entry: a full-stage layer with its own focus root.
 *
 * On mount it restores the scroll position and focus recorded when a screen was pushed over it.
 * Otherwise it focuses the screen root, and Norigin descends to the screen's initial focus:
 * the `preferredChildFocusKey` chain if the screen sets one, else the top-left focusable.
 */
export function ScreenHost({ entry, children }: { entry: StackEntry; children: ReactNode }) {
  const { ref, focusKey } = useFocusable({ focusKey: `screen:${entry.id}`, isFocusBoundary: true });

  // Children's refs are attached before this runs, so the scroller is registered.
  useLayoutEffect(() => {
    const scroller = scrollerFor(entry.id);
    if (scroller && entry.restore) scroller.scrollTop = entry.restore.scrollTop;
  }, [entry]);

  // Runs after the children's effects, so their focusables are registered by now.
  useEffect(() => {
    const target = entry.restore?.focusKey;
    void setFocus(target && doesFocusableExist(target) ? target : focusKey);
  }, [entry, focusKey]);

  return (
    <ScreenContext.Provider value={entry.id}>
      <FocusContext.Provider value={focusKey}>
        <div ref={ref} className="screen-host" data-screen={entry.name}>
          {children}
        </div>
      </FocusContext.Provider>
    </ScreenContext.Provider>
  );
}
