import type { Page } from '@playwright/test';
import { fakeBookmarks } from './harness/bookmarks';
import { fakeFilm, fakeHome, fakeItem, fakeTitle } from './harness/catalog';
import type { FakeResponse } from './harness/fakeApi';
import type { Remote } from './harness/remote';
import { expect, test } from './harness/test';

const LATER = fakeItem(401, 'Долгая дорога / The Long Road', { year: 2020 });
const ISLAND = fakeItem(402, 'Остров / The Island', { type: 'serial', year: 2023 });
const LIGHTHOUSE = fakeItem(403, 'Маяк / The Lighthouse', { year: 2019 });

/** From Home's tab, along the tab bar to Bookmarks (it shows as soon as it has focus). */
async function openBookmarksTab(page: Page, remote: Remote) {
  await remote.repeat('right', 6);
  await expect(page.getByRole('tab', { name: 'Закладки' })).toHaveAttribute('aria-selected', 'true');
}

const folderTab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const folderRow = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

test.describe('the Bookmarks tab', () => {
  test('shows the folders, and the titles of the folder in focus', async ({ app, api, page, remote }) => {
    fakeBookmarks(api, [
      { id: 1, title: 'Посмотреть позже', items: [LATER, ISLAND] },
      { id: 2, title: 'Любимое', items: [LIGHTHOUSE] },
    ]);
    for (const item of [LATER, ISLAND, LIGHTHOUSE]) fakeTitle(api, item);
    await app.open();
    await openBookmarksTab(page, remote);

    await expect(folderTab(page, 'Посмотреть позже')).toHaveAttribute('aria-selected', 'true');
    await expect(folderTab(page, 'Любимое')).toBeVisible();
    const later = folderRow(page, 'Посмотреть позже');
    await expect(later.getByRole('button')).toHaveText(['Долгая дорога', 'Остров']);

    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('Посмотреть позже');
    await remote.press('right');
    await expect(app.focused).toHaveAccessibleName('Любимое');
    await expect(folderTab(page, 'Любимое')).toHaveAttribute('aria-selected', 'true');
    await expect(folderRow(page, 'Любимое').getByRole('button')).toHaveText(['Маяк']);

    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('Маяк');
    await remote.press('ok');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Маяк');

    // Back lands on the same title, in the same folder.
    await remote.press('back');
    await expect(app.focused).toHaveAccessibleName('Маяк');
    await expect(folderTab(page, 'Любимое')).toHaveAttribute('aria-selected', 'true');
  });

  test('shows changes made on another device when the tab is shown again', async ({ app, api, page, remote }) => {
    const bookmarks = fakeBookmarks(api, [{ id: 1, title: 'Посмотреть позже', items: [LATER] }]);
    for (const item of [LATER, ISLAND, LIGHTHOUSE]) fakeTitle(api, item);
    await app.open();
    await openBookmarksTab(page, remote);
    await expect(folderRow(page, 'Посмотреть позже').getByRole('button')).toHaveText(['Долгая дорога']);

    // Meanwhile, on the phone: a title is added and a new folder is made.
    bookmarks.folder(1).items.unshift(ISLAND);
    bookmarks.addFolder({ id: 2, title: 'Любимое', items: [LIGHTHOUSE] });

    // Away to the next tab and back.
    await remote.press('right');
    await expect(page.getByRole('tab', { name: 'История' })).toHaveAttribute('aria-selected', 'true');
    await remote.press('left');
    await expect(folderRow(page, 'Посмотреть позже').getByRole('button')).toHaveText(['Остров', 'Долгая дорога']);
    await expect(folderTab(page, 'Любимое')).toBeVisible();

    // And again after a title page: it was removed elsewhere while the viewer looked at it.
    await remote.press('down', 'down', 'ok');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Остров');
    bookmarks.folder(1).items = [LATER];
    await remote.press('back');
    await expect(folderRow(page, 'Посмотреть позже').getByRole('button')).toHaveText(['Долгая дорога']);
    await expect(app.focused).toHaveAccessibleName('Долгая дорога');
  });

  test('with no bookmarks, says so and suggests what is popular', async ({ app, page, remote }) => {
    await app.open(); // every test starts with no folders
    await openBookmarksTab(page, remote);

    await expect(page.getByText('Закладок пока нет')).toBeVisible();
    await expect(page.getByText('Добавляйте фильмы и сериалы кнопкой «В закладки» на их странице')).toBeVisible();
    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('Город без света'); // the first of Popular on Home
    await expect(folderRow(page, 'Популярное сейчас').getByRole('button').first()).toHaveAccessibleName('Город без света');
    await remote.press('ok');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Город без света');
  });

  test('with only empty folders, shows the empty state too', async ({ app, api, page, remote }) => {
    fakeBookmarks(api, [{ id: 1, title: 'Посмотреть позже', items: [] }]);
    await app.open();
    await openBookmarksTab(page, remote);

    await expect(page.getByText('Закладок пока нет')).toBeVisible();
    await expect(folderTab(page, 'Посмотреть позже')).toHaveCount(0);
  });
});

