import type { Page } from '@playwright/test';
import { fakeHome, fakeSeries, seriesProgress, streamUrl, type EpisodeMark } from './harness/catalog';
import type { FakeApi } from './harness/fakeApi';
import { FakePlayerRemote, setAppVisible } from './harness/player';
import type { Remote } from './harness/remote';
import { expect, test } from './harness/test';

// Next episode and episode switching (spec §5.1 CH ▲▼, §5.3 Next episode). kino.watch has no end-credits
// markers, so the "next episode" card is time-based: it shows for the last 20 s of an episode.

const MINUTES = 45;
const DURATION = MINUTES * 60;
// Season 1 has two episodes, season 2 has one.
const HARBOUR = fakeSeries(31, 'Тихая гавань / Quiet Harbour', [['Возвращение', 'Причал'], ['Маяк']], { minutes: MINUTES });
/** fakeSeries: episode E of season S has video id `id * 10_000 + S * 100 + E`. */
const episodeVideo = (season: number, episode: number) => HARBOUR.id * 10_000 + season * 100 + episode;

const playerScreen = (page: Page) => page.locator('[data-screen="player"]');
const nextCard = (page: Page) => page.getByRole('dialog', { name: 'Следующая серия' });

/** HARBOUR as Home's only title, with the viewer's progress (marks oldest first; the last is resumed). */
function harbour(api: FakeApi, marks: EpisodeMark[]) {
  fakeHome(api, { hot: [HARBOUR], movies: [], serials: [], progress: { [HARBOUR.id]: seriesProgress(HARBOUR, marks) } });
}

/** Home's featured title → its page → Resume, then waits until the episode plays. */
async function resumeFromHero(page: Page, remote: Remote) {
  await expect(page.getByRole('button', { name: 'Смотреть' })).toBeVisible();
  await remote.press('down', 'ok');
  await expect(page.locator('[data-screen="title"] [role="button"][data-focused="true"]')).toHaveCount(1);
  await remote.press('ok');
  await expect(page.getByRole('progressbar', { name: 'Прогресс просмотра' })).toBeVisible();
  await expect.poll(() => new FakePlayerRemote(page).state()).toBe('playing');
}

