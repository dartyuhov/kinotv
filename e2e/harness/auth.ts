import type { Page } from '@playwright/test';
import { FAKE_CLIENT, type FakeApi, type FakeResponse, type RecordedRequest } from './fakeApi';
import { expect, type App, type Clock } from './test';

// kino.watch's OAuth endpoints, faked. Most journeys don't need these: `app.open()` starts signed in.

/** The client credentials every OAuth request carries in its query string. */
export const CLIENT_QUERY = { client_id: FAKE_CLIENT.id, client_secret: FAKE_CLIENT.secret };

/** The device_token answer while the viewer hasn't approved the code yet. */
export const PENDING: FakeResponse = { status: 400, json: { error: 'authorization_pending' } };

/** Device code number `n`: user code `CODE<n>`, 300 s lifetime, 5 s polling interval. */
export function deviceCode(n: number, overrides: Record<string, unknown> = {}): FakeResponse {
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

/** A token response: `access-<n>` / `refresh-<n>`. */
export function tokens(n: number, expiresIn = 3600): FakeResponse {
  return {
    json: { access_token: `access-${n}`, token_type: 'bearer', expires_in: expiresIn, refresh_token: `refresh-${n}`, scope: null },
  };
}

/**
 * The device flow on POST /oauth2/device. Codes are handed out as CODE1, CODE2, …;
 * `poll` answers each device_token poll (pending unless the test says otherwise).
 */
export function fakeDeviceFlow(api: FakeApi, poll: (req: RecordedRequest) => FakeResponse = () => PENDING) {
  let issued = 0;
  api.on('POST', '/oauth2/device', (req) => (req.query.grant_type === 'device_code' ? deviceCode(++issued) : poll(req)));
  return {
    codeRequests: () => api.requestsTo('POST', '/oauth2/device').filter((r) => r.query.grant_type === 'device_code'),
    polls: () => api.requestsTo('POST', '/oauth2/device').filter((r) => r.query.grant_type === 'device_token'),
  };
}

/** Stops the page clock one second after TEST_START_TIME, so the test decides when timers fire. */
export const signInHeading = (page: Page) => page.getByRole('heading', { name: 'Вход в KinoTV' });

/** Launches signed out and signs in through the device flow, ending on Home with tokens `access-1` / `refresh-1`. */
export async function signInWithCode(app: App, api: FakeApi, clock: Clock, page: Page): Promise<void> {
  fakeDeviceFlow(api, () => tokens(1));
  await clock.pause();
  await app.open({ signedIn: false });
  await expect(page.getByText('CODE1')).toBeVisible();
  await clock.runFor(5_000);
  await expect(page.getByRole('tab', { name: 'Главная' })).toBeVisible();
}
