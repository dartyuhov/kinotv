import type { Page } from '@playwright/test';
import { CLIENT_QUERY, fakeDeviceFlow, pauseClock, PENDING, signInHeading, tokens } from './harness/auth';
import { FAKE_USER, type FakeApi, type FakeResponse, type RecordedRequest } from './harness/fakeApi';
import type { Remote } from './harness/remote';
import { expect, SEEDED_SESSION, test, type App } from './harness/test';

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

/** Answers 401 to any token but `valid`, like kino.watch does for a revoked or expired token. */
const acceptsOnly =
  (valid: string, ok: FakeResponse): ((req: RecordedRequest) => FakeResponse) =>
  (req) =>
    req.query.access_token === valid ? ok : { status: 401, json: { status: 401, error: 'unauthorized' } };

test.describe('a 401 from the API', () => {
  test('is refreshed once and the requests are retried with the new token; the viewer notices nothing', async ({
    app,
    api,
    page,
  }) => {
    api.on('POST', '/oauth2/token', slowly(300, tokens(2)));
    api.on('POST', '/v1/device/notify', acceptsOnly('access-2', { json: { status: 200 } }));
    api.on('GET', '/v1/user', acceptsOnly('access-2', { json: { status: 200, user: FAKE_USER } }));
    await app.open();

    await expect.poll(() => tokensSentTo(api, 'GET', '/v1/user')).toEqual([SEEDED_SESSION.accessToken, 'access-2']);
    await expect.poll(() => tokensSentTo(api, 'POST', '/v1/device/notify')).toEqual([SEEDED_SESSION.accessToken, 'access-2']);
    expect(refreshes(api)).toHaveLength(1);
    await expect(homeTab(page)).toBeVisible();
    await expect(signInHeading(page)).toBeHidden();
  });

  test('that refreshing cannot fix shows Sign-in, then returns to the screen the viewer was on', async ({
    app,
    api,
    page,
    remote,
  }) => {
    let approved = false;
    fakeDeviceFlow(api, () => (approved ? tokens(1) : PENDING));
    await pauseClock(page);
    await app.open();
    await remote.repeat('right', 8);
    await expect(app.focused).toHaveAccessibleName('Настройки');
    await expect(page.getByText(`Аккаунт: ${FAKE_USER.username}`)).toBeVisible();

    // The token is revoked on the server, and so is the refresh token.
    api.on('GET', '/v1/user', acceptsOnly('access-1', { json: { status: 200, user: FAKE_USER } }));
    api.on('POST', '/oauth2/token', { status: 400, json: { error: 'invalid_grant' } });
    await remote.press('left', 'right'); // re-opening Settings re-checks the account

    await expect(signInHeading(page)).toBeVisible();
    await expect(page.getByText('CODE1')).toBeVisible();
    expect(refreshes(api)).toHaveLength(1);

    approved = true;
    await page.clock.runFor(5_000);

    await expect(page.getByRole('tab', { name: 'Настройки' })).toHaveAttribute('aria-selected', 'true');
    await expect(app.focused).toHaveAccessibleName('Настройки');
    await expect(page.getByText(`Аккаунт: ${FAKE_USER.username}`)).toBeVisible();
    expect(tokensSentTo(api, 'GET', '/v1/user')).toContain('access-1');
  });
});

test.describe('Sign out on Settings', () => {
  test.beforeEach(async ({ api }) => {
    api.on('POST', '/v1/device/unlink', { json: { status: 200 } });
  });

  async function signOut(app: App, remote: Remote) {
    await remote.repeat('right', 8);
    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('Выйти из аккаунта');
    await remote.press('ok');
  }

  test('ends the session for good and shows Sign-in', async ({ app, api, page, remote }) => {
    fakeDeviceFlow(api);
    await app.open();
    await signOut(app, remote);

    await expect(signInHeading(page)).toBeVisible();
    await expect(page.getByText('CODE1')).toBeVisible();
    // The TV leaves the account's device list too.
    expect(tokensSentTo(api, 'POST', '/v1/device/unlink')).toEqual([SEEDED_SESSION.accessToken]);

    await page.reload();
    await expect(signInHeading(page)).toBeVisible();
    await expect(homeTab(page)).toBeHidden();
  });

  test('signing in again starts on Home, not where the previous viewer left off', async ({ app, api, page, remote }) => {
    let approved = false;
    fakeDeviceFlow(api, () => (approved ? tokens(1) : PENDING));
    await pauseClock(page);
    await app.open();
    await signOut(app, remote);
    await expect(page.getByText('CODE1')).toBeVisible();

    approved = true;
    await page.clock.runFor(5_000);

    await expect(homeTab(page)).toHaveAttribute('aria-selected', 'true');
    await expect(app.focused).toHaveAccessibleName('Главная');
  });
});
