import type { Page } from '@playwright/test';
import { fakeHome, fakeItem, fakeSerialProgress, fakeSeries } from './harness/catalog';
import type { FakeApi, FakeResponse } from './harness/fakeApi';
import type { Remote } from './harness/remote';
import { expect, test } from './harness/test';

const NORTH_WIND = fakeItem(41, 'Северный ветер / North Wind', { type: 'serial' });
const QUIET_HARBOUR = fakeItem(42, 'Тихая гавань / Quiet Harbour', { type: 'serial' });
const GLASS_GARDEN = fakeItem(43, 'Стеклянный сад / Glass Garden', { type: 'serial' });
const NIGHT_TRAIN = fakeItem(44, 'Ночной поезд / Night Train', { type: 'serial' });

/** From the Home tab (where the app opens) along the tab bar to I Watch. */
async function openIWatch(page: Page, remote: Remote) {
  await remote.press('right', 'right', 'right');
  await expect(page.getByRole('tab', { name: 'Я смотрю' })).toHaveAttribute('aria-selected', 'true');
}

const list = (page: Page) => page.getByRole('region', { name: 'Я смотрю' });

test('I Watch lists followed series, those with new episodes first, with a count of new episodes', async ({
  app,
  api,
  page,
  remote,
}) => {
  fakeHome(api, {
    followed: [
      fakeSerialProgress(NORTH_WIND, 8, 8),
      fakeSerialProgress(QUIET_HARBOUR, 5, 8, 1),
      fakeSerialProgress(GLASS_GARDEN, 2, 10),
      fakeSerialProgress(NIGHT_TRAIN, 3, 12, 3),
    ],
  });
  await app.open();
  await openIWatch(page, remote);

  await expect(list(page)).toMatchAriaSnapshot(`
    - region "Я смотрю":
      - button "Ночной поезд, 3 новые серии"
      - button "Тихая гавань, 1 новая серия"
      - button "Северный ветер"
      - button "Стеклянный сад"
  `);
  await expect(list(page).getByRole('button', { name: 'Ночной поезд, 3 новые серии' })).toContainText('3');
  expect(api.requestsTo('GET', '/v1/watching/serials').some((r) => r.query.subscribed === '1')).toBe(true);
});

test('OK on a series opens its title page; Back returns to the same series', async ({ app, api, page, remote }) => {
  fakeHome(api, {
    followed: [fakeSerialProgress(NORTH_WIND, 2, 8), fakeSerialProgress(QUIET_HARBOUR, 5, 8, 1), fakeSerialProgress(GLASS_GARDEN, 2, 10)],
  });
  await app.open();
  await openIWatch(page, remote);

  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Тихая гавань, 1 новая серия');
  await remote.press('right', 'ok');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Северный ветер');

  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('Северный ветер');
  await expect(page.getByRole('tab', { name: 'Я смотрю' })).toHaveAttribute('aria-selected', 'true');
});

test('the list is fetched again whenever the tab is shown, so changes made elsewhere appear', async ({ app, api, page, remote }) => {
  const home = fakeHome(api, { followed: [fakeSerialProgress(NORTH_WIND, 2, 8)] });
  await app.open();
  await openIWatch(page, remote);
  await expect(list(page).getByRole('button')).toHaveAccessibleName('Северный ветер');

  // Followed on the phone meanwhile, with a new episode out.
  home.followed = [fakeSerialProgress(NORTH_WIND, 2, 8), fakeSerialProgress(NIGHT_TRAIN, 3, 12, 1)];
  await remote.press('right', 'left');
  await expect(list(page)).toMatchAriaSnapshot(`
    - region "Я смотрю":
      - button "Ночной поезд, 1 новая серия"
      - button "Северный ветер"
  `);
});

