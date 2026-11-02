import { expect, test } from './harness/test';

test('Back in a tab screen moves focus up to its tab', async ({ app, remote, page }) => {
  await app.open();
  await remote.press('right', 'right', 'ok', 'down'); // Сериалы → second action

  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('Сериалы');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сериалы');
});

test('Back on any tab other than Home goes to Home', async ({ app, remote, page }) => {
  await app.open();
  await remote.repeat('right', 4); // ТВ

  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('Главная');
  await expect(page.getByRole('tab', { name: 'Главная' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Популярное' })).toBeVisible();
});

test.describe('the exit dialog', () => {
  // The browser fallback of the platform exit marks <html>, since there is no app to close.
  const exitRequested = (page: import('@playwright/test').Page) =>
    expect(page.locator('html')).toHaveAttribute('data-exit-requested', 'true');

  test('Back on Home asks to exit; focus stays in the dialog; Back cancels', async ({ app, remote, page }) => {
    await app.open();
    await remote.press('back');

    const dialog = page.getByRole('alertdialog', { name: 'Выйти из приложения?' });
    await expect(dialog).toBeVisible();
    await expect(app.focused).toHaveAccessibleName('Выйти');

    await remote.press('right');
    await expect(app.focused).toHaveAccessibleName('Отмена');
    await remote.press('up', 'right', 'down');
    await expect(app.focused).toHaveAccessibleName('Отмена');

    await remote.press('back');
    await expect(dialog).toBeHidden();
    await expect(app.focused).toHaveAccessibleName('Главная');
    await expect(page.locator('html')).not.toHaveAttribute('data-exit-requested');
  });

  test('Cancel closes the dialog', async ({ app, remote, page }) => {
    await app.open();
    await remote.press('back', 'right', 'ok');

    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(app.focused).toHaveAccessibleName('Главная');
    await expect(page.locator('html')).not.toHaveAttribute('data-exit-requested');
  });

  test('OK on Exit calls the platform exit', async ({ app, remote, page }) => {
    await app.open();
    await remote.press('back', 'ok');
    await exitRequested(page);
  });
});
