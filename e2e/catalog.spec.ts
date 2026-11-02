import type { Page } from '@playwright/test';
import { fakeCatalog, fakeItem, fakeItems } from './harness/catalog';
import type { FakeApi } from './harness/fakeApi';
import { expect, test } from './harness/test';

const grid = (page: Page, name: string) => page.getByRole('region', { name });

const RIVER = fakeItem(21, 'Медленная река / Slow River');
const GARDEN = fakeItem(22, 'Стеклянный сад / Glass Garden');
const TRAIN = fakeItem(23, 'Ночной поезд / Night Train');

test('Movies shows the newest films as a poster grid, and Down from the tab focuses the first one', async ({
  app,
  api,
  page,
  remote,
}) => {
  fakeCatalog(api, { items: () => [RIVER, GARDEN, TRAIN] });
  await app.open();

  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('Фильмы');
  await expect(grid(page, 'Фильмы')).toMatchAriaSnapshot(`
    - button "Медленная река"
    - button "Стеклянный сад"
    - button "Ночной поезд"
  `);

  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Медленная река');
  expect(api.requestsTo('GET', '/v1/items')[0]!.query).toMatchObject({ type: 'movie', sort: 'created-', page: '1' });
});

test('Down before the first page has arrived lands on the first card once it does', async ({ app, api, page, remote }) => {
  let answer!: () => void;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  api.on('GET', '/v1/items', async () => {
    await answered;
    return { json: { status: 200, items: [RIVER, GARDEN], pagination: { total: 1, current: 1, perpage: 42, total_items: 2 } } };
  });
  await app.open();
  await remote.press('right', 'down');
  await expect(page.getByRole('tab', { name: 'Фильмы' })).not.toHaveAttribute('data-focused');

  answer();
  await expect(app.focused).toHaveAccessibleName('Медленная река');
});

test('Series shows series, offers the series types, and keeps its own filters apart from Movies', async ({
  app,
  api,
  page,
  remote,
}) => {
  await app.open();
  await remote.press('right', 'right');
  await expect(app.focused).toHaveAccessibleName('Сериалы');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сериалы');
  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Сериал 1');
  expect(api.requestsTo('GET', '/v1/items').slice(-1)[0]!.query).toMatchObject({ type: 'serial', sort: 'created-' });

  await remote.press('up', 'ok');
  await expect(page.getByRole('dialog', { name: 'Тип' }).getByRole('option')).toHaveText([
    'Сериалы',
    'Документальные сериалы',
    'ТВ шоу',
  ]);
  await remote.press('down', 'ok');
  await expect(page.getByRole('button', { name: 'Тип: Документальные сериалы' })).toBeVisible();

  // Movies still shows films; back on Series, its type is still the one picked.
  await remote.press('up', 'left');
  await expect(app.focused).toHaveAccessibleName('Фильмы');
  await expect(page.getByRole('button', { name: 'Тип: Фильмы' })).toBeVisible();
  await remote.press('right');
  await expect(page.getByRole('button', { name: 'Тип: Документальные сериалы' })).toBeVisible();
});

