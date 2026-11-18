import { fakeCatalog, fakeHome, fakeItems } from './harness/catalog';
import { expect, test } from './harness/test';
import { solidPng } from './harness/fakeCdn';

declare global {
  interface Window {
    decodeControl: { hold: boolean; releases: (() => void)[]; invisibleFocus: string[] };
  }
}

test('a direction change cancels pending grid entry without freezing focus memory or scrolling', async ({ app, api, page, remote }) => {
  const items = fakeItems(1001, 70);
  fakeCatalog(api, { items: () => items });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(items[7]!.posters.medium, async route => {
    await held;
    await route.fulfill({ contentType: 'image/png', body: solidPng([1, 2, 3]) });
  });
  await app.open();
  await remote.press('right');
  await expect(page.getByRole('button', { name: 'Фильм 1001', exact: true })).toHaveAttribute('data-artwork', 'ready');
  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Фильм 1001');
  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Фильм 1001');
  await expect(page.getByRole('button', { name: 'Фильм 1008', exact: true })).toHaveAttribute('data-artwork', 'loading');
  await expect(page.getByRole('button', { name: 'Фильм 1002', exact: true })).toHaveAttribute('data-artwork', 'ready');
  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('Фильм 1002');
  release();
  await expect(page.getByRole('button', { name: 'Фильм 1008', exact: true })).toHaveAttribute('data-artwork', 'ready');
  await expect(app.focused).toHaveAccessibleName('Фильм 1002');
  for (const id of [1009, 1016, 1023, 1030]) {
    await expect(page.getByRole('button', { name: `Фильм ${id}`, exact: true })).toHaveAttribute('data-artwork', 'ready');
    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName(`Фильм ${id}`);
    await expect(app.focused).toBeInViewport();
  }
  await remote.press('ok');
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('Фильм 1030');
  await expect(app.focused).toBeInViewport();
});

for (const { source, cancel } of (['row', 'grid'] as const).flatMap(source => [false, true].map(cancel => ({ source, cancel })))) {
  test(`Back to a warm ${source} ${cancel ? 'cancels restoration on new input' : 'retains usable focus until the saved card decodes'}`, async ({ app, api, page, remote }) => {
    const items = fakeItems(89_000, 30);
    fakeHome(api, { hot: [], movies: [], serials: [], fresh: items, popular: [] });
    fakeCatalog(api, { items: () => items });
    await page.addInitScript(() => {
      const decode = HTMLImageElement.prototype.decode;
      const control = { hold: false, releases: [] as (() => void)[], invisibleFocus: [] as string[] };
      Object.assign(window, { decodeControl: control });
      HTMLImageElement.prototype.decode = async function () {
        await decode.call(this);
        if (control.hold && this.classList.contains('card__image')) {
          await new Promise<void>(resolve => { control.releases.push(resolve); });
        }
      };
      new MutationObserver(() => {
        for (const card of document.querySelectorAll('.card[data-focused="true"][data-artwork="loading"]')) {
          control.invisibleFocus.push(card.getAttribute('aria-label')!);
        }
      }).observe(document, { subtree: true, attributes: true, childList: true });
    });
    await app.open();
    if (source === 'grid') await remote.press('right');
    const first = page.getByRole('button', { name: 'Фильм 89000', exact: true });
    await expect(first).toHaveAttribute('data-artwork', 'ready');
    await remote.press('down');
    await expect(app.focused).toHaveAccessibleName('Фильм 89000');
    const saved = page.getByRole('button', { name: 'Фильм 89001', exact: true });
    await expect(saved).toHaveAttribute('data-artwork', 'ready');
    await remote.press('right');
    await expect(app.focused).toHaveAccessibleName('Фильм 89001');
    await remote.press('ok');
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
    await page.evaluate(() => { window.decodeControl.hold = true; });
    await remote.press('back');
    await expect(first).toHaveAttribute('data-artwork', 'loading');
    await expect(first).toHaveCSS('opacity', '0');
    await expect(app.focused).toHaveCount(1);
    await expect(app.focused).not.toHaveAttribute('aria-disabled', 'true');
    await expect(app.focused).toHaveAccessibleName(source === 'row' ? 'Главная' : 'Фильмы');
    await expect.poll(() => page.evaluate(() => window.decodeControl.releases.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.decodeControl.invisibleFocus)).toEqual([]);
    if (cancel) await remote.press('up');
    await page.evaluate(() => { const c = window.decodeControl; c.hold = false; c.releases.forEach(release => release()); });
    if (cancel) {
      await expect(first).toHaveAttribute('data-artwork', 'ready');
      await expect(app.focused).toHaveAccessibleName(source === 'row' ? 'Главная' : 'Фильмы');
    } else {
      await expect(app.focused).toHaveAccessibleName('Фильм 89001');
      await expect(app.focused).toHaveAttribute('data-artwork', 'ready');
      await remote.press('left');
      await expect(app.focused).toHaveAccessibleName('Фильм 89000');
    }
  });
}

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
