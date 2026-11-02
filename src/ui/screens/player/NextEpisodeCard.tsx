import { useEffect, useRef, useState } from 'react';
import { t } from '../../../core/i18n';
import { remoteBus } from '../../../core/input/remoteBus';
import { useBackHandler } from '../../nav/useBackHandler';
import { usePlayerKeyCapture, usePlayerUi } from './playerUi';
import './NextEpisodeCard.css';

/** The card shows for this many seconds at the end of an episode (kino.watch has no credits markers). */
export const NEXT_CARD_SECONDS = 20;
/** Then it counts down this many seconds, in clock time while playing, and plays the next episode. */
export const NEXT_COUNTDOWN_SECONDS = 10;

/**
 * The "Next episode in 10 s" layer (spec §5.3), for an episode that has a next one. In the last
 * NEXT_CARD_SECONDS it shows the card and counts down while the video plays; at zero, or on OK, it calls
 * `onPlay`. Back hides it and keeps the current episode. It also owns the end of the video: the next
 * episode plays then, unless the viewer said no, in which case the player closes.
 */
export function NextEpisodeCard({ label, onPlay, onLeave }: { label: string; onPlay(): void; onLeave(): void }) {
  const { playback } = usePlayerUi();
  const { position, duration, state } = playback;
  const inWindow = duration > 0 && duration - position <= NEXT_CARD_SECONDS;
  const [cancelled, setCancelled] = useState(false);
  const [seconds, setSeconds] = useState(NEXT_COUNTDOWN_SECONDS);
  const shown = inWindow && !cancelled;

  // Called at most once: the countdown and the end of the video may both get there.
  const done = useRef(false);
  const actions = useRef({ onPlay, onLeave });
  actions.current = { onPlay, onLeave };
  const finish = (play: boolean) => {
    if (done.current) return;
    done.current = true;
    if (play) actions.current.onPlay();
    else actions.current.onLeave();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // Seeking back out of the last seconds starts afresh: the card comes back next time.
  useEffect(() => {
    if (inWindow) return;
    setCancelled(false);
    setSeconds(NEXT_COUNTDOWN_SECONDS);
  }, [inWindow]);

  useEffect(() => {
    if (!shown || state !== 'playing') return;
    if (seconds <= 0) return finishRef.current(true);
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [shown, state, seconds]);

  useEffect(() => {
    if (state === 'ended') finishRef.current(!cancelled);
  }, [state, cancelled]);

  usePlayerKeyCapture(shown);
  useEffect(() => {
    if (!shown) return;
    return remoteBus.subscribe((key) => {
      if (key === 'ok') finishRef.current(true);
    });
  }, [shown]);
  useBackHandler(() => {
    setCancelled(true);
    return true;
  }, shown);

  if (!shown) return null;
  return (
    <div className="next-episode" role="dialog" aria-label={t('player.nextEpisode')}>
      <p className="next-episode__countdown">{t('player.nextEpisodeIn', { n: Math.max(0, seconds) })}</p>
      <p className="next-episode__name">{label}</p>
      <p className="next-episode__hint">{t('player.nextEpisodeHint')}</p>
    </div>
  );
}
