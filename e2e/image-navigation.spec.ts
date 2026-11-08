import { fakeHome, fakeItems, fakeSeries, fakeCatalog } from './harness/catalog';
import { expect, test } from './harness/test';
import { solidPng } from './harness/fakeCdn';

test('stale sharp backdrop subscribes to changed artwork and releases outgoing layers after the refresh fade', async ({ app, api, cdn, page, remote }) => {
  const items = fakeItems(1400, 3);
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: items, popular: [] });
  const source = items[0]!.posters.wide!;
  cdn.respond(source, { headers: { 'cache-control': 'max-age=0', etag: '"old"' }, body: solidPng([255, 0, 0]) });
  await app.open(); await remote.press('down');
  await expect(page.getByTestId('backdrop').last()).toHaveJSProperty('naturalWidth', 16);
  cdn.respond(source, { headers: { 'cache-control': 'max-age=3600', etag: '"new"' }, body: solidPng([0, 255, 0], 32, 18), delay: 800 });
  await page.reload(); await remote.press('down');
  await expect(page.getByTestId('backdrop').last()).toHaveJSProperty('naturalWidth', 16);
  const staleUrl = await page.getByTestId('backdrop').last().getAttribute('src');
  await expect(page.getByTestId('backdrop').last()).toHaveJSProperty('naturalWidth', 32);
  expect(await page.getByTestId('backdrop').count()).toBeLessThanOrEqual(2);
  await expect(page.getByTestId('backdrop')).toHaveCount(1);
  await expect.poll(() => page.evaluate(async (url) => {
    try { await fetch(url!); return false; } catch { return true; }
  }, staleUrl)).toBe(true);
  await remote.press('right');
  await expect(page.getByTestId('backdrop').last()).toHaveAttribute('data-source', items[1]!.posters.wide!);
  await expect(page.getByTestId('backdrop')).toHaveCount(1);
});

test('abandoning an undecoded same-source refresh retains only the decoded sharp URL before acquiring the next source', async ({ app, api, cdn, page, remote, clock }) => {
  await page.addInitScript(() => {
    const live = new Set<string>();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const url = create(blob); live.add(url); return url; };
    URL.revokeObjectURL = (url) => { live.delete(url); revoke(url); };
    Object.assign(window, { artworkResources: live });
    // Hold React's load notification only for A's replacement, after cache validation.
    const add = HTMLImageElement.prototype.addEventListener;
    HTMLImageElement.prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
      if (!listener) return;
      if (type !== 'load') return add.call(this, type, listener, options);
      add.call(this, type, (event) => {
        if (this.dataset.testid === 'backdrop' && this.naturalWidth === 32) return;
        if (typeof listener === 'function') listener.call(this, event);
        else listener.handleEvent(event);
      }, options);
    };
  });
  const items = fakeItems(1420, 2);
  const source = items[0]!.posters.wide!;
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: items, popular: [] });
  cdn.respond(source, { headers: { 'cache-control': 'max-age=0' } });
  await app.open(); await remote.press('down');
  await expect(page.getByTestId('backdrop').last()).toHaveJSProperty('naturalWidth', 16);
  cdn.respond(source, { headers: { 'cache-control': 'max-age=3600' }, body: solidPng([0, 255, 0], 32, 18), delay: 1500 });
  await clock.pause();
  await page.reload(); await remote.press('down'); await clock.runFor(200);
  await expect(page.getByTestId('backdrop').last()).toHaveClass(/loaded/);
  const oldUrl = await page.getByTestId('backdrop').last().getAttribute('src');
  await clock.runFor(400);
  await expect(page.getByTestId('backdrop')).toHaveCount(1);
  await expect(page.getByTestId('backdrop').last()).toHaveJSProperty('naturalWidth', 32);
  const refreshUrl = await page.getByTestId('backdrop').last().getAttribute('src');
  await expect(page.getByTestId('backdrop').last()).not.toHaveClass(/loaded/);
  await remote.press('right');
  await expect.poll(() => page.evaluate((url) => (window as unknown as { artworkResources: Set<string> }).artworkResources.has(url!), refreshUrl)).toBe(false);
  expect(await page.evaluate((url) => (window as unknown as { artworkResources: Set<string> }).artworkResources.has(url!), oldUrl)).toBe(true);
  await clock.runFor(200);
  await expect(page.getByTestId('backdrop').last()).toHaveAttribute('data-source', items[1]!.posters.wide!);
  const nextUrl = await page.getByTestId('backdrop').last().getAttribute('src');
  expect(await page.evaluate((urls) => urls.map((url) => (window as unknown as { artworkResources: Set<string> }).artworkResources.has(url!)), [oldUrl, refreshUrl, nextUrl])).toEqual([true, false, true]);
  await expect(page.getByTestId('backdrop').last()).toHaveClass(/loaded/);
  await clock.runFor(400);
  expect(await page.evaluate((urls) => urls.map((url) => (window as unknown as { artworkResources: Set<string> }).artworkResources.has(url!)), [oldUrl, refreshUrl, nextUrl])).toEqual([false, false, true]);
});

