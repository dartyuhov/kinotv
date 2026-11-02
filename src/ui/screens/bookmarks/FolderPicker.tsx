import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import type { BookmarkFolder, ItemSummary } from '../../../core/api/types';
import { t } from '../../../core/i18n';
import { Overlay } from '../../components/Overlay';
import { revealInScroller } from '../../focus/reveal';
import { bookmarkFoldersQuery, itemBookmarkFoldersQuery } from './bookmarkQueries';
import { useBookmarkWrite } from './useBookmarkWrite';
import './FolderPicker.css';

const pickerKey = (itemId: number) => `bookmarks:picker:${itemId}`;
const optionKey = (itemId: number, folderId: number) => `bookmarks:picker:${itemId}:${folderId}`;

/**
 * The folder picker of a title page's Bookmark button: the viewer's folders, each ticked if it holds the
 * title. OK puts the title in a folder or takes it out, at once (see useBookmarkWrite). Back closes it.
 */
export function FolderPicker({ item, onClose }: { item: ItemSummary; onClose(): void }) {
  const folders = useQuery(bookmarkFoldersQuery);
  const memberships = useQuery(itemBookmarkFoldersQuery(item.id));
  const write = useBookmarkWrite();
  const ready = folders.isSuccess && memberships.isSuccess;
  const list = ready ? folders.data : [];
  const first = list[0];

  let message: string | null = null;
  if (folders.isError || memberships.isError) message = t('bookmarks.pickerFailed');
  else if (!ready) message = t('bookmarks.pickerLoading');
  else if (list.length === 0) message = t('bookmarks.noFolders');

  return (
    <Overlay
      id={pickerKey(item.id)}
      title={t('bookmarks.pickerTitle')}
      initialFocusKey={first ? optionKey(item.id, first.id) : undefined}
      onClose={onClose}
    >
      {message && <p className="folder-picker__message">{message}</p>}
      {list.length > 0 && (
        <div className="folder-picker__options">
          {list.map((folder) => {
            const checked = memberships.data?.includes(folder.id) ?? false;
            return (
              <FolderOption
                key={folder.id}
                focusKey={optionKey(item.id, folder.id)}
                folder={folder}
                checked={checked}
                onPress={() => write.mutate({ item, folder, add: !checked })}
              />
            );
          })}
        </div>
      )}
    </Overlay>
  );
}

interface FolderOptionProps {
  focusKey: string;
  folder: BookmarkFolder;
  checked: boolean;
  onPress(): void;
}

function FolderOption({ focusKey, folder, checked, onPress }: FolderOptionProps) {
  const { ref } = useFocusable<object, HTMLDivElement>({
    focusKey,
    onEnterPress: onPress,
    onFocus: ({ node }) => revealInScroller(node),
  });
  return (
    <div ref={ref} role="checkbox" aria-checked={checked} aria-label={folder.title} className="folder-picker__option">
      <span className="folder-picker__check" aria-hidden>
        {checked && <Check strokeWidth={3} />}
      </span>
      {folder.title}
    </div>
  );
}
