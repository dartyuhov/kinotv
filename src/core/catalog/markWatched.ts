import type { ApiClient, WatchedVideo } from '../api/client';

type ProgressApi = Pick<ApiClient, 'watching' | 'toggleWatched'>;
const owners = new WeakMap<ProgressApi, ReturnType<typeof createWatchedActions>>();

/** One account owner, shared by mounted pages and playback reporters. No mutation retries. */
export function createWatchedActions(api: ProgressApi, current: () => boolean = () => true) {
  let lane: Promise<unknown> = Promise.resolve();
  const check = () => { if (!current()) throw new Error('Watched account changed'); };
  const mark = (where: WatchedVideo): Promise<void> => {
    const task = lane.catch(() => undefined).then(async () => {
      const read = async () => {
        check();
        const progress = await api.watching(where.id);
        check();
        const videos = where.season === undefined ? progress.videos : progress.seasons?.find((s) => s.number === where.season)?.episodes;
        const video = videos?.find((v) => v.number === where.video);
        if (!video) throw new Error('Video progress unavailable');
        return video.status === 1;
      };
      if (await read()) return;
      check();
      try { await api.toggleWatched(where); } catch { /* Reconcile applied-but-response-lost, never retry. */ }
      if (!await read()) throw new Error('Watched state not confirmed');
    });
    lane = task;
    return task;
  };
  return { mark };
}

export function markVideoWatched(api: ProgressApi, where: WatchedVideo): Promise<void> {
  let owner = owners.get(api);
  if (!owner) { owner = createWatchedActions(api); owners.set(api, owner); }
  return owner.mark(where);
}

/** Sequential toggles only; every decision uses fresh service state, including after a lost response. */
export async function markEpisodesWatched(api: ProgressApi, id: number, season: number, episodes: number[], mark = (where: WatchedVideo) => markVideoWatched(api, where)) {
  let confirmed = 0;
  let failed = 0;
  for (const video of [...new Set(episodes)]) {
    const where = { id, season, video };
    try {
      await mark(where);
      confirmed++;
    } catch { failed++; }
  }
  return { confirmed, failed };
}
