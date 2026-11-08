import { fakeHome, fakeItem } from './harness/catalog';
import { expect, test } from './harness/test';
import { solidPng } from './harness/fakeCdn';

test('a small managed budget evicts released posters while browsing remains usable', async ({ app, api, cdn, page, remote }) => {
  await page.addInitScript(() => {
    (globalThis as typeof globalThis & { __kinotvImageOptions: { budget: number } }).__kinotvImageOptions = { budget: 800 };
  });
  const first = fakeItem(710, 'Первый кэш');
  const second = fakeItem(711, 'Второй кэш');
  const third = fakeItem(712, 'Третий кэш');
  const home = (item: typeof first) => fakeHome(api, { hot: [], movies: [], serials: [], fresh: [item], popular: [] });
  home(first);
  await app.open();
  const poster = page.locator('.card--poster img').first();
  await expect(poster).toHaveJSProperty('naturalWidth', 16);
  await page.reload();
  await expect(poster).toHaveJSProperty('naturalWidth', 16);
  expect(cdn.requests.filter((r) => r.source === first.posters.medium)).toHaveLength(1);
  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('Фильмы');
  await remote.press('left');
  await expect(poster).toHaveJSProperty('naturalWidth', 16);
  const beforeEviction = cdn.requests.filter((r) => r.source === first.posters.medium).length;
  // Reload is the real app restart seam: it releases the old screen's leases.
  for (const item of [second, third, first]) {
    home(item);
    await page.reload();
    await expect(poster).toHaveJSProperty('naturalWidth', 16);
  }
  expect(cdn.requests.filter((r) => r.source === first.posters.medium)).toHaveLength(beforeEviction + 1);
});

test('posters share a managed download and reuse it after remote revisit and restart', async ({ app, api, cdn, page, remote }) => {
  await page.context().addCookies([{ name: 'subscriber', value: 'fake-cookie-must-not-leak', url: 'http://fake-cdn.kinotv.test' }]);
  const item = fakeItem(701, 'Кэш');
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: [item], popular: [item] });
  await app.open();
  const posters = page.locator('.card--poster img');
  await expect(posters).toHaveCount(2);
  await expect(posters.first()).toHaveAttribute('src', /^blob:/);
  // The repeated row is initially clipped; reveal it with the remote before expecting a lease.
  await remote.press('down', 'down');
  await expect(posters.last()).toHaveAttribute('src', /^blob:/);
  expect(cdn.requests.filter((r) => r.source === item.posters.medium)).toHaveLength(1);
  const request = cdn.requests.find((r) => r.source === item.posters.medium)!;
  expect(request.headers.authorization).toBeUndefined();
  expect(request.headers.cookie).toBeUndefined();
  await remote.press('up', 'up', 'right', 'left');
  await expect(posters.first()).toHaveAttribute('src', /^blob:/);
  await page.reload();
  await expect(posters.first()).toHaveAttribute('src', /^blob:/);
  await expect(posters.first()).toHaveJSProperty('naturalWidth', 16);
  expect(cdn.requests.filter((r) => r.source === item.posters.medium)).toHaveLength(1);
});

test('poster query parameters remain distinct persistent identities', async ({ app, api, cdn, page }) => {
  const first = fakeItem(705, 'Первый');
  const second = fakeItem(706, 'Второй');
  first.posters.medium += '?variant=one';
  second.posters.medium = first.posters.medium.replace('=one', '=two');
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: [first, second], popular: [] });
  await app.open();
  const images = page.locator('.card--poster img');
  await expect(images).toHaveCount(2);
  for (const image of await images.all()) await expect(image).toHaveJSProperty('naturalWidth', 16);
  for (const item of [first, second]) expect(cdn.requests.filter((r) => r.source === item.posters.medium)).toHaveLength(1);
  await page.reload();
  await expect(images).toHaveCount(2);
  for (const image of await images.all()) await expect(image).toHaveJSProperty('naturalWidth', 16);
  for (const item of [first, second]) expect(cdn.requests.filter((r) => r.source === item.posters.medium)).toHaveLength(1);
});

test('unavailable persistence still displays posters and permits remote navigation', async ({ app, api, cdn, page, remote }) => {
  await page.addInitScript(() => { indexedDB.open = () => { throw new Error('local quota failure'); }; });
  const item = fakeItem(702, 'Без диска');
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: [item], popular: [] });
  await app.open();
  await expect(page.locator('.card--poster img').first()).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('.card--poster img').first()).toHaveJSProperty('naturalWidth', 16);
  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('Фильмы');
  await remote.press('left');
  await expect(page.locator('.card--poster img').first()).toHaveAttribute('src', /^blob:/);
  const beforeReload = cdn.requests.filter((r) => r.source === item.posters.medium).length;
  await page.reload();
  await expect(page.locator('.card--poster img').first()).toHaveAttribute('src', /^blob:/);
  expect(cdn.requests.filter((r) => r.source === item.posters.medium)).toHaveLength(beforeReload + 1);
});

