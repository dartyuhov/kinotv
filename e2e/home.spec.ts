import type { Locator, Page } from '@playwright/test';
import { episodeProgress, fakeHome, fakeItem, fakeItems, fakePosters, fakeSerialProgress, filmProgress } from './harness/catalog';
import { expect, test } from './harness/test';

const row = (page: Page, name: string) => page.getByRole('region', { name });

const NORTH_WIND = fakeItem(11, 'Северный ветер / North Wind', {
  type: 'serial',
  year: 2024,
  genres: [{ id: 9, title: 'Триллер' }],
  quality: 2160,
  plot: 'Пилот берёт последний заказ перед пенсией.',
});
const QUIET_HARBOUR = fakeItem(12, 'Тихая гавань / Quiet Harbour', { type: 'serial' });
const SLOW_RIVER = fakeItem(13, 'Медленная река / Slow River', { year: 2019 });
const GLASS_GARDEN = fakeItem(14, 'Стеклянный сад / Glass Garden', { year: 2021, plot: 'Садовник находит в теплице чужие письма.' });
const NIGHT_TRAIN = fakeItem(15, 'Ночной поезд / Night Train', { year: 2023 });

test('Home shows Continue watching, New releases and Popular from the API, in that order', async ({ app, api, page }) => {
  fakeHome(api, {
    hot: [NORTH_WIND],
    movies: [SLOW_RIVER],
    serials: [fakeSerialProgress(QUIET_HARBOUR, 2, 8)],
    progress: {
      [SLOW_RIVER.id]: filmProgress(SLOW_RIVER, 2400, 6000),
      [QUIET_HARBOUR.id]: episodeProgress(QUIET_HARBOUR, 1, 3, 1800, 2400),
    },
    fresh: [GLASS_GARDEN, NIGHT_TRAIN],
    popular: [NIGHT_TRAIN, NORTH_WIND],
  });
  await app.open();

  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Продолжить просмотр', 'Новинки', 'Популярное']);
  await expect(row(page, 'Продолжить просмотр')).toMatchAriaSnapshot(`
    - heading "Продолжить просмотр" [level=2]
    - button "Медленная река"
    - button "Тихая гавань, S1 · E3"
  `);
  await expect(row(page, 'Новинки')).toMatchAriaSnapshot(`
    - heading "Новинки" [level=2]
    - button "Стеклянный сад"
    - button "Ночной поезд"
  `);
  await expect(row(page, 'Популярное')).toMatchAriaSnapshot(`
    - heading "Популярное" [level=2]
    - button "Ночной поезд"
    - button "Северный ветер"
  `);

  // Progress bars show how far each title got.
  await expect(row(page, 'Продолжить просмотр').getByRole('progressbar')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Медленная река' }).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  await expect(page.getByRole('button', { name: 'Тихая гавань, S1 · E3' }).getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '75',
  );

  // Catalog shortcuts need a type; films and series come as one merged feed.
  expect(api.requestsTo('GET', '/v1/items/fresh')[0]!.query).toMatchObject({ type: 'movie,serial' });
  expect(api.requestsTo('GET', '/v1/watching/serials')[0]!.query).toMatchObject({ subscribed: '0' });
});

test('Continue watching is left out when there is nothing to continue', async ({ app, api, page }) => {
  fakeHome(api, { movies: [], serials: [fakeSerialProgress(QUIET_HARBOUR, 8, 8)] }); // a finished series isn't "in progress"
  await app.open();

  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Новинки', 'Популярное']);
});

