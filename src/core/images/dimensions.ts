/** Read common raster headers before decode; compressed-byte limits don't bound pixel memory. */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dimensions = (width: number, height: number) => width > 0 && height > 0 ? { width, height } : undefined;
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
    return dimensions(view.getUint32(16), view.getUint32(20));
  }
  if (bytes.length >= 10 && bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70) {
    return dimensions(view.getUint16(6, true), view.getUint16(8, true));
  }
  if (bytes.length >= 30 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    const uint24 = (at: number) => bytes[at]! + (bytes[at + 1]! << 8) + (bytes[at + 2]! << 16);
    if (view.getUint32(12) === 0x56503858) return dimensions(uint24(24) + 1, uint24(27) + 1); // VP8X
    if (view.getUint32(12) === 0x56503820 && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      return dimensions(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    }
    if (view.getUint32(12) === 0x5650384c && bytes[20] === 0x2f) {
      const packed = view.getUint32(21, true);
      return dimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
    }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let at = 2; at + 3 < bytes.length;) {
      if (bytes[at++] !== 0xff) return undefined;
      while (bytes[at] === 0xff) at++;
      const marker = bytes[at++];
      if (marker === undefined || marker === 0xda || marker === 0xd9 || at + 2 > bytes.length) return undefined;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = view.getUint16(at);
      if (length < 2) return undefined;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        if (length < 7 || at + 7 > bytes.length) return undefined;
        return dimensions(view.getUint16(at + 5), view.getUint16(at + 3));
      }
      at += length;
    }
  }
  return undefined;
}
