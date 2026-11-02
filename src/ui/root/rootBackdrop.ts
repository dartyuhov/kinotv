import { useEffect } from 'react';
import { create } from 'zustand';
import type { Posters } from '../../core/api/types';

/**
 * The full-bleed backdrop behind the root screen. A tab's screen lives in the content region below the
 * tab bar, so it can't paint behind the bar itself; it sets the art here and the root screen draws it.
 */
export const useRootBackdropStore = create<{ posters: Posters | null }>(() => ({ posters: null }));

/** Shows `posters` behind the root screen while the calling tab is mounted. */
export function useRootBackdrop(posters: Posters | null): void {
  useEffect(() => {
    useRootBackdropStore.setState({ posters });
  }, [posters]);
  useEffect(() => () => useRootBackdropStore.setState({ posters: null }), []);
}
