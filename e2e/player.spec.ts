import type { Page } from '@playwright/test';
import { fakeFilm, fakeHome, fakeItem, fakeSeries, filmProgress, seriesProgress, streamUrl } from './harness/catalog';
import type { FakeApi } from './harness/fakeApi';
import { FakePlayerRemote, setAppVisible } from './harness/player';
import type { Remote } from './harness/remote';
import { expect, test } from './harness/test';

// The player (spec §5.3, mockup player-remote, first frame), driven by the remote. The e2e build plays
// through the FakePlayer, so these tests read the player's timeline and cue what the stream does.
// Most pause the clock first: the video then only moves when the test runs the clock.

const MINUTES = 100;
const DURATION = MINUTES * 60;
const RIVER = fakeFilm(21, 'Медленная река / Slow River', { minutes: MINUTES });
const RIVER_VIDEO = 210; // fakeFilm: the film's only video has id `id * 10`

const playerScreen = (page: Page) => page.locator('[data-screen="player"]');
const progressBar = (page: Page) => page.getByRole('progressbar', { name: 'Прогресс просмотра' });

/**
 * Home's featured title → its page → Play/Resume. Returns once the video plays (the controls show and the
 * loading spinner has gone), as a viewer would wait before pressing on.
 */
async function playFromHero(page: Page, remote: Remote, { plays = true }: { plays?: boolean } = {}) {
  await expect(page.getByRole('button', { name: 'Смотреть' })).toBeVisible();
  await remote.press('down', 'ok');
  await expect(page.locator('[data-screen="title"] [role="button"][data-focused="true"]')).toHaveCount(1);
  await remote.press('ok');
  await expect(playerScreen(page)).toBeVisible();
  if (!plays) return;
  await expect(progressBar(page)).toBeVisible();
  await expect(page.getByRole('status', { name: 'Загрузка' })).toHaveCount(0);
  await expect.poll(() => new FakePlayerRemote(page).state()).toBe('playing');
}

/** RIVER as Home's only title; `stoppedAt` seconds is the viewer's saved position, if any. */
function river(api: FakeApi, stoppedAt?: number) {
  const progress = stoppedAt === undefined ? {} : { [RIVER.id]: filmProgress(RIVER, stoppedAt, DURATION) };
  fakeHome(api, { hot: [RIVER], movies: [], serials: [], progress });
}

const marks = (api: FakeApi) => api.requestsTo('GET', '/v1/watching/marktime').map((r) => r.query);

test.describe('starting playback', () => {
  test('Play starts the film from the beginning, on the Auto stream', async ({ app, api, page, remote, player }) => {
    river(api);
    await app.open();
    await playFromHero(page, remote);

    await expect(playerScreen(page).getByRole('heading', { level: 1 })).toHaveText('Медленная река');
    await expect.poll(() => player.loads()).toEqual([{ url: streamUrl(RIVER_VIDEO, '1080p', 'hls4'), startAt: 0 }]);
    await expect.poll(() => player.state()).toBe('playing');
    expect(api.requestsTo('GET', '/v1/items/media-links').map((r) => r.query.mid)).toEqual([String(RIVER_VIDEO)]);
  });

  test('Resume starts where the viewer stopped', async ({ app, api, clock, page, remote, player }) => {
    river(api, 48 * 60 + 10);
    await clock.pause();
    await app.open();
    await playFromHero(page, remote);

    await expect.poll(() => player.loads()).toEqual([{ url: streamUrl(RIVER_VIDEO, '1080p', 'hls4'), startAt: 48 * 60 + 10 }]);
    await expect(progressBar(page)).toHaveAttribute('aria-valuetext', '48:10 из 1:40:00');
    await expect(playerScreen(page).getByText('−51:50')).toBeVisible();
  });

  test('a series episode shows the series, the episode and its title', async ({ app, api, page, remote, player }) => {
    const HARBOUR = fakeSeries(31, 'Тихая гавань / Quiet Harbour', [['Возвращение', 'Причал', 'Старые письма']]);
    fakeHome(api, { hot: [HARBOUR], movies: [], serials: [], progress: { [HARBOUR.id]: seriesProgress(HARBOUR, [[1, 3, 600]]) } });
    await app.open();
    await playFromHero(page, remote);

    await expect(playerScreen(page).getByText('Тихая гавань · S1 · E3')).toBeVisible();
    await expect(playerScreen(page).getByRole('heading', { level: 1 })).toHaveText('Старые письма');
    await expect.poll(() => player.loads()).toEqual([{ url: streamUrl(31 * 10_000 + 103, '1080p', 'hls4'), startAt: 600 }]);
  });

  test('a stream failure tries the next supplied source', async ({ app, api, page, remote, player }) => {
    river(api);
    await app.open();
    await player.script({ loadError: 'media' });
    await playFromHero(page, remote, { plays: false });

    await expect.poll(() => player.state()).toBe('playing');
    expect(await player.loads()).toHaveLength(2);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await remote.press('stop');
    await expect(app.focused).toHaveAccessibleName('Смотреть');
    expect(marks(api)).toEqual([]);
  });
});

