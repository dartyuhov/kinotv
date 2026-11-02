import type { Page } from '@playwright/test';
import { fakeFilm, fakeHome, fakeSerialProgress, fakeSeries, fakeTitle, filmProgress, seriesProgress } from './harness/catalog';
import type { Remote } from './harness/remote';
import { expect, test } from './harness/test';

const heading = (page: Page) => page.getByRole('heading', { level: 1 });

/**
 * Opens the title page of Home's only featured title: Down to the hero's Play, then OK. Returns once the
 * page has loaded, i.e. a button on it has focus, as a viewer would wait before pressing on.
 */
async function openFromHero(page: Page, remote: Remote, { loads = true }: { loads?: boolean } = {}) {
  await expect(page.getByRole('button', { name: 'Смотреть' })).toBeVisible();
  await remote.press('down', 'ok');
  const titlePage = page.locator('[data-screen="title"]');
  await expect(titlePage).toBeVisible();
  if (loads) await expect(titlePage.locator('[role="button"][data-focused="true"]')).toHaveCount(1);
}

const RIVER = fakeFilm(21, 'Медленная река / Slow River', {
  year: 2019,
  genres: [
    { id: 8, title: 'Драма' },
    { id: 4, title: 'Детектив' },
  ],
  minutes: 112,
  quality: 2160,
  imdb_rating: 7.8,
  kinopoisk_rating: 8.1,
  age_rating: 16,
  plot: 'Бывший следователь возвращается в родной город.',
  audio: ['rus', 'eng', 'rus'],
  subtitles: ['eng'],
});

test.describe('a film', () => {
  test('shows its details, with focus on Play when the viewer has not started it', async ({ app, api, page, remote }) => {
    fakeHome(api, { hot: [RIVER], movies: [], serials: [], progress: {} });
    await app.open();
    await openFromHero(page, remote);

    await expect(heading(page)).toHaveText('Медленная река');
    await expect(page.getByText('Slow River', { exact: true })).toBeVisible();
    await expect(page.getByText('Фильм · Драма, Детектив · 2019 · 1 ч 52 мин')).toBeVisible();
    await expect(page.getByText('4K', { exact: true })).toBeVisible();
    await expect(page.getByText('16+', { exact: true })).toBeVisible();
    await expect(page.getByText('Бывший следователь возвращается в родной город.')).toBeVisible();
    await expect(page.getByText('IMDb 7.8')).toBeVisible();
    await expect(page.getByText('КП 8.1')).toBeVisible();
    await expect(page.getByText('Озвучка: русский, английский')).toBeVisible();
    await expect(page.getByText('Субтитры: английский')).toBeVisible();
    await expect(page.getByTestId('backdrop')).toHaveAttribute('src', RIVER.posters.wide!);

    await expect(app.focused).toHaveAccessibleName('Смотреть');
  });

  test('opened again, it starts on Play again, from cached details', async ({ app, api, page, remote }) => {
    fakeHome(api, { hot: [RIVER], movies: [], serials: [], progress: {} });
    await app.open();
    await openFromHero(page, remote);
    await remote.press('right');
    await expect(app.focused).toHaveAccessibleName('В закладки');

    await remote.press('back');
    await expect(app.focused).toHaveAccessibleName('Смотреть');
    await remote.press('ok');
    await expect(heading(page)).toHaveText('Медленная река');
    await expect(app.focused).toHaveAccessibleName('Смотреть');
    expect(api.requestsTo('GET', `/v1/items/${RIVER.id}`)).toHaveLength(1);
    expect(api.requestsTo('GET', '/v1/watching')).toHaveLength(2); // progress is personal: fetched each time
  });

  test('has a Bookmark button that does nothing yet, and no Follow button', async ({ app, api, page, remote }) => {
    fakeHome(api, { hot: [RIVER], movies: [], serials: [], progress: {} });
    await app.open();
    await openFromHero(page, remote);
    await expect(app.focused).toHaveAccessibleName('Смотреть');

    await remote.press('right');
    await expect(app.focused).toHaveAccessibleName('В закладки');
    const requests = api.requests.length;
    await remote.press('ok', 'right');
    await expect(app.focused).toHaveAccessibleName('В закладки');
    await expect(heading(page)).toHaveText('Медленная река');
    expect(api.requests.length).toBe(requests);
    await expect(page.getByRole('button', { name: 'Буду смотреть' })).toHaveCount(0);
  });

  test('offers Resume with where the viewer stopped', async ({ app, api, page, remote }) => {
    fakeHome(api, { hot: [RIVER], movies: [], serials: [], progress: { [RIVER.id]: filmProgress(RIVER, 48 * 60 + 10, 112 * 60) } });
    await app.open();
    await openFromHero(page, remote);

    await expect(app.focused).toHaveAccessibleName('Продолжить · 48 мин');
  });

  test('Resume opens the player where the viewer stopped; Back returns to Resume', async ({ app, api, page, remote }) => {
    fakeHome(api, { hot: [RIVER], movies: [], serials: [], progress: { [RIVER.id]: filmProgress(RIVER, 48 * 60 + 10, 112 * 60) } });
    await app.open();
    await openFromHero(page, remote);
    await expect(app.focused).toHaveAccessibleName('Продолжить · 48 мин');

    await remote.press('ok');
    const player = page.locator('[data-screen="player"]');
    await expect(player.getByRole('heading', { level: 1 })).toHaveText('Медленная река');
    await expect(player).toContainText('Начать с 48:10');

    await remote.press('back');
    await expect(heading(page)).toHaveText('Медленная река');
    await expect(app.focused).toHaveAccessibleName('Продолжить · 48 мин');
  });

  test('starts over once the viewer has watched it to the end', async ({ app, api, page, remote }) => {
    const watched = filmProgress(RIVER, 112 * 60, 112 * 60);
    (watched.json as { item: { videos: { status: number }[] } }).item.videos[0]!.status = 1;
    fakeHome(api, { hot: [RIVER], movies: [], serials: [], progress: { [RIVER.id]: watched } });
    await app.open();
    await openFromHero(page, remote);

    await expect(app.focused).toHaveAccessibleName('Смотреть');
  });
});

