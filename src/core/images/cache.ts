import type { ImageStore } from '../platform/imageStore';
import { decodeRecord, encodeRecord, hasDirective, responseMetadata, type ImageMetadata } from './records';
import { abortable, fetchImage, readImageBody, validateImage, type ImageTransport } from './transport';

export const IMAGE_BUDGET = 50 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_MEMORY_BUDGET = 8 * 1024 * 1024;
export type ImagePriority = 'visible' | 'refresh' | 'prefetch';
export type ImageRole = 'poster' | 'thumbnail' | 'preview' | 'backdrop';
export interface ImageLease {
  readonly ready: Promise<string | undefined>;
  /** Resolves after validation/admission completes, including stale background refresh. */
  readonly settled: Promise<void>;
  /** Receives the current URL (if ready), then successful background replacements. */
  subscribe(listener: (url: string) => void): () => void;
  /** Promote preloaded artwork without dropping its URL or restarting its load. */
  setPriority(priority: ImagePriority): void;
  /** A transitioning consumer has decoded the replacement and no longer needs the old URL. */
  releasePrevious(): void;
  /** Abandon an undecoded replacement while retaining the previously displayed URL. */
  retainPrevious(): void;
  release(): void;
}
export interface ImageUsage { managedBytes: number; entries: number; persistenceAvailable: boolean }
/** Session aggregates only. Source identities and storage errors never cross this boundary. */
export interface ImageDiagnostics { hits: number; misses: number; downloadedBytes: number; evictions: number; persistenceAvailable: boolean }
export interface ImageCache {
  acquire(source: string, role?: ImageRole, priority?: ImagePriority): ImageLease;
  usage(): Promise<ImageUsage>;
  diagnostics(): Promise<ImageDiagnostics>;
  clear(): Promise<void>;
}
export interface ImageCacheOptions {
  store: ImageStore;
  transport?: ImageTransport;
  budget?: number;
  maxImageBytes?: number;
  now?: () => number;
  validate?: (blob: Blob) => Promise<Blob | void>;
  timeoutMs?: number;
  memoryBudget?: number;
}

interface SharedImage {
  consumers: number;
  demand: Record<ImagePriority, number>;
  controller: AbortController;
  promise: Promise<string | undefined>;
  settled: Promise<void>;
  finish: () => void;
  url?: string;
  previousUrl?: string;
  listeners: Set<(url: string) => void>;
  refreshing?: boolean;
  priority: ImagePriority;
  invalidated?: boolean;
}

