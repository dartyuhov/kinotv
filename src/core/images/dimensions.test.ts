import { expect, it } from 'vitest';
import { imageDimensions } from './dimensions';

it('reads PNG dimensions without allocating pixels, including oversized headers', () => {
  const bytes = new Uint8Array(24);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x89504e47);
  view.setUint32(4, 0x0d0a1a0a);
  view.setUint32(16, 3840);
  view.setUint32(20, 2160);
  expect(imageDimensions(bytes)).toEqual({ width: 3840, height: 2160 });
  view.setUint32(16, 100_000);
  expect(imageDimensions(bytes)?.width).toBe(100_000);
  expect(imageDimensions(bytes.slice(0, 20))).toBeUndefined();
});

it('finds JPEG frame dimensions after application metadata and rejects truncated frames', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc2, 0, 7, 8, 8, 112, 15, 0]);
  expect(imageDimensions(jpeg)).toEqual({ width: 3840, height: 2160 });
  expect(imageDimensions(jpeg.slice(0, -1))).toBeUndefined();
  jpeg[10] = 0;
  jpeg[11] = 0;
  expect(imageDimensions(jpeg)).toBeUndefined();
});

it('reads extended WebP and GIF dimensions and handles unknown input', () => {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x52494646);
  view.setUint32(8, 0x57454250);
  view.setUint32(12, 0x56503858);
  bytes.set([255, 14, 0, 111, 8, 0], 24);
  expect(imageDimensions(bytes)).toEqual({ width: 3840, height: 2160 });
  const gif = Uint8Array.from([71, 73, 70, 56, 57, 97, 0, 15, 112, 8]);
  expect(imageDimensions(gif)).toEqual({ width: 3840, height: 2160 });
  expect(imageDimensions(new Uint8Array())).toBeUndefined();
});
