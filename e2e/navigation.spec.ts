import { expect, test } from './harness/test';

test('Back from pushed screens returns to each previous screen with the same element focused', async ({ app, remote, page }) => {
  const heading = page.getByRole('heading', { level: 1 });
  await app.open();
  await remote.press('right', 'ok', 'down'); // Фильмы → its screen → second action
  await expect(app.focused).toHaveAccessibleName('Открыть демо-экран 2');

  await remote.press('ok');
  await expect(heading).toHaveText('Демо-экран 2');
  await expect(page.getByRole('tablist')).toBeHidden();
  await expect(app.focused).toHaveAccessibleName('Открыть демо-экран 3');

  await remote.press('ok');
  await expect(heading).toHaveText('Демо-экран 3');

  await remote.press('back');
  await expect(heading).toHaveText('Демо-экран 2');
  await expect(app.focused).toHaveAccessibleName('Открыть демо-экран 3');

  await remote.press('back');
  await expect(heading).toHaveText('Фильмы');
  await expect(page.getByRole('tab', { name: 'Фильмы' })).toHaveAttribute('aria-selected', 'true');
  await expect(app.focused).toHaveAccessibleName('Открыть демо-экран 2');
});

test('focus scrolls the screen, and Back restores the scroll position', async ({ app, remote, page }) => {
  const heading = page.getByRole('heading', { level: 1 });
  await app.open();
  await remote.press('right', 'ok'); // Фильмы → its screen
  await expect(heading).toHaveText('Фильмы');
  const unscrolled = await heading.boundingBox();

  await remote.repeat('down', 7);
  await expect(app.focused).toHaveAccessibleName('Открыть демо-экран 8');
  await expect(app.focused).toBeInViewport({ ratio: 1 });
  // Back up a little: the screen stays scrolled, which focusing this action from the top wouldn't do.
  await remote.repeat('up', 2);
  await expect(app.focused).toHaveAccessibleName('Открыть демо-экран 6');
  // The heading isn't transformed by focus effects, so its position shows how far the screen scrolled.
  const scrolled = await heading.boundingBox();
  expect(scrolled!.y).toBeLessThan(unscrolled!.y);

  await remote.press('ok');
  await expect(heading).toHaveText('Демо-экран 6');
  await remote.press('back');

  await expect(app.focused).toHaveAccessibleName('Открыть демо-экран 6');
  expect(await heading.boundingBox()).toEqual(scrolled);
});