test.describe('the hero', () => {
  const heroTitle = (page: Page) => page.getByRole('heading', { level: 1 });
  const backdrop = (page: Page) => page.getByTestId('backdrop');
  const NO_WIDE_ART = fakeItem(16, 'Бумажные крылья / Paper Wings', { posters: fakePosters(16, { wide: false }) });

  test('shows a featured title; focusing cards switches the backdrop and details to the focused title', async ({
    app,
    api,
    page,
    remote,
  }) => {
    fakeHome(api, { hot: [NORTH_WIND], movies: [], serials: [], fresh: [GLASS_GARDEN, NIGHT_TRAIN, NO_WIDE_ART] });
    await app.open();

    await expect(heroTitle(page)).toHaveText('Северный ветер');
    await expect(page.getByText('Сериал · Триллер · 2024')).toBeVisible();
    await expect(page.getByText('4K', { exact: true })).toBeVisible();
    await expect(page.getByText('Пилот берёт последний заказ перед пенсией.')).toBeVisible();
    await expect(backdrop(page)).toHaveAttribute('src', NORTH_WIND.posters.wide!);

    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('Смотреть');
    await remote.press('right');
    await expect(app.focused).toHaveAccessibleName('В закладки');

    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('Стеклянный сад');
    await expect(heroTitle(page)).toHaveText('Стеклянный сад');
    await expect(page.getByText('Фильм · Драма · 2021')).toBeVisible();
    await expect(page.getByText('Садовник находит в теплице чужие письма.')).toBeVisible();
    await expect(backdrop(page)).toHaveAttribute('src', GLASS_GARDEN.posters.wide!);

    await remote.press('right');
    await expect(heroTitle(page)).toHaveText('Ночной поезд');
    await expect(backdrop(page)).toHaveAttribute('src', NIGHT_TRAIN.posters.wide!);

    // A title without backdrop art gets the largest poster instead.
    await remote.press('right');
    await expect(heroTitle(page)).toHaveText('Бумажные крылья');
    await expect(backdrop(page)).toHaveAttribute('src', NO_WIDE_ART.posters.big);

    // Back up in the hero, it shows the featured title again.
    await remote.press('up');
    await expect(app.focused).toHaveAccessibleName('В закладки');
    await expect(heroTitle(page)).toHaveText('Северный ветер');
    await expect(backdrop(page)).toHaveAttribute('src', NORTH_WIND.posters.wide!);
  });

  test('cycles the featured titles while the hero or the tab bar has focus, but not while the viewer browses the rows', async ({
    app,
    api,
    clock,
    page,
    remote,
  }) => {
    fakeHome(api, { hot: [NORTH_WIND, GLASS_GARDEN, NIGHT_TRAIN], movies: [], serials: [], fresh: [SLOW_RIVER] });
    await clock.pause();
    await app.open();
    await expect(heroTitle(page)).toHaveText('Северный ветер');
    await expect(page.getByRole('group', { name: '1 из 3' })).toBeVisible();

    // Focus is on the tab bar.
    await clock.runFor(7_000);
    await expect(heroTitle(page)).toHaveText('Северный ветер');
    await clock.runFor(1_000);
    await expect(heroTitle(page)).toHaveText('Стеклянный сад');
    await expect(page.getByRole('group', { name: '2 из 3' })).toBeVisible();
    await expect(backdrop(page)).toHaveAttribute('src', GLASS_GARDEN.posters.wide!);

    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('Смотреть');
    await clock.runFor(8_000);
    await expect(heroTitle(page)).toHaveText('Ночной поезд');

    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('Медленная река');
    await clock.runFor(30_000);
    await expect(heroTitle(page)).toHaveText('Медленная река');

    // Back in the hero, the same featured title, and cycling resumes (wrapping round).
    await remote.press('up');
    await expect(heroTitle(page)).toHaveText('Ночной поезд');
    await clock.runFor(8_000);
    await expect(heroTitle(page)).toHaveText('Северный ветер');
  });
});

test('Up and Down between rows land on the card each row last had focused, and it is on screen', async ({
  app,
  api,
  page,
  remote,
}) => {
  fakeHome(api, {
    hot: [NORTH_WIND],
    movies: [SLOW_RIVER, GLASS_GARDEN, NIGHT_TRAIN],
    serials: [],
    progress: {},
    fresh: fakeItems(400, 12),
    popular: fakeItems(500, 12),
  });
  await app.open();
  const focusedIsOnScreen = () => expect(app.focused).toBeInViewport({ ratio: 1 });

  await remote.press('down', 'down', 'right', 'right');
  await expect(app.focused).toHaveAccessibleName('Ночной поезд');
  await focusedIsOnScreen();

  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Фильм 400');
  await remote.repeat('right', 11);
  await expect(app.focused).toHaveAccessibleName('Фильм 411');
  await focusedIsOnScreen();

  await remote.press('down', 'right');
  await expect(app.focused).toHaveAccessibleName('Фильм 501');
  await focusedIsOnScreen();
  // The row above has scrolled away; the hero's details stay.
  await expect(row(page, 'Продолжить просмотр')).not.toBeInViewport();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Фильм 501');

  await remote.press('up');
  await expect(app.focused).toHaveAccessibleName('Фильм 411');
  await focusedIsOnScreen();
  await remote.press('up');
  await expect(app.focused).toHaveAccessibleName('Ночной поезд');
  await focusedIsOnScreen();
  await remote.press('down', 'down');
  await expect(app.focused).toHaveAccessibleName('Фильм 501');
});