test.describe('filters', () => {
  const picker = (page: Page, name: string) => page.getByRole('dialog', { name });
  const itemsQueries = (api: FakeApi) => api.requestsTo('GET', '/v1/items').map((r) => r.query);
  const lastItemsQuery = (api: FakeApi) => itemsQueries(api).slice(-1)[0];

  test('a sort picked from the filter row refetches the grid, and focus moves to its first card', async ({
    app,
    api,
    page,
    remote,
  }) => {
    fakeCatalog(api, { items: (q) => (q.sort === 'rating-' ? [TRAIN, RIVER] : [RIVER, GARDEN, TRAIN]) });
    await app.open();
    await remote.press('right', 'down');
    await expect(app.focused).toHaveAccessibleName('Медленная река');
    await remote.press('right');

    await remote.press('up');
    await expect(app.focused).toHaveAccessibleName('Тип: Фильмы');
    await remote.repeat('right', 4);
    await expect(app.focused).toHaveAccessibleName('Сортировка: Сначала новые');

    await remote.press('ok');
    await expect(picker(page, 'Сортировка')).toMatchAriaSnapshot(`
      - heading "Сортировка" [level=2]
      - listbox "Сортировка":
        - option "Сначала новые" [selected]
        - option "Популярные"
        - option "По рейтингу"
    `);
    await expect(app.focused).toHaveAccessibleName('Сначала новые');
    // Arrows can't leave the picker.
    await remote.press('left', 'up', 'right');
    await expect(app.focused).toHaveAccessibleName('Сначала новые');

    await remote.press('down', 'down', 'ok');
    await expect(picker(page, 'Сортировка')).toBeHidden();
    await expect(grid(page, 'Фильмы')).toMatchAriaSnapshot(`
      - button "Ночной поезд"
      - button "Медленная река"
    `);
    await expect(app.focused).toHaveAccessibleName('Ночной поезд');
    expect(lastItemsQuery(api)).toMatchObject({ type: 'movie', sort: 'rating-', page: '1' });

    await remote.press('up');
    await expect(app.focused).toHaveAccessibleName('Сортировка: По рейтингу');
  });

  test('Back closes a picker without changing anything', async ({ app, api, page, remote }) => {
    await app.open();
    await remote.press('right', 'down');
    await expect(app.focused).toHaveAccessibleName('Кино 1');
    await remote.press('up', 'right', 'ok');
    await expect(picker(page, 'Жанр')).toBeVisible();
    await remote.press('down', 'back');

    await expect(picker(page, 'Жанр')).toBeHidden();
    await expect(app.focused).toHaveAccessibleName('Жанр: Все жанры');
    expect(itemsQueries(api)).toHaveLength(1);
  });

  test('type, genre, year and country narrow the grid; each genre list belongs to the type', async ({ app, api, page, remote }) => {
    const NATURE = fakeItem(31, 'Океан / Ocean', { type: 'documovie' });
    fakeCatalog(api, { items: (q) => (q.country ? [] : q.type === 'documovie' ? [NATURE] : [RIVER]) });
    await app.open();
    await remote.press('right', 'down');
    await expect(app.focused).toHaveAccessibleName('Медленная река');

    // Type: the film types from GET /v1/types, in the server's order. Series types are on the Series tab.
    await remote.press('up', 'ok');
    await expect(picker(page, 'Тип').getByRole('listbox')).toMatchAriaSnapshot(`
      - listbox "Тип":
        - option "Фильмы" [selected]
        - option "3D"
        - option "Концерты"
        - option "Документальные фильмы"
    `);
    await remote.repeat('down', 3);
    await remote.press('ok');
    await expect(app.focused).toHaveAccessibleName('Океан');
    expect(lastItemsQuery(api)).toMatchObject({ type: 'documovie' });

    // Genre: this type's genres.
    await remote.press('up', 'right');
    await expect(app.focused).toHaveAccessibleName('Жанр: Все жанры');
    await remote.press('ok');
    await expect(picker(page, 'Жанр').getByRole('listbox')).toMatchAriaSnapshot(`
      - listbox "Жанр":
        - option "Все жанры" [selected]
        - option "Природа"
        - option "История"
    `);
    expect(api.requestsTo('GET', '/v1/genres').slice(-1)[0]!.query).toMatchObject({ type: 'documovie' });
    await remote.press('down', 'down', 'ok');
    await expect(app.focused).toHaveAccessibleName('Океан');
    expect(lastItemsQuery(api)).toMatchObject({ type: 'documovie', genre: '32' });

    // Year: recent years one by one, then decades.
    await remote.press('up', 'right');
    await expect(app.focused).toHaveAccessibleName('Год: Все годы');
    await remote.press('ok');
    await expect(picker(page, 'Год').getByRole('option').nth(1)).toHaveAccessibleName('2026');
    await expect(picker(page, 'Год').getByRole('option', { name: '2010–2019' })).toBeVisible();
    await remote.repeat('down', 7);
    await expect(app.focused).toHaveAccessibleName('2010–2019');
    await remote.press('ok');
    await expect(app.focused).toHaveAccessibleName('Океан');
    expect(lastItemsQuery(api)).toMatchObject({ type: 'documovie', genre: '32', year: '2010-2019' });

    // Country. Nothing matches: the grid says so, and focus stays on the filter.
    await remote.press('up', 'right', 'ok');
    await expect(picker(page, 'Страна').getByRole('option')).toHaveText(['Все страны', 'США', 'Россия', 'Франция']);
    await remote.repeat('down', 3);
    await remote.press('ok');
    await expect(grid(page, 'Фильмы')).toContainText('Ничего не найдено');
    await expect(app.focused).toHaveAccessibleName('Страна: Франция');
    expect(lastItemsQuery(api)).toMatchObject({ type: 'documovie', genre: '32', year: '2010-2019', country: '3' });

    // Another type clears the genre: genres belong to a family of types.
    await remote.repeat('left', 3);
    await remote.press('ok');
    await remote.repeat('up', 3);
    await remote.press('ok');
    await expect(app.focused).toHaveAccessibleName('Тип: Фильмы');
    await expect(page.getByRole('button', { name: 'Жанр: Все жанры' })).toBeVisible();
    expect(lastItemsQuery(api)).not.toHaveProperty('genre');
  });
});