test('a failed IndexedDB write displays the transient poster and releases it on unmount', async ({ app, api, page, remote }) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = () => { throw new DOMException('Local full disk', 'QuotaExceededError'); };
  });
  const item = fakeItem(703, 'Полный диск');
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: [item], popular: [item] });
  await app.open();
  const poster = page.locator('.card--poster img').first();
  await expect(poster).toHaveAttribute('src', /^blob:/);
  await expect(poster).toHaveJSProperty('naturalWidth', 16);
  const url = await poster.getAttribute('src');
  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('Фильмы');
  await expect.poll(() => page.evaluate(async (source) => {
    try { await fetch(source!); return false; } catch { return true; }
  }, url)).toBe(true);
});

for (const kind of ['no-store', 'HTML', 'invalid image', 'oversize'] as const) {
  test(`${kind} artwork is not persisted across restarts`, async ({ app, api, cdn, page }) => {
    const item = fakeItem(704, 'Проверка');
    const source = item.posters.medium;
    cdn.respond(source, kind === 'no-store' ? { headers: { 'cache-control': 'no-store' } }
      : kind === 'HTML' ? { contentType: 'text/html', body: '<html>login</html>' }
      : kind === 'invalid image' ? { body: 'not an image' }
      : { body: Buffer.alloc(5 * 1024 * 1024 + 1) });
    fakeHome(api, { hot: [], movies: [], serials: [], fresh: [item], popular: [] });
    await app.open();
    const poster = page.locator('.card--poster img').first();
    await expect.poll(() => cdn.requests.filter((r) => r.source === source).length).toBe(1);
    if (kind === 'no-store') {
      await expect(poster).toHaveAttribute('src', /^blob:/);
      await expect(poster).toHaveJSProperty('naturalWidth', 16);
    } else {
      await expect(page.getByRole('button', { name: 'Проверка' })).toBeVisible();
      await expect(poster).not.toHaveAttribute('src');
    }
    await page.reload();
    await expect.poll(() => cdn.requests.filter((r) => r.source === source).length).toBe(2);
    if (kind === 'no-store') await expect(poster).toHaveAttribute('src', /^blob:/);
    else await expect(poster).not.toHaveAttribute('src');
  });
}

for (const validator of ['etag', 'last-modified'] as const) {
  test(`expired posters use persisted ${validator} and 304 transfers no body across reloads`, async ({ app, api, cdn, page }) => {
    await page.clock.setFixedTime(new Date('2026-11-02T10:00:00Z'));
    const item = fakeItem(720, 'Валидация');
    const source = item.posters.medium;
    const value = validator === 'etag' ? '"poster-v1"' : 'Wed, 04 Nov 2026 12:00:00 GMT';
    cdn.respond(source, { headers: { 'cache-control': 'max-age=1, must-revalidate', [validator]: value }, conditional: true });
    fakeHome(api, { hot: [], movies: [], serials: [], fresh: [item], popular: [] });
    await app.open();
    const poster = page.locator('.card--poster img').first();
    await expect(poster).toHaveJSProperty('naturalWidth', 16);
    const initialBytes = cdn.transfers.filter((r) => r.source === source).reduce((sum, r) => sum + r.bytes, 0);
    expect(initialBytes).toBeGreaterThan(0);
    await page.clock.setFixedTime(new Date('2026-11-02T10:00:02Z'));
    cdn.respond(source, { headers: { 'cache-control': 'max-age=3600', [validator]: value }, conditional: true });
    await page.reload();
    await expect(poster).toHaveJSProperty('naturalWidth', 16);
    expect(cdn.requests.filter((r) => r.source === source)).toHaveLength(2);
    expect(cdn.requests.filter((r) => r.source === source)[1]!.headers[validator === 'etag' ? 'if-none-match' : 'if-modified-since']).toBe(value);
    expect(cdn.transfers.filter((r) => r.source === source).map((r) => r.status)).toEqual([200, 304]);
    expect(cdn.transfers.filter((r) => r.source === source).reduce((sum, r) => sum + r.bytes, 0)).toBe(initialBytes);
    await page.reload();
    await expect(poster).toHaveJSProperty('naturalWidth', 16);
    expect(cdn.requests.filter((r) => r.source === source)).toHaveLength(2);
  });
}

test('permitted stale poster remains visible then changes in place after background refresh', async ({ app, api, cdn, page }) => {
  const item = fakeItem(721, 'Обновление');
  const source = item.posters.medium;
  cdn.respond(source, { headers: { 'cache-control': 'max-age=0', etag: '"old"' }, body: solidPng([255, 0, 0], 16, 9) });
  // Both consumers are in the clipped viewport, so this also exercises shared refresh subscriptions.
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: [item, { ...item, id: 725 }], popular: [] });
  await app.open();
  const posters = page.locator('.card--poster img');
  await expect(posters.first()).toHaveJSProperty('naturalWidth', 16);
  cdn.respond(source, { headers: { 'cache-control': 'max-age=3600', etag: '"new"' }, body: solidPng([0, 255, 0], 32, 18), delay: 500 });
  await page.reload();
  await expect(posters.first()).toHaveJSProperty('naturalWidth', 16);
  await expect(posters.last()).toHaveJSProperty('naturalWidth', 16);
  await expect(posters.first()).toHaveJSProperty('naturalWidth', 32);
  await expect(posters.last()).toHaveJSProperty('naturalWidth', 32);
  expect(cdn.requests.filter((r) => r.source === source)).toHaveLength(2);
  expect(cdn.requests.filter((r) => r.source === source)[1]!.headers['if-none-match']).toBe('"old"');
  await page.reload();
  await expect(posters.first()).toHaveJSProperty('naturalWidth', 32);
  expect(cdn.requests.filter((r) => r.source === source)).toHaveLength(2);
});

