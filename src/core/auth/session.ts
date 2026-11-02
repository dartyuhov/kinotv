import type { AccessTokenSource } from '../api/authedHttp';
import { ApiError, isApiError } from '../api/errors';
import type { KeyValueStore } from '../platform/storage';
import type { OAuth, Tokens } from './oauth';

export type SessionStatus = 'signedIn' | 'signedOut';

export interface Session extends AccessTokenSource {
  status(): SessionStatus;
  /** Calls `listener` after every status change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  signIn(tokens: Tokens): void;
  /** Forgets the tokens. The status becomes signedOut. */
  signOut(): void;
}

export const SESSION_STORAGE_KEY = 'kinotv:session';

/** Refresh this long before the access token expires (spec §7.2). */
const REFRESH_AHEAD_MS = 5 * 60_000;
/** After a refresh fails for a transient reason (network, 5xx), try again this much later. */
const REFRESH_RETRY_MS = 60_000;
/** setTimeout's maximum delay; longer delays fire at once. */
const MAX_TIMER_MS = 2_147_483_647;

export interface SessionOptions {
  storage: KeyValueStore;
  oauth: Pick<OAuth, 'refresh'>;
  now?: () => number;
}

/**
 * The signed-in session (spec §7.2).
 *
 * - Tokens are persisted in app storage, and loaded from it at startup.
 * - The access token is refreshed 5 minutes before it expires, by a timer and also on demand when a
 *   request asks for a token inside that window.
 * - kino.watch rotates refresh tokens, so only one refresh runs at a time and everyone waiting shares it.
 *   The new tokens are saved before any waiting request continues.
 * - A refresh rejected with a 4xx ends the session (status becomes signedOut). A network or server
 *   error keeps the tokens and retries later.
 */
export function createSession({ storage, oauth, now = Date.now }: SessionOptions): Session {
  let tokens = storage.get<Tokens>(SESSION_STORAGE_KEY);
  let refreshing: Promise<string> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  function setTokens(next: Tokens | null) {
    const wasSignedIn = tokens !== null;
    tokens = next;
    if (next) storage.set(SESSION_STORAGE_KEY, next);
    else storage.remove(SESSION_STORAGE_KEY);
    scheduleRefresh(next ? next.expiresAt - REFRESH_AHEAD_MS - now() : null);
    if (wasSignedIn !== (next !== null)) for (const listener of [...listeners]) listener();
  }

  function scheduleRefresh(delayMs: number | null) {
    clearTimeout(refreshTimer);
    if (delayMs === null) return;
    refreshTimer = setTimeout(() => void refresh().catch(() => undefined), Math.min(Math.max(0, delayMs), MAX_TIMER_MS));
  }

  /** Single-flight refresh. Resolves with the new access token. */
  function refresh(): Promise<string> {
    if (refreshing) return refreshing;
    const current = tokens;
    if (!current) return Promise.reject(notSignedIn());

    refreshing = oauth
      .refresh(current.refreshToken)
      .then(
        (next) => {
          if (tokens === current) setTokens(next);
          return next.accessToken;
        },
        (error: unknown) => {
          if (tokens !== current) throw error; // signed out or in again meanwhile
          if (isApiError(error) && error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 429) {
            setTokens(null); // the refresh token is dead
            throw new ApiError('auth', error.status, error.code, 'Session expired');
          }
          scheduleRefresh(REFRESH_RETRY_MS);
          throw error;
        },
      )
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  scheduleRefresh(tokens ? tokens.expiresAt - REFRESH_AHEAD_MS - now() : null);

  return {
    status: () => (tokens ? 'signedIn' : 'signedOut'),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    signIn: (next) => setTokens(next),
    signOut: () => setTokens(null),
    expire: () => setTokens(null),

    async renewAfterRejection(rejected) {
      if (!tokens) throw notSignedIn();
      if (!refreshing && tokens.accessToken !== rejected) return tokens.accessToken; // already renewed
      return refresh();
    },

    async accessToken() {
      if (!tokens) throw notSignedIn();
      if (!refreshing && now() < tokens.expiresAt - REFRESH_AHEAD_MS) return tokens.accessToken;
      try {
        return await refresh();
      } catch (error) {
        // A transient failure doesn't matter while the current token still works.
        if (tokens && now() < tokens.expiresAt && !isApiError(error, 'auth')) return tokens.accessToken;
        throw error;
      }
    },
  };
}

function notSignedIn(): ApiError {
  return new ApiError('auth', null, null, 'Not signed in');
}
