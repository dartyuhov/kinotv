import { fakeHome, fakeSeries } from './harness/catalog';
import { fakeWatched } from './harness/watched';
import { expect, test } from './harness/test';

const series = fakeSeries(831, 'Гавань', [['Первая', 'Вторая', 'Третья'], ['Другая']]);

test('remote episode action preserves play, skips fresh watched and persists across reload', async ({ app, api, page, remote, player }) => {
  fakeHome(api, { hot: [series], movies: [], serials: [], progress: {} });
  const service = fakeWatched(api, series);
  await app.open();
  await remote.press('down', 'ok');
  await expect(app.focused).toHaveAccessibleName('Смотреть S1 · E1');
  await remote.press('down', 'down');
  await expect(app.focused).toHaveAccessibleName('1. Первая');
  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Отметить серию 1 просмотренной');
  // Another client marked this episode since title load: the action must not toggle it off.
  service.state.seasons![0]!.episodes[0]!.status = 1;
  await remote.press('ok');
  await expect(page.locator('[data-screen="title"]').getByRole('status')).toHaveText('Просмотрено: 1');
  expect(api.requestsTo('GET', '/v1/watching/toggle')).toHaveLength(0);
  await remote.press('up', 'right', 'down', 'ok');
  await expect(page.locator('[data-screen="title"]').getByRole('status')).toHaveText('Просмотрено: 1');
  await expect(page.getByRole('button', { name: '2. Вторая, просмотрено', exact: true })).toBeVisible();
  expect(await player.loads()).toEqual([]);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Главная' })).toBeVisible();
  await remote.press('down', 'ok');
  await expect(page.getByRole('button', { name: '2. Вторая, просмотрено', exact: true })).toBeVisible();
  await remote.press('down', 'down', 'ok');
  await expect.poll(async () => (await player.loads()).length).toBe(1);
});

test('season action guards repeated OK, reconciles lost response, shows partial failure and isolates season', async ({ app, api, page, remote }) => {
  fakeHome(api, { hot: [series], movies: [], serials: [], progress: {} });
  const service = fakeWatched(api, series, [[1, 1, 'watched']]);
  service.failures.set(2, 'lost');
  service.failures.set(3, 'reject');
  let release!: () => void;
  service.hold(new Promise<void>((resolve) => { release = resolve; }));
  await app.open();
  await remote.press('down', 'ok');
  await expect(app.focused).toHaveAccessibleName('Смотреть S1 · E2');
  await remote.press('down', 'down', 'down', 'right');
  await expect(app.focused).toHaveAccessibleName('Отметить сезон 1 просмотренным');
  await remote.press('ok', 'ok', 'ok');
  release();
  await expect(page.locator('[data-screen="title"]').getByRole('status')).toContainText('Подтверждено: 2. Не подтверждено: 1');
  expect(api.requestsTo('GET', '/v1/watching/toggle').map((r) => r.query.video)).toEqual(['2', '3']);
  await expect(page.getByRole('button', { name: '2. Вторая, просмотрено', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '3. Третья', exact: true })).toBeVisible();
  await expect(app.focused).toHaveAccessibleName('Отметить сезон 1 просмотренным');
  expect(service.state.seasons![1]!.episodes[0]!.status).toBe(-1);
  service.failures.clear();
  await remote.press('ok');
  await expect(page.locator('[data-screen="title"]').getByRole('status')).toHaveText('Просмотрено: 3');
  expect(api.requestsTo('GET', '/v1/watching/toggle').map((r) => r.query.video)).toEqual(['2', '3', '3']);
});
