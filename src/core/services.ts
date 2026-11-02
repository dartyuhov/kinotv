import { withAuth } from './api/authedHttp';
import { createApiClient } from './api/client';
import { createHttp } from './api/http';
import { createOAuth } from './auth/oauth';
import { describeDevice, registerDeviceOnSessionStart } from './auth/registerDevice';
import { createSession } from './auth/session';
import { config } from './config';
import { deviceInfo } from './platform/device';
import { storage } from './platform/storage';

// The app's single instances of the core services, wired once. UI code imports these.

const http = createHttp({ baseUrl: config.apiBaseUrl });

export const oauth = createOAuth(http, config.client);
export const session = createSession({ storage, oauth });
/** The kino.watch API, authenticated with the current session. */
export const api = createApiClient(withAuth(http, session));

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
}
