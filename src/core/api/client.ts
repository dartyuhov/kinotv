import type { Http } from './http';
import type { User } from './types';

/** The device's entry in the account's device list (research 10-kp-api §1.5). */
export interface DeviceDescription {
  title: string;
  hardware: string;
  software: string;
}

/**
 * The typed kino.watch API v1 (spec §3, §7.3). Every method resolves with parsed data or rejects with
 * an ApiError. Requests carry the session's access token, and a 401 is refreshed and retried once.
 *
 * To add an endpoint: add a method here that calls `http` with the path and params, unwrap the
 * response envelope, and add its response type to ./types.ts. Use GET for reads (they are retried on
 * network, timeout and 5xx errors) and POST with `form` for writes.
 */
export interface ApiClient {
  /** The signed-in account and its subscription. */
  user(): Promise<User>;
  /** Registers this device in the account's device list, or updates its entry. */
  deviceNotify(device: DeviceDescription): Promise<void>;
  /** Removes this device from the account's device list. */
  deviceUnlink(): Promise<void>;
}

export function createApiClient(http: Http): ApiClient {
  return {
    async user() {
      const res = await http<{ user: User }>({ method: 'GET', path: '/v1/user' });
      return res.user;
    },
    async deviceNotify(device) {
      await http({ method: 'POST', path: '/v1/device/notify', form: { ...device } });
    },
    async deviceUnlink() {
      await http({ method: 'POST', path: '/v1/device/unlink' });
    },
  };
}
