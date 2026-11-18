import { followingQuery } from './following';
import { queryClient, watchingQuery } from './queries';
import { continueWatchingQuery } from '../screens/home/homeQueries';
import { historyQuery } from '../screens/history/historyQueries';

/** Every progress writer refreshes the same views, including historical ordering/position. */
export function invalidateProgress(itemId: number): Promise<void[]> {
  return Promise.all([watchingQuery(itemId).queryKey, continueWatchingQuery.queryKey, followingQuery.queryKey, historyQuery.queryKey]
    .map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
