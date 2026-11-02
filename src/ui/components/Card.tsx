import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { Check } from 'lucide-react';
import { memo, useCallback, type CSSProperties } from 'react';
import './Card.css';

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
  onFocusIndex,
  onPressIndex,
  label,
  title,
  subtitle,
  image,
  progress,
  watched,
}: CardProps) {
  const onFocus = useCallback(() => onFocusIndex(index), [index, onFocusIndex]);
  const onEnterPress = useCallback(() => onPressIndex(index), [index, onPressIndex]);
  const { ref } = useFocusable<object, HTMLDivElement>({ focusKey, onFocus, onEnterPress });
  const percent = progress === null || progress === undefined ? null : Math.round(progress * 100);

  return (
    <div ref={ref} role="button" aria-label={label} className={`card card--${variant}`} style={style}>
      <div className="card__frame">
        <span className="card__fallback" aria-hidden>
          {title}
        </span>
        <img className="card__image" src={image} alt="" loading="lazy" decoding="async" draggable={false} />
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
        <div className="card__sheen" aria-hidden />
      </div>
    </div>
  );
});
