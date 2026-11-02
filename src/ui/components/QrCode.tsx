import { useMemo } from 'react';
import { encode } from 'uqr';

interface QrCodeProps {
  value: string;
  /** Rendered width and height in stage pixels. */
  size: number;
  /** Accessible name, e.g. "QR code: https://…". */
  label: string;
}

/** A QR code drawn as one SVG path: dark modules on a white quiet zone, crisp at any size. */
export function QrCode({ value, size, label }: QrCodeProps) {
  const { modules, path } = useMemo(() => {
    const { data, size: modules } = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    data.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x} ${y}h1v1h-1z`)));
    return { modules, path: d };
  }, [value]);

  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${modules} ${modules}`} shapeRendering="crispEdges">
      <rect width={modules} height={modules} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
