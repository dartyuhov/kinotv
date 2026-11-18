import { fakeCatalog, fakeFilm, fakeHome } from './harness/catalog';
import { expect, test } from './harness/test';

test('Back through catalog, title and player restores each original focused element', async ({ app, api, remote, page, player }) => {
  const films = [fakeFilm(801, 'First film'), fakeFilm(802, 'Second film')];
  fakeHome(api, { hot: films });
  fakeCatalog(api, { items: () => films });
  await app.open();
  await remote.press('right', 'ok');
  await expect(app.focused).toHaveAccessibleName('First film');
  await remote.press('right', 'ok');
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  await expect(app.focused).toHaveAccessibleName('Смотреть');
  await remote.press('ok');
  await expect.poll(() => player.state()).toBe('playing');
  await expect(page.getByRole('tablist')).toBeHidden();
  await remote.press('back', 'back');
  await expect(app.focused).toHaveAccessibleName('Смотреть');
  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('Second film');
  await expect(page.getByRole('tab', { name: 'Фильмы' })).toHaveAttribute('aria-selected', 'true');
});

test('Back from a live channel restores the virtualized grid page and original focus', async ({ app, api, remote, page, player }) => {
  api.on('GET', '/v1/tv', { json: { channels: Array.from({ length: 60 }, (_, i) => ({ id: i + 1, title: `Channel ${i + 1}`, stream: `https://live.test/${i + 1}` })) } });
  await app.open();
  await remote.press('right', 'right', 'right', 'right', 'ok');
  await expect(app.focused).toHaveAccessibleName('Channel 1, Прямой эфир');
  await remote.press('channelDown', 'channelDown', 'down');
  await expect(app.focused).toHaveAccessibleName('Channel 21, Прямой эфир');
  await expect(app.focused).toBeInViewport({ ratio: 1 });
  const track = page.locator('[data-grid="tv:grid"] .grid__track');
  // Compare the destination, not an intermediate animation frame.
  const before = await track.evaluate((el) => (el as HTMLElement).style.transform);
  await remote.press('ok');
  await expect.poll(() => player.state()).toBe('playing');
  await remote.press('channelUp');
  await expect(page.locator('[data-screen="livePlayer"] h1')).toHaveText('Channel 22');
  await remote.press('back', 'back');
  await expect(app.focused).toHaveAccessibleName('Channel 21, Прямой эфир');
  expect(await track.evaluate((el) => (el as HTMLElement).style.transform)).toBe(before);
});
