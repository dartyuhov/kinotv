import { useEffect, useRef, useState } from 'react';
import type { Posters } from '../../core/api/types';
import { imageCache } from '../../core/images';
import type { ImageLease } from '../../core/images/cache';
import { artwork } from './artwork';
import { useImage } from './useImage';
import './Backdrop.css';

/**
 * Full-bleed key art behind a screen (spec §6.1), faded into black by left and bottom gradient scrims.
 *
 * The largest artwork loads behind a FrostedImage of the smallest one, which shows at once and blurs
 * naturally as it is upscaled; the large image fades in over it when decoded. Place it as the first
 * child of a full-stage layer. Sharp art sits above the preview; the scrim sits above both.
 */
export function Backdrop({ posters }: { posters: Posters }) {
  const sharp = artwork(posters, 'backdrop');
  return (
    <div className="backdrop" aria-hidden>
      <SharpBackdrop source={sharp} />
      <FrostedImage src={artwork(posters, 'tiny')} />
      <div className="backdrop__scrim" />
    </div>
  );
}

/**
 * A frosted surface without backdrop-filter (spec §6.3): a tiny image stretched over the area, which the
 * browser's upscaling blurs, under a translucent fill. Fills its positioned parent.
 */
export function FrostedImage({ src }: { src: string }) {
  const url = useImage(src, 'preview');
  return (
    <div className="frosted" aria-hidden>
      <img className="frosted__image" src={url} alt="" decoding="async" draggable={false} />
      <div className="frosted__fill" />
    </div>
  );
}

interface Sharp { source: string; url: string; lease: ImageLease; loaded: boolean }

/** Two sharp leases at most: the retained image and one cancellable incoming image. */
function SharpBackdrop({ source }: { source: string }) {
  const retained = useRef<Sharp>();
  const [layers, setLayers] = useState<Sharp[]>([]);
  const complete = useRef<(image: Sharp) => void>(() => undefined);
  useEffect(() => {
    let active = true;
    let incoming: Sharp | undefined;
    let lease: ImageLease | undefined;
    let unsubscribe: (() => void) | undefined;
    let transition: ReturnType<typeof setTimeout> | undefined;
    const releaseOutgoing = (next: Sharp) => {
      if (retained.current?.lease !== next.lease) retained.current?.lease.release();
      next.lease.releasePrevious();
      retained.current = next;
    };
    setLayers(retained.current ? [retained.current] : []);
    const timer = setTimeout(() => {
      if (!source) return;
      lease = retained.current?.source === source ? retained.current.lease : imageCache().acquire(source, 'backdrop', 'visible');
      unsubscribe = lease.subscribe((url) => {
        if (!active || !url) return;
        if (retained.current?.url === url || incoming?.url === url) return;
        clearTimeout(transition);
        if (incoming?.loaded) releaseOutgoing(incoming);
        else if (incoming && retained.current?.lease !== lease) {
          // The incoming lease now owns stale + refreshed URLs. Drop the older source
          // before retaining those two, even if its stale image has not decoded yet.
          retained.current?.lease.release();
          retained.current = undefined;
        }
        incoming = { source, url, lease: lease!, loaded: false };
        setLayers(retained.current ? [retained.current, incoming] : [incoming]);
      });
    }, 200);
    complete.current = (image) => {
      if (!active || image !== incoming || image.loaded) return;
      image.loaded = true;
      setLayers(retained.current ? [retained.current, image] : [image]);
      transition = setTimeout(() => {
        releaseOutgoing(image);
        incoming = undefined;
        setLayers([image]);
      }, 400);
    };
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(transition);
      unsubscribe?.();
      // On interrupted fades keep the already decoded incoming image, releasing the outgoing first.
      if (incoming?.loaded) {
        releaseOutgoing(incoming);
      } else if (lease && retained.current?.lease !== lease) lease.release();
      else if (incoming && lease) lease.retainPrevious();
    };
  }, [source]);
  useEffect(() => () => { retained.current?.lease.release(); retained.current = undefined; }, []);
  return <>{layers.map((image) => <img key={image.url}
    className={`backdrop__image${image.loaded ? ' backdrop__image--loaded' : ''}`}
    data-testid="backdrop" data-source={image.source} src={image.url} alt="" decoding="async" draggable={false}
    onLoad={() => complete.current(image)} />)}</>;
}
