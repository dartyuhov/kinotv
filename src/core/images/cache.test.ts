import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it, vi } from 'vitest';
import { createBrowserImageStore, type ImageStore } from '../platform/imageStore';
import { createImageCache } from './cache';
import type { ImageTransport } from './transport';

const source = 'https://artwork.test/poster?size=medium&signature=one';
const response = (bytes = 100, cacheControl = 'max-age=3600') => new Response(new Uint8Array(bytes), {
  headers: { 'Content-Type': 'image/png', 'Cache-Control': cacheControl },
});
// Decode validation belongs to browser journeys; these exercise the public cache with controlled storage/network.
const validate = async () => undefined;
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

it('revisits validated artwork without waiting for disk, while releasing every display URL', async () => {
  const inner = createBrowserImageStore();
  let blocked = false;
  const read = vi.fn(async (key: string) => {
    if (blocked) throw new Error('Disk unavailable during revisit');
    return inner.read(key);
  });
  const transport = vi.fn<ImageTransport>(async () => response());
  const cache = createImageCache({ store: { ...inner, read }, transport, validate });
  const first = cache.acquire(source);
  const oldUrl = await first.ready;
  first.release();
  await expect(fetch(oldUrl!)).rejects.toThrow();
  const reads = read.mock.calls.length;
  blocked = true;
  const revisit = cache.acquire(source);
  const show = vi.fn();
  revisit.subscribe(show);
  // Publication must be synchronous from validated compressed bytes, not a
  // filesystem task behind access-time writes or an IntersectionObserver turn.
  expect(show).toHaveBeenCalledWith(expect.stringMatching(/^blob:/));
  expect(await revisit.ready).toMatch(/^blob:/);
  expect(read).toHaveBeenCalledTimes(reads);
  expect(transport).toHaveBeenCalledTimes(1);
  revisit.release();
});

it('displays demanded artwork before the startup inventory has finished', async () => {
  const inner = createBrowserImageStore();
  const seed = createImageCache({ store: inner, transport: async () => response(), validate });
  const seeded = seed.acquire(source);
  await seeded.ready;
  seeded.release();
  let finishInventory!: () => void;
  const store: ImageStore = { ...inner, list: () => new Promise(resolve => {
    finishInventory = () => { void inner.list().then(resolve); };
  }) };
  const cache = createImageCache({ store, transport: async () => response(), validate });
  const lease = cache.acquire(source);
  const show = vi.fn();
  lease.subscribe(show);
  await vi.waitFor(() => expect(show).toHaveBeenCalled());
  finishInventory();
  await lease.settled;
  lease.release();
});

it('bounds compressed revisit bytes with LRU eviction and clears them with disk cache', async () => {
  const inner = createBrowserImageStore();
  const read = vi.fn(inner.read);
  const transport = vi.fn<ImageTransport>(async () => response(100));
  const cache = createImageCache({ store: { ...inner, read }, transport, validate, memoryBudget: 200 });
  const visit = async (url: string) => { const lease = cache.acquire(url); await lease.ready; lease.release(); };
  await visit(source); await visit(`${source}2`); await visit(source); await visit(`${source}3`);
  const reads = read.mock.calls.length;
  await visit(source);
  expect(read).toHaveBeenCalledTimes(reads);
  await visit(`${source}2`);
  expect(read.mock.calls.length).toBeGreaterThan(reads);
  expect(transport).toHaveBeenCalledTimes(3);
  await cache.clear();
  await visit(source);
  expect(transport).toHaveBeenCalledTimes(4);
});

it('clears safely while startup reconciliation is still reading records', async () => {
  const inner = createBrowserImageStore();
  const seed = createImageCache({ store: inner, transport: async () => response(), validate });
  const lease = seed.acquire(source);
  await lease.ready; lease.release();
  let resume!: () => void;
  const store: ImageStore = { ...inner, async read(key) {
    await new Promise<void>(resolve => { resume = resolve; });
    return inner.read(key);
  } };
  const cache = createImageCache({ store, validate });
  await vi.waitFor(() => expect(resume).toBeTypeOf('function'));
  const cleared = cache.clear();
  resume();
  await cleared;
  expect((await cache.usage()).entries).toBe(0);
});

it('publishes validated artwork before a slow disk write finishes', async () => {
  const inner = createBrowserImageStore();
  let finishWrite!: () => void;
  const store: ImageStore = { ...inner, async writeTemporary(key, blob) {
    await new Promise<void>((resolve) => { finishWrite = resolve; });
    await inner.writeTemporary(key, blob);
  } };
  const cache = createImageCache({ store, transport: async () => response(), validate });
  const lease = cache.acquire(source);
  const show = vi.fn();
  lease.subscribe(show);
  await vi.waitFor(() => expect(show).toHaveBeenCalledWith(expect.stringMatching(/^blob:/)));
  expect(finishWrite).toBeTypeOf('function');
  expect((await inner.list()).length).toBe(0);
  finishWrite();
  await lease.settled;
  expect((await cache.usage()).entries).toBe(1);
  lease.release();
});

