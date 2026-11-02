import { useSyncExternalStore } from 'react';
import type { SessionStatus } from '../../core/auth/session';
import { session } from '../../core/services';

/** The session status, re-rendering on sign-in and sign-out. */
export function useSessionStatus(): SessionStatus {
  return useSyncExternalStore(session.subscribe, session.status);
}
