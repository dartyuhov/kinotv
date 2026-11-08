import { fakeHome, fakeItems, fakeCollection } from './harness/catalog';
import { expect, test } from './harness/test';
import { solidPng } from './harness/fakeCdn';

test('Home loads a vertical row on entry and reuses it on return', async ({ app, api, cdn, page, remote }) => {
  const fresh = fakeItems(91_000, 30), popular = fakeItems(92_000, 30);
  fakeHome(api, { hot: [], movies: [], serials: [], fresh, popular });
  await app.open(); await remote.press('down');
  const nextRow = page.getByRole('button', { name: 'Фильм 92000', exact: true });
  await expect(nextRow).not.toBeInViewport();
  await remote.press('down');
  await expect(nextRow.locator('img')).toHaveJSProperty('naturalWidth', 16);
  await expect.poll(() => cdn.active).toBe(0);
  const downloads = cdn.requests.filter(request => request.source === popular[0]!.posters.medium).length;
  expect(downloads).toBe(1);
  await remote.press('up', 'down');
  await expect(nextRow.locator('img')).toHaveJSProperty('naturalWidth', 16);
  expect(cdn.requests.filter(request => request.source === popular[0]!.posters.medium)).toHaveLength(downloads);
});

test('Home vertical browse and delayed return reuse artwork without filesystem reads', async ({ app, api, page, remote }) => {
  // Count actual poster record reads, excluding backdrop and temporary-write reads.
  await page.addInitScript(() => {
    const get = IDBObjectStore.prototype.get;
    Object.assign(window, { artworkReads: 0 });
    IDBObjectStore.prototype.get = function (...args) {
      const request = get.apply(this, args);
      request.addEventListener('success', () => {
        if (!/^[a-f0-9]{64}$/.test(String(args[0])) || !(request.result instanceof Blob)) return;
        void request.result.text().then(text => {
          if (text.includes('/medium.jpg')) (window as unknown as { artworkReads: number }).artworkReads++;
        });
      });
      return request;
    };
  });
  const fresh = fakeItems(97_000, 30), popular = fakeItems(98_000, 30);
  fakeHome(api, { hot: [], movies: [], serials: [], fresh, popular,
    collections: [fakeCollection(99_000, 'Подборка', [])] });
  await app.open(); await remote.press('down');
  const first = page.getByRole('button', { name: 'Фильм 97000', exact: true });
  await expect(first.locator('img')).toHaveJSProperty('naturalWidth', 16);
  await remote.press('down', 'down');
  await expect(first).not.toBeInViewport();
  await expect(first.locator('img')).not.toHaveAttribute('src');
  // Allow the previous retention window and batched writes to finish.
  await page.waitForTimeout(2000);
  const reads = await page.evaluate(() => (window as unknown as { artworkReads: number }).artworkReads);
  await remote.press('up', 'up');
  await expect(first).toBeInViewport();
  await expect(first.locator('img')).toHaveJSProperty('naturalWidth', 16);
  expect(await page.evaluate(() => (window as unknown as { artworkReads: number }).artworkReads)).toBe(reads);
  // ScreenStack unmounts Home: the same session cache must work through that too.
  await remote.press('ok');
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  await page.waitForTimeout(1800);
  const beforeBack = await page.evaluate(() => (window as unknown as { artworkReads: number }).artworkReads);
  await remote.press('back');
  await expect(first.locator('img')).toHaveJSProperty('naturalWidth', 16);
  expect(await page.evaluate(() => (window as unknown as { artworkReads: number }).artworkReads)).toBe(beforeBack);
});

test('brief scroll-out and reversal retain a loaded thumbnail URL', async ({ app, api, page, remote }) => {
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: fakeItems(94_000, 60), popular: [] });
  await app.open();
  await remote.press('down');
  const first = page.getByRole('button', { name: 'Фильм 94000', exact: true });
  await expect(first.locator('img')).toHaveJSProperty('naturalWidth', 16);
  const source = await first.locator('img').getAttribute('src');
  await remote.repeat('right', 5);
  await expect(first).not.toBeInViewport();
  await expect(first.locator('img')).toHaveAttribute('src', source!);
  await remote.repeat('left', 5);
  await expect(first).toBeInViewport();
  await expect(first.locator('img')).toHaveAttribute('src', source!);
  // Retention is temporary: after leaving it offscreen, its display resource is released.
  await remote.repeat('right', 5);
  await expect(first.locator('img')).not.toHaveAttribute('src');
});

test('scroll retention releases on expiry and never retains more than eight clipped cards', async ({ app, api, cdn, page, remote }) => {
  const items = fakeItems(96_000, 80);
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: items, popular: [] });
  const poster = solidPng([80, 90, 100], 250, 375);
  for (const item of items) cdn.respond(item.posters.medium, { body: poster });
  await app.open();
  await remote.press('down');
  for (let i = 0; i < 20; i++) {
    await remote.press('right');
    await expect(app.focused.locator('img')).toHaveJSProperty('naturalWidth', 250);
  }
  const clipped = () => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('.card img[src]')].filter((image) => {
    const box = image.getBoundingClientRect();
    return box.right <= 0 || box.left >= innerWidth;
  }).map((image) => image.naturalWidth * image.naturalHeight * 4));
  // Eight retained cards plus at most two directional display preloads.
  await expect.poll(async () => (await clipped()).length).toBeLessThanOrEqual(10);
  expect((await clipped()).reduce((sum, bytes) => sum + bytes, 0)).toBeLessThanOrEqual(8 * 1024 * 1024 + 2 * 250 * 375 * 4);
  await expect.poll(async () => (await clipped()).length).toBeLessThanOrEqual(2);
});

test('a prefetched neighbor is already decoded before scrolling into view', async ({ app, api, page, remote }) => {
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: fakeItems(95_000, 60), popular: [] });
  await app.open();
  await remote.press('down');
  const neighbor = page.getByRole('button', { name: 'Фильм 95008', exact: true }).locator('img');
  await expect(neighbor).toHaveJSProperty('naturalWidth', 16);
  const source = await neighbor.getAttribute('src');
  await remote.repeat('right', 3);
  await expect(page.getByRole('button', { name: 'Фильм 95008', exact: true })).toBeInViewport();
  await expect(neighbor).toHaveAttribute('src', source!);
});
