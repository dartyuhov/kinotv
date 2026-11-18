import { expect, test } from './harness/test';
import { fakeDeviceFlow, PENDING, signInHeading, tokens } from './harness/auth';
import { FAKE_USER } from './harness/fakeApi';

const STARTUP_KEY = 'kinotv:startup-tab';

test('fresh launches use the saved tab rather than the last visited tab', async ({ app, page, remote }) => {
  await app.open();
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify('movies')), STARTUP_KEY);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Фильмы', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(app.focused).toHaveAccessibleName('Фильмы');
  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('Сериалы');
  await page.reload();
  await expect(app.focused).toHaveAccessibleName('Фильмы');
});

for (const raw of ['not-json', '"removed-tab"', '"sport"', 'null', '42', '{}', '["movies"]']) {
  test(`invalid preference ${raw} falls back to Home`, async ({ app, page }) => {
    await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: STARTUP_KEY, raw });
    await app.open();
    await expect(app.focused).toHaveAccessibleName('Главная');
    await expect(page.getByRole('tab', { name: 'Главная' })).toHaveAttribute('aria-selected', 'true');
  });
}

test('unreadable preference falls back to Home without disrupting the saved session', async ({ app, page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify('movies'));
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (name) {
      if (name === key) throw new DOMException('Unavailable', 'SecurityError');
      return get.call(this, name);
    };
  }, STARTUP_KEY);
  await app.open();
  await expect(app.focused).toHaveAccessibleName('Главная');
  await page.reload();
  await expect(app.focused).toHaveAccessibleName('Главная');
});

test('failed preference writes leave the picker and navigation usable and restart defaults to Home', async ({ app, page, remote }) => {
  await page.addInitScript((key) => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Full', 'QuotaExceededError');
      return set.call(this, name, value);
    };
  }, STARTUP_KEY);
  await app.open();
  await remote.repeat('right', 8);
  await remote.press('down', 'down', 'down', 'ok', 'down', 'ok');
  await expect(app.focused).toHaveAccessibleName('Начальная вкладка: Фильмы');
  await remote.press('up', 'up', 'up', 'left');
  await expect(app.focused).toHaveAccessibleName('История');
  await page.reload();
  await expect(app.focused).toHaveAccessibleName('Главная');
});

test('temporary reauthentication preserves Settings instead of applying the saved startup tab', async ({ app, api, page, clock, remote }) => {
  let approved = false;
  fakeDeviceFlow(api, () => approved ? tokens(1) : PENDING);
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify('movies')), STARTUP_KEY);
  await clock.pause();
  await app.open();
  await expect(app.focused).toHaveAccessibleName('Фильмы');
  await remote.repeat('right', 7);
  await expect(page.getByText(`Аккаунт: ${FAKE_USER.username}`)).toBeVisible();
  await clock.settle();
  api.on('GET', '/v1/user', (req) => req.query.access_token === 'access-1'
    ? { json: { status: 200, user: FAKE_USER } }
    : { status: 401, json: { status: 401, error: 'unauthorized' } });
  api.on('POST', '/oauth2/token', { status: 400, json: { error: 'invalid_grant' } });
  await remote.press('left', 'right');
  await expect(signInHeading(page)).toBeVisible();
  await expect(page.getByText('CODE1')).toBeVisible();
  approved = true;
  await clock.runFor(5_000);
  await expect(page.getByRole('tab', { name: 'Настройки' })).toHaveAttribute('aria-selected', 'true');
  await expect(app.focused).toHaveAccessibleName('Настройки');
  await expect(page.getByText(`Аккаунт: ${FAKE_USER.username}`)).toBeVisible();
  await page.reload();
  await expect(app.focused).toHaveAccessibleName('Фильмы');
});

test('installation preference survives explicit sign-out and is applied after signing in on a fresh launch', async ({ app, api, page, clock, remote }) => {
  let approved = false;
  fakeDeviceFlow(api, () => approved ? tokens(1) : PENDING);
  api.on('POST', '/v1/device/unlink', { json: { status: 200 } });
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem('startup-test:seeded')) {
      localStorage.setItem(key, JSON.stringify('movies'));
      sessionStorage.setItem('startup-test:seeded', '1');
    }
  }, STARTUP_KEY);
  await clock.pause();
  await app.open();
  await remote.repeat('right', 7);
  await remote.press('down', 'ok');
  await expect(signInHeading(page)).toBeVisible();
  await expect(page.getByText('CODE1')).toBeVisible();
  await page.reload();
  await expect(page.getByText('CODE2')).toBeVisible();
  approved = true;
  await clock.runFor(5_000);
  await expect(app.focused).toHaveAccessibleName('Фильмы');
});

test('remote picker uses root labels, cancels cleanly and saves without changing this screen or unrelated state', async ({ app, page, remote }) => {
  await app.open();
  const session = await page.evaluate(() => {
    localStorage.setItem('startup-test:unrelated', 'keep');
    return localStorage.getItem('kinotv:session');
  });
  await remote.repeat('right', 8);
  await remote.press('down', 'down', 'down');
  await expect(app.focused).toHaveAccessibleName('Начальная вкладка: Главная');
  const bounds = await app.focused.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1080);
  await remote.press('ok');
  const picker = page.getByRole('listbox', { name: 'Начальная вкладка' });
  await expect(picker.getByRole('option')).toHaveText([
    'Поиск', 'Главная', 'Фильмы', 'Сериалы', 'Я смотрю', 'ТВ', 'Закладки', 'История', 'Настройки',
  ]);
  await expect(app.focused).toHaveAccessibleName('Главная');
  await remote.press('down', 'back');
  await expect(picker).toBeHidden();
  await expect(app.focused).toHaveAccessibleName('Начальная вкладка: Главная');
  await remote.press('ok', 'down', 'ok');
  await expect(app.focused).toHaveAccessibleName('Начальная вкладка: Фильмы');
  await expect(page.getByRole('tab', { name: 'Настройки' })).toHaveAttribute('aria-selected', 'true');
  await remote.press('ok');
  await expect(picker.getByRole('option', { name: 'Фильмы', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(app.focused).toHaveAccessibleName('Фильмы');
  await remote.press('back');
  expect(await page.evaluate(() => localStorage.getItem('kinotv:session'))).toBe(session);
  expect(await page.evaluate(() => localStorage.getItem('startup-test:unrelated'))).toBe('keep');
  await page.reload();
  await expect(app.focused).toHaveAccessibleName('Фильмы');
});
