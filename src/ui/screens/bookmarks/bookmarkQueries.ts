import { queryOptions } from '@tanstack/react-query';
import { api } from '../../../core/services';
import { queryClient } from '../../app/queries';

/** Every bookmark query key starts with this, so one invalidation covers them all. */
export const BOOKMARKS_KEY = ['bookmarks'] as const;
/** Every bookmark write (add or remove) is a mutation with this key. */
export const BOOKMARK_WRITE_KEY = ['bookmarks', 'write'] as const;

/**
 * Bookmark reads wait until no bookmark write is in flight. A read that answered mid-write could show the
 * server's state from before the write and wipe out the change already on screen (spec §7.4); after the
 * write settles, the read gets the server's truth either way.
 */
async function afterWrites<T>(read: () => Promise<T>): Promise<T> {
  const mutations = queryClient.getMutationCache();
  const writing = () => queryClient.isMutating({ mutationKey: BOOKMARK_WRITE_KEY }) > 0;
  if (writing()) {
    await new Promise<void>((resolve) => {
      const unsubscribe = mutations.subscribe(() => {
        if (writing()) return;
        unsubscribe();
        resolve();
      });
    });
  }
  return read();
}

// Personal lists: re-fetched whenever a screen showing them mounts (spec §7.4).

/** The viewer's bookmark folders, with how many titles each holds. */
export const bookmarkFoldersQuery = queryOptions({
  queryKey: [...BOOKMARKS_KEY, 'folders'],
  queryFn: () => afterWrites(() => api.bookmarkFolders()),
  staleTime: 0,
});

/** The titles in one folder, newest first. */
export const bookmarkFolderItemsQuery = (folderId: number) =>
  queryOptions({
    queryKey: [...BOOKMARKS_KEY, 'folder', folderId],
    queryFn: () => afterWrites(() => api.bookmarkFolderItems(folderId)),
    staleTime: 0,
  });

/** The ids of the folders that hold one title. */
export const itemBookmarkFoldersQuery = (itemId: number) =>
  queryOptions({
    queryKey: [...BOOKMARKS_KEY, 'item', itemId],
    queryFn: () => afterWrites(() => api.itemBookmarkFolders(itemId)),
    staleTime: 0,
  });
