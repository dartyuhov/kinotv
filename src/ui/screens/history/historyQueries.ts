import { queryOptions } from '@tanstack/react-query';
import { api } from '../../../core/services';

export const historyQuery = queryOptions({ queryKey: ['history'], queryFn: () => api.history(), staleTime: 0 });
