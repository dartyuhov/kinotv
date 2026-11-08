import { isImageMime } from './mime';

export interface ImageMetadata {
  version: 1;
  source: string;
  mime: string;
  size: number;
  storedAt: number;
  lastUsed: number;
  freshUntil: number;
  cacheControl: string;
  etag?: string;
  lastModified?: string;
  lifetimeMs?: number;
}

/** One record = length prefix + UTF-8 metadata + compressed payload. Atomic publication on both platforms. */
export function encodeRecord(metadata: ImageMetadata, payload: Blob): Blob {
  const json = new TextEncoder().encode(JSON.stringify(metadata));
  const prefix = new Uint8Array(4);
  new DataView(prefix.buffer).setUint32(0, json.byteLength);
  return new Blob([prefix, json, payload]);
}

export async function decodeRecord(record: Blob): Promise<{ metadata: ImageMetadata; payload: Blob }> {
  const length = new DataView(await record.slice(0, 4).arrayBuffer()).getUint32(0);
  if (length > 64 * 1024 || length + 4 >= record.size) throw new Error('Invalid artwork record');
  const metadata = JSON.parse(await record.slice(4, length + 4).text()) as ImageMetadata;
  if (metadata.version !== 1 || typeof metadata.source !== 'string' || typeof metadata.mime !== 'string' ||
      !Number.isFinite(metadata.freshUntil) || !Number.isFinite(metadata.lastUsed) || !Number.isFinite(metadata.storedAt) ||
      typeof metadata.cacheControl !== 'string' || (metadata.etag !== undefined && typeof metadata.etag !== 'string') ||
      (metadata.lastModified !== undefined && typeof metadata.lastModified !== 'string') ||
      (metadata.lifetimeMs !== undefined && (!Number.isFinite(metadata.lifetimeMs) || metadata.lifetimeMs < 0)) ||
      !isImageMime(metadata.mime) ||
      metadata.size !== record.size - length - 4) {
    throw new Error('Invalid artwork metadata');
  }
  return { metadata, payload: record.slice(length + 4, record.size, metadata.mime) };
}

export function responseMetadata(source: string, payload: Blob, headers: Headers, now: number, previousLifetime?: number): ImageMetadata {
  const cacheControl = headers.get('cache-control') ?? '';
  const maxAge = /(?:^|,)\s*max-age\s*=\s*"?(\d+)/i.exec(cacheControl);
  const expires = Date.parse(headers.get('expires') ?? '');
  const date = Date.parse(headers.get('date') ?? '');
  const age = Math.max(Number(headers.get('age')) || 0, Number.isFinite(date) ? Math.max(0, (now - date) / 1000) : 0);
  const lifetime = maxAge ? Number(maxAge[1]) * 1000 : Number.isFinite(expires) ? Math.max(0, expires - (Number.isFinite(date) ? date : now)) : previousLifetime ?? 7 * 86400_000;
  return { version: 1, source, mime: payload.type, size: payload.size, storedAt: now, lastUsed: now,
    freshUntil: now + Math.max(0, lifetime - age * 1000), cacheControl, lifetimeMs: lifetime,
    etag: headers.get('etag') ?? undefined, lastModified: headers.get('last-modified') ?? undefined };
}

export const hasDirective = (value: string, directive: string): boolean =>
  value.split(',').some((part) => part.trim().split('=')[0]?.toLowerCase() === directive);