test('stale idle prefetch finishes delayed validation and persists freshness before releasing demand', async ({ app, api, cdn, page, remote, clock }) => {
  const items = fakeItems(1450, 30);
  const prefetched = items.slice(8, 10);
  for (const item of prefetched) cdn.respond(item.posters.medium, { headers: { 'cache-control': 'max-age=0', etag: '"one"' } });
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: items, popular: [] });
  await clock.pause(); await app.open(); await remote.press('down');
  await clock.runFor(300);
  for (const item of prefetched) await expect.poll(() => cdn.requests.filter((r) => r.source === item.posters.medium).length).toBe(1);
  for (const item of prefetched) cdn.respond(item.posters.medium, { headers: { 'cache-control': 'max-age=3600', etag: '"one"' }, conditional: true, delay: 500 });
  await page.reload(); await remote.press('down'); await clock.runFor(300);
  for (const item of prefetched) await expect.poll(() => cdn.transfers.filter((r) => r.source === item.posters.medium).map((r) => r.status)).toEqual([200, 304]);
  await clock.settle();
  await page.reload(); await remote.press('down'); await clock.runFor(300);
  for (const item of prefetched) expect(cdn.requests.filter((r) => r.source === item.posters.medium)).toHaveLength(2);
});

test('landscape artwork and previews use managed URLs and share wide bytes with backdrops', async ({ app, api, cdn, page, remote }) => {
  const items = fakeItems(810, 3);
  fakeHome(api, { hot: [items[0]!], movies: items, serials: [], fresh: [], popular: [] });
  await app.open();
  await expect(page.locator('.card--landscape img').first()).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('.frosted__image')).toHaveAttribute('src', /^blob:/);
  await expect(page.getByTestId('backdrop').last()).toHaveAttribute('src', /^blob:/);
  expect(cdn.requests.filter((r) => r.source === items[0]!.posters.wide)).toHaveLength(1);
  await remote.press('down', 'down');
  await expect(app.focused).toHaveClass(/card/);
});

test('focus settles for 200 ms; slow obsolete sharp completions cannot replace the current title', async ({ app, api, cdn, page, remote, clock }) => {
  const items = fakeItems(820, 4);
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: items, popular: [] });
  cdn.respond(items[0]!.posters.wide!, { delay: 900 });
  await clock.pause();
  await app.open();
  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Фильм 820');
  await clock.runFor(199);
  expect(cdn.requested.filter((path) => path.startsWith('/wide/'))).toEqual([]);
  await clock.runFor(1);
  await expect.poll(() => cdn.requested.includes('/wide/820.jpg')).toBe(true);
  await remote.press('right');
  await clock.runFor(100);
  await remote.press('right');
  await clock.runFor(199);
  expect(cdn.requested).not.toContain('/wide/821.jpg');
  expect(cdn.requested).not.toContain('/wide/822.jpg');
  await clock.runFor(1);
  const current = page.getByTestId('backdrop').last();
  await expect(current).toHaveAttribute('data-source', items[2]!.posters.wide!);
  await expect(current).toHaveJSProperty('naturalWidth', 16);
  // Let the obsolete server response arrive after the new image, without moving the app's clock.
  await expect.poll(() => cdn.active).toBe(0);
  await clock.runFor(500);
  await expect(page.getByTestId('backdrop')).toHaveCount(1);
  await expect(current).toHaveAttribute('data-source', items[2]!.posters.wide!);
  await expect(app.focused).toHaveAccessibleName('Фильм 822');
});

