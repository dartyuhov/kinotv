import type { Page } from '@playwright/test';
import { crc32, deflateSync } from 'node:zlib';

/**
 * Artwork URLs in fixtures point at this host. It is not a real host: the harness answers every request
 * to it with a tiny generated image, so tests never reach the network and the page logs no load errors.
 */
export const FAKE_CDN_BASE_URL = 'http://fake-cdn.kinotv.test';

/** Serves a small solid-colour PNG for any path on the fake CDN, and records which paths were asked for. */
export class FakeCdn {
  readonly requested: string[] = [];

  async attach(page: Page): Promise<void> {
    await page.route(`${FAKE_CDN_BASE_URL}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      this.requested.push(path);
      await route
        .fulfill({ status: 200, contentType: 'image/png', body: solidPng(colourFor(path)) })
        .catch(() => undefined); // the page may have dropped the image meanwhile
    });
  }
}

// A different colour per path, so screenshots of a failing test still tell the pictures apart.
function colourFor(path: string): [number, number, number] {
  let hash = 0;
  for (const ch of path) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return [hash & 0xff, (hash >> 8) & 0xff, (hash >> 16) & 0xff];
}

/** A 16×9 RGB PNG of one colour. */
function solidPng([r, g, b]: [number, number, number], width = 16, height = 9): Buffer {
  const row = Buffer.alloc(1 + width * 3); // filter byte 0, then RGB pixels
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit depth, truecolour, default compression, filter and interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