const RIVER = fakeFilm(21, 'Медленная река / Slow River', { year: 2019 });

const picker = (page: Page) => page.getByRole('dialog', { name: 'Сохранить в папку' });
const folderOption = (page: Page, name: string) => picker(page).getByRole('checkbox', { name, exact: true });

/** A write the test answers when it chooses: `answer(response)` sends it. */
function heldAnswer() {
  let answer!: (response: FakeResponse) => void;
  const response = new Promise<FakeResponse>((resolve) => (answer = resolve));
  return { handler: () => response, answer };
}

test.describe('the Bookmark button on a title page', () => {
  test('opens a folder picker that shows the folders holding the title; Back closes it', async ({ app, api, page, remote }) => {
    fakeBookmarks(api, [
      { id: 1, title: 'Посмотреть позже', items: [LATER, RIVER] },
      { id: 2, title: 'Любимое', items: [LIGHTHOUSE] },
    ]);
    fakeHome(api, { hot: [RIVER], movies: [], serials: [], progress: {} });
    await app.open();
    await remote.press('down', 'ok'); // the hero's title
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Медленная река');
    await expect(app.focused).toHaveAccessibleName('Смотреть');

    await remote.press('right', 'ok');
    await expect(picker(page)).toBeVisible();
    await expect(folderOption(page, 'Посмотреть позже')).toBeChecked();
    await expect(folderOption(page, 'Любимое')).not.toBeChecked();
    await expect(app.focused).toHaveAccessibleName('Посмотреть позже');

    // Focus stays in the picker.
    await remote.press('up', 'left', 'right');
    await expect(app.focused).toHaveAccessibleName('Посмотреть позже');
    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('Любимое');
    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('Любимое');

    await remote.press('back');
    await expect(picker(page)).toHaveCount(0);
    await expect(app.focused).toHaveAccessibleName('В закладки');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Медленная река');
  });

  test('adds and removes at once, and the Bookmarks tab shows it before the server answers', async ({ app, api, page, remote }) => {
    const bookmarks = fakeBookmarks(
      api,
      [
        { id: 1, title: 'Посмотреть позже', items: [RIVER, LATER] },
        { id: 2, title: 'Любимое', items: [LIGHTHOUSE] },
      ],
      [RIVER],
    );
    for (const item of [RIVER, LATER, LIGHTHOUSE]) fakeTitle(api, item);
    await app.open();
    await openBookmarksTab(page, remote);
    await expect(folderRow(page, 'Посмотреть позже').getByRole('button')).toHaveText(['Медленная река', 'Долгая дорога']);
    await remote.press('down', 'right'); // look into Любимое
    await expect(folderRow(page, 'Любимое').getByRole('button')).toHaveText(['Маяк']);
    await remote.press('left', 'down');
    await expect(app.focused).toHaveAccessibleName('Медленная река');
    await remote.press('ok');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Медленная река');

    const release = bookmarks.holdWrites();
    await remote.press('right', 'ok');
    await expect(folderOption(page, 'Посмотреть позже')).toBeChecked();
    await remote.press('ok'); // out of Посмотреть позже
    await expect(folderOption(page, 'Посмотреть позже')).not.toBeChecked();
    await remote.press('down', 'ok'); // into Любимое
    await expect(folderOption(page, 'Любимое')).toBeChecked();
    expect(api.requestsTo('POST', '/v1/bookmarks/remove-item').map((r) => r.body)).toEqual([{ item: '21', folder: '1' }]);
    expect(api.requestsTo('POST', '/v1/bookmarks/add').map((r) => r.body)).toEqual([{ item: '21', folder: '2' }]);

    // Back to the tab while the server still hasn't answered.
    await remote.press('back', 'back');
    await expect(folderRow(page, 'Посмотреть позже').getByRole('button')).toHaveText(['Долгая дорога']);
    await expect(folderTab(page, 'Посмотреть позже')).toContainText('1');
    // The title the viewer opened has left the folder, so focus goes back to the tab.
    await expect(app.focused).toHaveAccessibleName('Закладки');
    // And it stays that way: the tab's refresh can't bring back the server's state from before the write.
    await page.waitForTimeout(500);
    await expect(folderRow(page, 'Посмотреть позже').getByRole('button')).toHaveText(['Долгая дорога']);
    await remote.press('down', 'right');
    await expect(folderTab(page, 'Любимое')).toHaveAttribute('aria-selected', 'true');
    await expect(folderRow(page, 'Любимое').getByRole('button')).toHaveText(['Медленная река', 'Маяк']);
    await expect(folderTab(page, 'Любимое')).toContainText('2');

    // The server agrees, and the tab, refreshed, still shows the same.
    release();
    await api.idle();
    await expect(folderRow(page, 'Любимое').getByRole('button')).toHaveText(['Медленная река', 'Маяк']);
    await remote.press('left');
    await expect(folderRow(page, 'Посмотреть позже').getByRole('button')).toHaveText(['Долгая дорога']);
  });

  test('a change the server rejects is undone, with a message', async ({ app, api, page, remote }) => {
    fakeBookmarks(api, [
      { id: 1, title: 'Посмотреть позже', items: [LATER] },
      { id: 2, title: 'Любимое', items: [LIGHTHOUSE] },
    ]);
    for (const item of [LATER, LIGHTHOUSE]) fakeTitle(api, item);
    fakeHome(api, { hot: [RIVER], movies: [], serials: [], progress: {} });
    const add = heldAnswer();
    api.on('POST', '/v1/bookmarks/add', add.handler);
    await app.open();
    await remote.press('down', 'ok');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Медленная река');
    await remote.press('right', 'ok');
    await expect(app.focused).toHaveAccessibleName('Посмотреть позже');
    await remote.press('down', 'ok');

    await expect(folderOption(page, 'Любимое')).toBeChecked();
    add.answer({ status: 500, json: { status: 500, error: 'server_error' } });
    await expect(folderOption(page, 'Любимое')).not.toBeChecked();
    await expect(page.getByRole('status')).toHaveText('Не удалось добавить «Медленная река» в «Любимое»');
    await expect(app.focused).toHaveAccessibleName('Любимое');

    // The tab shows the folder as the server has it.
    await remote.press('back', 'back', 'up');
    await openBookmarksTab(page, remote);
    await expect(folderRow(page, 'Посмотреть позже').getByRole('button')).toHaveText(['Долгая дорога']);
    await remote.press('down', 'right');
    await expect(folderRow(page, 'Любимое').getByRole('button')).toHaveText(['Маяк']);
  });

  test('a removal the server rejects puts the title back', async ({ app, api, page, remote }) => {
    fakeBookmarks(api, [{ id: 1, title: 'Посмотреть позже', items: [RIVER, LATER] }]);
    for (const item of [RIVER, LATER]) fakeTitle(api, item);
    api.on('POST', '/v1/bookmarks/remove-item', { status: 400, json: { status: 400, error: 'bad_request' } });
    await app.open();
    await openBookmarksTab(page, remote);
    await expect(folderRow(page, 'Посмотреть позже').getByRole('button')).toHaveText(['Медленная река', 'Долгая дорога']);
    await remote.press('down', 'down');
    await expect(app.focused).toHaveAccessibleName('Медленная река');
    await remote.press('ok');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Медленная река');
    await remote.press('right', 'ok');
    await expect(app.focused).toHaveAccessibleName('Посмотреть позже');
    await remote.press('ok');

    await expect(page.getByRole('status')).toHaveText('Не удалось убрать «Медленная река» из «Посмотреть позже»');
    await expect(folderOption(page, 'Посмотреть позже')).toBeChecked();
    await remote.press('back', 'back');
    await expect(folderRow(page, 'Посмотреть позже').getByRole('button')).toHaveText(['Медленная река', 'Долгая дорога']);
  });
});