it('promotes a prefetched lease in place without replacing its display URL', async () => {
  const transport = vi.fn<ImageTransport>(async () => response());
  const cache = createImageCache({ store: createBrowserImageStore(), transport, validate });
  const lease = cache.acquire(source, 'poster', 'prefetch');
  const url = await lease.ready;
  lease.setPriority('visible');
  expect(await lease.ready).toBe(url);
  expect(transport).toHaveBeenCalledTimes(1);
  lease.release();
  await expect(fetch(url!)).rejects.toThrow();
});

it('persists prepared artwork and keeps HTTP validators for the original source', async () => {
  const store = createBrowserImageStore();
  const transport = vi.fn<ImageTransport>(async () => new Response(new Uint8Array(100), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600', ETag: 'original' },
  }));
  const prepare = vi.fn(async () => new Blob([new Uint8Array(20)], { type: 'image/webp' }));
  const cache = createImageCache({ store, transport, validate: prepare });
  const lease = cache.acquire(source);
  const url = await lease.ready;
  expect((await (await fetch(url!)).blob()).size).toBe(20);
  lease.release();
  const restarted = createImageCache({ store, transport, validate });
  const restored = restarted.acquire(source);
  const body = await (await fetch((await restored.ready)!)).blob();
  expect(body.size).toBe(20);
  expect(body.type).toBe('image/webp');
  expect(transport).toHaveBeenCalledTimes(1);
  restored.release();
});

it('serializes decodes and skips abandoned requests waiting for the decode lane', async () => {
  const finishes: Array<() => void> = [];
  const prepare = vi.fn(() => new Promise<void>((resolve) => finishes.push(resolve)));
  const cache = createImageCache({ store: createBrowserImageStore(), transport: async () => response(), validate: prepare });
  const first = cache.acquire(source);
  const abandoned = cache.acquire(`${source}abandoned`);
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
  abandoned.release();
  finishes[0]!();
  await first.ready;
  await abandoned.ready;
  expect(prepare).toHaveBeenCalledTimes(1);
  first.release();
});

it('migrates an existing oversized representation without a network transfer or losing freshness', async () => {
  const store = createBrowserImageStore();
  const transport = vi.fn<ImageTransport>(async () => response());
  const old = createImageCache({ store, transport, validate });
  const initial = old.acquire(source);
  await initial.ready;
  initial.release();
  const prepare = vi.fn(async () => new Blob([new Uint8Array(20)], { type: 'image/webp' }));
  const upgraded = createImageCache({ store, transport, validate: prepare });
  const migrated = upgraded.acquire(source);
  expect((await (await fetch((await migrated.ready)!)).blob()).size).toBe(20);
  migrated.release();
  const restarted = createImageCache({ store, transport, validate });
  const restored = restarted.acquire(source);
  expect((await (await fetch((await restored.ready)!)).blob()).type).toBe('image/webp');
  expect(transport).toHaveBeenCalledTimes(1);
  restored.release();
});

it('deduplicates full URLs across roles, keeps another lease alive, and releases its last display resource', async () => {
  let answer!: (response: Response) => void;
  const transport = vi.fn<ImageTransport>(() => new Promise((resolve) => { answer = resolve; }));
  const cache = createImageCache({ store: createBrowserImageStore(), transport, validate });
  const first = cache.acquire(source, 'poster');
  const second = cache.acquire(source, 'backdrop');
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  first.release();
  expect(transport.mock.calls[0]![1].signal.aborted).toBe(false);
  answer(response());
  const url = await second.ready;
  expect(url).toMatch(/^blob:/);
  expect(await first.ready).toBeUndefined();
  expect((await fetch(url!)).status).toBe(200);
  second.release();
  await expect(fetch(url!)).rejects.toThrow();
  transport.mockImplementation(async () => response());
  const different = cache.acquire(`${source}x`);
  await different.ready;
  expect(transport).toHaveBeenCalledTimes(2);
  different.release();
});

it('persists fresh records across restarts without transport and includes metadata in usage', async () => {
  const store = createBrowserImageStore();
  const transport = vi.fn<ImageTransport>(async () => response());
  const preparation = vi.fn(validate);
  let cache = createImageCache({ store, transport, validate: preparation });
  let lease = cache.acquire(source);
  await lease.ready;
  lease.release();
  const usage = await cache.usage();
  expect(usage.entries).toBe(1);
  expect(usage.managedBytes).toBeGreaterThan(100);
  expect(usage.managedBytes).toBe((await store.list())[0]!.size);
  lease = cache.acquire(source);
  expect(await lease.ready).toMatch(/^blob:/);
  lease.release();
  expect(preparation).toHaveBeenCalledTimes(1); // The admitted bytes are already validated this session.
  cache = createImageCache({ store: createBrowserImageStore(), transport, validate: preparation });
  lease = cache.acquire(source);
  expect(await lease.ready).toMatch(/^blob:/);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(preparation).toHaveBeenCalledTimes(2); // Persisted bytes get checked again after restart.
  lease.release();
});