test('visible windows download first, idle prefetch is capped at two and stops offline', async ({ app, api, cdn, page, remote, clock }) => {
  const items = fakeItems(840, 70);
  for (const item of items) cdn.respond(item.posters.medium, { delay: 60 });
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: items, popular: [] });
  await clock.pause();
  await app.open();
  await remote.press('down');
  const posters = () => cdn.requested.filter((path) => path.endsWith('/medium.jpg'));
  await expect.poll(() => posters().length).toBe(8);
  await expect.poll(() => cdn.active).toBe(0);
  await clock.runFor(149);
  expect(posters()).toHaveLength(8);
  await clock.runFor(1);
  await expect.poll(() => posters().length).toBe(10);
  await clock.runFor(2000);
  expect(posters()).toHaveLength(10);
  expect(cdn.peakActive).toBeLessThanOrEqual(2);
  // Move beyond the downloaded window offline: visible demand remains allowed, speculative demand stops.
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await remote.press('right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right');
  await clock.runFor(1000);
  await expect(app.focused).toHaveAccessibleName('Фильм 852');
  await clock.runFor(3000);
  // These are beyond the clipped visible window at this focus position, so only speculation can ask for them.
  expect(cdn.requested).not.toContain('/poster/859/medium.jpg');
  expect(cdn.requested).not.toContain('/poster/860/medium.jpg');
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await clock.runFor(300);
  await expect.poll(() => cdn.requested.includes('/poster/859/medium.jpg')).toBe(true);
  await expect.poll(() => cdn.requested.includes('/poster/860/medium.jpg')).toBe(true);
});

test('episode thumbnails share persistent reuse and pending idle work is suspended during playback', async ({ app, api, cdn, page, remote, clock, player }) => {
  const series = fakeSeries(930, 'Сериал', [Array.from({ length: 30 }, (_, i) => `Эпизод ${i + 1}`)]);
  const episodes = series.seasons![0]!.episodes;
  fakeHome(api, { hot: [series], movies: [], serials: [], fresh: [], popular: [] });
  await clock.pause();
  await app.open();
  await remote.press('down', 'ok');
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  await expect(app.focused).toHaveAccessibleName('Смотреть S1 · E1');
  await remote.press('down', 'down');
  await expect(app.focused).toHaveAccessibleName('1. Эпизод 1');
  await expect(page.locator('.card--landscape img').first()).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => cdn.requests.filter((r) => r.source.includes('/thumb/')).length).toBe(5);
  await remote.press('ok');
  await expect.poll(() => player.state()).toBe('playing');
  await clock.runFor(2000);
  expect(cdn.requests.filter((r) => r.source.includes('/thumb/'))).toHaveLength(5);
  await remote.press('stop');
  await expect(app.focused).toHaveAccessibleName('1. Эпизод 1');
  await clock.runFor(300);
  // Session-compressed bytes also survive playback unmounting the title during admission.
  await expect.poll(() => cdn.requests.filter((r) => r.source.includes('/thumb/')).length).toBe(7);
  expect(cdn.requests.filter((r) => r.source === episodes[0]!.thumbnail)).toHaveLength(1);
  for (const image of await page.locator('.card--landscape img[src]').all()) await expect(image).toHaveAttribute('src', /^blob:/);
});

test('repeated navigation releases offscreen and outgoing resources with at most two sharp layers', async ({ app, api, cdn, page, remote }) => {
  // Narrow browser resource seam: observe object-URL lifetime, not cache internals or hook calls.
  await page.addInitScript(() => {
    const live = new Set<string>();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const url = create(blob); live.add(url); return url; };
    URL.revokeObjectURL = (url) => { live.delete(url); revoke(url); };
    Object.assign(window, { artworkResources: live });
  });
  const items = fakeItems(960, 50);
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: items, popular: [] });
  await app.open();
  await remote.press('down');
  await expect(page.getByTestId('backdrop').last()).toHaveAttribute('data-source', items[0]!.posters.wide!);
  const firstUrl = await page.locator('.card img').first().getAttribute('src');
  for (let i = 0; i < 16; i++) {
    await remote.press('right');
    await expect(page.getByTestId('backdrop').last()).toHaveAttribute('data-source', items[i + 1]!.posters.wide!);
    expect(await page.getByTestId('backdrop').count()).toBeLessThanOrEqual(2);
  }
  await expect.poll(() => page.evaluate((url) => (window as unknown as { artworkResources: Set<string> }).artworkResources.has(url!), firstUrl)).toBe(false);
  await expect(page.getByTestId('backdrop')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const live = (window as unknown as { artworkResources: Set<string> }).artworkResources;
    const displayed = new Set([...document.images].map((image) => image.src).filter((src) => src.startsWith('blob:')));
    return [...live].filter((url) => !displayed.has(url)).length;
  })).toBe(0);
  await expect(app.focused.locator('img')).toHaveJSProperty('naturalWidth', 16);
  // Earlier offscreen speculation may be cancelled and reacquired while scrolling.
  // Revisit must reuse the now-displayed poster without another download.
  const posterRequests = () => cdn.requests.filter((r) => r.source === items[16]!.posters.medium).length;
  const beforeRevisit = posterRequests();
  expect(beforeRevisit).toBeGreaterThan(0);
  await remote.press('ok');
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('Фильм 976');
  await expect(app.focused.locator('img')).toHaveJSProperty('naturalWidth', 16);
  expect(posterRequests()).toBe(beforeRevisit);
});

