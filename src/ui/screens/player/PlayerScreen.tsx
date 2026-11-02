import { useQuery } from '@tanstack/react-query';
import { formatClock } from '../../../core/catalog/facts';
import { splitTitle } from '../../../core/catalog/titles';
import { t } from '../../../core/i18n';
import { itemQuery } from '../../app/queries';
import type { ScreenParams } from '../../nav/stack';
import './PlayerScreen.css';

/**
 * STUB for the player. Ticket 06 replaces the component but keeps the `player` screen name and its
 * params. It only says what would play, so opening it and Back can be tested now.
 */
export function PlayerScreen({ params }: { params: ScreenParams['player'] }) {
  const { data: item } = useQuery(itemQuery(params.itemId));
  const { season, episode, startAt } = params;
  return (
    <div className="player-stub">
      <h1 className="player-stub__title">{item ? splitTitle(item.title).title : ' '}</h1>
      {season !== undefined && episode !== undefined && <p>{t('card.episode', { season, episode })}</p>}
      {season === undefined && episode !== undefined && <p>{t('player.part', { n: episode })}</p>}
      <p>{t('player.startAt', { time: formatClock(startAt) })}</p>
      <p className="player-stub__note">{t('player.comingSoon')}</p>
    </div>
  );
}