it('serializes admission including old replacement, temporary and metadata bytes under concurrent writes', async () => {
  const inner = createBrowserImageStore();
  let peak = 0;
  const store: ImageStore = { ...inner, async writeTemporary(key, blob) {
    await inner.writeTemporary(key, blob);
    peak = Math.max(peak, (await inner.list()).reduce((sum, file) => sum + file.size, 0));
  } };
  const cache = createImageCache({ store, transport: async () => response(600), budget: 1200, validate });
  const leases = [source, `${source}2`, `${source}3`].map((url) => cache.acquire(url));
  expect(await Promise.all(leases.map((lease) => lease.ready))).toEqual([expect.stringMatching(/^blob:/), expect.stringMatching(/^blob:/), expect.stringMatching(/^blob:/)]);
  expect(peak).toBeLessThanOrEqual(1200);
  expect((await cache.usage()).entries).toBe(1);
  const before = (await cache.usage()).managedBytes;
  leases.forEach((lease) => lease.release());
  const expired = createImageCache({ store, now: () => Date.now() + 7200_000, transport: async () => response(600), budget: 1200, validate });
  const replacement = expired.acquire(source);
  await replacement.ready;
  expect((await expired.usage()).managedBytes).toBe(before);
  expect(peak).toBeLessThanOrEqual(1200);
  replacement.release();
});

it.each(['no-store', 'private, no-store', 'NO-STORE'])('never persists %s', async (directive) => {
  const cache = createImageCache({ store: createBrowserImageStore(), transport: async () => response(100, directive), validate });
  const lease = cache.acquire(source);
  expect(await lease.ready).toMatch(/^blob:/);
  expect((await cache.usage()).managedBytes).toBe(0);
  lease.release();
});

it.each(['oversize', 'unknown-length oversize', 'HTML', 'invalid image'])('rejects %s without persistence', async (kind) => {
  const transport: ImageTransport = async () => {
    if (kind === 'HTML') return new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } });
    if (kind === 'oversize') return new Response(new Uint8Array(1), { headers: { 'Content-Type': 'image/png', 'Content-Length': String(5 * 1024 * 1024 + 1) } });
    return response(kind === 'unknown-length oversize' ? 5 * 1024 * 1024 + 1 : 100);
  };
  const cache = createImageCache({ store: createBrowserImageStore(), transport,
    validate: kind === 'invalid image' ? async () => { throw new Error('Bad decode'); } : validate });
  const lease = cache.acquire(source);
  expect(await lease.ready).toBeUndefined();
  expect((await cache.usage()).managedBytes).toBe(0);
  lease.release();
});

it('falls back transiently on write failure and fences old in-flight writes when cleared', async () => {
  const inner = createBrowserImageStore();
  const store: ImageStore = { ...inner, writeTemporary: async () => { throw new Error('Full'); } };
  const cache = createImageCache({ store, transport: async () => response(), validate });
  const lease = cache.acquire(source);
  expect(await lease.ready).toMatch(/^blob:/);
  expect(await cache.usage()).toEqual({ managedBytes: 0, entries: 0, persistenceAvailable: false });
  lease.release();
  let answer!: (response: Response) => void;
  const transport = vi.fn<ImageTransport>(() => new Promise((resolve) => { answer = resolve; }));
  const clearing = createImageCache({ store: inner, transport, validate });
  const pending = clearing.acquire(source);
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  await clearing.clear();
  answer(response());
  expect(await pending.ready).toMatch(/^blob:/);
  expect((await clearing.usage()).managedBytes).toBe(0);
  pending.release();
});

it('limits shared transport to two downloads and cancels work with no consumers', async () => {
  const answers: ((response: Response) => void)[] = [];
  const transport = vi.fn<ImageTransport>(() => new Promise((resolve) => { answers.push(resolve); }));
  const cache = createImageCache({ store: createBrowserImageStore(), transport, validate });
  const leases = Array.from({ length: 5 }, (_, i) => cache.acquire(`${source}${i}`));
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
  leases[2]!.release();
  answers[0]!(response());
  await leases[0]!.ready;
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(3));
  expect(transport.mock.calls.map(([url]) => url)).not.toContain(`${source}2`);
  leases.forEach((lease) => lease.release());
  answers.forEach((answer) => answer(response()));
  await Promise.all(leases.map((lease) => lease.ready));
});