test.describe('controls', () => {
  test('hide after 4 s without input and come back on any key', async ({ app, api, clock, page, remote }) => {
    river(api);
    await clock.pause();
    await app.open();
    await playFromHero(page, remote);

    await clock.runFor(3_500);
    await expect(progressBar(page)).toBeVisible();
    await clock.runFor(1_000);
    await expect(progressBar(page)).toBeHidden();

    await remote.press('down');
    await expect(progressBar(page)).toBeVisible();
    await clock.runFor(3_500);
    await remote.press('down'); // input restarts the 4 s (Up opens playback settings)
    await clock.runFor(3_500);
    await expect(progressBar(page)).toBeVisible();
    await clock.runFor(1_000);
    await expect(progressBar(page)).toBeHidden();
  });

  test('OK and ⏯ pause and resume; paused, the controls stay', async ({ app, api, clock, page, remote, player }) => {
    river(api);
    await clock.pause();
    await app.open();
    await playFromHero(page, remote);
    await clock.runFor(2_000);

    await remote.press('ok');
    expect(await player.state()).toBe('paused');
    await clock.runFor(10_000);
    expect(await player.position()).toBe(2);
    await expect(progressBar(page)).toBeVisible();

    await remote.press('ok');
    expect(await player.state()).toBe('playing');
    await clock.runFor(3_000);
    expect(await player.position()).toBe(5);

    await remote.press('playPause');
    expect(await player.state()).toBe('paused');
    await remote.press('playPause');
    expect(await player.state()).toBe('playing');
  });
});

test.describe('seeking', () => {
  test('◀▶ step 10 s, then 30 s, then 60 s while held, preview the time, and seek once', async ({ app, api, clock, page, remote, player }) => {
    river(api, 20 * 60);
    await clock.pause();
    await app.open();
    await playFromHero(page, remote);

    // Held: three 10 s steps, three 30 s steps, then 60 s steps.
    await remote.repeat('right', 7);
    await expect(progressBar(page)).toHaveAttribute('aria-valuetext', '23:00 из 1:40:00');
    await expect(page.locator('.player-bar__preview')).toHaveText('23:00');
    expect(await player.seeks()).toEqual([]);

    await clock.runFor(1_000);
    expect(await player.seeks()).toEqual([23 * 60]);
    await expect(page.locator('.player-bar__preview')).toHaveCount(0);

    // A new hold starts again at 10 s.
    await remote.repeat('left', 2);
    await clock.runFor(1_000);
    expect(await player.seeks()).toEqual([23 * 60, 23 * 60 - 20]);
  });

  test('⏪ and ⏩ jump −10 s and +30 s', async ({ app, api, clock, page, remote, player }) => {
    river(api, 20 * 60);
    await clock.pause();
    await app.open();
    await playFromHero(page, remote);

    await remote.press('fastForward', 'fastForward', 'rewind');
    await clock.runFor(1_000);
    expect(await player.seeks()).toEqual([20 * 60 + 50]);
  });

  test('seeking stops short of the end and the start', async ({ app, api, clock, page, remote, player }) => {
    river(api, DURATION - 15);
    await clock.pause();
    await app.open();
    await playFromHero(page, remote);

    await remote.press('fastForward');
    await clock.runFor(1_000);
    expect(await player.seeks()).toEqual([DURATION - 1]);
  });
});

test.describe('leaving', () => {
  test('Back hides the controls, then leaves the player and saves where the viewer stopped', async ({ app, api, clock, page, remote }) => {
    river(api, 48 * 60 + 10);
    await clock.pause();
    await app.open();
    await playFromHero(page, remote);
    await clock.runFor(2_000);

    await remote.press('back');
    await clock.runFor(300);
    await expect(progressBar(page)).toBeHidden();
    await expect(playerScreen(page)).toBeVisible();
    expect(marks(api)).toEqual([]);

    await remote.press('back');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Медленная река');
    await expect(app.focused).toHaveAccessibleName('Продолжить · 48 мин');
    await expect.poll(() => marks(api)).toEqual([{ id: String(RIVER.id), video: '1', time: String(48 * 60 + 12), access_token: expect.any(String) }]);
  });

  test('the end of the film leaves the player', async ({ app, api, page, remote, player }) => {
    river(api, DURATION - 60);
    await app.open();
    await playFromHero(page, remote);

    await player.end();
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
  });
});

