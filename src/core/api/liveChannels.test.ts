import { expect, it } from 'vitest';
import { createApiClient } from './client';
import type { Http } from './http';

const client = (body: unknown) => createApiClient((async () => body) as Http);

it('normalizes the documented TV envelope, preserving opaque sources and first-seen identity/order', async () => {
  expect(await client({ channels: [
    { id: 101, title: 'A', logos: { m: 'https://logos.test/a-m.png', s: 'https://logos.test/a-s.png' }, stream: 'https://live.test/opaque?sig=abc%2F123' },
    { id: '101', title: 'duplicate' },
    { id: '202', name: 'b', logos: { m: 'invalid', s: 'https://logos.test/b.png' }, stream: '' },
    { id: 303, title: 'C', stream: 'file:///local' },
    { id: null, title: 'invalid identity' },
  ] }).tvChannels()).toEqual([
    { id: '101', title: 'A', logoUrl: 'https://logos.test/a-m.png', playback: { kind: 'hls', url: 'https://live.test/opaque?sig=abc%2F123' } },
    { id: '202', title: 'Канал 202', name: 'b', logoUrl: 'https://logos.test/b.png', playback: { kind: 'unavailable', reason: 'missing-stream' } },
    { id: '303', title: 'C', logoUrl: undefined, playback: { kind: 'unavailable', reason: 'unsupported-stream' } },
  ]);
});

it('rejects a non-success TV status rather than treating an empty channels array as success', async () => {
  await expect(client({ status: 403, channels: [] }).tvChannels()).rejects.toMatchObject({ kind: 'rejected', status: 403 });
});
