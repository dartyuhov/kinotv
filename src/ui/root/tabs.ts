import { create } from 'zustand';

/** Tab bar order (spec §4). */
export const TAB_IDS = ['search', 'home', 'movies', 'series', 'iwatch', 'tv', 'sport', 'bookmarks', 'history', 'settings'] as const;
export type TabId = (typeof TAB_IDS)[number];

export const HOME_TAB: TabId = 'home';

export const tabFocusKey = (id: TabId) => `tab:${id}`;

interface TabState {
  activeTab: TabId;
  setActiveTab(id: TabId): void;
}

/** The active tab outlives the root screen, so it survives pushing and popping screens on top of it. */
export const useTabStore = create<TabState>((set) => ({
  activeTab: HOME_TAB,
  setActiveTab: (activeTab) => set({ activeTab }),
}));
