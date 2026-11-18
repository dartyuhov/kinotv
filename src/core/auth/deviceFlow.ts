import { isApiError } from '../api/errors';
import type { OAuth, Tokens } from './oauth';

export type DeviceFlowState =
  | { status: 'requesting' }
  | { status: 'waiting'; userCode: string; verificationUri: string }
  | { status: 'failed'; reason: 'network' | 'auth' | 'unavailable' };

export interface DeviceFlow {
  /** Throws away the current code and asks for a new one. Also the retry after `failed`. */
  restart(): void;
  stop(): void;
}

export interface DeviceFlowOptions {
  oauth: OAuth;
  onState(state: DeviceFlowState): void;
  /** Called once, when the viewer approves the code. The flow is stopped by then. */
  onApproved(tokens: Tokens): void;
}

/**
 * Runs the OAuth 2 device flow (spec §7.1): gets a code, polls at the server's interval and replaces the
 * code when it expires, until the viewer approves it.
 *
 * Expiry is detected two ways: our own timer from `expires_in`, and any poll error other than
 * `authorization_pending` / `slow_down` (kino.watch's expired-code error string is not documented).
 */
export function startDeviceFlow({ oauth, onState, onApproved }: DeviceFlowOptions): DeviceFlow {
  // Each code gets a generation; answers that arrive for an older one are ignored.
  let generation = 0;
  let requesting = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  function clearTimers() {
    clearTimeout(pollTimer);
    clearTimeout(expiryTimer);
  }

  async function requestCode() {
    if (requesting) return;
    requesting = true;
    clearTimers();
    const gen = ++generation;
    onState({ status: 'requesting' });
    let device;
    try {
      device = await oauth.requestDeviceCode();
    } catch (error) {
      if (gen === generation) {
        const reason = isApiError(error) && (error.kind === 'network' || error.kind === 'timeout')
          ? 'network'
          : isClientRejection(error) ? 'auth' : 'unavailable';
        onState({ status: 'failed', reason });
      }
      return;
    } finally {
      requesting = false;
    }
    if (gen !== generation) return;

    onState({ status: 'waiting', userCode: device.userCode, verificationUri: device.verificationUri });
    let interval = device.interval;
    expiryTimer = setTimeout(() => void requestCode(), device.expiresIn * 1000);

    const schedulePoll = () => {
      pollTimer = setTimeout(() => void poll(), interval * 1000);
    };
    const poll = async () => {
      try {
        const tokens = await oauth.pollDeviceToken(device.code);
        if (gen !== generation) return;
        stop();
        onApproved(tokens);
      } catch (error) {
        if (gen !== generation) return;
        const code = isApiError(error) ? error.code : null;
        if (code === 'authorization_pending') {
          schedulePoll();
        } else if (code === 'slow_down' || (isApiError(error) && error.status === 429)) {
          interval += 5;
          schedulePoll();
        } else {
          void requestCode();
        }
      }
    };
    schedulePoll();
  }

  function stop() {
    generation++;
    clearTimers();
  }

  void requestCode();

  return {
    restart() {
      void requestCode();
    },
    stop,
  };
}

function isClientRejection(error: unknown): boolean {
  return isApiError(error) && (
    error.kind === 'auth' || error.status === 403 ||
    error.code === 'incorrect_client_credentials' || error.code === 'invalid_client' || error.code === 'unauthorized_client'
  );
}
