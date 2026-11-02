import { create } from 'zustand';
import { session } from '../../core/services';

interface RowMemoryState {
  /** Focused card index per row focus key. */
  index: Record<string, number>;
  remember(rowKey: string, index: number): void;
}

/**
 * Which card each row had focused. Rows are virtualised and screens unmount when another is pushed, so
 * Norigin's own last-focused-child memory is lost; this store outlives both (research 40-norigin §5.2).
 */
export const useRowMemory = create<RowMemoryState>((set) => ({
  index: {},
  remember: (rowKey, index) => set((s) => (s.index[rowKey] === index ? s : { index: { ...s.index, [rowKey]: index } })),
}));

// The next viewer starts at the beginning of every row.
session.subscribe(() => {
  if (session.status() === 'signedOut') useRowMemory.setState({ index: {} });
});
