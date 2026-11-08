import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it, vi } from 'vitest';
import { createBrowserImageStore } from '../platform/imageStore';
import { createImageCache } from './cache';
import type { ImageTransport } from './transport';

const source = 'https://artwork.test/poster?signature=never-in-diagnostics';
const response = (policy = 'max-age=3600') => new Response(new Uint8Array(100), {
  headers: { 'Content-Type': 'image/png', 'Cache-Control': policy },
});

it('clear fences a queued stale refresh and access maintenance without revoking displayed artwork', async () => {
  const store = createBrowserImageStore();
  const seed = createImageCache({ store, validate, transport: async () => response('max-age=0'), now: () => 1000 });
  const original = seed.acquire(source);
  await original.ready;
  original.release();
  const answers: ((value: Response) => void)[] = [];
  const transport = vi.fn<ImageTransport>(() => new Promise((resolve) => answers.push(resolve)));
  const cache = createImageCache({ store, validate, transport, now: () => 2000 });
  const blockers = [cache.acquire(`${source}block1`), cache.acquire(`${source}block2`)];
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
  const stale = cache.acquire(source);
  const url = await stale.ready;
  await cache.clear();
  answers.forEach((answer) => answer(response()));
  await Promise.all(blockers.map((lease) => lease.ready));
  await new Promise((resolve) => setTimeout(resolve, 1100));
  expect(transport).toHaveBeenCalledTimes(2);
  expect((await cache.usage()).managedBytes).toBe(0);
  expect((await fetch(url!)).status).toBe(200);
  stale.release();
  await expect(fetch(url!)).rejects.toThrow();
  blockers.forEach((lease) => lease.release());
});

it('reports partial clear failure accurately, preserves unrelated files and can retry', async () => {
  const inner = createBrowserImageStore();
  await inner.writeTemporary('preferences', new Blob(['keep']));
  let failing = false;
  const store = { ...inner, async remove(key: string) {
    if (failing) throw new Error('device error containing private details');
    await inner.remove(key);
  } };
  const cache = createImageCache({ store, validate, transport: async () => response() });
  const lease = cache.acquire(source);
  const url = await lease.ready;
  const before = await cache.usage();
  failing = true;
  await expect(cache.clear()).rejects.toThrow('Image cache could not be cleared');
  expect(await cache.usage()).toEqual({ ...before, persistenceAvailable: false });
  expect((await fetch(url!)).status).toBe(200);
  failing = false;
  await cache.clear();
  expect(await cache.usage()).toEqual({ managedBytes: 0, entries: 0, persistenceAvailable: true });
  expect(await (await inner.read('preferences'))!.text()).toBe('keep');
  lease.release();
});

it('exposes only aggregate diagnostics for hits, misses, transferred bytes, evictions and persistence', async () => {
  const cache = createImageCache({ store: createBrowserImageStore(), validate, budget: 1200, transport: async () => response() });
  for (const url of [source, source, ...Array.from({ length: 5 }, (_, i) => `${source}${i}`)]) {
    const lease = cache.acquire(url);
    await lease.ready;
    lease.release();
  }
  expect(await cache.diagnostics()).toEqual({ hits: 1, misses: 6, downloadedBytes: 600, evictions: expect.any(Number), persistenceAvailable: true });
  expect((await cache.diagnostics()).evictions).toBeGreaterThan(0);
  expect(JSON.stringify(await cache.diagnostics())).not.toContain('signature');
});

