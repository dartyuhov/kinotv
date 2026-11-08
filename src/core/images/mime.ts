export const isImageMime = (mime: string): boolean =>
  ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(mime);
