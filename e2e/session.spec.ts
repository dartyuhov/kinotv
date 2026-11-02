import type { Page } from '@playwright/test';
import { CLIENT_QUERY, pauseClock, tokens } from './harness/auth';
import type { FakeApi, FakeResponse } from './harness/fakeApi';
import { expect, SEEDED_SESSION, test } from './harness/test';

const homeTab = (page: Page) => page.getByRole('tab', { name: 'Главная' });
const refreshes = (api: FakeApi) => api.requestsTo('POST', '/oauth2/token');
const tokensSentTo = (api: FakeApi, method: string, path: string) =>
  api.requestsTo(method, path).map((r) => r.query.access_token);

/** Answers after `ms` of real time, so other requests can start while this one is in flight. */
const slowly =
  (ms: number, response: FakeResponse): (() => Promise<FakeResponse>) =>
  () =>
    new Promise((resolve) => setTimeout(() => resolve(response), ms));

test.describe('token refresh', () => {
  test('the access token is refreshed 5 minutes before it expires, and the new tokens are kept', async ({ app, api, page }) => {
    api.on('POST', '/oauth2/token', tokens(2));
    await pauseClock(page);
    await app.open({ expiresIn: 3600 }); // the clock is paused 1 s after the token was issued

    await page.clock.runFor(3_298_000); // 1 s before the 55-minute mark
    expect(refreshes(api)).toHaveLength(0);
    await page.clock.runFor(2_000);
    await expect.poll(() => refreshes(api).length).toBe(1);
    expect(refreshes(api)[0]!.query).toEqual({
      grant_type: 'refresh_token',
      refresh_token: SEEDED_SESSION.refreshToken,
      ...CLIENT_QUERY,
    });

    // The rotated tokens were saved: after a restart the app uses them.
    await page.reload();
    await expect(homeTab(page)).toBeVisible();
    await expect.poll(() => tokensSentTo(api, 'POST', '/v1/device/notify')).toEqual([SEEDED_SESSION.accessToken, 'access-2']);
  });

  test('requests made while a refresh is in flight share it: one refresh call, all sent with the new token', async ({
    app,
    api,
  }) => {
    api.on('POST', '/oauth2/token', slowly(300, tokens(2)));
    await app.open({ expiresIn: 120 }); // inside the 5-minute window at launch

    // A session start makes two requests at once: the device check-in and the account.
    await expect.poll(() => tokensSentTo(api, 'POST', '/v1/device/notify')).toEqual(['access-2']);
    await expect.poll(() => tokensSentTo(api, 'GET', '/v1/user')).toEqual(['access-2']);
    expect(refreshes(api)).toHaveLength(1);
  });
});
