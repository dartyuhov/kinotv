import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from './harness/test';

// On the TV the Tizen web runtime opens index.html straight from the installed .wgt (file://), not from
// a web server. Chromium refuses module and crossorigin scripts from file://, so this guards the build
// output. dist-e2e/ is the production build the e2e web server makes before the tests run.
test('the production build starts when index.html is opened from local files, as on the TV', async ({ app, page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(pathToFileURL(resolve('dist-e2e/index.html')).href);

  await expect(app.focused).toHaveAccessibleName('Главная');
  await expect(page.getByRole('tablist')).toBeVisible();
  expect(errors).toEqual([]);
});
