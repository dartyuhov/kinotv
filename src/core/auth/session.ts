import type { AccessTokenSource } from '../api/authedHttp';
import { ApiError } from '../api/errors';
import type { KeyValueStore } from '../platform/storage';
import type { Tokens } from './oauth';

export type SessionStatus = 'signedIn' | 'signedOut';

export interface Session extends AccessTokenSource {
  status(): SessionStatus;
  /** Calls `listener` after every status change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  signIn(tokens: Tokens): void;
}

export const SESSION_STORAGE_KEY = 'kinotv:session';

export interface SessionOptions {
  storage: KeyValueStore;
}

/** The signed-in session (spec §7.2): tokens persisted in app storage. */
export function createSession({ storage }: SessionOptions): Session {
  let tokens = storage.get<Tokens>(SESSION_STORAGE_KEY);
  const listeners = new Set<() => void>();

  function setTokens(next: Tokens | null) {
    const wasSignedIn = tokens !== null;
    tokens = next;
    if (next) storage.set(SESSION_STORAGE_KEY, next);
    else storage.remove(SESSION_STORAGE_KEY);
    if (wasSignedIn !== (next !== null)) for (const listener of [...listeners]) listener();
  }

  return {
    status: () => (tokens ? 'signedIn' : 'signedOut'),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    signIn: (next) => setTokens(next),
    async accessToken() {
      if (!tokens) throw new ApiError('auth', null, null, 'Not signed in');
      return tokens.accessToken;
    },
  };
}
