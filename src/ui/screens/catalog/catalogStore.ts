import { create } from 'zustand';
import { defaultFilter, type CatalogFilter, type CatalogSection } from '../../../core/catalog/catalogFilter';
import { session } from '../../../core/services';

interface CatalogState {
  /** The filters each section's grid shows. */
  filters: Record<CatalogSection, CatalogFilter>;
  setFilter(section: CatalogSection, filter: CatalogFilter): void;
}

const initialFilters = (): Record<CatalogSection, CatalogFilter> => ({ movies: defaultFilter('movies'), series: defaultFilter('series') });

/** The Movies and Series filters. They outlive the tabs, which unmount on every push and tab change. */
export const useCatalogStore = create<CatalogState>((set) => ({
  filters: initialFilters(),
  setFilter: (section, filter) => set((s) => ({ filters: { ...s.filters, [section]: filter } })),
}));

// The next viewer starts with the default filters.
session.subscribe(() => {
  if (session.status() === 'signedOut') useCatalogStore.setState({ filters: initialFilters() });
});