test.describe('progress sync', () => {
  test('saves every 30 s while playing, and at once on pause', async ({ app, api, clock, page, remote }) => {
    river(api);
    await clock.pause();
    await app.open();
    await playFromHero(page, remote);

    await clock.runFor(29_000);
    expect(marks(api)).toEqual([]);
    await clock.runFor(31_000);
    expect(marks(api).map((m) => m.time)).toEqual(['30', '60']);

    await clock.runFor(5_000);
    await remote.press('ok');
    await clock.settle();
    expect(marks(api).map((m) => m.time)).toEqual(['30', '60', '65']);

    // Paused, nothing more is saved.
    await clock.runFor(60_000);
    expect(marks(api).map((m) => m.time)).toEqual(['30', '60', '65']);
  });

  test('a series episode is saved with its season', async ({ app, api, clock, page, remote }) => {
    const HARBOUR = fakeSeries(31, 'Тихая гавань / Quiet Harbour', [['Возвращение', 'Причал', 'Старые письма']]);
    fakeHome(api, { hot: [HARBOUR], movies: [], serials: [], progress: { [HARBOUR.id]: seriesProgress(HARBOUR, [[1, 3, 600]]) } });
    await clock.pause();
    await app.open();
    await playFromHero(page, remote);

    await clock.runFor(30_000);
    expect(marks(api)).toEqual([{ id: '31', season: '1', video: '3', time: '630', access_token: expect.any(String) }]);
  });

  test('going to the background pauses and saves; coming back shows the paused controls', async ({ app, api, clock, page, remote, player }) => {
    river(api);
    await clock.pause();
    await app.open();
    await playFromHero(page, remote);
    await clock.runFor(12_000);
    await expect(progressBar(page)).toBeHidden();

    await setAppVisible(page, false);
    await clock.settle();
    expect(await player.state()).toBe('paused');
    expect(marks(api).map((m) => m.time)).toEqual(['12']);

    await setAppVisible(page, true);
    await expect(progressBar(page)).toBeVisible();
    await clock.runFor(10_000);
    expect(await player.state()).toBe('paused');
    await expect(progressBar(page)).toBeVisible();
    expect(await player.position()).toBe(12);
  });

  test('crossing 90% marks the film watched once, and it leaves Continue watching', async ({ app, api, clock, page, remote, player }) => {
    const OTHER = fakeItem(22, 'Город без света / City Without Light');
    fakeHome(api, {
      hot: [OTHER],
      movies: [RIVER, OTHER],
      serials: [],
      progress: { [RIVER.id]: filmProgress(RIVER, 80 * 60, DURATION) },
    });
    // The server's view: RIVER is unfinished until it is toggled watched.
    let watched = false;
    api.on('GET', '/v1/watching/toggle', () => {
      watched = !watched;
      return { json: { status: 200, watched: watched ? 1 : 0 } };
    });
    api.on('GET', '/v1/watching/movies', () => ({
      json: { status: 200, items: (watched ? [OTHER] : [RIVER, OTHER]).map(({ id, type, subtype, title, posters }) => ({ id, type, subtype, title, posters })) },
    }));
    await clock.pause();
    await app.open();
    await remote.press('down', 'down');
    await expect(app.focused).toHaveAccessibleName('Медленная река');
    await remote.press('ok');
    await expect(app.focused).toHaveAccessibleName('Продолжить · 1 ч 20 мин');
    await remote.press('ok');
    await expect(progressBar(page)).toBeVisible();
    await expect.poll(() => player.state()).toBe('playing');

    await player.time(0.9 * DURATION - 1);
    await clock.settle();
    expect(api.requestsTo('GET', '/v1/watching/toggle')).toEqual([]);

    await player.time(0.9 * DURATION);
    await clock.settle();
    await player.time(0.95 * DURATION);
    // The player checks the server's status first (GET /v1/watching), then toggles: two round trips.
    await expect.poll(() => watched).toBe(true);
    await clock.settle();
    expect(api.requestsTo('GET', '/v1/watching/toggle').map((r) => r.query)).toEqual([
      { id: String(RIVER.id), video: '1', access_token: expect.any(String) },
    ]);
    expect(marks(api).map((m) => m.time)).toContain(String(0.9 * DURATION));

    await remote.press('back', 'back'); // hide the controls, leave the player
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
    await remote.press('back');
    const continueRow = page.getByRole('region', { name: 'Продолжить просмотр' });
    await expect(continueRow).toBeVisible();
    await expect(continueRow.getByRole('button', { name: 'Город без света' })).toBeVisible();
    await expect(continueRow.getByRole('button', { name: 'Медленная река' })).toHaveCount(0);
  });

  test('a film the server already counts as watched is not toggled back', async ({ app, api, clock, page, remote, player }) => {
    const progress = filmProgress(RIVER, 85 * 60, DURATION);
    river(api, 0);
    // The viewer stopped at 85 min. Saving a position past 90% makes the server count it as watched
    // (kino.watch may do that by itself, research 10-kp-api §7).
    const savedPast90 = () => marks(api).some((m) => Number(m.time) >= 0.9 * DURATION);
    api.on('GET', '/v1/watching', () => {
      const body = structuredClone(progress.json) as { item: { videos: { status: number }[] } };
      if (savedPast90()) body.item.videos[0]!.status = 1;
      return { json: body };
    });
    await clock.pause();
    await app.open();
    await playFromHero(page, remote);

    await player.time(0.92 * DURATION);
    // The player asks for the status after its save...
    const askedAfterSave = () => {
      const paths = api.requests.map((r) => r.path);
      return paths.lastIndexOf('/v1/watching') > paths.indexOf('/v1/watching/marktime') && savedPast90();
    };
    await expect.poll(askedAfterSave).toBe(true);
    await clock.settle();
    // ...and, finding it watched, leaves it alone.
    expect(api.requestsTo('GET', '/v1/watching/toggle')).toEqual([]);
  });
});
