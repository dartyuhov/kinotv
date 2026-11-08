import { fakeHome, fakeItem } from './harness/catalog';
import { solidPng } from './harness/fakeCdn';
import { expect, test } from './harness/test';

for (const fallback of [false, true]) {
  test(`4K artwork is bounded and persisted at 1080p${fallback ? ' without ImageBitmap' : ''}`, async ({ app, api, cdn, page }) => {
    if (fallback) await page.addInitScript(() => { Object.defineProperty(globalThis, 'createImageBitmap', { value: undefined }); });
    const item = fakeItem(91_000);
    fakeHome(api, { hot: [item], fresh: [], popular: [], movies: [], serials: [] });
    cdn.respond(item.posters.wide!, { body: solidPng([80, 90, 100], 3840, 2160) });
    await app.open();
    const image = page.getByTestId('backdrop').last();
    await expect(image).toHaveJSProperty('naturalWidth', 1920);
    await expect(image).toHaveJSProperty('naturalHeight', 1080);
    await page.reload();
    await expect(image).toHaveJSProperty('naturalWidth', 1920);
    expect(cdn.requests.filter((request) => request.source === item.posters.wide)).toHaveLength(1);
  });
}

test('rejects a pixel bomb before asking the browser to decode it', async ({ app, api, cdn, page }) => {
  const item = fakeItem(91_001);
  fakeHome(api, { hot: [item], fresh: [], popular: [], movies: [], serials: [] });
  const header = solidPng([0, 0, 0]).subarray(0, 24);
  header.writeUInt32BE(100_000, 16);
  header.writeUInt32BE(100_000, 20);
  cdn.respond(item.posters.wide!, { body: header });
  await page.addInitScript(() => {
    const create = URL.createObjectURL;
    (globalThis as typeof globalThis & { largeDecodeAttempts: number }).largeDecodeAttempts = 0;
    URL.createObjectURL = (blob) => {
      if (blob instanceof Blob && blob.size === 24) (globalThis as typeof globalThis & { largeDecodeAttempts: number }).largeDecodeAttempts++;
      return create(blob);
    };
  });
  await app.open();
  await expect.poll(() => cdn.transfers.some((request) => request.source === item.posters.wide)).toBe(true);
  await expect(page.getByTestId('backdrop')).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { largeDecodeAttempts: number }).largeDecodeAttempts)).toBe(0);
});