test.describe('a long grid', () => {
  // 100 films, "Фильм 1001" to "Фильм 1100", seven to a row.
  const FILMS = fakeItems(1001, 100);
  const pagesRequested = (api: FakeApi) => api.requestsTo('GET', '/v1/items').map((r) => r.query.page);

  test.beforeEach(({ api }) => {
    fakeCatalog(api, { items: () => FILMS });
  });

  test('Up and Down keep the column, and the next page loads before the viewer reaches the end', async ({ app, api, page, remote }) => {
    await app.open();
    await remote.press('right', 'down');
    await expect(app.focused).toHaveAccessibleName('Фильм 1001');

    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('Фильм 1008');
    await remote.press('right', 'up');
    await expect(app.focused).toHaveAccessibleName('Фильм 1002');
    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('Фильм 1009');
    expect(pagesRequested(api)).toEqual(['1']);

    await remote.press('down');
    await expect.poll(() => pagesRequested(api)).toEqual(['1', '2']);
    await expect(page.getByRole('button', { name: 'Фильм 1043', exact: true })).toHaveCount(1); // page 2 is in
    await remote.repeat('down', 4);
    await expect(app.focused).toHaveAccessibleName('Фильм 1044');
  });

  test('only the rows on screen, plus a screen of rows either side, are rendered', async ({ app, api, page, remote }) => {
    const card = (name: string) => grid(page, 'Фильмы').getByRole('button', { name, exact: true });
    await app.open();
    await remote.press('right', 'down');
    await expect(app.focused).toHaveAccessibleName('Фильм 1001');
    await remote.repeat('down', 2);
    await expect(card('Фильм 1043')).toHaveCount(1); // page 2 is in: 84 films loaded
    await remote.repeat('down', 5);
    await expect(app.focused).toHaveAccessibleName('Фильм 1050');
    expect(pagesRequested(api)).toEqual(['1', '2']);

    // The focused row is on top; the rows above it scrolled away and the first ones are no longer rendered.
    await expect(card('Фильм 1050')).toBeInViewport();
    await expect(card('Фильм 1043')).not.toBeInViewport();
    await expect(card('Фильм 1001')).toHaveCount(0);
    expect(await grid(page, 'Фильмы').getByRole('button').count()).toBeLessThan(84);

    await remote.repeat('up', 7);
    await expect(app.focused).toHaveAccessibleName('Фильм 1001');
    await expect(card('Фильм 1001')).toBeInViewport();
  });

  test('CH ▼ and CH ▲ jump a page of rows, keeping the column', async ({ app, page, remote }) => {
    const card = (name: string) => grid(page, 'Фильмы').getByRole('button', { name, exact: true });
    await app.open();
    await remote.press('right', 'down');
    await expect(app.focused).toHaveAccessibleName('Фильм 1001');
    await remote.press('right');

    // Two rows fit on screen, so a page is two rows.
    await remote.press('channelDown');
    await expect(app.focused).toHaveAccessibleName('Фильм 1016');
    await expect(card('Фильм 1002')).not.toBeInViewport();
    await remote.press('channelDown');
    await expect(app.focused).toHaveAccessibleName('Фильм 1030');

    await remote.press('channelUp');
    await expect(app.focused).toHaveAccessibleName('Фильм 1016');
    await remote.press('channelUp');
    await expect(app.focused).toHaveAccessibleName('Фильм 1002');
    await expect(card('Фильм 1002')).toBeInViewport();
  });

  test('Back from a title page comes back to the same card, scrolled the same way', async ({ app, page, remote }) => {
    const card = (name: string) => grid(page, 'Фильмы').getByRole('button', { name, exact: true });
    await app.open();
    await remote.press('right', 'down');
    await expect(app.focused).toHaveAccessibleName('Фильм 1001');
    await remote.repeat('down', 2);
    await expect(card('Фильм 1043')).toHaveCount(1); // page 2 is in
    await remote.repeat('down', 4);
    await remote.repeat('right', 2);
    await expect(app.focused).toHaveAccessibleName('Фильм 1045');

    await remote.press('ok');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Фильм 1045');
    await expect(app.focused).toHaveAccessibleName('Смотреть');

    await remote.press('back');
    await expect(page.getByRole('tab', { name: 'Фильмы' })).toHaveAttribute('aria-selected', 'true');
    await expect(app.focused).toHaveAccessibleName('Фильм 1045');
    await expect(card('Фильм 1045')).toBeInViewport();
    await expect(card('Фильм 1001')).toHaveCount(0);
    await remote.press('up');
    await expect(app.focused).toHaveAccessibleName('Фильм 1038');
  });
});
