import type { Page } from '@playwright/test';
import { FAKE_CLIENT, type FakeApi, type FakeResponse, type RecordedRequest } from './harness/fakeApi';
import { expect, test, TEST_START_TIME } from './harness/test';

const CLIENT_QUERY = { client_id: FAKE_CLIENT.id, client_secret: FAKE_CLIENT.secret };
const PENDING: FakeResponse = { status: 400, json: { error: 'authorization_pending' } };

function deviceCode(n: number, overrides: Record<string, unknown> = {}): FakeResponse {
  return {
    json: {
      code: `device-code-${n}`,
      user_code: `CODE${n}`,
      verification_uri: 'https://kino.pub/device',
      expires_in: 300,
      interval: 5,
      ...overrides,
    },
  };
}

function tokens(n: number, expiresIn = 3600): FakeResponse {
  return {
    json: { access_token: `access-${n}`, token_type: 'bearer', expires_in: expiresIn, refresh_token: `refresh-${n}`, scope: null },
  };
}

/**
 * The kino.watch device flow on POST /oauth2/device. Codes are handed out as CODE1, CODE2, …;
 * `poll` answers each device_token poll (pending until the test says otherwise).
 */
function fakeDeviceFlow(api: FakeApi, poll: (req: RecordedRequest) => FakeResponse = () => PENDING) {
  let issued = 0;
  api.on('POST', '/oauth2/device', (req) => (req.query.grant_type === 'device_code' ? deviceCode(++issued) : poll(req)));
  return {
    codeRequests: () => api.requestsTo('POST', '/oauth2/device').filter((r) => r.query.grant_type === 'device_code'),
    polls: () => api.requestsTo('POST', '/oauth2/device').filter((r) => r.query.grant_type === 'device_token'),
  };
}

/** Stops the clock just after launch, so the test decides when poll and expiry timers fire. */
async function pauseClock(page: Page): Promise<void> {
  await page.clock.pauseAt(TEST_START_TIME.getTime() + 1000);
}

const signInHeading = (page: Page) => page.getByRole('heading', { name: 'Вход в KinoTV' });
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
