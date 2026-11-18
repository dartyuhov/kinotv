import { expect, test } from './harness/test';
import { setAppVisible } from './harness/player';

const A = { id: 101, title: 'Test Channel A', name: 'test-a', logos: {}, stream: 'https://live.test/a.m3u8?signature=one' };
const B = { id: '202', title: 'Test Channel B', logos: {}, stream: 'https://live.test/b.m3u8' };
const OFF = { id: 303, title: 'Unavailable Channel', stream: '' };

test('TV preserves snapshot order and identities, deduplicates, and exposes unavailable channels', async ({ app, api, page, remote }) => {
  api.on('GET', '/v1/tv', { json: { channels: [A, { ...A, id: '101', title: 'Duplicate' }, B, OFF, { title: 'Invalid' }] } });
  await app.open();
  await remote.press('right', 'right', 'right', 'right', 'ok');
  const cards = page.locator('[data-grid="tv:grid"] [role="button"]');
  await expect(cards).toHaveCount(3);
  await expect(cards).toHaveText(['Test Channel ATest Channel AПрямой эфир', 'Test Channel BTest Channel BПрямой эфир', 'Unavailable ChannelUnavailable ChannelТрансляция недоступна']);
  await expect(app.focused).toHaveAccessibleName('Test Channel A, Прямой эфир');
  expect(api.requestsTo('GET', '/v1/tv')).toHaveLength(1);
  expect(api.requestsTo('GET', '/v1/tv')[0]!.query).toEqual({ access_token: 'seeded-access-token' });
});

test('a late channel-switch response cannot replace the screen after Back', async ({ app, api, page, remote, player }) => {
  let release!: () => void;
  let requests = 0;
  api.on('GET', '/v1/tv', async () => {
    if (++requests === 3) await new Promise<void>((resolve) => { release = resolve; });
    return { json: { channels: [A, B] } };
  });
  await app.open();
  await remote.press('right', 'right', 'right', 'right', 'ok');
  await expect(app.focused).toHaveAccessibleName('Test Channel A, Прямой эфир');
  await remote.press('ok');
  await expect.poll(() => player.state()).toBe('playing');
  await remote.press('channelUp');
  await expect.poll(() => requests).toBe(3);
  await remote.press('back', 'back');
  release();
  await expect(app.focused).toHaveAccessibleName('Test Channel A, Прямой эфир');
  await expect(page.locator('[data-screen="livePlayer"]')).toHaveCount(0);
  expect(await player.loads()).toHaveLength(1);
});

test('TV transport retries exhaust into a recoverable error with no false empty result', async ({ app, api, page, remote, clock }) => {
  await clock.pause();
  api.on('GET', '/v1/tv', { networkError: true });
  await app.open();
  await remote.repeat('right', 4);
  await expect(page.getByRole('tabpanel').getByRole('status')).toHaveText('Загрузка каналов…');
  await clock.runFor(15_000);
  await expect(page.getByRole('tabpanel').getByRole('status')).toHaveText('Не удалось загрузить каналы');
  await expect(app.focused).toHaveAccessibleName('Повторить · OK');
  api.on('GET', '/v1/tv', { json: { channels: [A] } });
  await remote.press('ok');
  await expect(page.getByRole('button', { name: 'Test Channel A, Прямой эфир' })).toBeVisible();
  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('ТВ');
});

test('Back after zapping and removal restores the nearest surviving opening-grid card', async ({ app, api, page, remote, player }) => {
  let channels = [A, { ...A, id: 404, title: 'Opening Channel' }, { ...A, id: 505, title: 'Neighbor' }];
  api.on('GET', '/v1/tv', () => ({ json: { channels } }));
  await app.open();
  await remote.press('right', 'right', 'right', 'right', 'ok');
  await expect(app.focused).toHaveAccessibleName('Test Channel A, Прямой эфир');
  await remote.press('right', 'ok');
  await expect.poll(() => player.state()).toBe('playing');
  await remote.press('channelUp');
  await expect(page.locator('[data-screen="livePlayer"] h1')).toHaveText('Neighbor');
  channels = channels.filter((c) => c.id !== 404);
  await remote.press('back', 'back');
  await expect(page.getByRole('button', { name: 'Opening Channel, Прямой эфир' })).toHaveCount(0);
  await expect(app.focused).toHaveAccessibleName('Neighbor, Прямой эфир');
});

