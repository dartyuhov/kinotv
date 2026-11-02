import { expect, test } from './harness/test';

test('the app opens on Home in a 1920×1080 frame with the tab bar', async ({ app, page }) => {
  await app.open();

  const stage = page.getByTestId('stage');
  expect(await stage.boundingBox()).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });

  await expect(page.getByRole('tablist')).toMatchAriaSnapshot(`
    - tablist:
      - tab "Поиск"
      - tab "Главная" [selected]
      - tab "Фильмы"
      - tab "Сериалы"
      - tab "Я смотрю"
      - tab "ТВ"
      - tab "Спорт"
      - tab "Закладки"
      - tab "История"
      - tab "Настройки"
  `);
  await expect(app.focused).toHaveAccessibleName('Главная');
});

test('arrows move focus along the tab bar and the focused tab shows its screen', async ({ app, remote, page }) => {
  await app.open();

  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('Фильмы');
  await expect(page.getByRole('tab', { name: 'Фильмы' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Фильмы');

  await remote.repeat('right', 8);
  await expect(app.focused).toHaveAccessibleName('Настройки');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Настройки');

  // The bar does not wrap around.
  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('Настройки');

  await remote.repeat('left', 9);
  await expect(app.focused).toHaveAccessibleName('Поиск');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Поиск');
});

test('OK or Down on a tab moves into its screen; Up comes back to the active tab', async ({ app, remote, page }) => {
  await app.open();
  await remote.repeat('right', 6); // Закладки, far from the screen's left-aligned content

  await remote.press('ok');
  await expect(app.focused).toHaveAccessibleName('Открыть демо-экран 1');
  await expect(page.getByRole('tab', { name: 'Закладки' })).toHaveAttribute('aria-selected', 'true');

  await remote.press('up');
  await expect(app.focused).toHaveAccessibleName('Закладки');

  await remote.press('down');
  await expect(app.focused).toHaveAccessibleName('Открыть демо-экран 1');
});
