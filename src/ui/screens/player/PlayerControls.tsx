import { useEffect, useState, type ReactNode } from 'react';
import { formatClock } from '../../../core/catalog/facts';
import { t } from '../../../core/i18n';
import './PlayerControls.css';

/** How long the fade-out runs before the controls leave the screen (and the accessibility tree). */
const FADE_MS = 250;

export interface PlayerControlsProps {
  visible: boolean;
  /** The small line above the title, e.g. "Тихая гавань · S1 · E3". */
  eyebrow?: string;
  title: string;
  /** Seconds. */
  position: number;
  duration: number;
  /** A seek target being previewed, seconds, or null. Shown instead of the position. */
  preview: number | null;
  /** Top right: the quick pills for audio, subtitles and quality (ticket 08). */
  topRight?: ReactNode;
  /** The line of key hints at the bottom. */
  hint: string;
}

/**
 * The controls overlay (spec §5.3, mockup player-remote, first frame): title top left, a slot top right,
 * the progress bar with elapsed and remaining time, and key hints. While seeking, the bar and the times
 * show the target, with its time above the playhead (no thumbnails: kino.watch has none).
 */
export function PlayerControls({ visible, eyebrow, title, position, duration, preview, topRight, hint }: PlayerControlsProps) {
  const gone = useGoneAfterFade(visible);
  const shown = preview ?? position;
  const fraction = duration > 0 ? Math.min(1, Math.max(0, shown / duration)) : 0;

  return (
    <div className="player-controls" data-state={visible ? 'shown' : gone ? 'hidden' : 'hiding'}>
      <div className="player-controls__top">
        <div className="player-controls__titles">
          {eyebrow && <p className="player-controls__eyebrow">{eyebrow}</p>}
          <h1 className="player-controls__title">{title}</h1>
        </div>
        {topRight}
      </div>
      <div className="player-controls__bottom">
        <div
          className="player-bar"
          role="progressbar"
          aria-label={t('player.progress')}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(shown)}
          aria-valuetext={t('player.progressValue', { elapsed: formatClock(shown), total: formatClock(duration) })}
        >
          <div className="player-bar__track">
            <div className="player-bar__played" style={{ transform: `scaleX(${fraction})` }} />
          </div>
          <div className="player-bar__head" style={{ transform: `translateX(${fraction * 100}%)` }}>
            <div className="player-bar__knob" />
            {preview !== null && <div className="player-bar__preview">{formatClock(preview)}</div>}
          </div>
        </div>
        <div className="player-controls__times">
          <span>{formatClock(shown)}</span>
          <span>{t('player.remaining', { time: formatClock(Math.max(0, duration - shown)) })}</span>
        </div>
        <p className="player-controls__hint">{hint}</p>
      </div>
    </div>
  );
}

/** True once the controls have finished fading out. */
function useGoneAfterFade(visible: boolean): boolean {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (visible) {
      setGone(false);
      return;
    }
    const timer = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(timer);
  }, [visible]);
  return gone;
}
