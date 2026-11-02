import type { Page } from '@playwright/test';
import { fakeItem, fakeList, fakeSearch } from './harness/catalog';
import type { FakeApi } from './harness/fakeApi';
import type { Remote } from './harness/remote';
import { expect, test, type App } from './harness/test';

// The keyboard as the approved mockup (keyboard-v2.html) draws it: digits, three letter rows, then the
// function keys (language, space, delete, clear), named in the UI language (Russian).
const KEYS = {
  ru: ['1234567890-', 'йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбюё', ['RU → EN', 'пробел', 'стереть', 'очистить']],
  en: ['1234567890-', 'qwertyuiop', "asdfghjkl'", 'zxcvbnm.:', ['EN → RU', 'пробел', 'стереть', 'очистить']],
};
type Layout = keyof typeof KEYS;
const rowsOf = (layout: Layout) => KEYS[layout].map((row) => Array.from(row));

const HARBOUR = fakeItem(401, 'Тихая гавань / Quiet Harbour', { type: 'serial' });
const HARBOUR_2 = fakeItem(402, 'Тихая гавань 2 / Quiet Harbour 2');
const OCEANS = fakeItem(403, 'Восемь друзей Оушена / Ocean’s 8');

/** From Home: onto the Search tab, then into the keyboard. */
async function openSearch(app: App, remote: Remote) {
  await remote.press('left');
  await expect(app.focused).toHaveAccessibleName('Поиск');
  await remote.press('ok');
}

const searchbox = (page: Page) => page.getByRole('searchbox');
const results = (page: Page) => page.getByRole('region', { name: 'Результаты' });
const searches = (api: FakeApi) => api.requestsTo('GET', '/v1/items/search').map((r) => r.query.q);
const focusedName = async (app: App) => (await app.focused.textContent()) ?? '';

/**
 * Moves to the key named `name` the way a viewer would, then presses OK. Up or down until the focused key
 * is in the key's row, then the shorter way round the row (rows wrap).
 */
async function pressKey(app: App, remote: Remote, layout: Layout, name: string) {
  const rows = rowsOf(layout);
  const rowOf = (key: string) => rows.findIndex((r) => r.includes(key));
  const target = rowOf(name);
  expect(target, `"${name}" is on the ${layout} keyboard`).toBeGreaterThanOrEqual(0);

  let row = rowOf(await focusedName(app));
  while (row !== target) {
    const next = row + (row < target ? 1 : -1);
    await remote.press(row < target ? 'down' : 'up');
    await expect.poll(async () => rowOf(await focusedName(app))).toBe(next);
    row = next;
  }
  const keys = rows[row]!;
  const right = (keys.indexOf(name) - keys.indexOf(await focusedName(app)) + keys.length) % keys.length;
  if (right <= keys.length - right) await remote.repeat('right', right);
  else await remote.repeat('left', keys.length - right);
  await expect(app.focused).toHaveAccessibleName(name);
  await remote.press('ok');
}

/** Types `text` key by key; a space is the space key. */
async function typeOn(app: App, remote: Remote, layout: Layout, text: string) {
  for (const ch of text) await pressKey(app, remote, layout, ch === ' ' ? 'пробел' : ch);
}

test('typing on the Russian keyboard searches for the typed title and shows what was found', async ({ app, api, page, remote }) => {
  fakeSearch(api, { тихая: [HARBOUR, HARBOUR_2] });
  await app.open();
  await openSearch(app, remote);
  await expect(app.focused).toHaveAccessibleName('й');
  await expect(page.getByText('RU', { exact: true })).toBeVisible();

  await typeOn(app, remote, 'ru', 'тихая');

  await expect(searchbox(page)).toHaveText('тихая');
  await expect(results(page)).toMatchAriaSnapshot(`
    - region "Результаты":
      - heading "Результаты"
      - button "Тихая гавань"
      - button "Тихая гавань 2"
  `);
  expect(searches(api).pop()).toBe('тихая');
  expect(api.requestsTo('GET', '/v1/items/search').pop()?.query).toMatchObject({ field: 'title' });
});

test("the language key switches to English, which has ' . : too; the layout is remembered", async ({ app, api, page, remote }) => {
  fakeSearch(api, { "ocean's 8": [OCEANS] });
  await app.open();
  await openSearch(app, remote);

  await pressKey(app, remote, 'ru', 'RU → EN');
  await expect(app.focused).toHaveAccessibleName('EN → RU');
  await expect(page.getByText('EN', { exact: true })).toBeVisible();

  await typeOn(app, remote, 'en', "ocean's 8");
  await expect(searchbox(page)).toHaveText("ocean's 8");
  await expect(results(page).getByRole('button', { name: 'Восемь друзей Оушена' })).toBeVisible();
  expect(searches(api).pop()).toBe("ocean's 8");

  await pressKey(app, remote, 'en', 'очистить');
  await typeOn(app, remote, 'en', 'x: 2.0');
  await expect(searchbox(page)).toHaveText('x: 2.0');
  await expect.poll(() => searches(api).pop()).toBe('x: 2.0');

  // Another tab and back: still English.
  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('Поиск');
  await remote.press('right', 'left', 'ok');
  await expect(app.focused).toHaveAccessibleName('q');
  await expect(page.getByText('EN', { exact: true })).toBeVisible();

  // And after a restart.
  await page.reload();
  await expect(app.focused).toHaveCount(1);
  await openSearch(app, remote);
  await expect(app.focused).toHaveAccessibleName('q');
  await expect(page.getByText('EN', { exact: true })).toBeVisible();
});

