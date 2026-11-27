import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { validateImage } from './transport';

// validateImage on an oversized source, with the browser's bitmap and canvas stubbed out:
// the test checks which format the resized artwork is encoded in, not pixels.
const encoded: string[] = [];

beforeEach(() => {
  encoded.length = 0;
  vi.stubGlobal('createImageBitmap', async (_blob: Blob, options: { resizeWidth: number; resizeHeight: number }) =>
    ({ width: options.resizeWidth, height: options.resizeHeight, close() {} }));
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage() {} }),
      toBlob(callback: (blob: Blob | null) => void, type: string) {
        encoded.push(type);
        callback(new Blob([new Uint8Array(8)], { type }));
      },
    }),
  });
});
afterEach(() => vi.unstubAllGlobals());

const jpeg4k = () => new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 7, 8, 8, 112, 15, 0])], { type: 'image/jpeg' });
function png4k(): Blob {
  const bytes = new Uint8Array(24);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x89504e47);
  view.setUint32(4, 0x0d0a1a0a);
  view.setUint32(16, 3840);
  view.setUint32(20, 2160);
  return new Blob([bytes], { type: 'image/png' });
}

it('keeps an oversized JPEG as JPEG after resizing (fast to encode on the TV)', async () => {
  const result = await validateImage(jpeg4k());
  expect(encoded).toEqual(['image/jpeg']);
  expect(result.type).toBe('image/jpeg');
});

it('encodes other oversized sources as WebP, which keeps any alpha', async () => {
  const result = await validateImage(png4k());
  expect(encoded).toEqual(['image/webp']);
  expect(result.type).toBe('image/webp');
});