test('switch and background during deferred prepare never autoplay stale adapters', async ({ app, api, page, remote, player, clock }) => {
  api.on('GET', '/v1/tv', { json: { channels: [A, B] } });
  await clock.pause();
  await app.open();
  await player.script({ loadDelayMs: 2000 });
  await remote.press('right', 'right', 'right', 'right', 'ok');
  await expect(app.focused).toHaveAccessibleName('Test Channel A, Прямой эфир');
  await remote.press('ok');
  await expect.poll(() => player.loads()).toHaveLength(1);
  await remote.press('channelUp');
  await expect.poll(() => player.loads()).toHaveLength(2);
  await setAppVisible(page, false);
  await clock.runFor(2500);
  expect((await player.calls()).filter((c) => c.op === 'play')).toEqual([]);
  await player.script({ loadDelayMs: 0 });
  await setAppVisible(page, true);
  await expect.poll(() => player.state()).toBe('paused');
  expect(await player.loads()).toEqual([{ url: A.stream, startAt: 0 }, { url: B.stream, startAt: 0 }, { url: B.stream, startAt: 0 }]);
  await remote.press('play');
  await expect.poll(() => player.state()).toBe('playing');
  expect((await player.calls()).filter((c) => c.op === 'play')).toHaveLength(1);
});

test('Retry refreshes the same source identity, removed channels stay unavailable, and ended never advances', async ({ app, api, page, remote, player }) => {
  let channels = [A];
  api.on('GET', '/v1/tv', () => ({ json: { channels } }));
  await app.open();
  await remote.press('right', 'right', 'right', 'right', 'ok');
  await expect(app.focused).toHaveAccessibleName('Test Channel A, Прямой эфир');
  await player.script({ loadError: 'network' });
  await remote.press('ok');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Повторить' })).toBeFocused();
  channels = [{ ...A, stream: 'https://live.test/a-v2?signature=two' }];
  await remote.press('ok');
  await expect.poll(() => player.state()).toBe('playing');
  expect(await player.loads()).toEqual([{ url: A.stream, startAt: 0 }, { url: channels[0]!.stream, startAt: 0 }]);
  await player.end();
  await expect(page.getByRole('alert')).toContainText('Трансляция завершена');
  channels = [];
  await remote.press('ok');
  await expect(page.getByRole('alert')).toContainText('Трансляция недоступна');
  expect(await player.loads()).toHaveLength(2);
  await remote.press('back');
  await expect(page.locator('[data-screen="root"]')).toBeVisible();
  expect(api.requests.filter((r) => /marktime|toggle/.test(r.path))).toEqual([]);
});

test('background releases live playback; foreground resolves a new URL paused without position restoration', async ({ app, api, page, remote, player, clock }) => {
  let stream = A.stream;
  api.on('GET', '/v1/tv', () => ({ json: { channels: [{ ...A, stream }] } }));
  await clock.pause();
  await app.open();
  await remote.press('right', 'right', 'right', 'right', 'ok');
  await expect(app.focused).toHaveAccessibleName('Test Channel A, Прямой эфир');
  await remote.press('ok');
  await expect.poll(() => player.state()).toBe('playing');
  await player.time(123);
  await setAppVisible(page, false);
  await expect.poll(() => player.state()).toBe('idle');
  stream = 'https://live.test/fresh-edge';
  await setAppVisible(page, true);
  await expect.poll(() => player.state()).toBe('paused');
  expect(await player.loads()).toEqual([{ url: A.stream, startAt: 0 }, { url: stream, startAt: 0 }]);
  await clock.runFor(31_000);
  expect((await player.calls()).filter((c) => c.op === 'play')).toHaveLength(1);
  expect((await player.calls()).filter((c) => ['seek', 'suspend', 'restore'].includes(c.op))).toEqual([]);
  await remote.press('play');
  await expect.poll(() => player.state()).toBe('playing');
  expect(api.requests.filter((r) => /marktime|toggle/.test(r.path))).toEqual([]);
});

