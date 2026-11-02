import type { Page } from '@playwright/test';
import { fakeCollection, fakeHome, fakeItem, fakeItems, type FakeCollection } from './harness/catalog';
import { expect, test } from './harness/test';

const region = (page: Page, name: string) => page.getByRole('region', { name });

const RIVER = fakeItem(21, 'Медленная река / Slow River');
const GARDEN = fakeItem(22, 'Стеклянный сад / Glass Garden');
const TRAIN = fakeItem(23, 'Ночной поезд / Night Train');

const NOIR = fakeCollection(7, 'Нуар на вечер', [RIVER, GARDEN]);
const SPACE = fakeCollection(8, 'Космос', [TRAIN]);
const HARBOUR = fakeCollection(9, 'Морские истории', [GARDEN, TRAIN]);

test('Home ends with a Collections row of the newest collections', async ({ app, api, page }) => {
  fakeHome(api, { collections: [NOIR, SPACE, HARBOUR] });
  await app.open();

  await expect(page.getByRole('heading', { level: 2 }).last()).toHaveText('Подборки');
  await expect(region(page, 'Подборки')).toMatchAriaSnapshot(`
    - heading "Подборки" [level=2]
    - button "Нуар на вечер"
    - button "Космос"
    - button "Морские истории"
  `);
  expect(api.requestsTo('GET', '/v1/collections')[0]!.query).toMatchObject({ sort: 'created-' });
});

/** Home with only New releases, Popular and Collections, so three Downs from the tab bar reach Collections. */
const homeWith = (collections: FakeCollection[]) => ({
  hot: [],
  movies: [],
  serials: [],
  fresh: [fakeItem(31)],
  popular: [fakeItem(32)],
  collections,
});

test('OK on a collection opens its titles in a grid under its name; OK on a title opens the title page', async ({
  app,
  api,
  page,
  remote,
}) => {
  fakeHome(api, homeWith([NOIR, SPACE]));
  await app.open();
  await remote.press('down', 'down', 'down');
  await expect(app.focused).toHaveAccessibleName('Нуар на вечер');

  await remote.press('ok');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Нуар на вечер');
  await expect(region(page, 'Нуар на вечер')).toMatchAriaSnapshot(`
    - button "Медленная река"
    - button "Стеклянный сад"
  `);
  await expect(app.focused).toHaveAccessibleName('Медленная река');
  expect(api.requestsTo('GET', '/v1/collections/view')[0]!.query).toMatchObject({ id: '7', page: '1' });

  await remote.press('right', 'ok');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Стеклянный сад');
  await expect(page.getByRole('button', { name: 'Смотреть' })).toBeVisible();

  await remote.press('back');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Нуар на вечер');
  await expect(app.focused).toHaveAccessibleName('Стеклянный сад');
});

test('Back from a collection returns to the Collections row with the same collection focused', async ({
  app,
  api,
  page,
  remote,
}) => {
  fakeHome(api, homeWith([NOIR, SPACE, HARBOUR]));
  await app.open();
  await remote.press('down', 'down', 'down', 'right');
  await expect(app.focused).toHaveAccessibleName('Космос');
  // The hero above the rows names the focused collection, as it does a focused title.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Космос');

  await remote.press('ok');
  await expect(region(page, 'Космос')).toMatchAriaSnapshot(`
    - button "Ночной поезд"
  `);

  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('Космос');
  await expect(app.focused).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Космос');
  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('Морские истории');
});

test.describe('errors and empty states', () => {
  const rejected = { status: 400, json: { status: 400, error: 'bad request' } }; // not retried, so no waiting

  test('no collections: no Collections row', async ({ app, api, page }) => {
    fakeHome(api, homeWith([]));
    await app.open();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Новинки', 'Популярное']);
  });

  test('the collections fail to load: the row says so and the rest of Home works', async ({ app, api, page, remote }) => {
    fakeHome(api, homeWith([NOIR]));
    api.on('GET', '/v1/collections', rejected);
    await app.open();

    await expect(region(page, 'Подборки')).toContainText('Не удалось загрузить');
    await remote.press('down', 'down', 'down');
    await expect(app.focused).toHaveAccessibleName('Фильм 32');
  });

  test('a collection fails to load: the screen says so, and Back returns to it on Home', async ({ app, api, page, remote }) => {
    fakeHome(api, homeWith([NOIR]));
    api.on('GET', '/v1/collections/view', rejected);
    await app.open();
    await remote.press('down', 'down', 'down', 'ok');

    await expect(page.getByText('Не удалось загрузить подборку')).toBeVisible();
    await remote.press('back');
    await expect(app.focused).toHaveAccessibleName('Нуар на вечер');
  });

  test('an empty collection says it is empty', async ({ app, api, page, remote }) => {
    fakeHome(api, homeWith([fakeCollection(11, 'Скоро', [])]));
    await app.open();
    await remote.press('down', 'down', 'down', 'ok');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Скоро');
    await expect(page.getByText('В этой подборке пока ничего нет')).toBeVisible();
    await remote.press('back');
    await expect(app.focused).toHaveAccessibleName('Скоро');
  });
});

test('opening a collection again from Home starts at its first title', async ({ app, api, remote }) => {
  fakeHome(api, homeWith([NOIR]));
  await app.open();
  await remote.press('down', 'down', 'down', 'ok');
  await expect(app.focused).toHaveAccessibleName('Медленная река');
  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('Стеклянный сад');

  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('Нуар на вечер');
  await remote.press('ok');
  await expect(app.focused).toHaveAccessibleName('Медленная река');
});

test('a long collection loads its next page before the viewer reaches the end', async ({ app, api, remote }) => {
  const pagesRequested = () => api.requestsTo('GET', '/v1/collections/view').map((r) => r.query.page);
  const LONG = fakeCollection(10, 'Большая подборка', fakeItems(1001, 50));
  fakeHome(api, homeWith([LONG]));
  await app.open();
  await remote.press('down', 'down', 'down', 'ok');
  await expect(app.focused).toHaveAccessibleName('Фильм 1001');
  expect(pagesRequested()).toEqual(['1']);

  await remote.press('down', 'down');
  await expect(app.focused).toHaveAccessibleName('Фильм 1015');
  await expect.poll(pagesRequested).toEqual(['1', '2']);

  // Seven to a row: the 50th title is first in the eighth row.
  await remote.repeat('down', 5);
  await expect(app.focused).toHaveAccessibleName('Фильм 1050');
  await expect(app.focused).toBeInViewport({ ratio: 1 });
  expect(pagesRequested()).toEqual(['1', '2']);
});
