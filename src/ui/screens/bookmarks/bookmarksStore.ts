import { create } from 'zustand';
import { session } from '../../../core/services';

/**
 * The folder the Bookmarks tab shows. The tab unmounts when a title page is pushed over it, so the
 * choice lives here, and Back comes back to the same folder.
 */
export const useBookmarksStore = create<{ folderId: number | null }>(() => ({ folderId: null }));

// The next viewer starts on their own first folder.
session.subscribe(() => {
  if (session.status() === 'signedOut') useBookmarksStore.setState({ folderId: null });
});