test('arrows wrap from one edge of the keyboard to the other', async ({ app, remote }) => {
  await app.open();
  await openSearch(app, remote);
  await expect(app.focused).toHaveAccessibleName('й');

  await remote.press('up');
  await expect(app.focused).toHaveAccessibleName('1');
  await remote.press('left');
  await expect(app.focused).toHaveAccessibleName('-');
  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('1');
  await remote.press('down', 'left');
  await expect(app.focused).toHaveAccessibleName('ъ');
  await remote.repeat('down', 3);
  await expect(app.focused).toHaveAccessibleName('очистить');
  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('RU → EN');
  await remote.press('left');
  await expect(app.focused).toHaveAccessibleName('очистить');

  // Up from the digits row leaves the keyboard for the tab bar.
  await remote.repeat('up', 4);
  await expect(app.focused).toHaveAccessibleName('-');
  await remote.press('up');
  await expect(app.focused).toHaveAccessibleName('Поиск');
});

test('on the remote, ⏪ deletes a character and ⏩ types a space; the keys delete and clear too', async ({ app, api, page, remote }) => {
  fakeSearch(api, {});
  await app.open();
  await openSearch(app, remote);

  await typeOn(app, remote, 'ru', 'ти');
  await remote.press('fastForward');
  await typeOn(app, remote, 'ru', 'хо');
  await expect(searchbox(page)).toHaveText('ти хо');
  await expect.poll(() => searches(api).pop()).toBe('ти хо');

  await remote.press('rewind', 'rewind');
  await expect(searchbox(page)).toHaveText('ти ');
  await pressKey(app, remote, 'ru', 'стереть');
  await expect(searchbox(page)).toHaveText('ти');
  await pressKey(app, remote, 'ru', 'очистить');
  await expect(searchbox(page)).toHaveText('');
  await expect(page.getByText('Название фильма или сериала')).toBeVisible();
});

test('search runs 300 ms after typing stops, from 2 characters, and shows only the latest results', async ({ app, api, clock, page, remote }) => {
  // "ти" is answered late, after "тих" has been asked; its answer must never show.
  let answerStale!: () => void;
  const staleAnswer = new Promise<void>((resolve) => (answerStale = resolve));
  api.on('GET', '/v1/items/search', async (req) => {
    if (req.query.q === 'ти') {
      await staleAnswer;
      return fakeList([HARBOUR_2]);
    }
    return fakeList(req.query.q === 'тих' ? [HARBOUR] : []);
  });
  const cancelled: string[] = [];
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/v1/items/search') cancelled.push(url.searchParams.get('q') ?? '');
  });

  await clock.pause();
  await app.open();
  await openSearch(app, remote);

  await typeOn(app, remote, 'ru', 'т');
  await clock.runFor(1_000, { stepMs: 100 });
  expect(searches(api), 'one character is not searched for').toEqual([]);

  await typeOn(app, remote, 'ru', 'и');
  // From here the stale request is pending, so time is moved without waiting for the fake API to be idle.
  await page.clock.runFor(299);
  expect(searches(api)).toEqual([]);
  await page.clock.runFor(1);
  await expect.poll(() => searches(api)).toEqual(['ти']);

  await typeOn(app, remote, 'ru', 'х');
  await page.clock.runFor(300);
  await expect.poll(() => searches(api)).toEqual(['ти', 'тих']);
  await expect.poll(() => cancelled, 'the superseded request is cancelled').toEqual(['ти']);
  await expect(results(page).getByRole('button')).toHaveAccessibleName('Тихая гавань');

  answerStale();
  await clock.settle();
  await expect(results(page).getByRole('button')).toHaveCount(1);
  await expect(results(page).getByRole('button')).toHaveAccessibleName('Тихая гавань');
});

test('▼ from the bottom row moves to the results; OK opens the title, and Back returns to the same result', async ({ app, api, page, remote }) => {
  fakeSearch(api, { тихая: [HARBOUR, HARBOUR_2] });
  await app.open();
  await openSearch(app, remote);
  await typeOn(app, remote, 'ru', 'тихая');
  await expect(results(page).getByRole('button')).toHaveCount(2);

  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('RU → EN');
  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Тихая гавань');
  await remote.press('right', 'ok');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Тихая гавань 2');

  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('Тихая гавань 2');
  await expect(searchbox(page)).toHaveText('тихая');
  expect(searches(api).filter((q) => q === 'тихая'), 'the results come back from the cache').toHaveLength(1);
});

test('when nothing is found, a message and a "Популярное сейчас" row are shown instead', async ({ app, api, page, remote }) => {
  fakeSearch(api, {});
  await app.open();
  await openSearch(app, remote);
  await typeOn(app, remote, 'ru', 'щщ');

  await expect(page.getByText('По запросу «щщ» ничего не нашлось')).toBeVisible();
  const popular = page.getByRole('region', { name: 'Популярное сейчас' });
  await expect(popular.getByRole('button').first()).toHaveAccessibleName('Город без света');
  await expect(results(page)).toHaveCount(0);

  await remote.repeat('down', 4);
  await expect(app.focused).toHaveAccessibleName('Город без света');
  await remote.press('ok');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Город без света');
});
