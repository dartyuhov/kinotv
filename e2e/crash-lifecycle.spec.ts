import { fakeDeviceFlow, PENDING, signInHeading, tokens } from './harness/auth';
import { fakeFilm, fakeHome } from './harness/catalog';
import { setAppVisible } from './harness/player';
import { expect, test } from './harness/test';

// Dedicated crash investigation journeys. These exercise application cleanup through the real
// screen/session boundaries; FakePlayer cannot establish native decoder release or TV process RSS.
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => { throw error; });
  page.on('crash', () => { throw new Error('Browser page crashed during lifecycle journey'); });
});

test('repeated playback visibility cycles release lifecycle listeners and progress timers on exit', async ({ app, api, page, remote, player, clock }) => {
  const film = fakeFilm(93_000, 'Lifecycle film');
  fakeHome(api, { hot: [film], fresh: [], popular: [], movies: [], serials: [] });
  await clock.pause();
  await app.open();
  await remote.press('down', 'ok');
  await expect(page.locator('.title-page')).toBeVisible();
  await expect(app.focused).toHaveAccessibleName('Смотреть');

  for (let cycle = 0; cycle < 10; cycle++) {
    await remote.press('ok');
    await expect.poll(() => player.state()).toBe('playing');
    await clock.runFor(2_000);
    const before = (await player.calls()).length;
    await setAppVisible(page, false);
    await clock.settle();
    expect(await player.state()).toBe('paused');
    await setAppVisible(page, true);
    expect((await player.calls()).slice(before)).toEqual([
      { op: 'pause' }, { op: 'suspend' }, { op: 'restore' },
    ]);
    await clock.runFor(1_000);
    expect(await player.position()).toBe(2);
    await remote.press('stop');
    await expect(page.locator('.title-page')).toBeVisible();
    await clock.settle();
    const calls = await player.calls();
    const writes = api.requestsTo('GET', '/v1/watching/marktime').length;
    await setAppVisible(page, false);
    await setAppVisible(page, true);
    await clock.runFor(31_000);
    expect(await player.calls()).toEqual(calls);
    expect(api.requestsTo('GET', '/v1/watching/marktime')).toHaveLength(writes);
    expect(await player.state()).toBe('idle');
    await expect(app.focused).toHaveAccessibleName('Смотреть');
  }
  expect((await player.calls()).filter((call) => call.op === 'destroy')).toHaveLength(10);
});

test('session expiry during playback tears down the old player and reauthentication keeps one active lifecycle', async ({ app, api, page, remote, player, clock }) => {
  const film = fakeFilm(93_001, 'Reauthentication film');
  fakeHome(api, { hot: [film], fresh: [], popular: [], movies: [], serials: [] });
  let approved = false;
  fakeDeviceFlow(api, () => approved ? tokens(1) : PENDING);
  await clock.pause();
  await app.open();
  await remote.press('down', 'ok');
  await expect(page.locator('.title-page')).toBeVisible();
  await expect(app.focused).toHaveAccessibleName('Смотреть');
  await remote.press('ok');
  await expect.poll(() => player.state()).toBe('playing');
  await clock.runFor(2_000);

  // The next progress save encounters a revoked session, not a process crash.
  api.on('GET', '/v1/watching/marktime', { status: 401, json: { status: 401, error: 'unauthorized' } });
  api.on('POST', '/oauth2/token', { status: 400, json: { error: 'invalid_grant' } });
  await remote.press('pause');
  await expect(signInHeading(page)).toBeVisible();
  await expect(page.getByText('CODE1')).toBeVisible();
  expect(await player.state()).toBe('idle');
  const signedOutCalls = await player.calls();
  expect(signedOutCalls.filter((call) => call.op === 'destroy')).toHaveLength(1);
  await setAppVisible(page, false);
  await setAppVisible(page, true);
  expect(await player.calls()).toEqual(signedOutCalls);

  api.on('GET', '/v1/watching/marktime', { json: { status: 200 } });
  approved = true;
  await clock.runFor(5_000);
  await expect(page.locator('[data-screen="player"]')).toBeVisible();
  await expect.poll(() => player.state()).toBe('playing');
  const before = (await player.calls()).length;
  await setAppVisible(page, false);
  await setAppVisible(page, true);
  expect((await player.calls()).slice(before)).toEqual([
    { op: 'pause' }, { op: 'suspend' }, { op: 'restore' },
  ]);
  await remote.press('stop');
  await expect(page.locator('.title-page')).toBeVisible();
  await clock.settle();
  const writes = api.requestsTo('GET', '/v1/watching/marktime').length;
  await clock.runFor(31_000);
  expect(api.requestsTo('GET', '/v1/watching/marktime')).toHaveLength(writes);
  expect((await player.calls()).filter((call) => call.op === 'destroy')).toHaveLength(2);
});