export function createImageCache({ store, transport = fetchImage, budget = IMAGE_BUDGET,
  maxImageBytes = MAX_IMAGE_BYTES, now = Date.now, validate = validateImage, timeoutMs = 15_000,
  memoryBudget = IMAGE_MEMORY_BUDGET }: ImageCacheOptions): ImageCache {
  const limit = Math.min(IMAGE_BUDGET, Math.max(0, budget));
  const imageLimit = Math.min(MAX_IMAGE_BYTES, Math.max(0, maxImageBytes));
  const shared = new Map<string, SharedImage>();
  // Validated compressed bytes only: no retained object URLs or decoded images.
  // Survives card/screen unmounts without putting filesystem reads on revisits.
  const warm = new Map<string, { key: string; metadata: ImageMetadata; payload: Blob }>();
  const warmLimit = Math.min(IMAGE_MEMORY_BUDGET, Math.max(0, memoryBudget));
  function remember(key: string, metadata: ImageMetadata, payload: Blob, epoch: number) {
    if (epoch !== generation) return;
    warm.delete(metadata.source);
    if (payload.size > warmLimit || hasDirective(metadata.cacheControl, 'no-store') || hasDirective(metadata.cacheControl, 'no-cache')) return;
    warm.set(metadata.source, { key, metadata, payload });
    let size = [...warm.values()].reduce((sum, item) => sum + item.payload.size, 0);
    while (size > warmLimit || warm.size > 128) {
      const [source, item] = warm.entries().next().value!;
      warm.delete(source);
      size -= item.payload.size;
    }
  }
  let available = true;
  let generation = 0;
  const counters = { hits: 0, misses: 0, downloadedBytes: 0, evictions: 0 };
  let serial: Promise<unknown> = Promise.resolve();
  const files = new Map<string, number>();
  const entries = new Map<string, ImageMetadata>();
  // Fingerprints/flags only, bounded by persisted entries (<= 2,000).
  const bases = new Map<string, string>();
  const validated = new Set<string>();
  const dirty = new Set<string>();
  let accessTimer: ReturnType<typeof setTimeout> | undefined;
  const managed = (key: string) => /^(?:(?:bak-)?[a-f0-9]{64}(?:-meta)?|tmp-[a-f0-9-]+)$/.test(key);
  const reservations = new Map<string, number>();
  const reserved = () => [...reservations.values()].reduce((sum, size) => sum + size, 0);
  const temporaryKey = () => `tmp-${crypto.randomUUID?.() ?? `${now().toString(16)}-${Math.random().toString(16).slice(2)}`}`;
  async function digest(blob: Blob): Promise<string> {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  async function readRecord(key: string) {
    const record = await store.read(key);
    if (!record) return undefined;
    const cached = await decodeRecord(record);
    const base = await digest(record);
    const known = entries.get(key);
    if (known && bases.has(key)) {
      if (base !== bases.get(key)) throw new Error('Changed artwork record');
      // Sidecars were reconciled at startup or published by this cache. Keep
      // in-session freshness and lastUsed rather than rereading them per lease.
      return { metadata: known, payload: cached.payload };
    }
    const sidecar = await store.readMetadata(key);
    if (sidecar) {
      try {
        const update = JSON.parse(await sidecar.text()) as { version: number; base: string; metadata: ImageMetadata };
        if (update.version !== 1 || update.base !== base) throw new Error('Obsolete metadata');
        const checked = await decodeRecord(encodeRecord(update.metadata, cached.payload));
        if (checked.metadata.source !== cached.metadata.source || checked.metadata.mime !== cached.metadata.mime) throw new Error('Invalid metadata identity');
        cached.metadata = checked.metadata;
      } catch { await store.remove(`${key}-meta`); files.delete(`${key}-meta`); }
    }
    bases.set(key, base);
    return cached;
  }
  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = serial.then(operation);
    serial = result.catch(() => undefined);
    return result;
  }
  const initialized = (async () => {
    try {
      for (const file of await store.list()) if (managed(file.key)) files.set(file.key, file.size);
      for (const key of [...files.keys()]) {
        await exclusive(async () => { try {
          if (!files.has(key) || entries.has(key)) return;
          if (key.endsWith('-meta')) {
            if (!files.has(key.slice(0, -5))) { await store.remove(key); files.delete(key); }
            return;
          }
          if (key.startsWith('tmp-')) throw new Error('Interrupted artwork');
          const cached = await readRecord(key);
          if (!cached) throw new Error('Missing artwork');
          if (cached.payload.size > imageLimit || await keyFor(cached.metadata.source) !== key ||
              hasDirective(cached.metadata.cacheControl, 'no-store')) throw new Error('Invalid artwork');
          entries.set(key, cached.metadata);
        } catch { await remove(key); } });
      }
      await exclusive(() => cleanup(0));
    } catch { available = false; }
  })();
  const bytes = () => [...files.values()].reduce((sum, size) => sum + size, 0);
  async function keyFor(source: string): Promise<string> {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)))]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function remove(key: string): Promise<void> {
    await store.remove(key);
    files.delete(key);
    files.delete(`bak-${key}`);
    if (/^[a-f0-9]{64}$/.test(key)) {
      await store.remove(`${key}-meta`);
      files.delete(`${key}-meta`);
      files.delete(`bak-${key}-meta`);
    }
    entries.delete(key);
    bases.delete(key);
    validated.delete(key);
    dirty.delete(key);
  }
  async function discard(key: string, epoch: number): Promise<void> {
    try { await exclusive(async () => { if (epoch === generation) await remove(key); }); }
    catch { available = false; }
  }
  async function cleanup(required: number, replacement?: string, force = false): Promise<boolean> {
    const needsEntry = replacement !== undefined && !entries.has(replacement);
    const high = limit * .9;
    required += reserved();
    const target = force ? 0 : bytes() + required > high ? Math.min(limit * .8, limit - required) : limit - required;
    const candidates = [...entries].filter(([key, metadata]) => key !== replacement && !shared.get(metadata.source)?.consumers)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key] of candidates) {
      if (bytes() <= target && entries.size + Number(needsEntry) <= 2000) break;
      await remove(key);
      counters.evictions++;
    }
    return bytes() + required <= limit && entries.size + Number(needsEntry) <= 2000;
  }
  async function persist(key: string, metadata: ImageMetadata, payload: Blob, epoch: number, signal?: AbortSignal, expected?: ImageMetadata, metadataOnly = false, reservation?: string): Promise<void> {
    await initialized;
    const base = metadataOnly ? bases.get(key) : undefined;
    if (metadataOnly && !base) return;
    const record = metadataOnly ? new Blob([JSON.stringify({ version: 1, base, metadata })]) : encodeRecord(metadata, payload);
    const fingerprint = metadataOnly ? base! : await digest(record);
    await exclusive(async () => {
      if (reservation) reservations.delete(reservation);
      if (!available || epoch !== generation || signal?.aborted || (expected && entries.get(key) !== expected)) return;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (epoch !== generation || signal?.aborted) return;
        const temporary = temporaryKey();
        try {
          if (!await cleanup(record.size, key, attempt > 0)) return;
          if (epoch !== generation || signal?.aborted) return;
          files.set(temporary, record.size);
          await store.writeTemporary(temporary, record);
          if (epoch !== generation || signal?.aborted) { await remove(temporary); return; }
          if (metadataOnly) await store.commitMetadata(temporary, key);
          else await store.commit(temporary, key);
          files.delete(temporary);
          files.set(metadataOnly ? `${key}-meta` : key, record.size);
          if (!metadataOnly && files.has(`${key}-meta`)) { await store.remove(`${key}-meta`); files.delete(`${key}-meta`); }
          entries.set(key, metadata);
          bases.set(key, fingerprint);
          if (!metadataOnly) validated.add(key); // Download was validated before admission.
          dirty.delete(key);
          return;
        } catch {
          bases.delete(key);
          validated.delete(key);
          // A failed rollback can leave physical backups or a differently sized
          // publication behind. Charge every surviving managed file before retrying.
          try {
            const surviving = await store.list();
            files.clear();
            for (const file of surviving) if (managed(file.key)) files.set(file.key, file.size);
          } catch { available = false; }
          try { await remove(temporary); } catch { available = false; return; }
          if (attempt === 1) available = false;
        }
      }
    });
  }
  function touched(key: string, epoch: number): void {
    if (epoch !== generation) return;
    const metadata = entries.get(key);
    if (!metadata) return;
    metadata.lastUsed = now();
    dirty.add(key);
    accessTimer ??= setTimeout(() => {
      accessTimer = undefined;
      void (async () => {
        for (const key of [...dirty]) {
          if (epoch !== generation) return;
          dirty.delete(key);
          try {
            const metadata = entries.get(key);
            if (metadata) await persist(key, metadata, new Blob(), epoch, undefined, metadata, true);
          } catch { /* Access-time maintenance must not interrupt artwork. */ }
        }
      })();
    }, 1000);
    accessTimer.unref?.();
  }

  function reprioritize(image: SharedImage): void {
    // Once stale artwork is displayed, visible consumers need only background refresh.
    image.priority = image.demand.visible && !image.refreshing ? 'visible'
      : image.demand.refresh || (image.demand.visible && image.refreshing) ? 'refresh' : 'prefetch';
  }

  // Transport slots belong to shared sources, not consumers. Storage admission is serialized separately.
  const queue: { image: SharedImage; start: () => void; cancel: () => void }[] = [];
  let active = 0;
  // Cached reads and downloads share one decode lane. The transport limit alone
  // doesn't bound validation of a screenful of cold persistent hits.
  let decoding: Promise<unknown> = Promise.resolve();
  function prepare(payload: Blob, signal: AbortSignal): Promise<Blob> {
    const result = decoding.then(async () => {
      if (signal.aborted) throw new Error('Artwork cancelled');
      const prepared = await validate(payload);
      if (signal.aborted) throw new Error('Artwork cancelled');
      return prepared ?? payload;
    });
    decoding = result.catch(() => undefined);
    return result;
  }
  function drain(): void {
    const rank = { visible: 0, refresh: 1, prefetch: 2 };
    queue.sort((a, b) => rank[a.image.priority] - rank[b.image.priority]);
    while (active < 2 && queue.length) queue.shift()!.start();
  }
  function scheduled<T>(image: SharedImage, operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const cancel = () => {
        image.controller.signal.removeEventListener('abort', cancel);
        const index = queue.indexOf(job);
        if (index >= 0) queue.splice(index, 1);
        reject(new Error('Artwork cancelled'));
      };
      const job = { image, cancel, start: () => {
        image.controller.signal.removeEventListener('abort', cancel);
        if (image.controller.signal.aborted || image.invalidated) { reject(new Error('Artwork cancelled')); return; }
        active++;
        operation().then(resolve, reject).finally(() => { active--; drain(); });
      } };
      if (image.controller.signal.aborted || image.invalidated) { reject(new Error('Artwork cancelled')); return; }
      image.controller.signal.addEventListener('abort', cancel, { once: true });
      queue.push(job);
      drain();
    });
  }

  function publish(image: SharedImage, payload: Blob): string | undefined {
    if (image.controller.signal.aborted || !image.consumers) return undefined;
    if (image.previousUrl) URL.revokeObjectURL(image.previousUrl);
    image.previousUrl = image.url;
    image.url = URL.createObjectURL(payload);
    for (const listener of image.listeners) { try { listener(image.url); } catch { /* Consumer isolation. */ } }
    return image.url;
  }
  async function load(source: string, image: SharedImage, epoch: number): Promise<string | undefined> {
    const signal = image.controller.signal;
    try {
      const resident = warm.get(source);
      if (resident && resident.metadata.freshUntil > now()) {
        remember(resident.key, resident.metadata, resident.payload, epoch);
        counters.hits++;
        touched(resident.key, epoch);
        image.finish();
        return publish(image, resident.payload);
      }
      warm.delete(source);
      if (signal.aborted) throw new Error('Artwork cancelled');
      const key = await exclusive(() => keyFor(source));
      let cached: Awaited<ReturnType<typeof decodeRecord>> | undefined;
      if (available) {
        try {
          cached = await exclusive(async () => signal.aborted ? undefined : readRecord(key));
          if (signal.aborted) throw new Error('Artwork cancelled');
          if (cached) {
            if (cached.metadata.source === source && !hasDirective(cached.metadata.cacheControl, 'no-store')) {
              if (!validated.has(key)) {
                const prepared = await prepare(cached.payload, signal);
                if (prepared !== cached.payload) {
                  cached.payload = prepared;
                  cached.metadata = { ...cached.metadata, mime: prepared.type, size: prepared.size };
                  await persist(key, cached.metadata, prepared, epoch, signal);
                }
              }
              if (epoch === generation) { entries.set(key, cached.metadata); validated.add(key); }
              touched(key, epoch);
            } else throw new Error('Invalid artwork identity');
          } else if (files.has(key)) await discard(key, epoch);
        } catch {
          if (signal.aborted) throw new Error('Artwork cancelled');
          cached = undefined;
          await discard(key, epoch);
        }
      }
      const policy = cached?.metadata.cacheControl ?? '';
      if (cached) counters.hits++;
      else counters.misses++;
      if (cached) remember(key, cached.metadata, cached.payload, epoch);
      const fresh = cached && cached.metadata.freshUntil > now() && !hasDirective(policy, 'no-cache');
      if (fresh && cached) { image.finish(); return publish(image, cached.payload); }
      const staleAllowed = cached && !hasDirective(policy, 'no-cache') && !hasDirective(policy, 'must-revalidate');
      if (staleAllowed && cached) publish(image, cached.payload);
      const refresh = async (): Promise<string | undefined> => {
        try { return await scheduled(image, async () => {
          const controller = new AbortController();
          const cancel = () => controller.abort();
          signal.addEventListener('abort', cancel, { once: true });
          if (signal.aborted) cancel();
          const timer = setTimeout(cancel, timeoutMs);
          const requestSignal = controller.signal;
          const reservation = temporaryKey();
          let canPersist = available;
          const request = (validators?: { etag?: string; lastModified?: string }) => abortable(
            transport(source, { signal: requestSignal, validators }).then((response) => {
              if (requestSignal.aborted) void response.body?.cancel().catch(() => undefined);
              return response;
            }), requestSignal);
          try {
          let response = await request(cached ? {
            etag: cached.metadata.etag, lastModified: cached.metadata.lastModified,
          } : undefined);
          let receivedAt = now();
          if (response.status === 304 && (!cached || !(cached.metadata.etag || cached.metadata.lastModified) ||
              (response.headers.has('etag') && response.headers.get('etag')?.replace(/^W\//, '') !== cached.metadata.etag?.replace(/^W\//, '')) ||
              (response.headers.has('last-modified') && response.headers.get('last-modified') !== cached.metadata.lastModified))) {
            void response.body?.cancel().catch(() => undefined);
            response = await request();
            receivedAt = now();
            if (response.status === 304) { void response.body?.cancel().catch(() => undefined); throw new Error('Unexpected artwork validation'); }
          }
          if (response.status === 304) {
            void response.body?.cancel().catch(() => undefined);
            if (!cached) throw new Error('Unexpected artwork validation');
            const headers = new Headers(response.headers);
            if (!headers.has('cache-control')) headers.set('cache-control', cached.metadata.cacheControl);
            if (!headers.has('etag') && cached.metadata.etag) headers.set('etag', cached.metadata.etag);
            if (!headers.has('last-modified') && cached.metadata.lastModified) headers.set('last-modified', cached.metadata.lastModified);
            const metadata = responseMetadata(source, cached.payload, headers, receivedAt, cached.metadata.lifetimeMs);
            remember(key, metadata, cached.payload, epoch);
            if (hasDirective(metadata.cacheControl, 'no-store')) {
              await discard(key, epoch);
            } else await persist(key, metadata, cached.payload, epoch, requestSignal, undefined, true);
            return image.url ?? publish(image, cached.payload);
          }
          const noStore = hasDirective(response.headers.get('cache-control') ?? '', 'no-store');
          const reserve = async (size: number) => {
            await initialized;
            try { await exclusive(async () => {
              reservations.delete(reservation);
              if (!canPersist || noStore || epoch !== generation || requestSignal.aborted) { canPersist = false; return; }
              const placeholder = new Blob([], { type: response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() });
              const metadata = { ...responseMetadata(source, placeholder, response.headers, receivedAt), size };
              const required = encodeRecord(metadata, placeholder).size + size;
              if (await cleanup(required, key)) reservations.set(reservation, required);
              else canPersist = false;
            }); } catch {
              canPersist = false;
              available = false;
              reservations.delete(reservation);
            }
          };
          const downloaded = await readImageBody(response, imageLimit, requestSignal, (bytes) => { counters.downloadedBytes += bytes; }, reserve);
          const body = await abortable(prepare(downloaded, requestSignal), requestSignal);
          const metadata = responseMetadata(source, body, response.headers, receivedAt);
          remember(key, metadata, body, epoch);
          // Subscribers can display validated bytes immediately. ready/settled
          // still include admission, so persistence and prefetch callers retain
          // their completion contract without putting disk latency on screen.
          const url = publish(image, body);
          if (!hasDirective(response.headers.get('cache-control') ?? '', 'no-store')) {
            if (canPersist) await persist(key, metadata, body, epoch, requestSignal, undefined, false, reservation);
          } else await discard(key, epoch);
          return url;
          } finally {
            clearTimeout(timer);
            signal.removeEventListener('abort', cancel);
            await exclusive(async () => { reservations.delete(reservation); });
          }
        }); } catch { return undefined; } finally { image.finish(); }
      };
      if (staleAllowed) {
        image.refreshing = true;
        reprioritize(image);
        void refresh();
        return image.url;
      }
      return await refresh();
    } catch { image.finish(); return undefined; }
  }

  return {
    acquire(source, _role = 'poster', priority = 'visible') {
      let image = shared.get(source);
      if (!image) {
        let finish!: () => void;
        const settled = new Promise<void>((resolve) => { finish = resolve; });
        image = { consumers: 0, demand: { visible: 0, refresh: 0, prefetch: 0 }, controller: new AbortController(), promise: Promise.resolve(undefined), settled, finish, priority, listeners: new Set() };
        shared.set(source, image);
        image.consumers++;
        image.promise = load(source, image, generation);
      } else {
        image.consumers++;
      }
      const resource = image;
      resource.demand[priority]++;
      reprioritize(resource);
      let released = false;
      const listeners = new Set<(url: string) => void>();
      return { ready: resource.promise.then((url) => released ? undefined : resource.url ?? url), settled: resource.settled,
        subscribe(listener) {
          if (released) return () => undefined;
          listeners.add(listener);
          resource.listeners.add(listener);
          if (resource.url) listener(resource.url);
          return () => { listeners.delete(listener); resource.listeners.delete(listener); };
        }, setPriority(next) {
          if (released || priority === next) return;
          resource.demand[priority]--;
          priority = next;
          resource.demand[priority]++;
          reprioritize(resource);
        }, releasePrevious() {
          if (released || !resource.previousUrl) return;
          URL.revokeObjectURL(resource.previousUrl);
          resource.previousUrl = undefined;
        }, retainPrevious() {
          if (released || !resource.previousUrl || resource.consumers !== 1) return;
          if (resource.url) URL.revokeObjectURL(resource.url);
          resource.url = resource.previousUrl;
          resource.previousUrl = undefined;
        }, release() {
        if (released) return;
        released = true;
        resource.demand[priority]--;
        reprioritize(resource);
        for (const listener of listeners) resource.listeners.delete(listener);
        listeners.clear();
        if (--resource.consumers) return;
        resource.controller.abort();
        if (resource.url) URL.revokeObjectURL(resource.url);
        if (resource.previousUrl) URL.revokeObjectURL(resource.previousUrl);
        if (shared.get(source) === resource) shared.delete(source);
        drain();
      } };
    },
    async usage() {
      await initialized;
      await serial;
      return { managedBytes: bytes(), entries: entries.size, persistenceAvailable: available };
    },
    async diagnostics() {
      await initialized;
      await serial;
      return { ...counters, persistenceAvailable: available };
    },
    async clear() {
      generation++;
      warm.clear();
      for (const image of shared.values()) image.invalidated = true;
      shared.clear(); // Existing leases keep their own resources; new demand belongs to the new generation.
      for (const job of [...queue]) job.cancel();
      clearTimeout(accessTimer);
      accessTimer = undefined;
      dirty.clear();
      await initialized;
      await exclusive(async () => {
        bases.clear();
        validated.clear();
        try {
          for (const file of await store.list()) if (managed(file.key)) await remove(file.key);
          available = true;
        } catch { available = false; throw new Error('Image cache could not be cleared'); }
      });
    },
  };
}
