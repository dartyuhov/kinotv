import { fakeFilm, fakeHome, fakeSeries, filmProgress, seriesProgress } from './harness/catalog';
import { fakeHistory, historyEntry } from './harness/history';
import { expect, browsingTest as test } from './harness/test';
import type { Remote } from './harness/remote';

async function history(remote: Remote) { await remote.repeat('right', 6); }
const series = fakeSeries(851, 'Гавань', [['Первая', 'Вторая'], ['Третья']]);
const film = fakeFilm(852, 'Река');

for (const leave of ['tab', 'back'] as const) test(`late History open cannot navigate after leaving by ${leave}`, async ({ app, api, page, remote, player }) => {
  fakeHome(api, { hot: [film], movies: [], serials: [], progress: {} });
  fakeHistory(api, [[historyEntry(film, film.videos![0]!, 300, 200)]]);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  api.on('GET', '/v1/items/852', async () => { await gate; return { json: { item: film } }; });
  await app.open();
  await history(remote);
  await expect(page.getByRole('button', { name: 'Река, Сохранено: 5 мин' })).toBeVisible();
  await remote.press('down', 'ok');
  await expect(page.locator('.history').getByRole('status')).toHaveText('Загрузка видео…');
  await remote.press('back');
  if (leave === 'tab') await remote.press('left');
  else await remote.press('back');
  release();
  await expect.poll(() => api.requestsTo('GET', '/v1/items/852').length).toBe(1);
  await page.waitForTimeout(150);
  await expect(page.locator('[data-screen="player"]')).toHaveCount(0);
  expect(await player.loads()).toHaveLength(0);
});

test('all pages determine order and latest title media; exact episode resumes, progress refreshes after playback', async ({ app, api, page, remote, player }) => {
  fakeHome(api, { hot: [film], movies: [], serials: [], progress: {
    [series.id]: seriesProgress(series, [[1, 1, 'watched'], [1, 2, 600]]),
    [film.id]: filmProgress(film, 300, 6000),
  } });
  fakeHistory(api, [[historyEntry(series, series.seasons![0]!.episodes[0]!, 2700, 100), historyEntry(film, film.videos![0]!, 300, 200)],
    [historyEntry(series, series.seasons![0]!.episodes[1]!, 600, 300)]]);
  await app.open();
  await history(remote);
  const cards = page.getByRole('region', { name: 'История' }).getByRole('button');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAccessibleName('Гавань, Сохранено: 10 мин');
  await expect(cards.nth(0).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '22');
  expect(api.requestsTo('GET', '/v1/history').map((r) => r.query.page)).toEqual(['1', '2']);
  await remote.press('down', 'ok');
  await expect(page.locator('[data-screen="player"]')).toContainText('S1 · E2');
  await expect.poll(async () => (await player.loads())[0]?.startAt).toBe(600);
  await player.time(900);
  await remote.press('back', 'back');
  await expect(cards.nth(0)).toHaveAccessibleName('Гавань, Сохранено: 15 мин');
  await expect(app.focused).toHaveAccessibleName('Гавань, Сохранено: 15 мин');
  await remote.press('right', 'ok');
  await expect.poll(async () => (await player.loads()).slice(-1)[0]?.startAt).toBe(300);
  await player.time(1200);
  await remote.press('back', 'back');
  await expect(cards.nth(0)).toHaveAccessibleName('Река, Сохранено: 20 мин');
  await expect(app.focused).toHaveAccessibleName('Река, Сохранено: 20 мин');
});

test('completed exact film part replays from zero and unavailable media keeps focus', async ({ app, api, page, remote, player }) => {
  const multipart = fakeFilm(853, 'Две части');
  multipart.videos!.push({ ...multipart.videos![0]!, id: 8531, number: 2, title: 'Вторая часть' });
  fakeHome(api, { hot: [multipart], movies: [], serials: [], progress: {} });
  fakeHistory(api, [[historyEntry(multipart, multipart.videos![1]!, 6000, 300), historyEntry(series, null, 30, 200)]]);
  await app.open();
  await history(remote);
  await expect(page.getByRole('button', { name: 'Две части, Сохранено: 1 ч 40 мин' })).toBeVisible();
  await remote.press('down', 'ok');
  await expect.poll(async () => (await player.loads())[0]).toEqual(expect.objectContaining({ startAt: 0, url: expect.stringContaining('/8531/') }));
  await remote.press('back', 'back', 'right', 'ok');
  await expect(page.locator('.history').getByRole('status')).toHaveText('Историческое видео недоступно');
  await expect(app.focused).toHaveAccessibleName('Гавань, Историческое видео недоступно');
  expect(await player.loads()).toHaveLength(1);
});

test('loading, failed-load retry and empty state remain remote navigable', async ({ app, api, page, remote }) => {
  fakeHome(api);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  api.on('GET', '/v1/history', async () => { await gate; return { status: 400, json: { error: 'unavailable' } }; });
  await app.open();
  await history(remote);
  await expect(page.locator('.history').getByRole('status')).toHaveText('Загрузка истории…');
  release();
  await expect(page.locator('.history').getByRole('status')).toHaveText('Не удалось загрузить историю');
  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Повторить загрузку истории');
  fakeHistory(api, [[]]);
  await remote.press('ok');
  await expect(page.locator('.history').getByRole('status')).toHaveText('История просмотров пуста');
  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('История');
});

test('a relaunch shows the saved history at once, and a failed refresh keeps it', async ({ app, api, page, remote }) => {
  fakeHome(api, { hot: [film], movies: [], serials: [], progress: {} });
  fakeHistory(api, [[historyEntry(film, film.videos![0]!, 300, 200)]]);
  await app.open();
  await history(remote);
  await expect(page.getByRole('button', { name: 'Река, Сохранено: 5 мин' })).toBeVisible();
  // Age the saved copy past freshness, and make the refresh fail.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('kinotv:history')!) as { savedAt: number };
    localStorage.setItem('kinotv:history', JSON.stringify({ ...saved, savedAt: saved.savedAt - 10 * 60_000 }));
  });
  api.on('GET', '/v1/history', { status: 400, json: { error: 'unavailable' } });
  const before = api.requestsTo('GET', '/v1/history').length;
  await page.reload();
  await history(remote);
  await expect(page.getByRole('button', { name: 'Река, Сохранено: 5 мин' })).toBeVisible();
  await expect.poll(() => api.requestsTo('GET', '/v1/history').length).toBeGreaterThan(before);
  await expect(page.locator('.history').getByRole('status')).not.toHaveText('Не удалось загрузить историю');
  await expect(page.getByRole('button', { name: 'Повторить загрузку истории' })).toHaveCount(0);
});
