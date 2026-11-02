import { queryOptions } from '@tanstack/react-query';
import { api } from '../../../core/services';

const RESULTS_LENGTH = 40;

/**
 * Titles matching `term` (catalog data: the 10-minute default). The request is cancelled when nothing
 * shows its results any more, i.e. the viewer has typed on (spec §5.2).
 */
export const searchQuery = (term: string) =>
  queryOptions({
    queryKey: ['search', term],
    queryFn: async ({ signal }) => (await api.search(term, { perpage: RESULTS_LENGTH, signal })).items,
  });