test.describe('the next-episode card', () => {
  test('appears for the last 20 s, counts down from 10 and then plays the next episode', async ({ app, api, clock, page, remote, player }) => {
    harbour(api, [[1, 1, DURATION - 30]]);
    await clock.pause();
    await app.open();
    await resumeFromHero(page, remote);

    await clock.runFor(9_000);
    await expect(nextCard(page)).toHaveCount(0);
    await clock.runFor(1_000); // 20 s left
    await expect(nextCard(page)).toBeVisible();
    await expect(nextCard(page)).toContainText('Следующая серия через 10 с');
    await expect(nextCard(page)).toContainText('S1 · E2 · Причал');

    await clock.runFor(9_000);
    await expect(nextCard(page)).toContainText('Следующая серия через 1 с');
    expect(await player.loads()).toHaveLength(1);

    await clock.runFor(1_000);
    await expect(playerScreen(page).getByRole('heading', { level: 1 })).toHaveText('Причал');
    await expect(playerScreen(page)).toContainText('Тихая гавань · S1 · E2');
    await expect.poll(() => player.loads()).toEqual([
      { url: streamUrl(episodeVideo(1, 1), '1080p', 'hls4'), startAt: DURATION - 30 },
      { url: streamUrl(episodeVideo(1, 2), '1080p', 'hls4'), startAt: 0 },
    ]);
    await expect(nextCard(page)).toHaveCount(0);
  });

  test('OK plays the next episode at once', async ({ app, api, clock, page, remote, player }) => {
    harbour(api, [[1, 1, DURATION - 20]]);
    await clock.pause();
    await app.open();
    await resumeFromHero(page, remote);
    await expect(nextCard(page)).toContainText('через 10 с');

    await remote.press('ok');
    await expect(playerScreen(page).getByRole('heading', { level: 1 })).toHaveText('Причал');
    await expect.poll(async () => (await player.loads()).slice(-1)[0]).toEqual({ url: streamUrl(episodeVideo(1, 2), '1080p', 'hls4'), startAt: 0 });
    expect(await player.calls()).not.toContainEqual({ op: 'pause' }); // OK went to the card, not to play/pause
  });

  test('Back hides the card and keeps the episode; at its end the player closes', async ({ app, api, clock, page, remote, player }) => {
    harbour(api, [[1, 1, DURATION - 20]]);
    await clock.pause();
    await app.open();
    await resumeFromHero(page, remote);
    await expect(nextCard(page)).toBeVisible();

    await remote.press('back');
    await expect(nextCard(page)).toHaveCount(0);
    await expect(playerScreen(page)).toBeVisible();
    await clock.runFor(15_000); // past where the countdown would have ended
    expect(await player.loads()).toHaveLength(1);
    expect(await player.state()).toBe('playing');
    await expect(playerScreen(page)).toContainText('S1 · E1');

    await clock.runFor(5_000); // the end of the episode
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
    expect(await player.loads()).toHaveLength(1);
  });

  test('if the episode ends before the countdown does, the next one plays', async ({ app, api, page, remote, player }) => {
    harbour(api, [[1, 1, 600]]);
    await app.open();
    await resumeFromHero(page, remote);

    await player.end();
    await expect(playerScreen(page).getByRole('heading', { level: 1 })).toHaveText('Причал');
    await expect.poll(async () => (await player.loads()).slice(-1)[0]?.url).toBe(streamUrl(episodeVideo(1, 2), '1080p', 'hls4'));
  });

  test('the countdown holds while the TV is in the background', async ({ app, api, clock, page, remote, player }) => {
    harbour(api, [[1, 1, DURATION - 20]]);
    await clock.pause();
    await app.open();
    await resumeFromHero(page, remote);
    await clock.runFor(3_000);
    await expect(nextCard(page)).toContainText('через 7 с');

    await setAppVisible(page, false);
    await clock.runFor(30_000);
    await setAppVisible(page, true);
    await expect(nextCard(page)).toContainText('через 7 с');
    expect(await player.loads()).toHaveLength(1);
    expect(await player.state()).toBe('paused');
  });

  test('the last episode has no card, and its end closes the player', async ({ app, api, clock, page, remote, player }) => {
    harbour(api, [[1, 1, 'watched'], [1, 2, 'watched'], [2, 1, DURATION - 30]]);
    await clock.pause();
    await app.open();
    await resumeFromHero(page, remote);
    await expect(playerScreen(page)).toContainText('S2 · E1');

    await clock.runFor(29_000);
    await expect(nextCard(page)).toHaveCount(0);
    await clock.runFor(1_000);
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
    expect(await player.loads()).toHaveLength(1);
  });
});

