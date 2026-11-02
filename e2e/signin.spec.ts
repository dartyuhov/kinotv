import type { Page } from '@playwright/test';
import pkg from '../package.json' with { type: 'json' };
import {
  CLIENT_QUERY,
  fakeDeviceFlow,
  pauseClock,
  PENDING,
  signInHeading,
  signInWithCode,
  tokens,
} from './harness/auth';
import type { FakeResponse } from './harness/fakeApi';
import { expect, test } from './harness/test';

const homeTab = (page: Page) => page.getByRole('tab', { name: 'Главная' });

test('a fresh launch shows the code, address and QR code; approving it leads to Home without key presses', async ({
  app,
  api,
  page,
}) => {
  let approved = false;
  const flow = fakeDeviceFlow(api, () => (approved ? tokens(1) : PENDING));
  await pauseClock(page);
  await app.open({ signedIn: false });

  await expect(signInHeading(page)).toBeVisible();
  await expect(page.getByText('CODE1')).toBeVisible();
  // The server still names the old kino.pub host, which no longer resolves.
  await expect(page.getByText('kino.watch/device')).toBeVisible();
  await expect(page.getByRole('img', { name: 'QR-код: https://kino.watch/device' })).toBeVisible();
  await expect(homeTab(page)).toBeHidden();
  expect(flow.codeRequests()).toEqual([
    expect.objectContaining({ query: { grant_type: 'device_code', ...CLIENT_QUERY } }),
  ]);

  // Polls at the server's interval while the code waits for approval.
  await page.clock.runFor(4_900);
  expect(flow.polls()).toHaveLength(0);
  await page.clock.runFor(100);
  await expect.poll(() => flow.polls().length).toBe(1);
  expect(flow.polls()[0]!.query).toEqual({ grant_type: 'device_token', code: 'device-code-1', ...CLIENT_QUERY });

  approved = true;
  await page.clock.runFor(5_000);

  await expect(homeTab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(app.focused).toHaveAccessibleName('Главная');
  await expect(signInHeading(page)).toBeHidden();
});

test.describe('an expired code is replaced automatically', () => {
  test('when its lifetime runs out', async ({ app, api, page }) => {
    const flow = fakeDeviceFlow(api);
    await pauseClock(page);
    await app.open({ signedIn: false });
    await expect(page.getByText('CODE1')).toBeVisible();

    await page.clock.runFor(299_000);
    await expect(page.getByText('CODE1')).toBeVisible();
    await page.clock.runFor(1_000);

    await expect(page.getByText('CODE2')).toBeVisible();
    await expect(page.getByText('CODE1')).toBeHidden();
    expect(flow.codeRequests()).toHaveLength(2);

    // Polling carries on with the new code.
    const before = flow.polls().length;
    await page.clock.runFor(5_000);
    await expect.poll(() => flow.polls().length).toBe(before + 1);
    expect(flow.polls()[flow.polls().length - 1]!.query.code).toBe('device-code-2');
  });

  test('when the server rejects a poll with anything but "pending"', async ({ app, api, page }) => {
    const flow = fakeDeviceFlow(api, () => ({ status: 400, json: { error: 'code_expired' } }));
    await pauseClock(page);
    await app.open({ signedIn: false });
    await expect(page.getByText('CODE1')).toBeVisible();

    await page.clock.runFor(5_000);

    await expect(page.getByText('CODE2')).toBeVisible();
    expect(flow.codeRequests()).toHaveLength(2);
  });
});

test('"slow_down" keeps the code and stretches the polling interval by 5 s', async ({ app, api, page }) => {
  let answer: FakeResponse = { status: 400, json: { error: 'slow_down' } };
  const flow = fakeDeviceFlow(api, () => answer);
  await pauseClock(page);
  await app.open({ signedIn: false });

  await page.clock.runFor(5_000);
  await expect.poll(() => flow.polls().length).toBe(1);
  answer = PENDING;

  await page.clock.runFor(9_900);
  expect(flow.polls()).toHaveLength(1);
  await page.clock.runFor(100);
  await expect.poll(() => flow.polls().length).toBe(2);
  await expect(page.getByText('CODE1')).toBeVisible();
  expect(flow.codeRequests()).toHaveLength(1);
});

test('if no code can be had, the screen says so and OK retries', async ({ app, api, page, remote }) => {
  api.on('POST', '/oauth2/device', { status: 503, json: {} });
  await app.open({ signedIn: false });

  await expect(page.getByText('Не удалось получить код для входа', { exact: false })).toBeVisible();
  await expect(app.focused).toHaveAccessibleName('Повторить');

  fakeDeviceFlow(api);
  await remote.press('ok');
  await expect(page.getByText('CODE1')).toBeVisible();
  await expect(app.focused).toHaveAccessibleName('Получить новый код');
});

test('after sign-in the TV registers itself once, as "KinoTV · <model>" with its versions', async ({ app, api, page }) => {
  await signInWithCode(app, api, page);

  await expect.poll(() => api.requestsTo('POST', '/v1/device/notify').length).toBe(1);
  await page.clock.runFor(60_000);
  const notifies = api.requestsTo('POST', '/v1/device/notify');
  expect(notifies).toHaveLength(1);
  // In the browser the platform has no TV model; on the TV it is the real model, e.g. "QE65Q60CAUXXC".
  expect(notifies[0]).toEqual(
    expect.objectContaining({
      query: { access_token: 'access-1' },
      body: { title: 'KinoTV · Browser', hardware: 'Browser', software: `Browser / KinoTV ${pkg.version}` },
    }),
  );
});

test('restarting the app with a stored session goes straight to Home', async ({ app, api, page }) => {
  await signInWithCode(app, api, page);
  const codeRequests = api.requestsTo('POST', '/oauth2/device').length;

  await page.reload();

  await expect(homeTab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(app.focused).toHaveAccessibleName('Главная');
  await expect(signInHeading(page)).toBeHidden();
  expect(api.requestsTo('POST', '/oauth2/device')).toHaveLength(codeRequests);
  // The restored session is the one from sign-in: the TV checks in with its token.
  await expect.poll(() => api.requestsTo('POST', '/v1/device/notify').map((r) => r.query.access_token)).toEqual([
    'access-1',
    'access-1',
  ]);
});
