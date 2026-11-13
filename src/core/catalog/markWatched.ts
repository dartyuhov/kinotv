import type { ApiClient } from '../api/client';

/** Sequential toggles only; every decision uses fresh service state, including after a lost response. */
export async function markEpisodesWatched(api: Pick<ApiClient, 'watching' | 'toggleWatched'>, id: number, season: number, episodes: number[]) {
  let confirmed = 0;
  let failed = 0;
  for (const video of [...new Set(episodes)]) {
    const where = { id, season, video };
    const read = async () => {
      const progress = await api.watching(id);
      const episode = progress.seasons?.find((s) => s.number === season)?.episodes.find((e) => e.number === video);
      if (!episode) throw new Error('Episode progress unavailable');
      return episode.status === 1;
    };
    try {
      if (await read()) { confirmed++; continue; }
      try { await api.toggleWatched(where); } catch { /* The write may have applied. Never blindly repeat it. */ }
      if (await read()) confirmed++;
      else failed++;
    } catch { failed++; }
  }
  return { confirmed, failed };
}
