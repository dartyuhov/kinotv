import { APP_VERSION, RELEASES_PATH } from './harness/fakeApi';
import type { Remote } from './harness/remote';
import { expect, test, type App } from './harness/test';

// The app checks the latest GitHub release at launch, at most once a day, and Settings says when a newer
// version is out (spec §11). Each app.open() is a launch. The release endpoint is routed in the fake API
// like the kino.watch API.

/** From Home, along the tab bar to Settings. */
async function goToSettings(app: App, remote: Remote): Promise<void> {
  await remote.repeat('right', 8);
  await expect(app.focused).toHaveAccessibleName('Настройки');
}

test('Settings says an update is available when a newer version is released', async ({ app, api, remote, page }) => {
  api.on('GET', RELEASES_PATH, { json: { tag_name: 'v99.0.0', html_url: 'https://github.com/example/kinotv/releases/tag/v99.0.0' } });

  await app.open();
  await goToSettings(app, remote);

  await expect(page.getByText('Доступно обновление (v99.0.0)')).toBeVisible();
});

test('Settings says nothing about updates when the latest release is this version', async ({ app, api, remote, page }) => {
  api.on('GET', RELEASES_PATH, { json: { tag_name: `v${APP_VERSION}` } });

  await app.open();
  await goToSettings(app, remote);

  await expect.poll(() => api.requestsTo('GET', RELEASES_PATH).length).toBe(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Настройки');
  await expect(page.getByText(/Доступно обновление/)).toHaveCount(0);
});

test('checks at most once a day, and remembers what it found across restarts', async ({ app, api, remote, page }) => {
  api.on('GET', RELEASES_PATH, { json: { tag_name: 'v99.0.0' } });
  // The stored session outlives the day this test skips, so the launch after it needs no token refresh.
  await app.open({ expiresIn: 2 * 24 * 3600 });
  await expect.poll(() => api.requestsTo('GET', RELEASES_PATH).length).toBe(1);

  // Restarted the same day: no new check, but the notice is still there.
  await app.open();
  await goToSettings(app, remote);
  await expect(page.getByText('Доступно обновление (v99.0.0)')).toBeVisible();
  expect(api.requestsTo('GET', RELEASES_PATH)).toHaveLength(1);

  // A day later it checks again.
  await page.clock.fastForward('24:00:01');
  await app.open();
  await expect.poll(() => api.requestsTo('GET', RELEASES_PATH).length).toBe(2);
});

test('a failed check shows no notice and is tried again at the next launch', async ({ app, api, remote, page }) => {
  api.on('GET', RELEASES_PATH, { status: 500, json: { message: 'Server Error' } });

  await app.open();
  await goToSettings(app, remote);
  await expect.poll(() => api.requestsTo('GET', RELEASES_PATH).length).toBe(1);
  await expect(page.getByText(/Доступно обновление/)).toHaveCount(0);

  api.on('GET', RELEASES_PATH, { json: { tag_name: 'v99.0.0' } });
  await app.open();
  await goToSettings(app, remote);
  await expect(page.getByText('Доступно обновление (v99.0.0)')).toBeVisible();
});
