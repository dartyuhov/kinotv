import { withAuth } from './api/authedHttp';
import { createApiClient } from './api/client';
import { createHttp } from './api/http';
import { createOAuth } from './auth/oauth';
import { describeDevice, registerDeviceOnSessionStart } from './auth/registerDevice';
import { createSession } from './auth/session';
import { config } from './config';
import { deviceInfo } from './platform/device';
import { storage } from './platform/storage';
import { loadWebapis } from './platform/tizenGlobals';
import { nativeAvPlay, nativeVideoCapabilities } from './platform/avplay';
import { createWatchedActions, markEpisodesWatched } from './catalog/markWatched';
import type { WatchedVideo } from './api/client';

// The app's single instances of the core services, wired once. UI code imports these.

const http = createHttp({ baseUrl: config.apiBaseUrl });

export const oauth = createOAuth(http, config.client);
export const session = createSession({ storage, oauth });
/** The kino.watch API, authenticated with the current session. */
export const api = createApiClient(withAuth(http, session));
let accountGeneration = 0;
session.subscribe(() => { accountGeneration++; });
const watchedOwner = () => {
  const generation = accountGeneration;
  const current = () => generation === accountGeneration && session.status() === 'signedIn';
  const check = () => { if (!current()) throw new Error('Watched account changed'); };
  const scopedApi = createApiClient(withAuth(http, {
    async accessToken() { check(); const token = await session.accessToken(); check(); return token; },
    async renewAfterRejection(token) { check(); const renewed = await session.renewAfterRejection(token); check(); return renewed; },
    expire() { check(); session.expire(); },
  }));
  return createWatchedActions(scopedApi, current);
};
let watched = watchedOwner();
session.subscribe(() => { watched = watchedOwner(); });
/** Capture the account owner before any asynchronous work can outlive it. */
export const watchedActions = () => {
  const owner = watched;
  return {
    mark: (where: WatchedVideo) => owner.mark(where),
    episodes: (id: number, season: number, episodes: number[], watched = true) => markEpisodesWatched(api, id, season, episodes, owner.mark, watched),
  };
};

/** Prepare server-side link generation before requesting playback links. One attempt per session. */
let playbackSettings: Promise<void> | undefined;
session.subscribe(() => { playbackSettings = undefined; });
export function preparePlaybackSettings(): Promise<void> {
  playbackSettings ??= loadWebapis().then(async () => {
    if (!nativeAvPlay()) return;
    const capabilities = nativeVideoCapabilities();
    await api.configurePlayback({ support4k: capabilities.uhd, supportHevc: capabilities.hevc, supportHdr: capabilities.hdr });
  }).catch(() => {
    // Settings availability differs between service hosts. Playback can still use issued links.
    // Do not log account responses or guess another device id on failure.
  });
  return playbackSettings;
}

/**
 * Signs the viewer out: the TV leaves the account's device list (best effort; it uses the token, so it
 * starts first) and the session is forgotten at once, whether or not the server answers.
 */
export function signOut(): void {
  void api.deviceUnlink().catch(() => undefined);
  session.signOut();
}

/** Starts the background work that follows the session. Called once from main.tsx. */
export function startServices(): void {
  registerDeviceOnSessionStart(session, api, async () => describeDevice(await deviceInfo(), config.appVersion));
  const configure = () => { if (session.status() === 'signedIn') void preparePlaybackSettings(); };
  session.subscribe(configure);
  configure();
}
