export interface ManifestTrack {
  type: 'AUDIO' | 'TEXT';
  lang: string;
  name: string;
  channels?: number;
  group?: string;
}

export interface ManifestVariant {
  width: number;
  height: number;
  /** HLS BANDWIDTH, bits per second. Never substitute AVERAGE-BANDWIDTH. */
  bandwidth: number;
  audioGroup?: string;
  subtitleGroup?: string;
}
export interface ManifestInfo { tracks: ManifestTrack[]; variants: ManifestVariant[] }
export const emptyManifest = (): ManifestInfo => ({ tracks: [], variants: [] });
function attributes(line: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of line.matchAll(/([A-Z-]+)=(?:"([^"]*)"|([^,]*))(?:,|$)/g)) result[match[1]!] = match[2] ?? match[3] ?? '';
  return result;
}

export function semanticRenditionName(name: string): string {
  return name.replace(/^\s*\d+[\s._)-]*/, '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function parseManifest(text: string): ManifestInfo {
  const tracks = parseManifestTracks(text);
  const variants: ManifestVariant[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    const info = attributes(line.slice(18));
    const dimensions = /^(\d+)[xX](\d+)$/.exec(info.RESOLUTION ?? '');
    const bandwidth = Number(info.BANDWIDTH);
    if (!dimensions || !Number.isSafeInteger(bandwidth) || bandwidth <= 0) continue;
    variants.push({ width: Number(dimensions[1]), height: Number(dimensions[2]), bandwidth,
      audioGroup: info.AUDIO, subtitleGroup: info.SUBTITLES });
  }
  return { tracks, variants };
}

/** Group/count/order agreement is necessary but not sufficient: each native identity must also be
 * independently unique by the reported language/channels. Repeated indistinguishable entries map
 * to undefined, regardless of observed native index order. */
export function matchManifestGroup(manifest: ManifestInfo, type: ManifestTrack['type'], width: number,
  native: readonly { lang: string; channels?: number }[]): Array<ManifestTrack | undefined> {
  const groups = new Set(manifest.variants.filter((variant) => variant.width === width)
    .map((variant) => type === 'AUDIO' ? variant.audioGroup : variant.subtitleGroup).filter(Boolean));
  if (groups.size !== 1 || native.length === 0) return [];
  const group = [...groups][0];
  const tracks = manifest.tracks.filter((track) => track.type === type && track.group === group);
  if (tracks.length !== native.length || tracks.some((track, i) => track.lang === 'unk' || track.lang !== native[i]!.lang ||
    (track.channels !== undefined && native[i]!.channels !== undefined && track.channels !== native[i]!.channels))) return [];
  const compatible = (track: { lang: string; channels?: number }, entry: { lang: string; channels?: number }) =>
    track.lang === entry.lang && (track.channels === undefined || entry.channels === undefined || track.channels === entry.channels);
  return native.map((entry) => {
    const matches = tracks.filter((track) => compatible(track, entry));
    if (matches.length !== 1 || native.filter((other) => compatible(matches[0]!, other)).length !== 1) return undefined;
    return matches[0];
  });
}

/** HLS rendition labels are evidence, not an AVPlay-index map. Keep only the semantic attributes. */
export function parseManifestTracks(text: string): ManifestTrack[] {
  const tracks: ManifestTrack[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('#EXT-X-MEDIA:')) continue;
    const info = attributes(line.slice(13));
    const type = info.TYPE === 'AUDIO' ? 'AUDIO' : info.TYPE === 'SUBTITLES' ? 'TEXT' : undefined;
    const lang = normalizeLanguage(info.LANGUAGE ?? '');
    const name = info.NAME?.trim();
    if (!type || !name || name.length > 160 || /[\x00-\x1f]|https?:\/\//i.test(name) || lang === 'unk') continue;
    const channels = Number.parseInt(info.CHANNELS ?? '', 10);
    tracks.push({ type, lang, name, ...(channels > 0 ? { channels } : {}), ...(info['GROUP-ID'] ? { group: info['GROUP-ID'] } : {}) });
  }
  return tracks;
}

export function normalizeLanguage(raw: string): string {
  const lang = raw.toLowerCase().split('-')[0] ?? '';
  const aliases: Record<string, string> = { ru: 'rus', en: 'eng', uk: 'ukr', de: 'deu', ger: 'deu', fr: 'fra', fre: 'fra', es: 'spa', it: 'ita', ja: 'jpn', ko: 'kor', zh: 'zho', chi: 'zho' };
  return aliases[lang] ?? (/^[a-z]{3}$/.test(lang) ? lang : 'unk');
}

/** Optional real-source metadata read. Failure must not stop AVPlay from fetching the same stream. */
export async function readManifest(url: string, signal: AbortSignal): Promise<ManifestInfo> {
  const abort = new AbortController();
  const cancel = () => abort.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 3_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (signal.aborted) return emptyManifest();
    const response = await fetch(url, { signal: abort.signal, credentials: 'omit' });
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > 256 * 1024) return emptyManifest();
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256 * 1024) return emptyManifest();
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text.startsWith('#EXTM3U') ? parseManifest(text) : emptyManifest();
  } catch { return emptyManifest(); }
  finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); await reader?.cancel().catch(() => undefined); }
}
