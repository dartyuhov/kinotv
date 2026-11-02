import type { Http } from './http';

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
  /** Registers this device in the account's device list, or updates its entry. */
  deviceNotify(device: DeviceDescription): Promise<void>;
}

export function createApiClient(http: Http): ApiClient {
  return {
    async deviceNotify(device) {
      await http({ method: 'POST', path: '/v1/device/notify', form: { ...device } });
    },
  };
}
