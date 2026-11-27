import { queryOptions } from '@tanstack/react-query';
import type { HistoryEntry } from '../../../core/api/types';
import { api } from '../../../core/services';
import { storage } from '../../../core/platform/storage';

/** The last history read, kept on the TV so the tab shows it at once on the next launch. Cleared on sign-out. */
export const HISTORY_STORAGE_KEY = 'kinotv:history';

interface SavedHistory { savedAt: number; entries: HistoryEntry[] }

function saved(): SavedHistory | undefined {
  const value = storage.get<SavedHistory>(HISTORY_STORAGE_KEY);
  return value && Number.isFinite(value.savedAt) && Array.isArray(value.entries) ? value : undefined;
}

/** Only what the History cards and backdrop show; playback re-reads the title's details anyway. */
const compact = ({ item, ...entry }: HistoryEntry): HistoryEntry =>
  ({ ...entry, item: { id: item.id, type: item.type, subtype: item.subtype, title: item.title, posters: item.posters } });

/**
 * The viewer's history. A long one is dozens of pages (seconds on a TV), so:
 * - it starts from the copy saved by the last read, at its age, and refreshes behind it once stale;
 * - it isn't re-fetched every time the tab shows: it stays fresh for five minutes. Progress writes and
 *   watched changes invalidate it (ui/app/progressInvalidation.ts), so playback from this app shows at
 *   once; activity elsewhere shows within five minutes;
 * - it is kept for half an hour after the tab closes.
 */
export const historyQuery = queryOptions({
  queryKey: ['history'],
  queryFn: async () => {
    const entries = await api.history();
    storage.set(HISTORY_STORAGE_KEY, { savedAt: Date.now(), entries: entries.map(compact) } satisfies SavedHistory);
    return entries;
  },
  initialData: () => saved()?.entries,
  initialDataUpdatedAt: () => saved()?.savedAt,
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
});
