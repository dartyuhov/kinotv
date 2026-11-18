import { useFocusable, type FocusDetails, type FocusableComponentLayout } from '@noriginmedia/norigin-spatial-navigation';
import { Check } from 'lucide-react';
import { memo, useCallback, useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import './Card.css';
import { useImageState } from './useImage';
import { CardReadiness } from './cardReadiness';
import { useArtworkVisibility, useArtworkRetention, useArtworkPrefetch } from './useArtworkDemand';

/** `landscape` is 16:9 (Continue watching, episodes); `poster` is 2:3 (catalog rows and grids). Spec §6.1. */
export type CardVariant = 'landscape' | 'poster';

/** Size of each card variant in 1080p logical pixels. Rows and grids lay cards out from these. */
export const CARD_SIZE: Record<CardVariant, { width: number; height: number }> = {
  landscape: { width: 384, height: 216 },
  poster: { width: 200, height: 300 },
};

/** Everything a Row (or grid) hands to each card it renders. Spread it onto <Card>. */
export interface CardSlot {
  focusKey: string;
  index: number;
  variant: CardVariant;
  style: CSSProperties;
  /** Only the two nearest offscreen cards in the active navigation direction may speculate. */
  prefetch?: string;
  /** Focused row's incoming viewport, known before its scroll transform paints. */
  visibleHint?: boolean;
  onFocusIndex(index: number): void;
  onPressIndex(index: number): void;
}

export interface CardProps extends CardSlot {
  /** Accessible name. */
  label: string;
  /** Shown on landscape cards, and on any card while its image is missing. */
  title: string;
  /** A second line on landscape cards, e.g. "S1 · E3". */
  subtitle?: string;
  image: string;
  /** 0..1 watched; a progress bar is drawn when set. */
  progress?: number | null;
  /** Draws a watched mark. Say so in `label` too: the mark itself is not announced. */
  watched?: boolean;
  /** A count badge, e.g. new episodes. Say what it counts in `label` too: the badge itself is not announced. */
  badge?: number;
}

/**
 * A focusable artwork card with the tvOS focus treatment: scale, lift, deeper shadow and a light sheen,
 * animated with transform and opacity only (spec §6.1, §6.3). Memoised: keep the callbacks stable.
 */
export const Card = memo(function Card({
  focusKey,
  index,
  variant,
  style,
  prefetch,
  visibleHint,
  onFocusIndex,
  onPressIndex,
  label,
  title,
  subtitle,
  image,
  progress,
  watched,
  badge,
}: CardProps) {
  const onFocus = useCallback((_layout: FocusableComponentLayout, _props: object, details: FocusDetails) => {
    if (!details.artworkRestore) onFocusIndex(index);
  }, [index, onFocusIndex]);
  const [decoded, setDecoded] = useState<string>();
  const [broken, setBroken] = useState<string>();
  const usable = useRef(false);
  const onEnterPress = useCallback(() => { if (usable.current) onPressIndex(index); }, [index, onPressIndex]);
  const elementRef = useRef<HTMLDivElement>(null);
  const percent = progress === null || progress === undefined ? null : Math.round(progress * 100);
  const visible = useArtworkVisibility(elementRef) || !!visibleHint;
  const role = variant === 'poster' ? 'poster' : 'thumbnail';
  const warm = useArtworkPrefetch(!visible ? prefetch : undefined);
  const retained = useArtworkRetention(elementRef, visible || warm);
  const { url: poster, failed } = useImageState(image, role, retained, visible ? 'visible' : 'prefetch');
  const ready = !!poster && decoded === poster;
  const error = failed || (!!poster && broken === poster);
  usable.current = ready || error;
  const { ref } = useFocusable<object, HTMLDivElement>({ focusKey, onFocus, onEnterPress, focusable: ready || error });
  const attach = useCallback((element: HTMLDivElement | null) => {
    (elementRef as { current: HTMLDivElement | null }).current = element;
    (ref as { current: HTMLDivElement | null }).current = element;
  }, [ref]);
  const report = useContext(CardReadiness);
  useEffect(() => {
    report(focusKey, ready || error);
    return () => report(focusKey, false);
  }, [report, focusKey, ready, error]);
  const currentPoster = useRef(poster);
  currentPoster.current = poster;

  return (
    <div ref={attach} role="button" aria-label={label} aria-disabled={!ready && !error}
      data-artwork={ready ? 'ready' : error ? 'failed' : 'loading'} className={`card card--${variant}`} style={style}>
      <div className="card__frame">
        <span className="card__fallback" aria-hidden>
          {title}
        </span>
        <img className="card__image" src={poster} alt="" decoding="async" draggable={false}
          onLoad={(event) => {
            const element = event.currentTarget;
            const url = poster;
            void element.decode().then(() => {
              if (url && currentPoster.current === url) setDecoded(url);
            }, () => { if (url && currentPoster.current === url) setBroken(url); });
          }}
          onError={() => { if (poster) setBroken(poster); }} />
        {variant === 'landscape' && (
          <div className="card__caption" aria-hidden>
            <span className="card__title">{title}</span>
            {subtitle && <span className="card__subtitle">{subtitle}</span>}
          </div>
        )}
        {percent !== null && (
          <div className="card__progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="card__progress-fill" style={{ transform: `scaleX(${percent / 100})` }} />
          </div>
        )}
        {watched && (
          <span className="card__watched" aria-hidden>
            <Check strokeWidth={3} />
          </span>
        )}
        {badge !== undefined && badge > 0 && (
          <span className="card__badge" aria-hidden>
            {badge}
          </span>
        )}
        <div className="card__sheen" aria-hidden />
      </div>
    </div>
  );
});