it('promotes queued shared demand and demotes it when the visible lease releases', async () => {
  const answers: ((response: Response) => void)[] = [];
  const transport = vi.fn<ImageTransport>(() => new Promise((resolve) => { answers.push(resolve); }));
  const cache = createImageCache({ store: createBrowserImageStore(), transport, validate });
  const blockers = [cache.acquire(`${source}block1`), cache.acquire(`${source}block2`)];
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
  const speculative = cache.acquire(`${source}speculative`, 'poster', 'prefetch');
  const promoted = cache.acquire(`${source}promoted`, 'poster', 'prefetch');
  const visible = cache.acquire(`${source}promoted`, 'thumbnail', 'visible');
  const demoted = cache.acquire(`${source}speculative`, 'poster', 'visible');
  demoted.release();
  demoted.release();
  const refresh = cache.acquire(`${source}refresh`, 'poster', 'refresh');
  // Allow storage lookup to enqueue every source before freeing transport slots.
  await new Promise((resolve) => setTimeout(resolve, 20));
  answers[0]!(response());
  await blockers[0]!.ready;
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(3));
  expect(transport.mock.calls[2]![0]).toBe(`${source}promoted`);
  answers[1]!(response());
  await blockers[1]!.ready;
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(4));
  expect(transport.mock.calls[3]![0]).toBe(`${source}refresh`);
  const leases = [...blockers, speculative, promoted, visible, refresh];
  leases.forEach((lease) => lease.release());
  answers.slice(2).forEach((answer) => answer(response()));
  await Promise.all(leases.map((lease) => lease.ready));
});

it('evicts the least recently used unleased record while protecting visible artwork', async () => {
  let time = 1000;
  const transport = vi.fn<ImageTransport>(async () => response(600));
  const cache = createImageCache({ store: createBrowserImageStore(), transport, budget: 3000, memoryBudget: 0, now: () => time++, validate });
  const first = cache.acquire(source);
  await first.ready;
  first.release();
  const old = cache.acquire(`${source}old`);
  await old.ready;
  old.release();
  const visible = cache.acquire(source);
  const visibleUrl = await visible.ready;
  const incoming = cache.acquire(`${source}incoming`);
  await incoming.ready;
  incoming.release();
  const next = cache.acquire(`${source}next`);
  await next.ready;
  next.release();
  expect((await fetch(visibleUrl!)).status).toBe(200);
  const revisit = cache.acquire(`${source}old`);
  await revisit.ready;
  expect(transport.mock.calls.filter(([url]) => url === `${source}old`)).toHaveLength(2);
  expect((await cache.usage()).managedBytes).toBeLessThanOrEqual(3500);
  visible.release();
  revisit.release();
});

it('retries a failed publication after cleanup and recovers corrupt decoded payloads through a fresh download', async () => {
  const store = createBrowserImageStore();
  const commit = vi.spyOn(store, 'commit').mockRejectedValueOnce(new Error('Interrupted publication'));
  const transport = vi.fn<ImageTransport>(async () => response());
  const first = createImageCache({ store, transport, validate });
  const lease = first.acquire(source);
  expect(await lease.ready).toMatch(/^blob:/);
  expect(commit).toHaveBeenCalledTimes(2);
  expect((await first.usage()).persistenceAvailable).toBe(true);
  lease.release();
  let decodes = 0;
  const restarted = createImageCache({ store, transport, validate: async () => { if (++decodes === 1) throw new Error('Corrupt image'); } });
  const recovered = restarted.acquire(source);
  expect(await recovered.ready).toMatch(/^blob:/);
  expect(transport).toHaveBeenCalledTimes(2);
  expect((await restarted.usage()).entries).toBe(1);
  recovered.release();
});

it('batches access metadata and persists recent use across restarts', async () => {
  const store = createBrowserImageStore();
  let time = 1000;
  const cache = createImageCache({ store, transport: async () => response(600), now: () => time++, budget: 3000, validate });
  for (const url of [source, `${source}old`]) { const lease = cache.acquire(url); await lease.ready; lease.release(); }
  const writes = vi.spyOn(store, 'writeTemporary');
  const reads = vi.spyOn(store, 'read');
  for (let i = 0; i < 10; i++) { const lease = cache.acquire(source); await lease.ready; lease.release(); }
  const readsBeforeFlush = reads.mock.calls.length;
  expect(writes).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(writes).toHaveBeenCalledTimes(1), { timeout: 2000 });
  expect(reads).toHaveBeenCalledTimes(readsBeforeFlush);
  const transport = vi.fn<ImageTransport>(async () => response(600));
  const restarted = createImageCache({ store, transport, now: () => time++, budget: 3000, validate });
  for (const url of [`${source}new`, `${source}next`, source]) { const lease = restarted.acquire(url); await lease.ready; lease.release(); }
  expect(transport.mock.calls.map(([url]) => url)).not.toContain(source);
});