for (const policy of ['no-cache, max-age=3600', 'must-revalidate, max-age=0', 'max-age=0']) {
  test(`${policy} governs placeholder and stale retention during a failed poster refresh`, async ({ app, api, cdn, page }) => {
    const item = fakeItem(722, 'Сбой обновления');
    const source = item.posters.medium;
    cdn.respond(source, { headers: { 'cache-control': policy, etag: '"old"' } });
    fakeHome(api, { hot: [], movies: [], serials: [], fresh: [item], popular: [] });
    await app.open();
    const poster = page.locator('.card--poster img').first();
    await expect(poster).toHaveJSProperty('naturalWidth', 16);
    cdn.respond(source, { status: 503, contentType: 'text/html', body: '<html>offline</html>', delay: 500 });
    await page.reload();
    await expect.poll(() => cdn.requests.filter((r) => r.source === source).length).toBe(2);
    if (policy === 'max-age=0') await expect(poster).toHaveJSProperty('naturalWidth', 16);
    else await expect(poster).not.toHaveAttribute('src');
    await expect.poll(() => cdn.transfers.filter((r) => r.source === source).length).toBe(2);
    if (policy === 'max-age=0') await expect(poster).toHaveJSProperty('naturalWidth', 16);
    else await expect(poster).not.toHaveAttribute('src');
    await expect(page.getByRole('button', { name: 'Сбой обновления' })).toBeVisible();
  });
}

test('damaged poster records recover on restart while unrelated saved data survives', async ({ app, api, cdn, page }) => {
  const item = fakeItem(723, 'Восстановление');
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: [item], popular: [] });
  await app.open();
  const poster = page.locator('.card--poster img').first();
  await expect(poster).toHaveJSProperty('naturalWidth', 16);
  await page.evaluate(async () => {
    localStorage.setItem('image-test:preferences', 'preserve');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('kinotv-images');
      request.onerror = () => reject(new Error('Cannot open test cache'));
      request.onsuccess = () => {
        const tx = request.result.transaction('files', 'readwrite');
        const store = tx.objectStore('files');
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          if (!cursor.result) return;
          cursor.result.update(new Blob(['corrupt metadata and payload']));
          cursor.result.continue();
        };
        store.put(new Blob(['interrupted']), 'tmp-abcd');
        tx.oncomplete = () => { request.result.close(); resolve(); };
        tx.onabort = () => reject(new Error('Cannot damage test cache'));
      };
    });
  });
  await page.reload();
  await expect(poster).toHaveJSProperty('naturalWidth', 16);
  expect(cdn.requests.filter((r) => r.source === item.posters.medium)).toHaveLength(2);
  expect(await page.evaluate(() => localStorage.getItem('image-test:preferences'))).toBe('preserve');
  await page.reload();
  await expect(poster).toHaveJSProperty('naturalWidth', 16);
  expect(cdn.requests.filter((r) => r.source === item.posters.medium)).toHaveLength(2);
});

for (const lifetime of ['age', 'expires'] as const) {
  test(`poster ${lifetime} expiry triggers conditional refresh rather than seven-day fallback`, async ({ app, api, cdn, page }) => {
    await page.clock.setFixedTime(new Date('2026-11-02T10:00:00Z'));
    const item = fakeItem(724, 'Срок хранения');
    const source = item.posters.medium;
    const headers: Record<string, string> = lifetime === 'age' ? { 'cache-control': 'max-age=60, must-revalidate', age: '59', etag: '"one"' }
      : { 'cache-control': 'must-revalidate', date: 'Mon, 02 Nov 2026 10:00:00 GMT', expires: 'Mon, 02 Nov 2026 10:00:01 GMT', etag: '"one"' };
    cdn.respond(source, { headers, conditional: true });
    fakeHome(api, { hot: [], movies: [], serials: [], fresh: [item], popular: [] });
    await app.open();
    const poster = page.locator('.card--poster img').first();
    await expect(poster).toHaveJSProperty('naturalWidth', 16);
    await page.clock.setFixedTime(new Date('2026-11-02T10:00:02Z'));
    cdn.respond(source, { headers: { 'cache-control': 'max-age=3600', etag: '"one"' }, conditional: true });
    await page.reload();
    await expect(poster).toHaveJSProperty('naturalWidth', 16);
    expect(cdn.transfers.filter((r) => r.source === source).map((r) => r.status)).toEqual([200, 304]);
  });
}
