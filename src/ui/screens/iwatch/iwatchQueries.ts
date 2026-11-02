import { queryOptions } from '@tanstack/react-query';
import { api } from '../../../core/services';

const SERIES_TYPES = ['serial'] as const;
const ROW_LENGTH = 40;

/** Popular series, suggested when the viewer follows none (catalog data: the 10-minute default). */
export const popularSeriesQuery = queryOptions({
  queryKey: ['items', 'popular', SERIES_TYPES],
  queryFn: async () => (await api.shortcut('popular', { types: SERIES_TYPES, perpage: ROW_LENGTH })).items,
});
