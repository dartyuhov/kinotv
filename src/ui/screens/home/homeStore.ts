import { create } from 'zustand';

interface HomeState {
  /** Which featured title the hero shows. */
  heroIndex: number;
  /** Focus key of the row that last had focus; the rows are scrolled to it. */
  activeRow: string | null;
}

/** Home's view state. It outlives Home, which unmounts whenever a screen is pushed over it or the tab changes. */
export const useHomeStore = create<HomeState>(() => ({ heroIndex: 0, activeRow: null }));