it('caps tiny records at 2000 entries and makes the oldest available for a new download', async () => {
  const blobs = new Map<string, Blob>();
  const store: ImageStore = {
    list: async () => [...blobs].map(([key, blob]) => ({ key, size: blob.size })),
    read: async (key) => blobs.get(key),
    writeTemporary: async (key, blob) => { blobs.set(key, blob); },
    commit: async (temporary, key) => { blobs.set(key, blobs.get(temporary)!); blobs.delete(temporary); },
    remove: async (key) => { blobs.delete(key); },
    readMetadata: async (key) => blobs.get(`${key}-meta`),
    commitMetadata: async (temporary, key) => { blobs.set(`${key}-meta`, blobs.get(temporary)!); blobs.delete(temporary); },
  };
  let time = 0;
  const transport = vi.fn<ImageTransport>(async () => response(1));
  const cache = createImageCache({ store, transport, validate, now: () => time++ });
  for (let i = 0; i <= 2000; i++) {
    const lease = cache.acquire(`${source}${i}`);
    await lease.ready;
    lease.release();
  }
  expect((await cache.usage()).entries).toBe(2000);
  const oldest = cache.acquire(`${source}0`);
  await oldest.ready;
  expect(transport.mock.calls.filter(([url]) => url === `${source}0`)).toHaveLength(2);
  oldest.release();
});

it('shows permitted stale artwork immediately, conditionally validates and publishes changed artwork to remaining leases', async () => {
  const store = createBrowserImageStore();
  const initial = createImageCache({ store, now: () => 1000, validate, transport: async () => new Response(new Uint8Array([1]), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=1', ETag: '"one"' },
  }) });
  const seed = initial.acquire(source);
  await seed.ready;
  seed.release();
  let answer!: (value: Response) => void;
  const transport = vi.fn<ImageTransport>(() => new Promise((resolve) => { answer = resolve; }));
  const cache = createImageCache({ store, now: () => 3000, validate, transport });
  const first = cache.acquire(source);
  const second = cache.acquire(source);
  const stale = await second.ready;
  expect(stale).toMatch(/^blob:/);
  expect(new Uint8Array(await (await fetch(stale!)).arrayBuffer())).toEqual(new Uint8Array([1]));
  const updates: string[] = [];
  const unsubscribe = second.subscribe((url) => updates.push(url));
  first.release();
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  expect(transport.mock.calls[0]![1].validators).toEqual({ etag: '"one"', lastModified: undefined });
  answer(new Response(new Uint8Array([2]), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600', ETag: '"two"' } }));
  await vi.waitFor(() => expect(updates[updates.length - 1]).not.toBe(stale));
  const changed = updates[updates.length - 1]!;
  expect(new Uint8Array(await (await fetch(changed)).arrayBuffer())).toEqual(new Uint8Array([2]));
  unsubscribe();
  second.release();
  await expect(fetch(changed)).rejects.toThrow();
  const restart = createImageCache({ store, now: () => 4000, validate, transport });
  const fresh = restart.acquire(source);
  expect(await fresh.ready).toMatch(/^blob:/);
  expect(transport).toHaveBeenCalledTimes(1);
  fresh.release();
});

it.each(['etag', 'last-modified'] as const)('persists %s validators and 304 freshness without another payload download', async (validator) => {
  const store = createBrowserImageStore();
  let time = 1000;
  const transport = vi.fn<ImageTransport>(async () => new Response(new Uint8Array([9, 8, 7]), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=1, must-revalidate', [validator]: validator === 'etag' ? '"v1"' : 'Wed, 04 Nov 2026 12:00:00 GMT' },
  }));
  let cache = createImageCache({ store, transport, validate, now: () => time });
  let lease = cache.acquire(source);
  await lease.ready;
  lease.release();
  time = 3000;
  transport.mockImplementation(async () => new Response(null, { status: 304, headers: { 'Cache-Control': 'max-age=3600', Age: '10' } }));
  cache = createImageCache({ store, transport, validate, now: () => time });
  lease = cache.acquire(source);
  const url = await lease.ready;
  expect(new Uint8Array(await (await fetch(url!)).arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]));
  expect(transport.mock.calls[1]![1].validators?.[validator === 'etag' ? 'etag' : 'lastModified']).toBe(validator === 'etag' ? '"v1"' : 'Wed, 04 Nov 2026 12:00:00 GMT');
  lease.release();
  time = 4000;
  cache = createImageCache({ store, transport, validate, now: () => time });
  lease = cache.acquire(source);
  await lease.ready;
  expect(transport).toHaveBeenCalledTimes(2);
  lease.release();
});

