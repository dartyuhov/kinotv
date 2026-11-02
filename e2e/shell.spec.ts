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