it('an access-metadata write overlapping clear cannot overwrite a newly cached generation', async () => {
  const inner = createBrowserImageStore();
  let hold = false;
  let resume!: () => void;
  const store = { ...inner, async writeTemporary(key: string, record: Blob) {
    await inner.writeTemporary(key, record);
    if (hold) {
      hold = false;
      await new Promise<void>((resolve) => { resume = resolve; });
    }
  } };
  const cache = createImageCache({ store, validate, transport: async () => response() });
  for (let i = 0; i < 2; i++) { const lease = cache.acquire(source); await lease.ready; lease.release(); }
  hold = true;
  await vi.waitFor(() => expect(resume).toBeTypeOf('function'), { timeout: 2000 });
  const clearing = cache.clear();
  resume();
  await clearing;
  const fresh = cache.acquire(source);
  await fresh.ready;
  const before = await cache.usage();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(await cache.usage()).toEqual(before);
  fresh.release();
  const transport = vi.fn<ImageTransport>(async () => response());
  const restarted = createImageCache({ store: inner, validate, transport });
  const reused = restarted.acquire(source);
  expect(await reused.ready).toMatch(/^blob:/);
  expect(transport).not.toHaveBeenCalled();
  reused.release();
});

it('clear waits for an in-progress temporary write, removes it and does not erase new navigation', async () => {
  const inner = createBrowserImageStore();
  let resume!: () => void;
  let hold = true;
  const store = { ...inner, async writeTemporary(key: string, value: Blob) {
    await inner.writeTemporary(key, value);
    if (hold) {
      hold = false;
      await new Promise<void>((resolve) => { resume = resolve; });
    }
  } };
  const cache = createImageCache({ store, validate, transport: async () => response() });
  const old = cache.acquire(source);
  await vi.waitFor(() => expect(resume).toBeTypeOf('function'));
  const clearing = cache.clear();
  const later = cache.acquire(`${source}new`);
  resume();
  await clearing;
  expect(await old.ready).toMatch(/^blob:/);
  expect(await later.ready).toMatch(/^blob:/);
  expect((await cache.usage()).entries).toBe(1);
  old.release();
  later.release();
  const transport = vi.fn<ImageTransport>(async () => response());
  const restarted = createImageCache({ store: inner, validate, transport });
  const reused = restarted.acquire(`${source}new`);
  await reused.ready;
  expect(transport).not.toHaveBeenCalled();
  reused.release();
});

it('usage counts metadata, reconciles interrupted files and excludes unrelated storage', async () => {
  const store = createBrowserImageStore();
  const cache = createImageCache({ store, validate, transport: async () => response() });
  const lease = cache.acquire(source);
  await lease.ready;
  const persisted = await cache.usage();
  expect(persisted.managedBytes).toBeGreaterThan(100);
  // An interrupted record is reconciled on the next cache startup, so it is removed before usage is reported.
  await store.writeTemporary('tmp-abcd', new Blob(['unfinished']));
  await store.writeTemporary('preferences', new Blob(['unrelated']));
  const restarted = createImageCache({ store, validate });
  expect(await restarted.usage()).toEqual(persisted);
  await restarted.clear();
  expect(await (await store.read('preferences'))!.text()).toBe('unrelated');
  lease.release();
});
const validate = async () => undefined;
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

it('clear invalidates queued work, retains active visible leases transiently and lets later navigation cache normally', async () => {
  const answers: ((value: Response) => void)[] = [];
  const transport = vi.fn<ImageTransport>(() => new Promise((resolve) => answers.push(resolve)));
  const cache = createImageCache({ store: createBrowserImageStore(), transport, validate });
  const visible = [cache.acquire(source), cache.acquire(`${source}other`)];
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
  const queued = cache.acquire(`${source}queued`, 'poster', 'prefetch');
  await new Promise((resolve) => setTimeout(resolve, 20));
  await cache.clear();
  answers.forEach((answer) => answer(response()));
  for (const lease of visible) expect(await lease.ready).toMatch(/^blob:/);
  expect(await queued.ready).toBeUndefined();
  expect(transport).toHaveBeenCalledTimes(2);
  expect((await cache.usage()).managedBytes).toBe(0);
  transport.mockImplementation(async () => response());
  const later = cache.acquire(source);
  const url = await later.ready;
  expect(transport).toHaveBeenCalledTimes(3);
  expect((await cache.usage()).entries).toBe(1);
  visible.forEach((lease) => lease.release());
  expect((await fetch(url!)).status).toBe(200);
  later.release();
  queued.release();
});
