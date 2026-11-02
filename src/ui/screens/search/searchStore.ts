import { create } from 'zustand';
import { getLocale } from '../../../core/i18n';
import { storage } from '../../../core/platform/storage';
import { session } from '../../../core/services';
import { initialLayout, type LayoutId } from './keyboardLayout';

const LAYOUT_STORAGE_KEY = 'kinotv:keyboardLayout';

interface SearchState {
  /** What the viewer has typed. Kept here so it survives opening a result and coming Back. */
  query: string;
  /** The layout used last, as stored (it survives restarts): null until the viewer first switches. */
  layout: unknown;
  setQuery(query: string): void;
  setLayout(layout: LayoutId): void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  layout: storage.get<unknown>(LAYOUT_STORAGE_KEY),
  setQuery: (query) => set({ query }),
  setLayout: (layout) => {
    storage.set(LAYOUT_STORAGE_KEY, layout);
    set({ layout });
  },
}));

/** The keyboard's layout: the one used last, else the UI language's (spec §5.2). */
export function useKeyboardLayout(): LayoutId {
  return initialLayout(useSearchStore((s) => s.layout), getLocale());
}

// The next viewer starts with an empty search.
session.subscribe(() => {
  if (session.status() === 'signedOut') useSearchStore.setState({ query: '' });
});