it.each(['no-cache', 'max-age=0, must-revalidate', 'max-age=0'])(
  'enforces stale display and failure policy for %s', async (policy) => {
    const store = createBrowserImageStore();
    const seed = createImageCache({ store, validate, now: () => 1000, transport: async () => response(100, policy) });
    const original = seed.acquire(source);
    await original.ready;
    original.release();
    let fail!: (reason: Error) => void;
    const transport = vi.fn<ImageTransport>(() => new Promise((_resolve, reject) => { fail = reject; }));
    const cache = createImageCache({ store, validate, now: () => 2000, transport });
    const lease = cache.acquire(source);
    let settled = false;
    void lease.ready.then(() => { settled = true; });
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    const allowed = policy === 'max-age=0';
    expect(settled).toBe(allowed);
    fail(new Error('Offline'));
    const url = await lease.ready;
    if (allowed) expect((await fetch(url!)).status).toBe(200);
    else expect(url).toBeUndefined();
    lease.release();
  });

it.each(['age', 'expires', 'fallback', 'no-cache'] as const)('honors %s rather than an unconditional seven-day lifetime', async (kind) => {
  const store = createBrowserImageStore();
  let time = Date.UTC(2026, 10, 5);
  const headers = new Headers({ 'Content-Type': 'image/png' });
  if (kind === 'age') { headers.set('Cache-Control', 'max-age=60, must-revalidate'); headers.set('Age', '59'); }
  if (kind === 'expires') { headers.set('Date', new Date(time).toUTCString()); headers.set('Expires', new Date(time + 1000).toUTCString()); }
  if (kind === 'no-cache') headers.set('Cache-Control', 'max-age=9999, no-cache');
  const transport = vi.fn<ImageTransport>(async () => new Response(new Uint8Array([1]), { headers }));
  let cache = createImageCache({ store, transport, validate, now: () => time });
  let lease = cache.acquire(source);
  await lease.ready;
  lease.release();
  time += kind === 'fallback' ? 6 * 86400_000 : 2000;
  cache = createImageCache({ store, transport, validate, now: () => time });
  lease = cache.acquire(source);
  await lease.ready;
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(kind === 'fallback' ? 1 : 2));
  lease.release();
});

it.each(['HTML', 'invalid', 'oversize', 'no-store'])('keeps safe stale artwork on %s refresh and never persists a rejected response', async (kind) => {
  const store = createBrowserImageStore();
  const seed = createImageCache({ store, validate, now: () => 1000, transport: async () => response(100, 'max-age=0') });
  const original = seed.acquire(source);
  await original.ready;
  original.release();
  let validations = 0;
  const cache = createImageCache({ store, now: () => 2000,
    validate: async () => { if (kind === 'invalid' && ++validations > 1) throw new Error('Bad image'); },
    transport: async () => kind === 'HTML' ? new Response('<html>', { headers: { 'Content-Type': 'text/html' } })
      : kind === 'oversize' ? response(5 * 1024 * 1024 + 1) : response(20, kind === 'no-store' ? 'no-store' : 'max-age=3600'),
  });
  const lease = cache.acquire(source);
  const stale = await lease.ready;
  const updates: string[] = [];
  lease.subscribe((url) => updates.push(url));
  if (kind === 'no-store') {
    await vi.waitFor(async () => expect((await cache.usage()).entries).toBe(0));
    await vi.waitFor(() => expect(updates[updates.length - 1]).not.toBe(stale));
  } else {
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(updates).toEqual([stale]);
    expect((await cache.usage()).entries).toBe(1);
  }
  lease.release();
});

it('counts old payloads and temporary metadata during concurrent unknown-length replacements', async () => {
  const inner = createBrowserImageStore();
  let peak = 0;
  let writes = 0;
  const store: ImageStore = { ...inner, async writeTemporary(key, blob) {
    await inner.writeTemporary(key, blob);
    writes++;
    peak = Math.max(peak, (await inner.list()).reduce((sum, file) => sum + file.size, 0));
  } };
  const seed = createImageCache({ store, budget: 2400, validate, now: () => 1000, transport: async () => response(600, 'max-age=0, must-revalidate') });
  for (const url of [source, `${source}other`]) {
    const lease = seed.acquire(url);
    await lease.ready;
    lease.release();
  }
  expect((await seed.usage()).entries).toBe(2);
  const transport: ImageTransport = async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { for (let i = 0; i < 6; i++) controller.enqueue(new Uint8Array(100)); controller.close(); },
  }), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' } });
  const cache = createImageCache({ store, budget: 2400, validate, now: () => 2000, transport });
  const leases = [cache.acquire(source), cache.acquire(`${source}other`)];
  expect(await Promise.all(leases.map((lease) => lease.ready))).toEqual([expect.stringMatching(/^blob:/), expect.stringMatching(/^blob:/)]);
  // Both old records are protected, so neither replacement fits alongside them.
  expect(writes).toBe(2);
  expect(peak).toBeLessThanOrEqual(2400);
  leases.forEach((lease) => lease.release());
});

