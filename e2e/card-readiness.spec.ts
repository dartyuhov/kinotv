import { fakeHome, fakeItems } from './harness/catalog';
import { expect, test } from './harness/test';

test('cards reveal together after artwork loads; pending cards cannot take focus', async ({ app, api, cdn, page, remote }) => {
  const items = fakeItems(87_000, 3);
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: items, popular: [] });
  cdn.respond(items[0]!.posters.medium, { delay: 1500 });
  cdn.respond(items[1]!.posters.medium, { delay: 2500 });
  const first = page.locator('.card').first();
  await app.open();
  await expect(first).toHaveAttribute('data-artwork', 'loading');
  await expect(first).toHaveCSS('opacity', '0');
  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Главная');
  await expect(first).toHaveAttribute('data-artwork', 'ready');
  await expect(first).toHaveCSS('opacity', '1');
  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Фильм 87000');
  await remote.press('right');
  await expect(app.focused).not.toHaveAccessibleName('Фильм 87001');
  await expect(page.getByRole('button', { name: 'Фильм 87001', exact: true })).toHaveAttribute('data-artwork', 'ready');
  await remote.press('up', 'down');
  await expect(app.focused).toHaveClass(/card/);
});

test('failed and missing artwork reveal navigable title fallbacks without spinners', async ({ app, api, cdn, page, remote }) => {
  const items = fakeItems(88_000, 2);
  items[1]!.posters = { small: '', medium: '', big: '' };
  fakeHome(api, { hot: [], movies: [], serials: [], fresh: items, popular: [] });
  cdn.respond(items[0]!.posters.medium, { status: 500 });
  await app.open();
  const first = page.getByRole('button', { name: 'Фильм 88000', exact: true });
  await expect(first).toHaveAttribute('data-artwork', 'failed');
  await expect(first).toHaveCSS('opacity', '1');
  await expect(first.locator('.card__fallback')).toBeVisible();
  await remote.press('down', 'right');
  await expect(app.focused).toHaveAccessibleName('Фильм 88001');
  await expect(app.focused).toHaveAttribute('data-artwork', 'failed');
  await expect(page.locator('.card [role="status"], .card [role="progressbar"]')).toHaveCount(0);
});
