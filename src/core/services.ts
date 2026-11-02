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
export const session = createSession({ storage });
/** The kino.watch API, authenticated with the current session. */
export const api = createApiClient(withAuth(http, session));

/** Starts the background work that follows the session. Called once from main.tsx. */
export function startServices(): void {
  registerDeviceOnSessionStart(session, api, () => describeDevice(deviceInfo(), config.appVersion));
}
