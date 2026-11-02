import { createHttp } from './api/http';
import { createOAuth } from './auth/oauth';
import { createSession } from './auth/session';
import { config } from './config';
import { storage } from './platform/storage';

// The app's single instances of the core services, wired once. UI code imports these.

const http = createHttp({ baseUrl: config.apiBaseUrl });

export const oauth = createOAuth(http, config.client);
export const session = createSession({ storage });
