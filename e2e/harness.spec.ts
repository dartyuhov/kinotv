import { expect, test, TEST_START_TIME } from './harness/test';

// The harness is shared by every journey test, so its own contract is pinned here.

test('the fake API answers on the configured base URL and records each request', async ({ app, api, page }) => {
  api.on('POST', '/oauth2/device', { json: { code: 'fake-device-code' } });
  await app.open();

  const response = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/oauth2/device?lang=ru`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
      body: JSON.stringify({ grant_type: 'device_code' }),
    });
    return { status: res.status, body: await res.json() };
  }, api.baseUrl);

  expect(response).toEqual({ status: 200, body: { code: 'fake-device-code' } });
  expect(api.requestsTo('POST', '/oauth2/device')).toEqual([
    expect.objectContaining({
      query: { lang: 'ru' },
      body: { grant_type: 'device_code' },
      headers: expect.objectContaining({ authorization: 'Bearer test-token' }),
    }),
  ]);
});

test('a request with no fake route gets a 501 and is listed as unhandled', async ({ app, api, page }) => {
  await app.open();
  const status = await page.evaluate(async (base) => (await fetch(`${base}/v1/unknown`)).status, api.baseUrl);

  expect(status).toBe(501);
  expect(api.unhandled.map((r) => r.path)).toEqual(['/v1/unknown']);
  api.unhandled.length = 0; // otherwise the fixture fails this test, which is its job in real journeys
});

test('the page clock starts at a fixed time and only moves timers when told to', async ({ app, page }) => {
  await app.open();
  const pausedAt = TEST_START_TIME.getTime() + 60_000;
  await page.clock.pauseAt(pausedAt);

  await page.evaluate(() => {
    setTimeout(() => ((window as { firedAt?: number }).firedAt = Date.now()), 30_000);
  });
  await page.clock.runFor(29_999);
  expect(await page.evaluate(() => (window as { firedAt?: number }).firedAt)).toBeUndefined();

  await page.clock.runFor(1);
  expect(await page.evaluate(() => (window as { firedAt?: number }).firedAt)).toBe(pausedAt + 30_000);
});
