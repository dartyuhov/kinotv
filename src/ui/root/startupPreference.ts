import { storage } from '../../core/platform/storage';
import type { TabId } from './tabs';

const STORAGE_KEY = 'kinotv:startup-tab';

/** Installation preference, independent of the session and the current navigation state. */
export function readStartupTab(availableTabs: readonly TabId[]): TabId {
  const saved = storage.get<unknown>(STORAGE_KEY);
  return availableTabs.find((id) => id === saved) ?? 'home';
}

export function saveStartupTab(tab: TabId): void {
  storage.set(STORAGE_KEY, tab);
}
