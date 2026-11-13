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

  for (const kind of ['film', 'episode'] as const) test(`Retry refreshes expired links and resumes the same ${kind} position`, async ({ app, api, clock, page, remote, player }) => {
    let mid = RIVER_VIDEO;
    if (kind === 'film') river(api, 120);
    else {
      const series = fakeSeries(31, 'Тихая гавань', [['Первая'], ['Вторая'], ['Третья'], ['Четвёртая']]);
      mid = series.seasons![3]!.episodes[0]!.id;
      fakeHome(api, { hot: [series], movies: [], serials: [], progress: { [series.id]: seriesProgress(series, [[4, 1, 120]]) } });
    }
    let requests = 0;
    api.on('GET', '/v1/items/media-links', () => ({ json: {
      files: [{ codec: 'h264', quality: '1080p', quality_id: 3, w: 1920, h: 1080,
        urls: { http: `https://cdn.test/film-${++requests}.mp4` } }], subtitles: [],
    } }));
    await clock.pause();
    await app.open();
    await playFromHero(page, remote);
    await player.time(145);
    await player.fail('network');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Повторить' })).toBeFocused();
    await remote.press('ok');
    await expect.poll(() => player.state()).toBe('playing');
    expect(await player.loads()).toEqual([
      { url: 'https://cdn.test/film-1.mp4', startAt: 120 },
      { url: 'https://cdn.test/film-2.mp4', startAt: 145 },
    ]);
    expect(requests).toBe(2);
    expect(api.requestsTo('GET', '/v1/items/media-links').map((request) => request.query.mid)).toEqual([String(mid), String(mid)]);
  });

  test('optional manifest failure still hands a supplied HLS source to the adaptive player', async ({ app, api, page, remote, player }) => {
    river(api);
    const url = streamUrl(RIVER_VIDEO, '1080p', 'hls4');
    api.on('GET', '/v1/items/media-links', { json: { files: [{ codec: 'h264', quality: '1080p', quality_id: 3,
      w: 1920, h: 1080, urls: { hls4: url } }], subtitles: [] } });
    await page.route(url, (route) => route.abort('connectionfailed'));
    await app.open();
    await player.script({ adaptiveBitrate: true });
    await playFromHero(page, remote);
    expect(await player.loads()).toEqual([{ url, startAt: 0 }]);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('failed link refresh keeps Retry usable without replaying cached links or duplicating requests', async ({ app, api, page, remote, player }) => {
    river(api);
    await app.open();
    await playFromHero(page, remote);
    // Exhaust the supplied fallback chain through runtime failures.
    for (let attempt = 0; attempt < 6; attempt++) {
      await player.fail('network');
      if (attempt < 5) await expect.poll(() => player.state()).toBe('playing');
    }
    await expect(page.getByRole('alert')).toBeVisible();
    const before = await player.loads();
    let answer!: (value: { status: number; json: unknown }) => void;
    const pending = new Promise<{ status: number; json: unknown }>((resolve) => { answer = resolve; });
    api.on('GET', '/v1/items/media-links', () => pending);
    await remote.press('ok', 'ok', 'ok');
    await expect.poll(() => api.requestsTo('GET', '/v1/items/media-links').length).toBe(2);
    expect(await player.loads()).toEqual(before);
    answer({ status: 400, json: { status: 400, error: 'unavailable' } });
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await player.loads()).toEqual(before);
    api.on('GET', '/v1/items/media-links', { json: { files: [{ codec: 'h264', quality: '720p', quality_id: 2,
      w: 1280, h: 720, urls: { http: 'https://cdn.test/refreshed.mp4' } }], subtitles: [] } });
    await remote.press('ok');
    await expect.poll(() => player.state()).toBe('playing');
    const recovered = await player.loads();
    expect(recovered[recovered.length - 1]?.url).toBe('https://cdn.test/refreshed.mp4');
  });

  test('leaving during Retry ignores a late fresh-link response', async ({ app, api, page, remote, player }) => {
    river(api);
    api.on('GET', '/v1/items/media-links', { json: { files: [{ codec: 'h264', quality: '1080p', quality_id: 3,
      w: 1920, h: 1080, urls: { http: 'https://cdn.test/old.mp4' } }], subtitles: [] } });
    await app.open();
    await playFromHero(page, remote);
    await player.fail();
    await expect(page.getByRole('alert')).toBeVisible();
    let answer!: (value: { json: unknown }) => void;
    const pending = new Promise<{ json: unknown }>((resolve) => { answer = resolve; });
    api.on('GET', '/v1/items/media-links', () => pending);
    await remote.press('ok');
    await expect.poll(() => api.requestsTo('GET', '/v1/items/media-links').length).toBe(2);
    await remote.press('back', 'back'); // loading controls hide first, then leave
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
    const before = await player.loads();
    answer({ json: { files: [{ codec: 'h264', quality: '1080p', quality_id: 3,
      w: 1920, h: 1080, urls: { http: 'https://cdn.test/late.mp4' } }], subtitles: [] } });
    await api.idle();
    expect(await player.loads()).toEqual(before);
    expect(await player.state()).toBe('idle');
  });
});

