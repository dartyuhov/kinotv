import { useMemo } from 'react';
import type { ItemDetails } from '../../../core/api/types';
import { adjacentEpisode, type EpisodeRef } from '../../../core/catalog/episodes';
import { findVideo } from '../../../core/catalog/findVideo';
import { t } from '../../../core/i18n';
import type { ProgressReporter } from '../../../core/sync/progressReporter';
import { screenStack } from '../../nav/stack';

/** An episode the player can move to, with the line that names it ("S1 · E2 · Причал"). */
export interface EpisodeChoice extends EpisodeRef {
  label: string;
}

/**
 * The episodes before and after the one playing (null at the first or last, and for films). Movement
 * runs across seasons: see core/catalog/episodes.ts.
 */
export function useEpisodeNeighbours(
  item: ItemDetails | undefined,
  season: number | undefined,
  episode: number | undefined,
): { previous: EpisodeChoice | null; next: EpisodeChoice | null } {
  return useMemo(() => {
    if (!item || season === undefined || episode === undefined) return { previous: null, next: null };
    const choice = (to: EpisodeRef | null): EpisodeChoice | null => {
      if (!to) return null;
      const where = t('card.episode', { season: to.season, episode: to.episode });
      const title = findVideo(item, to.season, to.episode)?.title;
      return { ...to, label: title ? t('player.nextEpisodeName', { where, title }) : where };
    };
    const here = { season, episode };
    return { previous: choice(adjacentEpisode(item, here, -1)), next: choice(adjacentEpisode(item, here, 1)) };
  }, [item, season, episode]);
}

/**
 * Plays another episode of the series from its start, in place of the current one. The outgoing
 * episode's position is saved first (spec §7.5: on episode change), then the player screen mounts
 * afresh for the new one. Back still returns to the screen the player was opened from.
 */
export function playEpisode(itemId: number, to: EpisodeRef, outgoing: ProgressReporter | null): void {
  void outgoing?.flush();
  screenStack.replace('player', { itemId, season: to.season, episode: to.episode, startAt: 0 });
}