test.describe('CH ▲▼', () => {
  const marks = (api: FakeApi) => api.requestsTo('GET', '/v1/watching/marktime').map(({ query: { id, season, video, time } }) => ({ id, season, video, time }));

  test('CH ▲ plays the next episode, saving where the viewer left the current one first', async ({ app, api, clock, page, remote, player }) => {
    harbour(api, [[1, 1, 600]]);
    await clock.pause();
    await app.open();
    await resumeFromHero(page, remote);
    await clock.runFor(5_000);

    await remote.press('channelUp');
    await expect(playerScreen(page).getByRole('heading', { level: 1 })).toHaveText('Причал');
    await expect(playerScreen(page)).toContainText('Тихая гавань · S1 · E2');
    await expect.poll(async () => (await player.loads()).slice(-1)[0]).toEqual({ url: streamUrl(episodeVideo(1, 2), '1080p', 'hls4'), startAt: 0 });
    await clock.settle();
    expect(marks(api)).toEqual([{ id: String(HARBOUR.id), season: '1', video: '1', time: '605' }]);
  });

  test('CH ▼ goes back across seasons, and does nothing at the first episode', async ({ app, api, clock, page, remote, player }) => {
    harbour(api, [[1, 1, 'watched'], [1, 2, 'watched'], [2, 1, 600]]);
    await clock.pause();
    await app.open();
    await resumeFromHero(page, remote);
    await expect(playerScreen(page)).toContainText('Тихая гавань · S2 · E1');
    await clock.runFor(3_000);

    await remote.press('channelDown');
    await expect(playerScreen(page)).toContainText('Тихая гавань · S1 · E2');
    await expect.poll(() => player.state()).toBe('playing');
    await clock.runFor(2_000);
    await remote.press('channelDown');
    await expect(playerScreen(page)).toContainText('Тихая гавань · S1 · E1');
    await expect.poll(() => player.state()).toBe('playing');
    await clock.settle();
    expect(marks(api)).toEqual([
      { id: String(HARBOUR.id), season: '2', video: '1', time: '603' },
      { id: String(HARBOUR.id), season: '1', video: '2', time: '2' },
    ]);

    await remote.press('channelDown');
    await clock.runFor(1_000);
    await expect(playerScreen(page)).toContainText('Тихая гавань · S1 · E1');
    expect((await player.loads()).map((l) => l.url)).toEqual([
      streamUrl(episodeVideo(2, 1), '1080p', 'hls4'),
      streamUrl(episodeVideo(1, 2), '1080p', 'hls4'),
      streamUrl(episodeVideo(1, 1), '1080p', 'hls4'),
    ]);
  });

  test('the next episode runs into the next season; at the last episode CH ▲ does nothing', async ({ app, api, clock, page, remote, player }) => {
    harbour(api, [[1, 1, 'watched'], [1, 2, DURATION - 20]]);
    await clock.pause();
    await app.open();
    await resumeFromHero(page, remote);
    await expect(nextCard(page)).toContainText('S2 · E1 · Маяк');

    await remote.press('ok');
    await expect(playerScreen(page).getByRole('heading', { level: 1 })).toHaveText('Маяк');
    await expect.poll(() => player.state()).toBe('playing');

    await remote.press('channelUp');
    await clock.runFor(1_000);
    await expect(playerScreen(page).getByRole('heading', { level: 1 })).toHaveText('Маяк');
    expect(await player.loads()).toHaveLength(2);
  });
});

test.describe('resume after switching episodes', () => {
  /** GET /v1/watching that knows what the player saved: every marktime so far updates the viewer's progress. */
  function liveProgress(api: FakeApi, initial: EpisodeMark[]) {
    api.on('GET', '/v1/watching', () => {
      const saved = api
        .requestsTo('GET', '/v1/watching/marktime')
        .map(({ query }): EpisodeMark => [Number(query.season), Number(query.video), Number(query.time)]);
      const all = [...initial, ...saved];
      const latest = all.filter(([s, e], i) => !all.slice(i + 1).some(([ls, le]) => ls === s && le === e));
      return seriesProgress(HARBOUR, latest);
    });
  }

  test('Back from an episode reached with the next-episode card offers to resume that episode', async ({ app, api, clock, page, remote, player }) => {
    harbour(api, [[1, 1, DURATION - 20]]);
    liveProgress(api, [[1, 1, DURATION - 20]]);
    await clock.pause();
    await app.open();
    await resumeFromHero(page, remote);

    await remote.press('ok'); // the card: play the next episode now
    await expect(playerScreen(page).getByRole('heading', { level: 1 })).toHaveText('Причал');
    await expect.poll(async () => (await player.loads()).slice(-1)[0]).toEqual({
      url: streamUrl(episodeVideo(1, 2), '1080p', 'hls4'), startAt: 0,
    });
    await expect.poll(() => player.state()).toBe('playing');
    await clock.runFor(40_000);

    await remote.press('back'); // the controls have hidden by now, so Back leaves
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
    await expect(app.focused).toHaveAccessibleName('Продолжить S1 · E2');

    await remote.press('ok');
    await expect(playerScreen(page)).toContainText('Тихая гавань · S1 · E2');
    await expect.poll(async () => (await player.loads()).slice(-1)[0]).toEqual({ url: streamUrl(episodeVideo(1, 2), '1080p', 'hls4'), startAt: 40 });
  });
});
