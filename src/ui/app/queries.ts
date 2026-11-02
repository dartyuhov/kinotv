import { QueryClient, queryOptions } from '@tanstack/react-query';
import { api, session } from '../../core/services';

/**
 * Server state cache (spec §7.4).
 *
 * - `staleTime` 10 minutes suits the catalog, collections, genres and item details. Personal lists
 *   (Continue watching, I Watch, Bookmarks, History) set their own and refetch when their screen gains focus.
 * - No query retries here: the API client already retries GETs on network, timeout and 5xx errors.
 * - No window-focus refetch: a TV app has no window focus worth reacting to.
 * - The cache belongs to the signed-in account, so it is cleared when the session ends.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10 * 60_000, retry: false, refetchOnWindowFocus: false },
  },
});

session.subscribe(() => {
  if (session.status() === 'signedOut') queryClient.clear();
});

/** The signed-in account: name and subscription. Re-fetched whenever a screen showing it mounts. */
export const userQuery = queryOptions({
  queryKey: ['user'],
  queryFn: () => api.user(),
  staleTime: 0,
});