test('TV is followed directly by Bookmarks without an unsupported Sport tab', async ({ app, api, page, remote }) => {
  api.on('GET', '/v1/tv', { json: { channels: [A] } });
  await app.open();
  await remote.repeat('right', 4);
  await expect(page.getByRole('tab', { name: 'ТВ', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Test Channel A, Прямой эфир' })).toBeVisible();
  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('Закладки');
  await expect(page.getByRole('tab', { name: 'Спорт', exact: true })).toHaveCount(0);
});

for (const response of [{ channels: [] }, {}, { channels: 'bad' }, { channels: [{ id: null }] }]) {
  test(`TV distinguishes ${JSON.stringify(response)} from a usable list and Retry recovers`, async ({ app, api, page, remote }) => {
    api.on('GET', '/v1/tv', { json: response });
    await app.open();
    await remote.repeat('right', 4);
    await expect(page.getByRole('tabpanel').getByRole('status')).toHaveText(Array.isArray(response.channels) && !response.channels.length ? 'Сейчас нет доступных каналов' : 'Не удалось загрузить каналы');
    api.on('GET', '/v1/tv', { json: { channels: [A] } });
    await remote.press('ok');
    // Error already focuses Retry; empty leaves the tab focused until OK enters it.
    if (Array.isArray(response.channels) && !response.channels.length) await remote.press('ok');
    await expect(page.getByRole('button', { name: 'Test Channel A, Прямой эфир' })).toBeVisible();
  });
}

test('TV grid page keys virtualize one snapshot without API paging', async ({ app, api, page, remote }) => {
  api.on('GET', '/v1/tv', { json: { channels: Array.from({ length: 100 }, (_, i) => ({ ...A, id: i + 1, title: `Channel ${i + 1}` })) } });
  await app.open();
  await remote.press('right', 'right', 'right', 'right', 'ok');
  await expect(app.focused).toHaveAccessibleName('Channel 1, Прямой эфир');
  await remote.press('channelDown');
  await expect(app.focused).toHaveAccessibleName('Channel 9, Прямой эфир');
  expect(await page.locator('[data-grid="tv:grid"] [role="button"]').count()).toBeLessThan(100);
  expect(api.requestsTo('GET', '/v1/tv')).toHaveLength(1);
});

test('hidden during source fetch suppresses stale load; foreground resolves paused and Back cancels late fetch', async ({ app, api, page, remote, player }) => {
  let release!: () => void;
  let requests = 0;
  api.on('GET', '/v1/tv', async () => {
    const request = ++requests;
    if (request === 2 || request === 5) await new Promise<void>((resolve) => { release = resolve; });
    return { json: { channels: [{ ...A, stream: request === 2 ? 'https://live.test/obsolete' : A.stream }] } };
  });
  await app.open();
  await remote.press('right', 'right', 'right', 'right', 'ok');
  await expect(app.focused).toHaveAccessibleName('Test Channel A, Прямой эфир');
  await remote.press('ok');
  await expect.poll(() => requests).toBe(2);
  await setAppVisible(page, false);
  release();
  await setAppVisible(page, true);
  await expect.poll(() => player.state()).toBe('paused');
  expect(await player.loads()).toEqual([{ url: A.stream, startAt: 0 }]);
  expect((await player.calls()).filter((c) => c.op === 'play')).toEqual([]);
  await remote.press('back', 'back');
  await expect(app.focused).toHaveAccessibleName('Test Channel A, Прямой эфир');
  await expect.poll(() => requests).toBe(4);
  await remote.press('ok');
  await expect.poll(() => requests).toBe(5);
  await remote.press('back', 'back');
  release();
  await expect(page.locator('[data-screen="root"]')).toBeVisible();
  expect(await player.loads()).toHaveLength(1);
});

test('live starts fresh, never seeks or writes progress, zaps with bounds and restores opening focus', async ({ app, api, page, remote, player, clock }) => {
  api.on('GET', '/v1/tv', { json: { channels: [A, OFF, B] } });
  await clock.pause();
  await app.open();
  await remote.press('right', 'right', 'right', 'right', 'ok');
  await expect(app.focused).toHaveAccessibleName('Test Channel A, Прямой эфир');
  await remote.press('ok');
  await expect.poll(() => player.state()).toBe('playing');
  await expect(page.locator('[data-screen="livePlayer"] h1')).toHaveText(A.title);
  expect(await player.loads()).toEqual([{ url: A.stream, startAt: 0 }]);
  await remote.press('left', 'right', 'rewind', 'fastForward');
  await clock.runFor(31_000);
  expect(await player.seeks()).toEqual([]);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await remote.press('pause');
  await expect.poll(() => player.state()).toBe('paused');
  await remote.press('play');
  await remote.press('channelUp');
  await expect(page.locator('[data-screen="livePlayer"] h1')).toHaveText(B.title);
  await expect.poll(() => player.state()).toBe('playing');
  const count = (await player.loads()).length;
  await remote.press('channelUp');
  expect(await player.loads()).toHaveLength(count);
  await remote.press('channelDown');
  await expect(page.locator('[data-screen="livePlayer"] h1')).toHaveText(A.title);
  await remote.press('back', 'back');
  await expect(app.focused).toHaveAccessibleName('Test Channel A, Прямой эфир');
  expect(api.requests.filter((r) => /marktime|toggle|media-links|\/items\/\d/.test(r.path))).toEqual([]);
});

test('a later switch wins even when an older snapshot resolves last', async ({ app, api, page, remote, player }) => {
  let release!: () => void;
  let requests = 0;
  api.on('GET', '/v1/tv', async () => {
    if (++requests === 3) await new Promise<void>((resolve) => { release = resolve; });
    return { json: { channels: [A, B] } };
  });
  await app.open();
  await remote.press('right', 'right', 'right', 'right', 'ok');
  await expect(app.focused).toHaveAccessibleName('Test Channel A, Прямой эфир');
  await remote.press('ok');
  await expect.poll(() => player.state()).toBe('playing');
  await remote.press('channelUp');
  await expect.poll(() => requests).toBe(3);
  await remote.press('channelUp');
  await expect(page.locator('[data-screen="livePlayer"] h1')).toHaveText(B.title);
  await expect.poll(() => player.state()).toBe('playing');
  release();
  await remote.press('back', 'back');
  await expect(app.focused).toHaveAccessibleName('Test Channel A, Прямой эфир');
  expect(await player.loads()).toEqual([{ url: A.stream, startAt: 0 }, { url: B.stream, startAt: 0 }]);
});

test('selecting an unavailable channel never substitutes another broadcast', async ({ app, api, page, remote, player }) => {
  api.on('GET', '/v1/tv', { json: { channels: [OFF, A] } });
  await app.open();
  await remote.press('right', 'right', 'right', 'right', 'ok');
  await expect(app.focused).toHaveAccessibleName('Unavailable Channel, Трансляция недоступна');
  await remote.press('ok');
  await expect(page.getByRole('alert')).toContainText('Трансляция недоступна');
  expect(await player.loads()).toEqual([]);
  await remote.press('back');
  await expect(app.focused).toHaveAccessibleName('Unavailable Channel, Трансляция недоступна');
});
