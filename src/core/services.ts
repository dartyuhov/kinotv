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

// The app's single instances of the core services, wired once. UI code imports these.

const http = createHttp({ baseUrl: config.apiBaseUrl });

export const oauth = createOAuth(http, config.client);
export const session = createSession({ storage, oauth });
/** The kino.watch API, authenticated with the current session. */
export const api = createApiClient(withAuth(http, session));

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
