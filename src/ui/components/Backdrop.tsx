import { useState } from 'react';
import type { Posters } from '../../core/api/types';
import { artwork } from './artwork';
import './Backdrop.css';

/**
 * Full-bleed key art behind a screen (spec §6.1), faded into black by left and bottom gradient scrims.
 *
 * The largest artwork loads behind a FrostedImage of the smallest one, which shows at once and blurs
 * naturally as it is upscaled; the large image fades in over it when decoded. Place it as the first
 * child of a full-stage layer.
 */
export function Backdrop({ posters }: { posters: Posters }) {
  const sharp = artwork(posters, 'backdrop');
  return (
    <div className="backdrop" aria-hidden>
      <FrostedImage src={artwork(posters, 'tiny')} />
      <FadeInImage key={sharp} src={sharp} />
      <div className="backdrop__scrim" />
    </div>
  );
}

/**
 * A frosted surface without backdrop-filter (spec §6.3): a tiny image stretched over the area, which the
 * browser's upscaling blurs, under a translucent fill. Fills its positioned parent.
 */
export function FrostedImage({ src }: { src: string }) {
  return (
    <div className="frosted" aria-hidden>
      <img className="frosted__image" src={src} alt="" decoding="async" draggable={false} />
      <div className="frosted__fill" />
    </div>
  );
}

function FadeInImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      className={loaded ? 'backdrop__image backdrop__image--loaded' : 'backdrop__image'}
      data-testid="backdrop"
      src={src}
      alt=""
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
    />
  );
}
