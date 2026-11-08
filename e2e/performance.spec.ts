import type { CDPSession, Page } from '@playwright/test';
import { fakeFilm, fakeHome, fakeItems } from './harness/catalog';
import { solidPng } from './harness/fakeCdn';
import { expect, test } from './harness/test';

// Opt-in: timings must run alone, rather than compete with the journey suite.
test.skip(!process.env.KINOTV_BENCH, 'Run with KINOTV_BENCH=1 and --workers=1');

async function sample(page: Page, cdp: CDPSession, name: string) {
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const values = Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
  const dom = await page.evaluate(() => {
    const images = [...document.images].filter((image) => image.src && image.naturalWidth);
    const unique = new Map(images.map((image) => [image.currentSrc, image.naturalWidth * image.naturalHeight * 4]));
    return {
      elements: document.querySelectorAll('*').length,
      images: images.length,
      // Lower bound, not process RSS: excludes decoder scratch space, GPU copies and browser caches.
      decodedImageBytes: [...unique.values()].reduce((sum, bytes) => sum + bytes, 0),
      largestImagePixels: Math.max(0, ...images.map((image) => image.naturalWidth * image.naturalHeight)),
    };
  });
  return { name, ...dom, heapBytes: values.JSHeapUsedSize, nodes: values.Nodes,
    listeners: values.JSEventListeners, layoutCount: values.LayoutCount,
    layoutSeconds: values.LayoutDuration, scriptSeconds: values.ScriptDuration, taskSeconds: values.TaskDuration };
}

test('realistic artwork and repeated remote browsing benchmark', async ({ app, api, cdn, page, remote }, info) => {
  test.setTimeout(180_000);
  const items = fakeItems(80_000, 100);
  fakeHome(api, { hot: [items[0]!], fresh: items, popular: items.slice().reverse(), movies: [], serials: [] });
  const wide = solidPng([70, 90, 120], 3840, 2160);
  const big = solidPng([80, 100, 130], 500, 750);
  const medium = solidPng([80, 100, 130], 250, 375);
  for (const item of items) {
    cdn.respond(item.posters.wide!, { body: wide });
    cdn.respond(item.posters.big, { body: big });
    cdn.respond(item.posters.medium, { body: medium });
  }
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const start = Date.now();
  await app.open();
  await expect(page.getByTestId('backdrop').last()).toHaveClass(/loaded/);
  await expect(page.locator('.card img[src]').first()).toHaveJSProperty('complete', true);
  const startupMs = Date.now() - start;
  const samples = [await sample(page, cdp, 'home')];
  const warmStart = Date.now();
  await page.reload();
  await expect(page.getByTestId('backdrop').last()).toHaveClass(/loaded/);
  const warmStartupMs = Date.now() - warmStart;
  await remote.press('down', 'down');
  const moves: number[] = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let i = 0; i < 20; i++) {
      const start = Date.now();
      await remote.press('right');
      await expect(app.focused).toHaveAccessibleName(`Фильм ${80_000 + cycle * 20 + i + 1}`);
      moves.push(Date.now() - start);
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(800);
    samples.push(await sample(page, cdp, `browse-${cycle + 1}`));
    await remote.press('ok');
    await expect(page.locator('.title-page')).toBeVisible();
    await page.waitForTimeout(700);
    samples.push(await sample(page, cdp, `title-${cycle + 1}`));
    await remote.press('back');
    await expect(page.locator('[data-row="home:row:fresh"]')).toBeVisible();
  }
  await remote.press('up', 'up', 'right');
  await expect(app.focused).toHaveAccessibleName('Фильмы');
  await page.waitForTimeout(1000);
  samples.push(await sample(page, cdp, 'catalog-after-browsing'));
  expect(errors).toEqual([]);
  moves.sort((a, b) => a - b);
  if (process.env.KINOTV_PERF_BUDGETS) {
    expect(Math.max(...samples.map((sample) => sample.decodedImageBytes))).toBeLessThan(16 * 1024 * 1024);
    expect(Math.max(...samples.map((sample) => sample.largestImagePixels))).toBeLessThanOrEqual(1920 * 1080);
  }
  const result = { cpuThrottle: 4, startupMs, warmStartupMs, navigationP50Ms: moves[Math.floor(moves.length * .5)],
    navigationP95Ms: moves[Math.floor(moves.length * .95)], downloads: cdn.requests.length,
    transferredBytes: cdn.transfers.reduce((sum, transfer) => sum + transfer.bytes, 0), samples };
  console.log(JSON.stringify(result, null, 2));
  await info.attach('performance.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});

test('playback UI work and repeated player teardown benchmark', async ({ app, api, page, remote, player, clock }, info) => {
  test.setTimeout(180_000);
  const film = fakeFilm(92_000, 'Benchmark film');
  fakeHome(api, { hot: [film], fresh: [], popular: [], movies: [], serials: [] });
  await clock.pause();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await app.open();
  await remote.press('down', 'ok');
  await expect(page.locator('.title-page')).toBeVisible();
  const samples = [await sample(page, cdp, 'before-playback')];
  const cycles = Number(process.env.KINOTV_STRESS_CYCLES) || 5;
  const teardowns: Awaited<ReturnType<typeof sample>>[] = [];
  for (let cycle = 0; cycle < cycles; cycle++) {
    await remote.press('ok');
    await expect.poll(() => player.state()).toBe('playing');
    await page.evaluate(() => {
      const state = globalThis as typeof globalThis & { playbackMutations: number; playbackObserver?: MutationObserver };
      state.playbackMutations = 0;
      state.playbackObserver = new MutationObserver((records) => { state.playbackMutations += records.length; });
      state.playbackObserver.observe(document.querySelector('.player')!, { subtree: true, attributes: true, characterData: true });
    });
    await clock.runFor(10_000);
    const mutations = await page.evaluate(() => {
      const state = globalThis as typeof globalThis & { playbackMutations: number; playbackObserver: MutationObserver };
      state.playbackObserver.disconnect();
      return state.playbackMutations;
    });
    if (process.env.KINOTV_PERF_BUDGETS) expect(mutations).toBeLessThan(80);
    samples.push({ ...await sample(page, cdp, `playback-${cycle + 1}`), mutations } as typeof samples[number]);
    await remote.press('stop');
    await expect(page.locator('.title-page')).toBeVisible();
    const teardown = await sample(page, cdp, `teardown-${cycle + 1}`);
    samples.push(teardown);
    teardowns.push(teardown);
  }
  const lastTeardown = teardowns[teardowns.length - 1]!;
  if (process.env.KINOTV_PERF_BUDGETS) {
    expect(lastTeardown.listeners).toBeLessThan(180);
    if (cycles >= 20) expect(lastTeardown.heapBytes! - teardowns[Math.floor(cycles / 2)]!.heapBytes!).toBeLessThan(512 * 1024);
  }
  const result = { cpuThrottle: 4, samples };
  console.log(JSON.stringify({ cpuThrottle: 4, cycles, firstTeardown: teardowns[0], lastTeardown,
    tailHeapGrowthBytes: lastTeardown.heapBytes! - teardowns[Math.floor(cycles / 2)]!.heapBytes! }, null, 2));
  await info.attach('playback-performance.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});