test('with no series followed, it says how to follow one and suggests popular series', async ({ app, api, page, remote }) => {
  fakeHome(api, { followed: [], popular: [GLASS_GARDEN, NIGHT_TRAIN] });
  await app.open();
  await openIWatch(page, remote);

  await expect(page.getByText('Вы пока не следите ни за одним сериалом')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Популярные сериалы' })).toMatchAriaSnapshot(`
    - region "Популярные сериалы":
      - heading "Популярные сериалы" [level=2]
      - button "Стеклянный сад"
      - button "Ночной поезд"
  `);
  expect(api.requestsTo('GET', '/v1/items/popular').some((r) => r.query.type === 'serial')).toBe(true);

  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Стеклянный сад');
  await remote.press('ok');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Стеклянный сад');
});

test('a list that fails to load says so, and the tab bar keeps working', async ({ app, api, page, remote }) => {
  fakeHome(api);
  api.on('GET', '/v1/watching/serials', (req) =>
    req.query.subscribed === '1' ? { status: 404, json: { status: 404 } } : { json: { status: 200, items: [] } },
  );
  await app.open();
  await openIWatch(page, remote);

  await expect(page.getByText('Не удалось загрузить список')).toBeVisible();
  await remote.press('right');
  await expect(page.getByRole('tab', { name: 'ТВ' })).toHaveAttribute('aria-selected', 'true');
});

test.describe('New episodes on Home', () => {
  test('follows Continue watching and lists the followed series that have new episodes', async ({ app, api, page }) => {
    fakeHome(api, {
      followed: [fakeSerialProgress(NORTH_WIND, 8, 8), fakeSerialProgress(QUIET_HARBOUR, 5, 8, 1), fakeSerialProgress(NIGHT_TRAIN, 3, 12, 2)],
    });
    await app.open();

    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Продолжить просмотр', 'Новые серии', 'Новинки', 'Популярное']);
    await expect(page.getByRole('region', { name: 'Новые серии' })).toMatchAriaSnapshot(`
      - region "Новые серии":
        - heading "Новые серии" [level=2]
        - button "Ночной поезд, 2 новые серии"
        - button "Тихая гавань, 1 новая серия"
    `);
  });

  test('is left out when no followed series has new episodes', async ({ app, api, page }) => {
    fakeHome(api, { followed: [fakeSerialProgress(NORTH_WIND, 8, 8)] });
    await app.open();

    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Продолжить просмотр', 'Новинки', 'Популярное']);
    await api.idle();
    expect(api.requestsTo('GET', '/v1/watching/serials').some((r) => r.query.subscribed === '1')).toBe(true);
    await expect(page.getByRole('region', { name: 'Новые серии' })).toHaveCount(0);
  });
});

test.describe('Follow on a series page', () => {
  const LIGHTHOUSE = fakeSeries(51, 'Маяк / Lighthouse', [['Огонь', 'Туман']]);
  const TOGGLE = '/v1/watching/togglewatchlist';
  const follow = (page: Page) => page.locator('[data-screen="title"]').getByRole('button', { name: 'Буду смотреть' });

  /** Home's featured title is LIGHTHOUSE: Down to the hero's Play, OK, then along the actions to Follow. */
  async function focusFollow(page: Page, remote: Remote) {
    await expect(page.getByRole('button', { name: 'Смотреть' })).toBeVisible();
    await remote.press('down', 'ok');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Маяк');
    await expect(page.locator('[data-screen="title"] [role="button"][data-focused="true"]')).toHaveCount(1);
    await remote.press('right', 'right');
    await expect(follow(page)).toHaveAttribute('data-focused', 'true');
  }

  /** Holds the server's answer to togglewatchlist until `release()`, so a test can look at the app meanwhile. */
  function slowToggle(api: FakeApi, answer: () => FakeResponse) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    api.on('GET', TOGGLE, async () => {
      await gate;
      return answer();
    });
    return { release };
  }

  test('follows at once and shows up in I Watch while the server is still answering', async ({ app, api, page, remote }) => {
    const home = fakeHome(api, { hot: [LIGHTHOUSE], movies: [], serials: [], followed: [], progress: {} });
    const toggle = slowToggle(api, () => {
      home.followed = [fakeSerialProgress(LIGHTHOUSE, 0, 2)];
      return { json: { status: 200, watching: true } };
    });
    await app.open();
    await focusFollow(page, remote);
    await expect(follow(page)).toHaveAttribute('aria-pressed', 'false');

    await remote.press('ok');
    await expect(follow(page)).toHaveAttribute('aria-pressed', 'true');

    await remote.press('back', 'up');
    await openIWatch(page, remote);
    await expect(list(page).getByRole('button')).toHaveAccessibleName('Маяк');

    toggle.release();
    await api.idle();
    await expect(list(page).getByRole('button')).toHaveAccessibleName('Маяк');
    expect(api.requestsTo('GET', TOGGLE).map((r) => r.query.id)).toEqual([String(LIGHTHOUSE.id)]);
  });

  test('unfollows at once: the series leaves Home’s New episodes and I Watch', async ({ app, api, page, remote }) => {
    const home = fakeHome(api, {
      hot: [LIGHTHOUSE],
      movies: [],
      serials: [],
      followed: [fakeSerialProgress(LIGHTHOUSE, 1, 2, 1)],
      progress: {},
    });
    const toggle = slowToggle(api, () => {
      home.followed = [];
      return { json: { status: 200, watching: false } };
    });
    await app.open();
    await expect(page.getByRole('region', { name: 'Новые серии' }).getByRole('button')).toHaveAccessibleName('Маяк, 1 новая серия');
    await focusFollow(page, remote);
    await expect(follow(page)).toHaveAttribute('aria-pressed', 'true');

    await remote.press('ok');
    await expect(follow(page)).toHaveAttribute('aria-pressed', 'false');

    // Back on Home, which fetches the list again, the server still lists the series: the app knows better.
    await remote.press('back');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Новинки', 'Популярное']);
    await remote.press('up');
    await openIWatch(page, remote);
    await expect(page.getByText('Вы пока не следите ни за одним сериалом')).toBeVisible();

    toggle.release();
    await api.idle();
    await expect(page.getByText('Вы пока не следите ни за одним сериалом')).toBeVisible();
  });

  test('a rejected follow is undone and says so; it is not sent twice', async ({ app, api, clock, page, remote }) => {
    fakeHome(api, { hot: [LIGHTHOUSE], movies: [], serials: [], followed: [], progress: {} });
    api.on('GET', TOGGLE, { status: 500, json: { status: 500, error: 'server error' } });
    await clock.pause();
    await app.open();
    await focusFollow(page, remote);

    await remote.press('ok');
    await clock.runFor(5_000);
    await expect(follow(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('alert')).toHaveText('Не удалось обновить «Я смотрю». Попробуйте ещё раз');
    expect(api.requestsTo('GET', TOGGLE)).toHaveLength(1);

    await remote.press('back', 'up');
    await openIWatch(page, remote);
    await clock.settle();
    await expect(page.getByText('Вы пока не следите ни за одним сериалом')).toBeVisible();
  });
});
