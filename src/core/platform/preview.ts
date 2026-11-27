// Samsung Smart Hub "Personal Preview": tiles shown above the app on the TV's Home bar before it is opened.
// The tiles are set by the preview service (tizen/service/service.js), which this module launches with
// the data. Tapping a tile starts (or resumes) the app with the tile's action data (see previewTarget).
import type { HistoryEntry } from '../api/types';
import { splitTitle } from '../catalog/titles';
import { storage, type KeyValueStore } from './storage';
import { tizen, type TizenAppControlData } from './tizenGlobals';

/** Keep in sync with PREVIEW_SERVICE_ID in tools/tizen/configXml.ts (checked by preview.test.ts). */
export const PREVIEW_SERVICE_ID = 'KinoTV0001.service';
export const PREVIEW_STORAGE_KEY = 'kinotv:preview';
/** The TV drops preview updates less than 10 minutes apart. */
export const PREVIEW_INTERVAL_MS = 10 * 60_000;
const MAX_TILES = 12;

/** What a tile opens. */
export interface PreviewTarget { itemId: number }

const poster = (entry: HistoryEntry) => {
  const url = entry.item.posters.medium || entry.item.posters.small || entry.item.posters.big;
  return /^https?:\/\//.test(url ?? '') ? url : undefined;
};

/**
 * The preview JSON for the newest History titles: one section of 2:3 poster tiles (JPEG/PNG over
 * http(s), as the TV requires), each opening its title. Undefined when no title has a usable poster.
 */
export function previewData(entries: readonly HistoryEntry[], sectionTitle: string): string | undefined {
  const tiles = entries.filter((entry) => poster(entry)).slice(0, MAX_TILES).map((entry) => ({
    title: splitTitle(entry.item.title).title,
    image_url: poster(entry)!,
    image_ratio: '2by3',
    action_data: JSON.stringify({ itemId: entry.item.id } satisfies PreviewTarget),
    is_playable: false,
  }));
  return tiles.length ? JSON.stringify({ sections: [{ title: sectionTitle, tiles }] }) : undefined;
}

interface SentPreview { json: string; sentAt: number; status?: string }

/**
 * Sends preview data through `launch`, at most once per PREVIEW_INTERVAL_MS and only when it changed or
 * wasn't delivered. A change within the interval is sent when the interval is over (while the app runs).
 * The last send and its outcome are kept in storage (PREVIEW_STORAGE_KEY) across launches.
 */
export function createPreviewPublisher({ launch, kv = storage, now = Date.now, schedule = setTimeout, cancel = clearTimeout }: {
  launch(json: string): Promise<string>;
  kv?: KeyValueStore;
  now?: () => number;
  schedule?: (run: () => void, ms: number) => unknown;
  cancel?: (timer: never) => void;
}) {
  let timer: unknown;
  let latest: string | undefined;
  async function publish(json: string): Promise<void> {
    latest = json;
    const sent = kv.get<SentPreview>(PREVIEW_STORAGE_KEY);
    if (sent?.json === json && sent.status === 'ok') return;
    const wait = sent ? sent.sentAt + PREVIEW_INTERVAL_MS - now() : 0;
    if (wait > 0) {
      if (timer !== undefined) cancel(timer as never);
      timer = schedule(() => { timer = undefined; if (latest) void publish(latest); }, wait);
      return;
    }
    const sentAt = now();
    kv.set(PREVIEW_STORAGE_KEY, { json, sentAt } satisfies SentPreview);
    const status = await launch(json).catch((error: unknown) => `error: ${error instanceof Error ? error.message : String(error)}`);
    kv.set(PREVIEW_STORAGE_KEY, { json, sentAt, status } satisfies SentPreview);
  }
  return { publish };
}

/** Launches the preview service with `json`; resolves with the status it replies (see service.js). */
export function launchPreviewService(json: string): Promise<string> {
  const api = tizen();
  const application = api?.application;
  if (!application?.launchAppControl || !api?.ApplicationControl || !api.ApplicationControlData) {
    return Promise.reject(new Error('Preview unsupported'));
  }
  // Samsung suggests checking the http://tizen.org/feature/web.service capability first, but a 2021 TV
  // (Tizen 6.0) reports false and still runs the service and sets the preview, so it isn't consulted.
  const { ApplicationControl, ApplicationControlData } = api;
  return new Promise((resolve, reject) => {
    const control = new ApplicationControl('http://tizen.org/appcontrol/operation/pick', null, 'image/jpeg', null,
      [new ApplicationControlData('caller', ['ForegroundApp']), new ApplicationControlData('preview', [json])]);
    // A service that doesn't reply still ran; don't wait forever.
    const timeout = setTimeout(() => resolve('launched, no reply'), 15_000);
    const done = (status: string) => { clearTimeout(timeout); resolve(status); };
    application.launchAppControl!(control, PREVIEW_SERVICE_ID, undefined, (error) => { clearTimeout(timeout); reject(error); }, {
      onsuccess: (data: TizenAppControlData[]) => done(data.find((d) => d.key === 'status')?.value[0] ?? 'ok'),
      onfailure: () => done('launched, no reply'),
    });
  });
}

/**
 * The title a preview tile asked for, from the app control the app was started or resumed with.
 * The TV wraps the tile's action data as PAYLOAD = ['{"values":"<action data>"}'], sometimes URI-encoded.
 */
export function previewTarget(data: readonly TizenAppControlData[] | undefined): PreviewTarget | undefined {
  const raw = data?.find((field) => field.key === 'PAYLOAD')?.value[0];
  if (!raw) return undefined;
  for (const decode of [(s: string) => s, decodeURIComponent]) {
    try {
      const values = (JSON.parse(decode(raw)) as { values?: unknown }).values;
      const target = JSON.parse(typeof values === 'string' ? decodeIfEncoded(values) : '') as Partial<PreviewTarget>;
      if (Number.isSafeInteger(target.itemId) && target.itemId! > 0) return { itemId: target.itemId! };
    } catch { /* try the next decoding */ }
  }
  return undefined;
}

const decodeIfEncoded = (value: string) => (value.startsWith('%7B') || value.startsWith('%7b') ? decodeURIComponent(value) : value);

/** The app control data the app was started or resumed with (Tizen only). */
export function requestedAppControlData(): TizenAppControlData[] | undefined {
  try { return tizen()?.application?.getCurrentApplication().getRequestedAppControl?.()?.appControl?.data; }
  catch { return undefined; }
}
