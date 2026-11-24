import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256 } from './sha256';

const hex = (buffer: ArrayBuffer) => Buffer.from(buffer).toString('hex');

describe('sha256', () => {
  it('matches the FIPS 180-4 example vectors', () => {
    expect(hex(sha256(new Uint8Array()))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('matches node:crypto across block boundaries and large inputs', () => {
    for (const length of [1, 55, 56, 63, 64, 65, 119, 120, 128, 1000, 65_537, 300_000]) {
      const data = randomBytes(length);
      expect(hex(sha256(new Uint8Array(data))), `length ${length}`).toBe(createHash('sha256').update(data).digest('hex'));
    }
  });
});
