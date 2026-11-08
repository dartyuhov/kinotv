import { fakeHome, fakeItem } from './harness/catalog';
import { solidPng } from './harness/fakeCdn';
import { expect, test } from './harness/test';

test('remote clear reports managed usage, preserves saved session/preferences and later navigation reuses new artwork', async ({ app, api, cdn, page, remote }) => {
  const item = fakeItem(1400, 'Кэш настроек');
  cdn.respond(item.posters.medium, { body: Buffer.concat([solidPng([1, 2, 3]), Buffer.alloc(1024 * 1024)]) });
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: [item], popular: [] });
  await app.open();
  await expect(page.locator('.card img').first()).toHaveJSProperty('naturalWidth', 16);
  const saved = await page.evaluate(() => {
    localStorage.setItem('image-test:preferences', 'preserve');
    return localStorage.getItem('kinotv:session');
  });
  await remote.repeat('right', 8);
  await expect(app.focused).toHaveAccessibleName('Настройки');
  await expect(page.getByText('Кэш изображений: 1,0 МиБ / 50 МиБ', { exact: true })).toBeVisible();
  await expect(page.getByText('Сохранение изображений доступно', { exact: true })).toBeVisible();
  await expect(page.getByText(/Попадания: \d+ · Промахи: \d+ · Загружено: 1,0 МиБ · Удалено: \d+/)).toBeVisible();
  await expect(page.locator('.settings-tab__cache')).not.toContainText('http');
  await expect(page.locator('.settings-tab__cache')).not.toContainText('seeded-access-token');
  await remote.press('down', 'down');
  await expect(app.focused).toHaveAccessibleName('Очистить кэш изображений');
  await remote.press('ok');
  await expect(page.getByRole('status').filter({ hasText: 'Кэш изображений очищен' })).toBeVisible();
  await expect(page.getByText('Кэш изображений: 0,0 МиБ / 50 МиБ', { exact: true })).toBeVisible();
  await expect(app.focused).toHaveAccessibleName('Очистить кэш изображений');
  expect(await page.evaluate(() => localStorage.getItem('kinotv:session'))).toBe(saved);
  expect(await page.evaluate(() => localStorage.getItem('image-test:preferences'))).toBe('preserve');
  await remote.press('up', 'up');
  await remote.repeat('left', 8);
  await expect(page.locator('.card img').first()).toHaveJSProperty('naturalWidth', 16);
  expect(cdn.requests.filter((r) => r.source === item.posters.medium)).toHaveLength(2);
  await page.reload();
  await expect(page.locator('.card img').first()).toHaveJSProperty('naturalWidth', 16);
  expect(cdn.requests.filter((r) => r.source === item.posters.medium)).toHaveLength(2);
  expect(await page.evaluate(() => localStorage.getItem('kinotv:session'))).toBe(saved);
  expect(await page.evaluate(() => localStorage.getItem('image-test:preferences'))).toBe('preserve');
});

test('remote clear during a delayed stale refresh fences its completion and permits fresh reuse', async ({ app, api, cdn, page, remote }) => {
  const item = fakeItem(1401, 'Активный кэш');
  fakeHome(api, { hot: [item], movies: [], serials: [], fresh: [], popular: [] });
  cdn.respond(item.posters.wide!, { headers: { 'cache-control': 'max-age=0' } });
  await app.open();
  await expect(page.getByTestId('backdrop').last()).toHaveClass(/loaded/);
  cdn.respond(item.posters.wide!, { headers: { 'cache-control': 'max-age=3600' }, delay: 1500 });
  await page.reload();
  await expect(page.getByTestId('backdrop').last()).toHaveJSProperty('naturalWidth', 16);
  await expect.poll(() => cdn.requests.filter((r) => r.source === item.posters.wide).length).toBe(2);
  await remote.repeat('right', 8);
  await remote.press('down', 'down', 'ok');
  await expect(page.getByText('Кэш изображений очищен', { exact: true })).toBeVisible();
  await expect(page.getByText('Кэш изображений: 0,0 МиБ / 50 МиБ', { exact: true })).toBeVisible();
  // Wait for the delayed server answer, including a request cancelled when Home unmounts.
  await expect.poll(() => cdn.transfers.filter((r) => r.source === item.posters.wide).length).toBe(2);
  await expect(page.getByText('Кэш изображений: 0,0 МиБ / 50 МиБ', { exact: true })).toBeVisible();
  cdn.respond(item.posters.wide!, { headers: { 'cache-control': 'max-age=3600' } });
  await page.reload();
  await expect(page.getByTestId('backdrop').last()).toHaveJSProperty('naturalWidth', 16);
  expect(cdn.requests.filter((r) => r.source === item.posters.wide)).toHaveLength(3);
  await page.reload();
  await expect(page.getByTestId('backdrop').last()).toHaveJSProperty('naturalWidth', 16);
  expect(cdn.requests.filter((r) => r.source === item.posters.wide)).toHaveLength(3);
});

test('clear failure is actionable, keeps focus and sign-in, and supports a successful retry', async ({ app, page, remote }) => {
  await page.addInitScript(() => {
    const remove = IDBObjectStore.prototype.delete;
    Object.assign(window, { failImageClear: true });
    IDBObjectStore.prototype.delete = function (key) {
      if (this.transaction.db.name === 'kinotv-images' && (window as unknown as { failImageClear: boolean }).failImageClear) {
        throw new DOMException('private storage detail must not be shown', 'UnknownError');
      }
      return remove.call(this, key);
    };
  });
  await app.open();
  await expect(page.locator('.card img').first()).toHaveJSProperty('naturalWidth', 16);
  await remote.repeat('right', 8);
  await remote.press('down', 'down', 'ok');
  await expect(page.getByRole('alert')).toHaveText('Не удалось очистить кэш изображений. Попробуйте ещё раз; если ошибка повторится, перезапустите KinoTV.');
  await expect(app.focused).toHaveAccessibleName('Очистить кэш изображений');
  await expect(page.getByText(/Сохранение изображений недоступно/)).toBeVisible();
  await expect(page.locator('.settings-tab')).not.toContainText('private storage detail');
  await page.evaluate(() => { Object.assign(window, { failImageClear: false }); });
  await remote.press('ok');
  await expect(page.getByText('Кэш изображений очищен', { exact: true })).toBeVisible();
  await expect(page.getByText('Сохранение изображений доступно', { exact: true })).toBeVisible();
  await remote.press('up', 'up');
  await remote.repeat('left', 8);
  await expect(app.focused).toHaveAccessibleName('Главная');
});

test('unavailable image persistence is reported without blocking remote navigation', async ({ app, page, remote }) => {
  await page.addInitScript(() => { indexedDB.open = () => { throw new Error('unavailable'); }; });
  await app.open();
  await expect(page.locator('.card img').first()).toHaveJSProperty('naturalWidth', 16);
  await remote.repeat('right', 8);
  await expect(page.getByText(/Сохранение изображений недоступно/)).toBeVisible();
  await remote.press('down', 'down', 'ok');
  await expect(page.getByRole('alert')).toContainText('Попробуйте ещё раз');
  await expect(app.focused).toHaveAccessibleName('Очистить кэш изображений');
});