test('OK on a card opens its title; Back returns to the same card, with the rows scrolled as they were', async ({
  app,
  api,
  page,
  remote,
}) => {
  fakeHome(api, { hot: [NORTH_WIND], movies: [SLOW_RIVER], serials: [], progress: {}, fresh: fakeItems(400, 12), popular: fakeItems(500, 30) });
  await app.open();
  await remote.press('down', 'down', 'down', 'down'); // hero, Continue watching, New releases, Popular
  await remote.repeat('right', 14);
  await expect(app.focused).toHaveAccessibleName('Фильм 514');
  // Unfocused things don't move with focus effects, so their positions show how the rows are scrolled.
  const neighbour = page.getByRole('button', { name: 'Фильм 515' });
  const rowHeading = page.getByRole('heading', { name: 'Популярное' });
  const before = { card: await settledBox(neighbour), heading: await settledBox(rowHeading) };

  await remote.press('ok');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Фильм 514');
  await expect(page.getByText('Film 514')).toBeVisible(); // the original title
  await expect(page.getByRole('tablist')).toBeHidden();
  expect(api.requestsTo('GET', '/v1/items/514')).toHaveLength(1);

  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('Фильм 514');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Фильм 514');
  expect(await neighbour.boundingBox()).toEqual(before.card);
  expect(await rowHeading.boundingBox()).toEqual(before.heading);

  // The other rows still remember their cards.
  await remote.press('up');
  await expect(app.focused).toHaveAccessibleName('Фильм 400');
});

test('a long row keeps only the cards on screen plus a buffer in the page', async ({ app, api, page, remote }) => {
  fakeHome(api, { hot: [NORTH_WIND], movies: [], serials: [], fresh: fakeItems(1000, 200) });
  await app.open();
  const cards = row(page, 'Новинки').getByRole('button');
  const card = (n: number) => row(page, 'Новинки').getByRole('button', { name: `Фильм ${n}`, exact: true });
  // About nine posters fit across the screen; one more screen either side is the most there should be.
  const MAX_IN_PAGE = 28;

  await expect(card(1000)).toBeVisible();
  expect(await cards.count()).toBeLessThanOrEqual(MAX_IN_PAGE);
  await expect(card(1199)).toHaveCount(0);

  await remote.press('down', 'down');
  await remote.repeat('right', 60);
  await expect(app.focused).toHaveAccessibleName('Фильм 1060');
  await expect(app.focused).toBeInViewport({ ratio: 1 });
  expect(await cards.count()).toBeLessThanOrEqual(MAX_IN_PAGE);
  await expect(card(1000)).toHaveCount(0);
  await expect(card(1100)).toHaveCount(0);

  await remote.repeat('left', 60);
  await expect(app.focused).toHaveAccessibleName('Фильм 1000');
  await expect(app.focused).toBeInViewport({ ratio: 1 });
});

test('a list that fails to load leaves the rest of Home working', async ({ app, api, page, remote }) => {
  fakeHome(api, { movies: [], serials: [], popular: [NIGHT_TRAIN] });
  const rejected = { status: 400, json: { status: 400, error: 'bad request' } }; // not retried, so no waiting
  api.on('GET', '/v1/items/hot', rejected);
  api.on('GET', '/v1/items/fresh', rejected);
  await app.open();

  await expect(row(page, 'Новинки')).toContainText('Не удалось загрузить');
  await expect(row(page, 'Популярное').getByRole('button', { name: 'Ночной поезд' })).toBeVisible();

  // No featured titles: the hero has nothing to focus, so Down goes past it and past the failed row.
  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Ночной поезд');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ночной поезд');
  await remote.press('up');
  await expect(app.focused).toHaveAccessibleName('Главная');
});

/** The element's box once it has stopped moving: the same in two reads longer apart than any transition. */
async function settledBox(locator: Locator) {
  for (;;) {
    const first = await locator.boundingBox();
    await locator.page().waitForTimeout(500);
    const second = await locator.boundingBox();
    if (JSON.stringify(first) === JSON.stringify(second)) return second;
  }
}
