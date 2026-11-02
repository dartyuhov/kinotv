import { useMutation } from '@tanstack/react-query';
import type { BookmarkFolder, ItemSummary } from '../../../core/api/types';
import { splitTitle } from '../../../core/catalog/titles';
import { t } from '../../../core/i18n';
import { api } from '../../../core/services';
import { queryClient } from '../../app/queries';
import { showToast } from '../../components/Toast';
import { BOOKMARK_WRITE_KEY, BOOKMARKS_KEY, bookmarkFolderItemsQuery, bookmarkFoldersQuery, itemBookmarkFoldersQuery } from './bookmarkQueries';

/** Put `item` in `folder` (add) or take it out. */
export interface BookmarkWrite {
  item: ItemSummary;
  folder: Pick<BookmarkFolder, 'id' | 'title'>;
  add: boolean;
}

/** What the optimistic change did, so a rejection can undo exactly that. */
interface Undo {
  /** Where the item stood in the folder's list before a removal; -1 if it wasn't listed. */
  index: number;
  /** How much the folder's count moved. */
  countDelta: number;
  /** Whether the item's folder list changed. */
  membershipChanged: boolean;
}

/**
 * Adds a title to a bookmark folder or removes it, optimistically (spec §7.4):
 *
 * - At once, every cached view of it changes: the title's folders (the picker), the folder's titles and
 *   its count (the Bookmarks tab).
 * - If the server rejects it, exactly that change is undone and a message says so. That happens even
 *   if the screen that asked has gone meanwhile.
 * - Once settled, every bookmark query is refetched for the server's truth. Bookmark reads wait for
 *   writes in flight (see bookmarkQueries), so no read can bring back the state from before.
 */
export function useBookmarkWrite() {
  return useMutation<void, Error, BookmarkWrite, Undo>({
    mutationKey: BOOKMARK_WRITE_KEY,
    mutationFn: ({ item, folder, add }) => (add ? api.addBookmark(item.id, folder.id) : api.removeBookmark(item.id, folder.id)),
    onMutate: async (write) => {
      await queryClient.cancelQueries({ queryKey: BOOKMARKS_KEY });
      return apply(write);
    },
    onError: (_error, write, undo) => {
      if (undo) revert(write, undo);
      const title = splitTitle(write.item.title).title;
      showToast(t(write.add ? 'bookmarks.addFailed' : 'bookmarks.removeFailed', { title, folder: write.folder.title }));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOOKMARKS_KEY });
    },
  });
}

function apply({ item, folder, add }: BookmarkWrite): Undo {
  const memberships = itemBookmarkFoldersQuery(item.id).queryKey;
  const items = bookmarkFolderItemsQuery(folder.id).queryKey;
  const listed = queryClient.getQueryData(items);
  const index = listed ? listed.findIndex((i) => i.id === item.id) : -1;
  // Whether the item was in the folder, as far as the cache knows; if it doesn't, the write is a change.
  const ids = queryClient.getQueryData(memberships);
  const wasIn = ids ? ids.includes(folder.id) : listed ? index >= 0 : !add;
  const membershipChanged = wasIn !== add;

  if (membershipChanged) {
    queryClient.setQueryData(memberships, (old) => old && (add ? [...old, folder.id] : old.filter((id) => id !== folder.id)));
  }
  queryClient.setQueryData(items, (old) => {
    if (!old) return old;
    if (add) return index >= 0 ? old : [item, ...old];
    return old.filter((i) => i.id !== item.id);
  });
  const countDelta = membershipChanged ? (add ? 1 : -1) : 0;
  shiftCount(folder.id, countDelta);
  return { index: add ? -1 : index, countDelta, membershipChanged };
}

function revert({ item, folder, add }: BookmarkWrite, undo: Undo): void {
  if (undo.membershipChanged) {
    queryClient.setQueryData(itemBookmarkFoldersQuery(item.id).queryKey, (old) =>
      old && (add ? old.filter((id) => id !== folder.id) : old.includes(folder.id) ? old : [...old, folder.id]),
    );
  }
  queryClient.setQueryData(bookmarkFolderItemsQuery(folder.id).queryKey, (old) => {
    if (!old) return old;
    if (add) return undo.membershipChanged ? old.filter((i) => i.id !== item.id) : old;
    if (undo.index < 0 || old.some((i) => i.id === item.id)) return old;
    return [...old.slice(0, undo.index), item, ...old.slice(undo.index)];
  });
  shiftCount(folder.id, -undo.countDelta);
}

function shiftCount(folderId: number, delta: number): void {
  if (!delta) return;
  queryClient.setQueryData(bookmarkFoldersQuery.queryKey, (old) =>
    old?.map((f) => (f.id === folderId ? { ...f, count: Math.max(0, f.count + delta) } : f)),
  );
}
