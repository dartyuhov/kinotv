import { isImageMime } from './mime';
import { imageDimensions } from './dimensions';

export interface ImageResponse {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}
export interface ImageRequest { signal: AbortSignal; validators?: { etag?: string; lastModified?: string } }
export type ImageTransport = (source: string, request: ImageRequest) => Promise<ImageResponse>;

/** Deliberately separate from authenticated API HTTP. Never accept caller-supplied auth headers. */
export const fetchImage: ImageTransport = (source, { signal, validators }) => {
  const url = new URL(source);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return Promise.reject(new Error('Unsupported artwork source'));
  }
  const headers = new Headers();
  if (validators?.etag) headers.set('If-None-Match', validators.etag);
  if (validators?.lastModified) headers.set('If-Modified-Since', validators.lastModified);
  return fetch(source, { signal, headers, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
};

/** Abort even a transport/stream that fails to reject its pending operation on abort. */
export function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new Error('Artwork cancelled'));
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}

export async function readImageBody(response: ImageResponse, maximum: number, signal: AbortSignal, transferred?: (bytes: number) => void,
  reserve?: (size: number) => Promise<void>): Promise<Blob> {
  const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing artwork body');
  const chunks: BlobPart[] = [];
  let size = 0;
  try {
    if (response.status !== 200 || !isImageMime(mime) ||
        Number(response.headers.get('content-length')) > maximum) throw new Error('Rejected artwork response');
    while (true) {
      if (signal.aborted) throw new Error('Artwork cancelled');
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      transferred?.(value.byteLength);
      if (size > maximum) throw new Error('Artwork exceeds limit');
      await reserve?.(size);
      chunks.push(value.buffer instanceof ArrayBuffer ? value as Uint8Array<ArrayBuffer> : new Uint8Array(value));
    }
    if (!size) throw new Error('Empty artwork');
    return new Blob(chunks, { type: mime });
  } finally { void reader.cancel().catch(() => undefined); }
}

/** Decode before admission: a MIME header or magic bytes alone cannot identify a valid image. */
export async function validateImage(blob: Blob): Promise<Blob> {
  const dimensions = imageDimensions(new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer()));
  // Reject pathological raster headers before allocating a decoder's full-size surface.
  if (dimensions && dimensions.width * dimensions.height > 16_777_216) throw new Error('Artwork exceeds pixel limit');
  if (dimensions && (dimensions.width > 1920 || dimensions.height > 1080) && typeof createImageBitmap === 'function') {
    const scale = Math.min(1920 / dimensions.width, 1080 / dimensions.height);
    let bitmap: ImageBitmap | undefined;
    let canvas: HTMLCanvasElement | undefined;
    try {
      bitmap = await createImageBitmap(blob, { resizeWidth: Math.max(1, Math.round(dimensions.width * scale)),
        resizeHeight: Math.max(1, Math.round(dimensions.height * scale)), resizeQuality: 'medium' });
      canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Artwork resize unavailable');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      bitmap = undefined;
      return await encodeCanvas(canvas);
    } finally {
      bitmap?.close();
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  let canvas: HTMLCanvasElement | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Invalid artwork'));
      image.src = url;
    });
    // The app renders a 1920×1080 plane even on 4K TVs. A 5 MB compressed-byte
    // limit alone permits enormous decoded textures. Persist the bounded image
    // so revisits/restarts don't decode the original again. Never upscale.
    const scale = Math.min(1, 1920 / image.naturalWidth, 1080 / image.naturalHeight);
    if (scale === 1) return blob;
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Artwork resize unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await encodeCanvas(canvas);
  } finally {
    image.onload = image.onerror = null;
    image.src = '';
    URL.revokeObjectURL(url);
    // Release the backing surface immediately, including on encoding failure.
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (result) => result ? resolve(result) : reject(new Error('Artwork resize failed')), 'image/webp', .85));
}
