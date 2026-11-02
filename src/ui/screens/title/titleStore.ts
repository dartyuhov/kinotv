import { create } from 'zustand';
import { session } from '../../../core/services';

interface TitleState {
  /** The season tab picked on each series' page, by item id. */
  season: Record<number, number>;
  pickSeason(itemId: number, season: number): void;
}

/**
 * Title page state that must outlive the page while the player is pushed over it, so Back lands on the
 * same season (and, through the row memory, the same episode).
 */
export const useTitleStore = create<TitleState>((set) => ({
  season: {},
  pickSeason: (itemId, season) =>
    set((s) => (s.season[itemId] === season ? s : { season: { ...s.season, [itemId]: season } })),
}));

// The next viewer starts on each series' own next episode.
session.subscribe(() => {
  if (session.status() === 'signedOut') useTitleStore.setState({ season: {} });
});
