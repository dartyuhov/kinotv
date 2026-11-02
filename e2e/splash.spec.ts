import { expect, test } from './harness/test';

test('a KinoTV splash shows while the app is loading, and is gone once it has started', async ({ app, page }) => {
  // Hold the app's script back, as a slow cold start on the TV would.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/assets/*.js', async (route) => {
    await held;
    await route.continue();
  });

  await app.seedSession();
  await page.goto('/', { waitUntil: 'commit' }); // the load event waits for the held script
  await expect(page.getByText('KinoTV', { exact: true })).toBeVisible();

  release();
  await expect(app.focused).toHaveAccessibleName('Главная');
  await expect(page.getByText('KinoTV', { exact: true })).toHaveCount(0);
});
