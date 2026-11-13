import { fakeCatalog, fakeHome, fakeItem } from './harness/catalog';
import { solidPng } from './harness/fakeCdn';
import { expect, test } from './harness/test';

// Run alone: these observations include browser scheduling and are not TV timings.
test.skip(!process.env.KINOTV_BENCH, 'Run with KINOTV_BENCH=1 and --workers=1');

interface Event { stage: string; at: number; duration?: number }
interface Probe { events: Event[]; reset(): void }
declare global { interface Window { artworkProbe: Probe } }

test('stage-separated cold, session revisit, restart, and legacy preparation', async ({ app, api, cdn, page, remote }, info) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    let start = performance.now();
    const events: Event[] = [];
    const delayedWrites = new WeakSet<IDBTransaction>();
    const mark = (stage: string, duration?: number) => events.push({ stage, at: performance.now() - start, duration });
    window.artworkProbe = { events, reset() { events.length = 0; start = performance.now(); } };
    // Measure real store calls/validation/display, rather than cache implementation calls.
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (key) {
      const start = performance.now();
      const request = get.call(this, key);
      request.addEventListener('success', () => mark(String(key).endsWith('-meta') ? 'metadata-read' : 'file-read', performance.now() - start));
      return request;
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      mark('write-start');
      if (sessionStorage.getItem('artwork:delay-write') && value instanceof Blob && value.size > 1000) delayedWrites.add(this.transaction);
      return put.call(this, value, key!);
    };
    // Deterministic storage-pressure probe: delay completion notification, not
    // the actual transaction. This preserves IndexedDB transaction lifetime.
    const complete = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete')!;
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', { ...complete, set(callback) {
      const tx = this as IDBTransaction;
      complete.set!.call(tx, tx.mode === 'readwrite' && callback ? function (event: globalThis.Event) {
        mark('write-committed');
        setTimeout(() => { mark('write-notified'); callback.call(tx, event); }, delayedWrites.has(tx) ? 600 : 0);
      } : callback);
    } });
    const fetch = window.fetch;
    window.fetch = async (...args) => {
      if (!String(args[0]).includes('fake-cdn.kinotv.test')) return fetch(...args);
      const start = performance.now();
      mark('request-start');
      const response = await fetch(...args);
      mark('response-headers', performance.now() - start);
      const body = response.body;
      if (body) {
        const getReader = body.getReader.bind(body);
        body.getReader = (() => {
          const reader = getReader();
          const read = reader.read.bind(reader);
          reader.read = async () => {
            const result = await read();
            if (result.done) mark('body-complete', performance.now() - start);
            return result;
          };
          return reader;
        }) as typeof body.getReader;
      }
      return response;
    };
    const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    Object.defineProperty(HTMLImageElement.prototype, 'src', { ...src, set(value) {
      if (value && !this.isConnected) {
        const start = performance.now();
        mark('preparation-start');
        this.addEventListener('load', () => mark('preparation-loaded', performance.now() - start), { once: true });
      }
      src.set!.call(this, value);
    } });
    const bitmap = globalThis.createImageBitmap;
    globalThis.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
      const start = performance.now();
      mark('bitmap-start');
      const result = await bitmap(...args);
      mark('bitmap-ready', performance.now() - start);
      return result;
    }) as typeof createImageBitmap;
    const encode = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      const start = performance.now();
      mark('encoding-start');
      encode.call(this, (blob) => { mark('encoding-ready', performance.now() - start); callback(blob); }, ...args);
    };
    document.addEventListener('load', (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement)) return;
      if (image.matches('.card img')) mark('poster-loaded');
      if (image.dataset.testid === 'backdrop') mark('sharp-loaded');
    }, true);
    const observer = new MutationObserver(() => {
      if (!events.some((event) => event.stage === 'layout') && document.querySelector('.card')) mark('layout');
      if (!events.some((event) => event.stage === 'sharp-ready') && document.querySelector('.backdrop__image--loaded')) mark('sharp-ready');
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  });
  const item = fakeItem(93_000, 'Artwork probe');
  fakeCatalog(api, { items: () => [] });
  fakeHome(api, { hot: [item], fresh: [item], popular: [], movies: [], serials: [] });
  const original = solidPng([70, 90, 120], 3840, 2160);
  cdn.respond(item.posters.wide!, { body: original, delay: 80 });
  cdn.respond(item.posters.medium, { body: solidPng([80, 100, 130], 250, 375), delay: 80 });
  const results: unknown[] = [];
  let requests = 0;
  let bytes = 0;
  const sample = async (name: string) => {
    const sharp = page.getByTestId('backdrop').last();
    await expect(sharp).toHaveClass(/loaded/);
    await expect(sharp).toHaveJSProperty('naturalWidth', 1920);
    await expect(page.locator('.card--poster img').first()).toHaveJSProperty('naturalWidth', 250);
    // Wait for all delayed admission notifications before the next phase. This
    // is deliberately outside the measured layout-to-sharp interval.
    await expect.poll(() => page.evaluate(() => {
      const events = window.artworkProbe.events;
      return events.filter((e) => e.stage === 'write-committed').length - events.filter((e) => e.stage === 'write-notified').length;
    })).toBe(0);
    await page.waitForTimeout(1400);
    const events = await page.evaluate(() => window.artworkProbe.events);
    const layout = events.find((e) => e.stage === 'layout')!.at;
    const ready = events.find((e) => e.stage === 'sharp-ready')!.at;
    const transferred = cdn.transfers.reduce((sum, transfer) => sum + transfer.bytes, 0);
    results.push({ name, layoutToSharpMs: ready - layout, requests: cdn.requests.length - requests,
      bodyBytes: transferred - bytes, events });
    requests = cdn.requests.length;
    bytes = transferred;
    return events;
  };
  await app.open();
  await sample('cold');
  await remote.press('right');
  await expect(app.focused).toHaveAccessibleName('Фильмы');
  await page.evaluate(() => window.artworkProbe.reset());
  await remote.press('left');
  await sample('session-revisit');
  await page.reload();
  await sample('persistent-restart');
  // Restore a historical unprepared record at the persistence seam. No real
  // account/cache data is involved; retain the fake source's freshness policy.
  await page.evaluate(async ({ source, bytes }) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('kinotv-images');
      request.onsuccess = () => resolve(request.result);
    });
    const records = await new Promise<Array<{ key: IDBValidKey; blob: Blob }>>((resolve) => {
      const values: Array<{ key: IDBValidKey; blob: Blob }> = [];
      const tx = db.transaction('files');
      const cursor = tx.objectStore('files').openCursor();
      cursor.onsuccess = () => {
        if (!cursor.result) return;
        values.push({ key: cursor.result.key, blob: cursor.result.value });
        cursor.result.continue();
      };
      tx.oncomplete = () => resolve(values);
    });
    for (const { key, blob } of records) {
      if (!/^[a-f0-9]{64}$/.test(String(key))) continue;
      const length = new DataView(await blob.slice(0, 4).arrayBuffer()).getUint32(0);
      const metadata = JSON.parse(await blob.slice(4, length + 4).text());
      if (metadata.source !== source) continue;
      metadata.mime = 'image/png'; metadata.size = bytes.length;
      const json = new TextEncoder().encode(JSON.stringify(metadata));
      const prefix = new Uint8Array(4);
      new DataView(prefix.buffer).setUint32(0, json.length);
      await new Promise<void>((resolve) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(new Blob([prefix, json, new Uint8Array(bytes)]), key);
        tx.objectStore('files').delete(`${key}-meta`);
        tx.oncomplete = () => resolve();
      });
    }
    db.close();
    sessionStorage.setItem('artwork:delay-write', '1');
  }, { source: item.posters.wide!, bytes: [...original] });
  await page.reload();
  const migration = await sample('legacy-preparation-restart');
  console.log(JSON.stringify(results.map((result) => {
    const { events, ...summary } = result as { events: Event[] };
    return { ...summary, stages: events.filter((event) => ['bitmap-ready', 'encoding-ready', 'sharp-ready', 'write-notified'].includes(event.stage)) };
  }), null, 2));
  await info.attach('artwork-stages.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  const prepared = migration.find((event) => event.stage === 'encoding-ready')!;
  const replacement = migration.find((event) => event.stage === 'write-notified' && event.at > prepared.at)!;
  expect(migration.find((event) => event.stage === 'sharp-ready')!.at).toBeLessThan(replacement.at);
  expect(cdn.requests.filter((request) => request.source === item.posters.wide)).toHaveLength(1);
  expect(cdn.peakActive).toBeLessThanOrEqual(2);
});