const HARBOUR = fakeSeries(
  31,
  'Тихая гавань / Quiet Harbour',
  [
    ['Возвращение', 'Причал', 'Старые письма', 'Шторм'],
    ['Отлив', 'Маяк'],
  ],
  {
    year: 2022,
    genres: [
      { id: 8, title: 'Драма' },
      { id: 4, title: 'Детектив' },
    ],
    minutes: 40,
  },
);
/** Season 1: episodes 1 and 2 watched, stopped half an hour into episode 3 (of 40 minutes). */
const HARBOUR_PROGRESS = seriesProgress(HARBOUR, [
  [1, 1, 'watched'],
  [1, 2, 'watched'],
  [1, 3, 1800],
]);

test.describe('a series', () => {
  const episodes = (page: Page, season: number) => page.getByRole('region', { name: `Сезон ${season}` });

  test('shows season tabs and the episodes with progress and watched marks; Resume continues the episode', async ({
    app,
    api,
    page,
    remote,
  }) => {
    fakeHome(api, { hot: [HARBOUR], movies: [], serials: [], progress: { [HARBOUR.id]: HARBOUR_PROGRESS } });
    await app.open();
    await openFromHero(page, remote);

    await expect(app.focused).toHaveAccessibleName('Продолжить S1 · E3');
    await expect(page.getByText('Сериал · 2 сезона · Драма, Детектив · 2022')).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Сезоны' })).toMatchAriaSnapshot(`
      - tablist "Сезоны":
        - tab "Сезон 1" [selected]
        - tab "Сезон 2"
    `);
    await expect(episodes(page, 1)).toMatchAriaSnapshot(`
      - region "Сезон 1":
        - button "1. Возвращение, просмотрено"
        - button "2. Причал, просмотрено"
        - button "3. Старые письма"
        - button "4. Шторм"
    `);
    const progress = (name: string) => episodes(page, 1).getByRole('button', { name }).getByRole('progressbar');
    await expect(progress('1. Возвращение, просмотрено')).toHaveAttribute('aria-valuenow', '100');
    await expect(progress('3. Старые письма')).toHaveAttribute('aria-valuenow', '75');
    await expect(progress('4. Шторм')).toHaveCount(0);
  });

  test('Down goes to the seasons and the next episode; focusing a season switches the row, which keeps its place', async ({
    app,
    api,
    page,
    remote,
  }) => {
    fakeHome(api, { hot: [HARBOUR], movies: [], serials: [], progress: { [HARBOUR.id]: HARBOUR_PROGRESS } });
    await app.open();
    await openFromHero(page, remote);

    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('Сезон 1');
    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('3. Старые письма'); // where the viewer is
    await remote.press('right');
    await expect(app.focused).toHaveAccessibleName('4. Шторм');

    await remote.press('up', 'right');
    await expect(app.focused).toHaveAccessibleName('Сезон 2');
    await expect(page.getByRole('tab', { name: 'Сезон 2' })).toHaveAttribute('aria-selected', 'true');
    await expect(episodes(page, 2)).toMatchAriaSnapshot(`
      - region "Сезон 2":
        - button "1. Отлив"
        - button "2. Маяк"
    `);
    await expect(episodes(page, 1)).toHaveCount(0);
    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('1. Отлив');
    await remote.press('right');
    await expect(app.focused).toHaveAccessibleName('2. Маяк');

    // Each season's row remembers its episode.
    await remote.press('up', 'left', 'down');
    await expect(app.focused).toHaveAccessibleName('4. Шторм');
    await remote.press('up', 'right', 'down');
    await expect(app.focused).toHaveAccessibleName('2. Маяк');

    // Up from the seasons goes back to Play/Resume.
    await remote.press('up', 'up');
    await expect(app.focused).toHaveAccessibleName('Продолжить S1 · E3');
  });

  test('has Bookmark and Follow buttons that do nothing yet', async ({ app, api, page, remote }) => {
    fakeHome(api, { hot: [HARBOUR], movies: [], serials: [], progress: { [HARBOUR.id]: HARBOUR_PROGRESS } });
    await app.open();
    await openFromHero(page, remote);
    const requests = api.requests.length;

    await remote.press('right');
    await expect(app.focused).toHaveAccessibleName('В закладки');
    await remote.press('ok', 'right');
    await expect(app.focused).toHaveAccessibleName('Буду смотреть');
    await remote.press('ok');
    await expect(app.focused).toHaveAccessibleName('Буду смотреть');
    await expect(heading(page)).toHaveText('Тихая гавань');
    expect(api.requests.length).toBe(requests);
  });

  test('OK on an episode plays it; Back returns to the same episode of the same season', async ({ app, api, page, remote }) => {
    fakeHome(api, { hot: [HARBOUR], movies: [], serials: [], progress: { [HARBOUR.id]: HARBOUR_PROGRESS } });
    await app.open();
    await openFromHero(page, remote);
    const player = page.locator('[data-screen="player"]');

    // Resume plays the episode the viewer stopped in, from where they stopped.
    await expect(app.focused).toHaveAccessibleName('Продолжить S1 · E3');
    await remote.press('ok');
    await expect(player.getByRole('heading', { level: 1 })).toHaveText('Тихая гавань');
    await expect(player).toContainText('S1 · E3');
    await expect(player).toContainText('Начать с 30:00');
    await remote.press('back');
    await expect(app.focused).toHaveAccessibleName('Продолжить S1 · E3');

    // An episode the viewer hasn't started plays from the beginning.
    await remote.press('down', 'right', 'down', 'right');
    await expect(app.focused).toHaveAccessibleName('2. Маяк');
    await remote.press('ok');
    await expect(player).toContainText('S2 · E2');
    await expect(player).toContainText('Начать с 0:00');

    await remote.press('back');
    await expect(app.focused).toHaveAccessibleName('2. Маяк');
    await expect(page.getByRole('tab', { name: 'Сезон 2' })).toHaveAttribute('aria-selected', 'true');
  });
});

test('Home card → title → episode → player, and Back all the way returns to the same card on Home', async ({
  app,
  api,
  page,
  remote,
}) => {
  const RAIN = fakeFilm(41, 'Дождь / Rain');
  fakeHome(api, {
    hot: [RAIN],
    movies: [RAIN],
    serials: [fakeSerialProgress(HARBOUR, 2, 6)],
    progress: { [HARBOUR.id]: HARBOUR_PROGRESS },
  });
  fakeTitle(api, HARBOUR);
  await app.open();
  await remote.press('down', 'down', 'right'); // hero, Continue watching, its second card
  await expect(app.focused).toHaveAccessibleName('Тихая гавань, S1 · E3');

  await remote.press('ok');
  await expect(heading(page)).toHaveText('Тихая гавань');
  await expect(app.focused).toHaveAccessibleName('Продолжить S1 · E3');
  await remote.press('down', 'down', 'right', 'ok');
  await expect(page.locator('[data-screen="player"]')).toContainText('S1 · E4');

  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('4. Шторм');
  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('Тихая гавань, S1 · E3');
  await expect(page.getByRole('region', { name: 'Продолжить просмотр' })).toBeVisible();
});

test.describe('when loading fails', () => {
  const rejected = { status: 404, json: { status: 404, error: 'not found' } }; // not retried, so no waiting

  test('a title that fails to load says so, and Back returns to Home', async ({ app, api, page, remote }) => {
    fakeHome(api, { hot: [RIVER], movies: [], serials: [], progress: {} });
    api.on('GET', `/v1/items/${RIVER.id}`, rejected);
    await app.open();
    await openFromHero(page, remote, { loads: false });

    await expect(page.getByText('Не удалось загрузить страницу')).toBeVisible();
    await expect(page.getByRole('button')).toHaveCount(0);

    await remote.press('back');
    await expect(app.focused).toHaveAccessibleName('Смотреть');
    await expect(page.getByRole('tab', { name: 'Главная' })).toBeVisible();
  });

  test('without the viewer’s progress, Play starts from the beginning', async ({ app, api, page, remote }) => {
    fakeHome(api, { hot: [HARBOUR], movies: [], serials: [], progress: {} });
    api.on('GET', '/v1/watching', rejected);
    await app.open();
    await openFromHero(page, remote);

    await expect(app.focused).toHaveAccessibleName('Смотреть S1 · E1');
    await expect(page.getByRole('region', { name: 'Сезон 1' }).getByRole('progressbar')).toHaveCount(0);
  });
});
