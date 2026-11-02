import { getCurrentFocusKey } from '@noriginmedia/norigin-spatial-navigation';
import { create } from 'zustand';

/**
 * Every screen that can be pushed, with its params. Add an entry here when you add a screen,
 * then register its component in ui/app/screens.tsx.
 */
export interface ScreenParams {
  root: undefined;
  demo: { n: number };
  /** A film or series page, by kino.watch item id. */
  title: { id: number };
  /**
   * Plays a title. `season` and `episode` pick a series episode; `episode` alone picks a part of a
   * multi-part film; neither means the film's only video. `startAt` is seconds into the video.
   */
  player: { itemId: number; season?: number; episode?: number; startAt: number };
  /** A curated collection's titles, by kino.watch collection id. */
  collection: { id: number };
}
export type ScreenName = keyof ScreenParams;

/** Where to put focus and scroll back when the screen above this one is popped. */
export interface Restore {
  focusKey: string;
  scrollTop: number;
}

export interface StackEntry<N extends ScreenName = ScreenName> {
  /** Unique per push. Used as the React key, so a re-pushed screen mounts fresh. */
  id: number;
  name: N;
  params: ScreenParams[N];
  restore?: Restore;
}

interface StackState {
  stack: StackEntry[];
}

let nextId = 1;
const rootEntry = (): StackEntry => ({ id: nextId++, name: 'root', params: undefined });

export const useScreenStackStore = create<StackState>(() => ({ stack: [rootEntry()] }));

// Each mounted screen registers its vertical scroll container here (see ScreenHost and useScreenScroller).
const scrollers = new Map<number, HTMLElement>();

export function registerScroller(entryId: number, el: HTMLElement | null): void {
  if (el) scrollers.set(entryId, el);
  else scrollers.delete(entryId);
}

export function scrollerFor(entryId: number): HTMLElement | undefined {
  return scrollers.get(entryId);
}

type ParamsArg<N extends ScreenName> = ScreenParams[N] extends undefined ? [] : [params: ScreenParams[N]];

/**
 * The ScreenStack navigator. Only the top screen is mounted; screens underneath are re-mounted on pop,
 * so keep anything that must survive a push in a store, not in component state.
 */
export const screenStack = {
  /** Pushes a screen. Records the current focus key and scroll position so `pop` can restore them. */
  push<N extends ScreenName>(name: N, ...args: ParamsArg<N>): void {
    const { stack } = useScreenStackStore.getState();
    const top = stack[stack.length - 1]!;
    const restore: Restore = {
      focusKey: getCurrentFocusKey(),
      scrollTop: scrollerFor(top.id)?.scrollTop ?? 0,
    };
    const entry = { id: nextId++, name, params: args[0] } as StackEntry;
    useScreenStackStore.setState({ stack: [...stack.slice(0, -1), { ...top, restore }, entry] });
  },

  /** Pops the top screen. Returns false at the root, where there is nothing to pop. */
  pop(): boolean {
    const { stack } = useScreenStackStore.getState();
    if (stack.length <= 1) return false;
    useScreenStackStore.setState({ stack: stack.slice(0, -1) });
    return true;
  },

  depth(): number {
    return useScreenStackStore.getState().stack.length;
  },

  /** Drops every screen above the root, e.g. on sign-out, so the next viewer starts fresh. */
  reset(): void {
    useScreenStackStore.setState({ stack: [rootEntry()] });
  },
};