test('catalog grid limits artwork to the clipped viewport plus two directional neighbors', async ({ app, api, cdn, remote, clock }) => {
  const items = fakeItems(1050, 100);
  fakeCatalog(api, { items: () => items });
  await clock.pause();
  await app.open();
  await remote.press('right', 'down');
  await expect(app.focused).toHaveClass(/card/);
  await clock.runFor(1000);
  // Storage/decoding and IntersectionObserver delivery aren't driven by the fake
  // timer. Wait for the visible window, rather than snapshotting a partial queue.
  await expect.poll(() => cdn.requested.filter((path) => path.startsWith('/poster/10') && path.endsWith('/medium.jpg')).length).toBeGreaterThan(8);
  const posters = cdn.requested.filter((path) => path.startsWith('/poster/10') && path.endsWith('/medium.jpg'));
  // Two full rows and a clipped third row, plus two directional neighbors.
  expect(posters.length).toBeLessThanOrEqual(26);
  expect(posters.length).toBeGreaterThan(8);
  expect(cdn.requested).not.toContain('/poster/1075/medium.jpg');
  await remote.press('channelDown');
  await clock.runFor(1000);
  await expect(app.focused).toHaveClass(/card/);
  expect(cdn.requested).not.toContain('/poster/1090/medium.jpg');
});

test('reversing direction cancels obsolete queued speculation and only warms two nearby cards', async ({ app, api, cdn, remote, clock }) => {
  const items = fakeItems(1200, 60);
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: items, popular: [] });
  await clock.pause();
  await app.open();
  await remote.press('down');
  await remote.repeat('right', 20);
  await expect(app.focused).toHaveAccessibleName('Фильм 1220');
  await clock.runFor(100);
  await remote.press('left');
  await expect(app.focused).toHaveAccessibleName('Фильм 1219');
  await clock.runFor(1000);
  // Forward speculation at focus 20 would ask for 1227/1228. Reversing before idle cancels it.
  expect(cdn.requested).not.toContain('/poster/1228/medium.jpg');
  await clock.runFor(5000);
  expect(cdn.requested).not.toContain('/poster/1228/medium.jpg');
  expect(cdn.requested).not.toContain('/poster/1229/medium.jpg');
});

test('failed artwork preserves title placeholders, existing backdrop and remote focus', async ({ app, api, cdn, page, remote }) => {
  const items = fakeItems(1300, 3);
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: items, popular: [] });
  cdn.respond(items[1]!.posters.medium, { status: 500 });
  cdn.respond(items[1]!.posters.small, { contentType: 'text/html', body: 'unavailable' });
  cdn.respond(items[1]!.posters.wide!, { status: 500 });
  await app.open();
  await remote.press('down');
  await expect(page.getByTestId('backdrop').last()).toHaveClass(/loaded/);
  const retained = await page.getByTestId('backdrop').last().getAttribute('src');
  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('Фильм 1301');
  await expect.poll(() => cdn.requested.includes('/wide/1301.jpg')).toBe(true);
  await expect.poll(() => cdn.active).toBe(0);
  await expect(app.focused.locator('.card__fallback')).toHaveText('Фильм 1301');
  await expect(app.focused.locator('img')).not.toHaveAttribute('src');
  await expect(page.getByTestId('backdrop').last()).toHaveAttribute('src', retained!);
  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('Фильм 1302');
  await expect(page.getByTestId('backdrop').last()).toHaveAttribute('data-source', items[2]!.posters.wide!);
});