it('304 with omitted cache headers retains the explicit lifetime rather than adopting seven days', async () => {
  const store = createBrowserImageStore();
  let time = 1000;
  const transport = vi.fn<ImageTransport>(async () => new Response(new Uint8Array(100), { headers: {
    'Content-Type': 'image/png', 'Cache-Control': 'max-age=1, must-revalidate', ETag: '"v1"',
  } }));
  let cache = createImageCache({ store, transport, validate, now: () => time });
  let lease = cache.acquire(source);
  await lease.ready;
  lease.release();
  transport.mockImplementation(async () => new Response(null, { status: 304 }));
  for (time of [3000, 5000]) {
    cache = createImageCache({ store, transport, validate, now: () => time });
    lease = cache.acquire(source);
    expect(await lease.ready).toMatch(/^blob:/);
    lease.release();
  }
  expect(transport).toHaveBeenCalledTimes(3);
});

it.each(['headers', 'body'])('releases both hanging %s slots by deadline, disposing bodies and preserving shared demand', async (kind) => {
  const cancelled = vi.fn();
  const transport = vi.fn<ImageTransport>(async (url) => {
    if (url.endsWith('next')) return response();
    if (kind === 'headers') return new Promise(() => undefined);
    return new Response(new ReadableStream({ cancel: cancelled }), { headers: { 'Content-Type': 'image/png' } });
  });
  const cache = createImageCache({ store: createBrowserImageStore(), transport, validate, timeoutMs: 80 });
  const first = cache.acquire(source);
  const shared = cache.acquire(source);
  first.release();
  const second = cache.acquire(`${source}other`);
  const next = cache.acquire(`${source}next`);
  expect(await next.ready).toMatch(/^blob:/);
  expect(await shared.ready).toBeUndefined();
  expect(await second.ready).toBeUndefined();
  expect(transport).toHaveBeenCalledTimes(3);
  if (kind === 'body') expect(cancelled).toHaveBeenCalledTimes(2);
  [shared, second, next].forEach((lease) => lease.release());
});

it.each(['contradictory etag', 'contradictory last-modified', 'unsolicited'])('retries %s 304 unconditionally and rejects a second impossible 304', async (kind) => {
  const store = createBrowserImageStore();
  const seed = createImageCache({ store, validate, now: () => 1000, transport: async () => new Response(new Uint8Array([1]), { headers: {
    'Content-Type': 'image/png', 'Cache-Control': 'max-age=0, must-revalidate',
    ...(kind === 'unsolicited' ? {} : { ETag: '"one"', 'Last-Modified': 'Wed, 04 Nov 2026 12:00:00 GMT' }),
  } }) });
  const original = seed.acquire(source); await original.ready; original.release();
  const transport = vi.fn<ImageTransport>(async () => new Response(null, { status: 304, headers:
    kind === 'contradictory etag' ? { ETag: '"two"' } : kind === 'contradictory last-modified' ? { 'Last-Modified': 'Thu, 05 Nov 2026 12:00:00 GMT' } : {},
  }));
  const cache = createImageCache({ store, validate, now: () => 2000, transport });
  const lease = cache.acquire(source);
  expect(await lease.ready).toBeUndefined();
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls[1]![1].validators).toBeUndefined();
  lease.release();
});

it('recovers an unsolicited 304 with one unconditional body fetch', async () => {
  const transport = vi.fn<ImageTransport>()
    .mockResolvedValueOnce(new Response(null, { status: 304, headers: { ETag: '"unknown"' } }))
    .mockResolvedValueOnce(response(77));
  const cache = createImageCache({ store: createBrowserImageStore(), transport, validate });
  const lease = cache.acquire(source);
  const url = await lease.ready;
  expect((await (await fetch(url!)).blob()).size).toBe(77);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls[1]![1].validators).toBeUndefined();
  expect((await cache.usage()).entries).toBe(1);
  lease.release();
});

it('304 freshness survives restart under a protected budget without rewriting the payload', async () => {
  const store = createBrowserImageStore();
  const seed = createImageCache({ store, budget: 12000, validate, now: () => 1000, transport: async () => new Response(new Uint8Array(10000), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=0, must-revalidate', ETag: '"one"' },
  }) });
  const original = seed.acquire(source); await original.ready; original.release();
  const written: number[] = [];
  const write = store.writeTemporary.bind(store);
  store.writeTemporary = async (key, blob) => { written.push(blob.size); await write(key, blob); };
  const transport = vi.fn<ImageTransport>(async () => new Response(null, { status: 304, headers: { 'Cache-Control': 'max-age=3600' } }));
  const cache = createImageCache({ store, budget: 12000, validate, now: () => 2000, transport });
  const lease = cache.acquire(source); expect(await lease.ready).toMatch(/^blob:/); lease.release();
  expect(written.length).toBeGreaterThan(0);
  expect(Math.max(...written)).toBeLessThan(2000);
  expect((await cache.usage()).managedBytes).toBe((await store.list()).reduce((sum, file) => sum + file.size, 0));
  const restarted = createImageCache({ store, budget: 12000, validate, now: () => 3000, transport });
  const fresh = restarted.acquire(source); expect(await fresh.ready).toMatch(/^blob:/); fresh.release();
  expect(transport).toHaveBeenCalledTimes(1);
});

