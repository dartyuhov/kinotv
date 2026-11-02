import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useQuery } from '@tanstack/react-query';
import { memo, useState } from 'react';
import type { BookmarkFolder, ItemSummary } from '../../../core/api/types';
import { splitTitle } from '../../../core/catalog/titles';
import { t } from '../../../core/i18n';
import { artwork } from '../../components/artwork';
import { Card, type CardSlot } from '../../components/Card';
import { Row } from '../../components/Row';
import { revealInScroller } from '../../focus/reveal';
import { screenStack } from '../../nav/stack';
import { useRootBackdrop } from '../../root/rootBackdrop';
import { shortcutQuery } from '../home/homeQueries';
import { bookmarkFolderItemsQuery, bookmarkFoldersQuery } from './bookmarkQueries';
import { useBookmarksStore } from './bookmarksStore';
import './BookmarksTab.css';

/** Focus keys, derived from folder ids so Back restores them. */
const ROOT_KEY = 'bookmarks';
const FOLDERS_KEY = 'bookmarks:folders';
const folderKey = (id: number) => `bookmarks:folder:${id}`;
const folderRowKey = (id: number) => `bookmarks:folder:${id}:items`;
const SUGGESTIONS_KEY = 'bookmarks:suggestions';

/**
 * Bookmarks (spec §4): the viewer's kino.watch folders as a row of tabs, and the titles of the folder in
 * focus below them. Focusing a folder selects it, as on the tab bar. The lists are personal, so they are
 * re-fetched whenever the tab is shown (spec §7.4).
 */
export function BookmarksTab() {
  const folders = useQuery(bookmarkFoldersQuery);
  const storedId = useBookmarksStore((s) => s.folderId);
  const list = folders.data ?? [];
  const selected = list.find((f) => f.id === storedId) ?? list[0];
  // No folders, or only empty ones: nothing to show but the empty state (spec §8).
  const empty = folders.isSuccess && list.every((f) => f.count === 0);

  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({
    focusKey: ROOT_KEY,
    preferredChildFocusKey: empty ? SUGGESTIONS_KEY : FOLDERS_KEY,
  });

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="bookmarks">
        <h1 className="bookmarks__title">{t('tabs.bookmarks')}</h1>
        {/* Minimal on purpose: retry and recovery come with the errors ticket (18). */}
        {folders.isError && <p className="bookmarks__message">{t('bookmarks.failed')}</p>}
        {empty && <Empty />}
        {!empty && selected && (
          <>
            <Folders folders={list} selectedId={selected.id} />
            <FolderItems folder={selected} />
          </>
        )}
      </div>
    </FocusContext.Provider>
  );
}

/** No bookmarks: say how to add some, and offer what is popular instead. */
function Empty() {
  const popular = useQuery(shortcutQuery('popular'));
  return (
    <>
      <p className="bookmarks__empty">{t('bookmarks.empty')}</p>
      <p className="bookmarks__message">{t('bookmarks.emptyHint')}</p>
      <Row
        focusKey={SUGGESTIONS_KEY}
        title={t('bookmarks.suggestions')}
        variant="poster"
        items={popular.data ?? []}
        itemKey={itemId}
        renderCard={renderCard}
        onItemPress={openTitle}
      />
    </>
  );
}

/** The folders, as tabs. Down from them goes to the selected folder's titles. */
function Folders({ folders, selectedId }: { folders: BookmarkFolder[]; selectedId: number }) {
  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({ focusKey: FOLDERS_KEY, preferredChildFocusKey: folderKey(selectedId) });
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="bookmarks__folders" role="tablist" aria-label={t('bookmarks.folders')}>
        {folders.map((folder) => (
          <FolderTab key={folder.id} folder={folder} selected={folder.id === selectedId} />
        ))}
      </div>
    </FocusContext.Provider>
  );
}

const selectFolder = (folderId: number) => useBookmarksStore.setState({ folderId });

const FolderTab = memo(function FolderTab({ folder, selected }: { folder: BookmarkFolder; selected: boolean }) {
  const { ref } = useFocusable<object, HTMLDivElement>({
    focusKey: folderKey(folder.id),
    onFocus: ({ node }) => {
      selectFolder(folder.id);
      revealInScroller(node);
    },
  });
  return (
    <div
      ref={ref}
      role="tab"
      aria-selected={selected}
      aria-label={folder.title}
      className={selected ? 'bookmarks__folder bookmarks__folder--selected' : 'bookmarks__folder'}
    >
      {folder.title}
      <span className="bookmarks__count" aria-hidden>
        {folder.count}
      </span>
    </div>
  );
});

/** The titles in one folder. The backdrop shows the focused title, or the folder's newest. */
function FolderItems({ folder }: { folder: BookmarkFolder }) {
  const items = useQuery(bookmarkFolderItemsQuery(folder.id));
  const list = items.data ?? [];
  const [focused, setFocused] = useState<ItemSummary | null>(null);
  const subject = (focused && list.find((i) => i.id === focused.id)) ?? list[0];
  useRootBackdrop(subject?.posters ?? null);

  const message = items.isError ? t('bookmarks.folderFailed') : items.isSuccess && list.length === 0 ? t('bookmarks.folderEmpty') : undefined;
  return (
    <Row
      key={folder.id}
      focusKey={folderRowKey(folder.id)}
      title={folder.title}
      hideTitle
      variant="poster"
      items={list}
      message={message}
      itemKey={itemId}
      renderCard={renderCard}
      onItemFocus={setFocused}
      onItemPress={openTitle}
    />
  );
}

const itemId = (item: ItemSummary) => item.id;
const openTitle = (item: ItemSummary) => screenStack.push('title', { id: item.id });

function renderCard(item: ItemSummary, slot: CardSlot) {
  const { title } = splitTitle(item.title);
  return <Card {...slot} label={title} title={title} image={artwork(item.posters, 'poster')} />;
}
