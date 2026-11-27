import { describe, expect, it, vi } from 'vitest';
import type { HistoryEntry } from '../api/types';
import { PREVIEW_SERVICE_ID as BUILD_SERVICE_ID } from '../../../tools/tizen/configXml';
import { createPreviewPublisher, PREVIEW_INTERVAL_MS, PREVIEW_SERVICE_ID, PREVIEW_STORAGE_KEY, previewData, previewTarget } from './preview';

const entry = (id: number, medium = `https://cdn.test/${id}-m.jpg`): HistoryEntry => ({
  item: { id, type: 'movie', subtype: '', title: `Фильм ${id} / Film ${id}`, posters: { small: '', medium, big: '' } },
  mediaId: id * 10, duration: 100, time: 10, lastSeen: 1000 - id,
});

const kv = () => {
  const values = new Map<string, unknown>();
  return { values, get: <T,>(key: string) => (values.get(key) ?? null) as T | null, set: (key: string, value: unknown) => { values.set(key, value); }, remove: (key: string) => { values.delete(key); } };
};

describe('Smart Hub preview data', () => {
  it('matches the service id the build declares', () => {
    expect(PREVIEW_SERVICE_ID).toBe(BUILD_SERVICE_ID);
  });

  it('makes one section of 2:3 poster tiles that open their title, newest first, at most twelve', () => {
    const data = JSON.parse(previewData(Array.from({ length: 15 }, (_, i) => entry(i + 1)), 'Недавно смотрели')!);
    expect(data.sections).toHaveLength(1);
    expect(data.sections[0].title).toBe('Недавно смотрели');
    expect(data.sections[0].tiles).toHaveLength(12);
    expect(data.sections[0].tiles[0]).toEqual({ title: 'Фильм 1', image_url: 'https://cdn.test/1-m.jpg', image_ratio: '2by3',
      action_data: '{"itemId":1}', is_playable: false });
  });

  it('skips titles without an http(s) poster, and has no data without any', () => {
    const data = JSON.parse(previewData([entry(1, ''), entry(2, 'file:///x.jpg'), entry(3)], 'S')!);
    expect(data.sections[0].tiles.map((tile: { action_data: string }) => tile.action_data)).toEqual(['{"itemId":3}']);
    expect(previewData([entry(1, '')], 'S')).toBeUndefined();
  });
});

describe('a tapped tile', () => {
  const payload = (value: string) => [{ key: 'PAYLOAD', value: [value] }];
  it('reads the title from PAYLOAD, plain or URI-encoded', () => {
    expect(previewTarget(payload(JSON.stringify({ values: '{"itemId":42}' })))).toEqual({ itemId: 42 });
    expect(previewTarget(payload(encodeURIComponent(JSON.stringify({ values: '{"itemId":42}' }))))).toEqual({ itemId: 42 });
    expect(previewTarget(payload(JSON.stringify({ values: encodeURIComponent('{"itemId":42}') })))).toEqual({ itemId: 42 });
  });
  it('ignores other launches and malformed data', () => {
    expect(previewTarget(undefined)).toBeUndefined();
    expect(previewTarget([{ key: 'caller', value: ['x'] }])).toBeUndefined();
    expect(previewTarget(payload('not json'))).toBeUndefined();
    expect(previewTarget(payload(JSON.stringify({ values: '{"itemId":-1}' })))).toBeUndefined();
  });
});

describe('sending the preview', () => {
  it('sends new data, skips data already delivered, and waits out the TV interval for a change', async () => {
    let clock = 1_000_000;
    const store = kv();
    const launch = vi.fn(async () => 'ok');
    const timers: Array<{ run: () => void; ms: number }> = [];
    const publisher = createPreviewPublisher({ launch, kv: store, now: () => clock, schedule: (run, ms) => { timers.push({ run, ms }); return timers.length; }, cancel: () => undefined });
    await publisher.publish('A');
    expect(launch).toHaveBeenCalledTimes(1);
    expect(store.values.get(PREVIEW_STORAGE_KEY)).toEqual({ json: 'A', sentAt: 1_000_000, status: 'ok' });
    await publisher.publish('A');
    expect(launch).toHaveBeenCalledTimes(1);
    clock += 60_000;
    await publisher.publish('B');
    expect(launch).toHaveBeenCalledTimes(1);
    expect(timers[timers.length - 1]!.ms).toBe(PREVIEW_INTERVAL_MS - 60_000);
    clock += PREVIEW_INTERVAL_MS;
    timers[timers.length - 1]!.run();
    await vi.waitFor(() => expect(launch).toHaveBeenLastCalledWith('B'));
  });

  it('records a failed launch and retries the same data after the interval', async () => {
    let clock = 0;
    const store = kv();
    const launch = vi.fn(async () => { throw new Error('Preview unsupported'); });
    const publisher = createPreviewPublisher({ launch, kv: store, now: () => clock, schedule: () => 0, cancel: () => undefined });
    await publisher.publish('A');
    expect(store.values.get(PREVIEW_STORAGE_KEY)).toMatchObject({ status: 'error: Preview unsupported' });
    clock += PREVIEW_INTERVAL_MS;
    await publisher.publish('A');
    expect(launch).toHaveBeenCalledTimes(2);
  });
});
