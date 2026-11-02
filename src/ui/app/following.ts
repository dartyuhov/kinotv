import { queryOptions, useMutation, useQuery } from '@tanstack/react-query';
import type { ItemDetails, WatchingSerial } from '../../core/api/types';
import { applyFollow, newEpisodesFirst, type FollowChange } from '../../core/catalog/following';
import { api } from '../../core/services';
import { itemQuery, queryClient } from './queries';

const FOLLOW_MUTATION_KEY = ['follow'] as const;

/**
 * The series the viewer follows (I Watch), with new episodes first. Personal, so it is re-fetched
 * whenever a screen showing it mounts: the I Watch tab, Home (New episodes) and series title pages
 * (the Follow button), spec §7.4.
 *
 * Follows and unfollows still on their way to the server are applied to every fetched list, so a list
 * fetched meanwhile (e.g. Home mounting again on Back) doesn't undo them on screen.
 */
export const followingQuery = queryOptions({
  queryKey: ['following'],
  queryFn: async () => {
    const list = await api.watchingSerials(true);
    // Read once the answer is in: the changes pending now, not those pending when the request went out.
    return newEpisodesFirst(pendingFollowChanges().reduce(applyFollow, list));
  },
  staleTime: 0,
});

function pendingFollowChanges(): FollowChange[] {
  return queryClient
    .getMutationCache()
    .findAll({ mutationKey: FOLLOW_MUTATION_KEY, status: 'pending' })
    .map((mutation) => mutation.state.variables as FollowChange);
}

/** Shows `change` everywhere at once: the followed list (I Watch, Home) and the series' details. */
function showFollow(change: FollowChange): void {
  queryClient.setQueryData<WatchingSerial[]>(followingQuery.queryKey, (list) => list && newEpisodesFirst(applyFollow(list, change)));
  queryClient.setQueryData<ItemDetails>(
    itemQuery(change.series.id).queryKey,
    (item) => item && { ...item, subscribed: change.follow, in_watchlist: change.follow },
  );
}

/**
 * Follow and unfollow (spec §7.4: toggles update the screen immediately and roll back if the server
 * rejects them). The change shows at once; a rejection undoes it, and the caller shows `failed`. The
 * callbacks belong to the mutation, not the screen, so they still run if the viewer leaves meanwhile.
 * Once the last pending change settles, the list is fetched again to match the server.
 */
export function useFollow(item: ItemDetails | undefined) {
  const following = useQuery(followingQuery);
  const mutation = useMutation({
    mutationKey: FOLLOW_MUTATION_KEY,
    mutationFn: (change: FollowChange) => api.toggleWatchlist(change.series.id),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: followingQuery.queryKey });
      showFollow(change);
    },
    onError: (_error, change) => showFollow({ ...change, follow: !change.follow }),
    // The server toggles, so it says which way it went.
    onSuccess: (followed, change) => showFollow({ ...change, follow: followed }),
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: FOLLOW_MUTATION_KEY }) === 1) {
        void queryClient.invalidateQueries({ queryKey: followingQuery.queryKey });
      }
    },
  });

  // The followed list is fresher than the details (cached for 10 minutes); they are the fallback.
  const followed = following.data
    ? following.data.some((s) => s.id === item?.id)
    : Boolean(item?.subscribed || item?.in_watchlist);

  return {
    followed,
    /** The last change was rejected (and undone). */
    failed: mutation.isError,
    toggle() {
      if (!item) return;
      const { id, type, subtype, title, posters } = item;
      mutation.mutate({ series: { id, type, subtype, title, posters }, follow: !followed });
    },
  };
}
