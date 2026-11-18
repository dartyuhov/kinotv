import { fakeHome, fakeSeries } from './harness/catalog';
import { fakeWatched } from './harness/watched';
import { expect, test } from './harness/test';

const series = fakeSeries(831, 'Гавань', [['Первая', 'Вторая', 'Третья'], ['Другая']]);

for (const artworkDelay of [0, 250]) {
  test(`switching seasons does not reinterpret the previous focused episode number${artworkDelay ? ' with delayed artwork' : ''}`, async ({ app, api, cdn, page, remote }) => {
    const overlapping = fakeSeries(832, 'Сезоны', [['Один', 'Два'], ['Новый один', 'Новый два']]);
    for (const season of overlapping.seasons!) {
      for (const episode of season.episodes) cdn.respond(episode.thumbnail, { delay: artworkDelay });
    }
    fakeHome(api, { hot: [overlapping], movies: [], serials: [], progress: {} });
    fakeWatched(api, overlapping);
    await app.open();
    await expect(page.getByRole('button', { name: 'Смотреть', exact: true })).toBeVisible();
    await remote.press('down', 'ok');
    await expect(app.focused).toHaveAccessibleName('Смотреть S1 · E1');
    await remote.press('down', 'down');
    await expect(app.focused).toHaveAccessibleName('1. Один');
    await expect(page.getByRole('button', { name: '2. Два', exact: true })).toBeEnabled();
    await remote.press('right');
    await expect(app.focused).toHaveAccessibleName('2. Два');
    await remote.press('up', 'right');
    await expect(page.getByRole('tab', { name: 'Сезон 2', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Отметить серию 1 просмотренной', exact: true })).toBeVisible();
    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('1. Новый один');
    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('Отметить серию 1 просмотренной');
    await remote.press('ok');
    await expect.poll(() => api.requestsTo('GET', '/v1/watching/toggle').map((r) => [r.query.season, r.query.video])).toEqual([['2', '1']]);
  });
}

test('remote episode action preserves play, skips fresh watched and persists across reload', async ({ app, api, page, remote, player }) => {
  fakeHome(api, { hot: [series], movies: [], serials: [], progress: {} });
  const service = fakeWatched(api, series);
  await app.open();
  await expect(page.getByRole('button', { name: 'Смотреть', exact: true })).toBeVisible();
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
  await remote.press('up');
  await expect(app.focused).toHaveAccessibleName('1. Первая, просмотрено');
  await expect(page.getByRole('button', { name: '2. Вторая', exact: true })).toBeEnabled();
  await remote.press('right', 'down');
  await expect(app.focused).toHaveAccessibleName('Отметить серию 2 просмотренной');
  await remote.press('ok');
  await expect(page.locator('[data-screen="title"]').getByRole('status')).toHaveText('Просмотрено: 1');
  await expect(page.getByRole('button', { name: '2. Вторая, просмотрено', exact: true })).toBeVisible();
  expect(await player.loads()).toEqual([]);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Главная' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Смотреть', exact: true })).toBeVisible();
  await remote.press('down', 'ok');
  await expect(page.getByRole('button', { name: '2. Вторая, просмотрено', exact: true })).toBeVisible();
  await expect(app.focused).toHaveAccessibleName('Смотреть S1 · E1');
  await remote.press('down', 'down');
  await expect(app.focused).toHaveAccessibleName('1. Первая, просмотрено');
  await remote.press('ok');
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
  await expect(page.getByRole('button', { name: 'Смотреть', exact: true })).toBeVisible();
  await remote.press('down', 'ok');
  await expect(app.focused).toHaveAccessibleName('Смотреть S1 · E2');
  await remote.press('down', 'down');
  await expect(app.focused).toHaveAccessibleName('2. Вторая');
  await remote.press('down', 'right');
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

test('leaving and reopening while a manual toggle is pending shares the playback watched owner', async ({ app, api, page, remote, player }) => {
  fakeHome(api, { hot: [series], movies: [], serials: [], progress: {} });
  const service = fakeWatched(api, series);
  let release!: () => void;
  // The response gate holds the mutation pending without freezing artwork/focus scheduling.
  service.hold(new Promise<void>((resolve) => { release = resolve; }));
  await app.open();
  await expect(page.getByRole('button', { name: 'Смотреть', exact: true })).toBeVisible();
  await remote.press('down', 'ok');
  await expect(app.focused).toHaveAccessibleName('Смотреть S1 · E1');
  await remote.press('down', 'down');
  await expect(app.focused).toHaveAccessibleName('1. Первая');
  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Отметить серию 1 просмотренной');
  await remote.press('ok');
  await expect.poll(() => api.requestsTo('GET', '/v1/watching/toggle').length).toBe(1);
  await remote.press('back');
  await expect(page.locator('[data-screen="title"]')).toHaveCount(0);
  await remote.press('ok');
  await expect(app.focused).toHaveAccessibleName('Смотреть S1 · E1');
  await remote.press('down', 'down');
  await expect(app.focused).toHaveAccessibleName('1. Первая');
  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Отметить серию 1 просмотренной');
  await remote.press('ok');
  await remote.press('up');
  await expect(app.focused).toHaveAccessibleName('1. Первая');
  await remote.press('ok');
  await expect.poll(() => player.state()).toBe('playing');
  await player.time(2500); // exceeds 90% of a 45-minute episode
  release();
  await expect.poll(() => service.state.seasons![0]!.episodes[0]!.status).toBe(1);
  await remote.press('stop');
  await expect(page.getByRole('button', { name: '1. Первая, просмотрено', exact: true })).toBeVisible();
  await api.idle();
  expect(api.requestsTo('GET', '/v1/watching/toggle').map((r) => [r.query.season, r.query.video])).toEqual([['1', '1']]);
});
