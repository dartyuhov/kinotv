import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { Play, Plus } from 'lucide-react';
import type { ItemSummary } from '../../../core/api/types';
import { is4k, ratingLabels, typeLabel } from '../../../core/catalog/facts';
import { splitTitle } from '../../../core/catalog/titles';
import { t } from '../../../core/i18n';
import { Button } from '../../components/Button';
import './Hero.css';

export const HERO_FOCUS_KEY = 'home:hero';

interface HeroProps {
  /** The title whose details are shown: the focused card's, or the featured one. */
  item: ItemSummary | undefined;
  /** Featured titles the hero cycles through; buttons and dots act on `featured[index]`. */
  featuredCount: number;
  index: number;
  /** Fade the buttons and dots out while the details describe a focused card rather than the featured title. */
  showingCard: boolean;
  onPlay(): void;
  onBookmark(): void;
}

/** The hero (spec §4, mockup tvos-style): big title, metadata, plot, Play and Bookmark, carousel dots. */
export function Hero({ item, featuredCount, index, showingCard, onPlay, onBookmark }: HeroProps) {
  const hasFeatured = featuredCount > 0;
  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({ focusKey: HERO_FOCUS_KEY, focusable: hasFeatured });
  const names = item ? splitTitle(item.title) : null;

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className={showingCard ? 'hero hero--card' : 'hero'}>
        {item && names && (
          <div className="hero__details">
            <h1 className="hero__title">{names.title}</h1>
            <p className="hero__meta">
              <span>{metaLine(item)}</span>
              {is4k(item) && <span className="hero__badge">4K</span>}
              {ratingLabels(item).map((rating) => (
                <span key={rating} className="hero__rating">
                  {rating}
                </span>
              ))}
            </p>
            {item.plot && <p className="hero__plot">{item.plot}</p>}
          </div>
        )}
        {hasFeatured && (
          <div className="hero__actions">
            <Button focusKey="home:hero:play" variant="primary" icon={Play} label={t('home.play')} onPress={onPlay} />
            <Button focusKey="home:hero:bookmark" icon={Plus} label={t('home.bookmark')} onPress={onBookmark} />
          </div>
        )}
        {featuredCount > 1 && (
          <div className="hero__dots" role="group" aria-label={t('home.slide', { n: index + 1, total: featuredCount })}>
            {Array.from({ length: featuredCount }, (_, i) => (
              <i key={i} className={i === index ? 'hero__dot hero__dot--active' : 'hero__dot'} />
            ))}
          </div>
        )}
      </div>
    </FocusContext.Provider>
  );
}

/** "Сериал · Триллер · 2024": type, up to two genres, year. */
function metaLine(item: ItemSummary): string {
  return [typeLabel(item.type), ...(item.genres ?? []).slice(0, 2).map((g) => g.title), item.year || null]
    .filter(Boolean)
    .join(' · ');
}