test.describe('controls', () => {
  test('long labels wrap without clipping, missing names stay truthful, and remote focus scrolls into view', async ({ app, api, clock, page, remote, player }) => {
    river(api);
    await clock.pause();
    await app.open();
    const longName = 'Русский · Студия профессионального многоголосого перевода · Полная версия с дополнительными комментариями и описанием '.repeat(2) + 'ExtendedCommentary'.repeat(8);
    await player.script({ tracks: { audio: [
      { id: 'long', lang: 'rus', label: longName, selected: true },
      { id: 'unnamed', lang: 'rus', label: ' ' },
      { id: 'unknown', lang: 'unk', label: '' },
      ...Array.from({ length: 10 }, (_, n) => ({ id: `extra:${n}`, lang: 'eng', label: `eng · Commentary ${n + 1}` })),
    ] } });
    await playFromHero(page, remote);
    const pills = page.locator('.playback-pills');
    await expect(pills).toContainText(longName);
    const overlayFits = await pills.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const title = document.querySelector('.player-controls__titles')!.getBoundingClientRect();
      return box.right <= 1920 && box.left >= title.right && element.scrollWidth <= element.clientWidth;
    });
    expect(overlayFits).toBe(true);
    await remote.press('up', 'down');
    const dialog = page.getByRole('dialog');
    const label = dialog.locator('.playback-settings__label').first();
    await expect(label).toHaveText(longName);
    expect(await label.evaluate((element) => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)).toBe(true);
    expect(await label.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const column = element.closest('section')!.getBoundingClientRect();
      return box.left >= column.left && box.right <= column.right;
    })).toBe(true);
    await remote.press('down');
    await expect(dialog.getByRole('button', { name: 'русский · Дорожка 2', exact: true })).toBeFocused();
    await remote.press('down');
    await expect(dialog.getByRole('button', { name: 'Дорожка 3', exact: true })).toBeFocused();
    await remote.repeat('down', 10);
    const last = dialog.getByRole('button', { name: 'английский · Commentary 10', exact: true });
    await expect(last).toBeFocused();
    expect(await last.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const list = element.parentElement!.getBoundingClientRect();
      return box.top >= list.top && box.bottom <= list.bottom && element.scrollWidth <= element.clientWidth;
    })).toBe(true);
    const box = await dialog.boundingBox();
    expect(box!.x + box!.width / 2).toBeCloseTo(960, 0);
    expect(box!.y + box!.height / 2).toBeCloseTo(540, 0);
  });

  test('full same-language names survive the overlay and picker, with truthful current and pending states', async ({ app, api, clock, page, remote, player }) => {
    river(api);
    await clock.pause();
    await app.open();
    const original = 'Original English commentary · Director';
    const dub = 'Русский · Полный дубляж · Студия длинных названий — расширенная театральная редакция с комментариями переводчика';
    await player.script({ tracks: { audio: [
      { id: 'original', lang: 'eng', label: original, selected: true },
      { id: 'dub', lang: 'eng', label: dub, pending: true },
    ], subtitlesOff: true } });
    await playFromHero(page, remote);
    const pills = page.locator('.playback-pills');
    await expect(pills).toContainText(original);
    await expect(pills).toContainText(`После продолжения: ${dub}`);
    await remote.press('up', 'down');
    const dialog = page.getByRole('dialog');
    const current = dialog.getByRole('button', { name: `${original} ✓ Выбрано`, exact: true });
    const pending = dialog.getByRole('button', { name: `${dub} После продолжения`, exact: true });
    await expect(current).toBeFocused();
    await expect(current).toHaveAttribute('aria-pressed', 'true');
    await expect(pending).toHaveAttribute('aria-pressed', 'false');
    await remote.press('down', 'ok');
    await expect(pending).toBeFocused();
    await expect.poll(async () => (await player.calls()).filter((call) => call.op === 'selectAudio')).toEqual([{ op: 'selectAudio', id: 'dub' }]);
    // A request alone is not confirmation from the adapter.
    await expect(current).toHaveAttribute('aria-pressed', 'true');
    await expect(pending).toHaveAttribute('data-pending', 'true');
    await remote.press('right', 'ok');
    await expect(dialog.getByRole('button', { name: 'Выкл. ✓ Выбрано', exact: true })).toBeFocused();
    await expect.poll(async () => (await player.calls()).filter((call) => call.op === 'selectSubtitle')).toEqual([{ op: 'selectSubtitle', id: null }]);
    expect(await player.seeks()).toEqual([]);
  });

  test('quality changes keep the paused position and display newly confirmed track choices', async ({ app, api, clock, page, remote, player }) => {
    river(api, 1200);
    await clock.pause();
    await app.open();
    await player.script({ tracks: { audio: [
      { id: 'a', lang: 'rus', label: 'rus · Studio A', selected: true },
      { id: 'b', lang: 'rus', label: 'rus · Studio B', pending: true },
    ], subtitles: [{ id: 'sub', lang: 'eng', label: 'eng · SDH', pending: true }] } });
    await playFromHero(page, remote);
    await remote.press('ok', 'up');
    const dialog = page.getByRole('dialog');
    const subtitles = page.locator('.playback-pills').getByRole('button', { name: /^Субтитры:/ });
    await expect(subtitles).toContainText('Субтитры: —');
    await expect(subtitles).toContainText('После продолжения: английский · SDH');
    await remote.press('down', 'right', 'down');
    await expect(dialog.getByRole('button', { name: 'английский · SDH После продолжения', exact: true })).toBeFocused();
    await remote.press('up', 'up', 'right');
    await expect(dialog.getByRole('tab', { name: 'Качество', exact: true })).toBeFocused();
    await player.script({ tracks: { audio: [
      { id: 'a', lang: 'rus', label: 'rus · Studio A' },
      { id: 'b', lang: 'rus', label: 'rus · Studio B', selected: true },
    ], subtitles: [{ id: 'sub', lang: 'eng', label: 'eng · SDH', selected: true }] } });
    await remote.press('down', 'down', 'ok');
    await expect.poll(() => player.loads()).toEqual([
      { url: streamUrl(RIVER_VIDEO, '1080p', 'hls4'), startAt: 1200 },
      { url: streamUrl(RIVER_VIDEO, '1080p', 'http'), startAt: 1200 },
    ]);
    await expect(dialog.getByRole('button', { name: '1080p ✓ Выбрано', exact: true })).toBeFocused();
    expect(await player.state()).toBe('paused');
    await remote.press('up', 'up', 'left', 'down', 'down');
    await expect(dialog.getByRole('button', { name: 'русский · Studio B ✓ Выбрано', exact: true })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'русский · Studio A', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await remote.press('back');
    await expect(page.locator('.playback-pills')).toContainText('Аудио: русский · Studio B');
    await expect(subtitles).toContainText('Субтитры: английский · SDH');
    await expect(page.locator('.playback-pills')).not.toContainText('После продолжения');
    expect(await player.seeks()).toEqual([]);
  });

  test('Up opens Audio/Subtitles directly; tabs and Back preserve playback remote semantics', async ({ app, api, clock, page, remote, player }) => {
    river(api);
    await clock.pause();
    await app.open();
    await playFromHero(page, remote);

    await remote.press('up');
    const dialog = page.getByRole('dialog', { name: 'Настройки воспроизведения' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab', { name: 'Аудио и субтитры' })).toBeFocused();
    await remote.press('right');
    await expect(dialog.getByRole('tab', { name: 'Качество', exact: true })).toBeFocused();
    await remote.press('left', 'left');
    await expect(dialog.getByRole('tab', { name: 'Информация' })).toBeFocused();
    await remote.press('back');
    await expect(dialog).toHaveCount(0);
    await expect(progressBar(page)).toBeVisible();
    expect(await player.state()).toBe('playing');
    expect(await player.seeks()).toEqual([]);
    await remote.press('ok');
    expect(await player.state()).toBe('paused');
  });

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
  test('preview stays inside the timeline at both ends and distinguishes the playing position', async ({ app, api, clock, page, remote, player }) => {
    river(api);
    await clock.pause();
    await app.open();
    await playFromHero(page, remote);
    await remote.press('left');
    const preview = page.locator('.player-bar__preview');
    await expect(preview).toContainText('Перемотка');
    await expect(page.locator('.player-controls__times')).toContainText('Сейчас 0:00');
    for (const target of [0, DURATION - 1]) {
      await player.time(target);
      await clock.runFor(1_000);
      await remote.press(target === 0 ? 'left' : 'right');
      const box = await preview.boundingBox();
      const bar = await progressBar(page).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(bar!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(bar!.x + bar!.width);
    }
  });

  test('◀▶ step 10 s, then 30 s, then 60 s while held, preview the time, and seek once', async ({ app, api, clock, page, remote, player }) => {
    river(api, 20 * 60);
    await clock.pause();
    await app.open();
    await playFromHero(page, remote);

    // Held: three 10 s steps, three 30 s steps, then 60 s steps.
    await remote.repeat('right', 7);
    await expect(progressBar(page)).toHaveAttribute('aria-valuetext', '23:00 из 1:40:00');
    await expect(page.locator('.player-bar__preview-time')).toHaveText('23:00');
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