it.each([false, true])('body transfer time consumes response freshness (Date supplied: %s)', async (dated) => {
  const store = createBrowserImageStore();
  let time = 1000;
  let finish!: () => void;
  const transport = vi.fn<ImageTransport>(async () => new Response(new ReadableStream({ start(controller) {
    finish = () => { time = 4000; controller.enqueue(new Uint8Array([1])); controller.close(); };
  } }), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=2, must-revalidate', ...(dated ? { Date: new Date(1000).toUTCString() } : {}) } }));
  const cache = createImageCache({ store, validate, now: () => time, transport });
  const lease = cache.acquire(source);
  await vi.waitFor(() => expect(finish).toBeDefined()); finish(); await lease.ready; lease.release();
  const nextTransport = vi.fn<ImageTransport>(async () => response());
  const restarted = createImageCache({ store, validate, now: () => 4001, transport: nextTransport });
  const next = restarted.acquire(source); await next.ready; next.release();
  expect(nextTransport).toHaveBeenCalledTimes(1);
});

it('stale prefetch settlement waits for conditional validation rather than display readiness', async () => {
  const store = createBrowserImageStore();
  const seed = createImageCache({ store, validate, now: () => 1000, transport: async () => new Response(new Uint8Array([1]), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=0', ETag: '"one"' },
  }) });
  const original = seed.acquire(source); await original.ready; original.release();
  let answer!: (response: Response) => void;
  const transport = vi.fn<ImageTransport>(() => new Promise((resolve) => { answer = resolve; }));
  const cache = createImageCache({ store, validate, now: () => 2000, transport });
  const prefetch = cache.acquire(source, 'poster', 'prefetch');
  let settled = false;
  void prefetch.settled.then(() => { settled = true; prefetch.release(); });
  expect(await prefetch.ready).toMatch(/^blob:/);
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  expect(settled).toBe(false);
  expect(transport.mock.calls[0]![1].signal.aborted).toBe(false);
  answer(new Response(null, { status: 304, headers: { 'Cache-Control': 'max-age=3600' } }));
  await prefetch.settled;
  const restarted = createImageCache({ store, validate, now: () => 3000, transport });
  const fresh = restarted.acquire(source); await fresh.ready; fresh.release();
  expect(transport).toHaveBeenCalledTimes(1);
});

it('unknown-length chunks reserve space before subsequent pulls, evicting incrementally', async () => {
  const store = createBrowserImageStore();
  const seed = createImageCache({ store, validate, budget: 3200, transport: async () => response(1000) });
  const original = seed.acquire(source); await original.ready; original.release();
  let first = true;
  let deletedDuringTransfer = false;
  const transport: ImageTransport = async () => new Response(new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (first) { first = false; controller.enqueue(new Uint8Array(1800)); return; }
      deletedDuringTransfer = (await store.list()).length === 0;
      controller.enqueue(new Uint8Array(100)); controller.close();
    },
  }, { highWaterMark: 0 }), { headers: { 'Content-Type': 'image/png' } });
  const cache = createImageCache({ store, validate, budget: 3200, transport });
  const incoming = cache.acquire(`${source}incoming`); expect(await incoming.ready).toMatch(/^blob:/);
  expect(deletedDuringTransfer).toBe(true);
  expect((await cache.usage()).managedBytes).toBeLessThanOrEqual(3200);
  incoming.release();
});

it('failed incremental growth releases its reservation and serves transient bytes while protected disk stays bounded', async () => {
  const store = createBrowserImageStore();
  let chunks = 0;
  const transport: ImageTransport = async (url) => url === source ? response(1000) : new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      chunks++;
      controller.enqueue(new Uint8Array(1000));
      if (chunks === 3) controller.close();
    },
  }, { highWaterMark: 0 }), { headers: { 'Content-Type': 'image/png' } });
  const cache = createImageCache({ store, validate, budget: 3200, transport });
  const protectedLease = cache.acquire(source); await protectedLease.ready;
  const before = await cache.usage();
  const incoming = cache.acquire(`${source}stream`);
  const url = await incoming.ready;
  expect((await (await fetch(url!)).blob()).size).toBe(3000);
  expect(chunks).toBe(3);
  expect(await cache.usage()).toEqual(before);
  expect((await store.list()).reduce((sum, file) => sum + file.size, 0)).toBe(before.managedBytes);
  protectedLease.release(); incoming.release();
});
