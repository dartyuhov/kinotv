import type { ApiClient, DeviceDescription } from '../api/client';
import type { DeviceInfo } from '../platform/device';
import type { Session } from './session';

/** How this TV appears in the viewer's kino.watch device list, e.g. "KinoTV · QE65Q60CAUXXC". */
export function describeDevice(info: DeviceInfo, appVersion: string): DeviceDescription {
  return {
    title: `KinoTV · ${info.model}`,
    hardware: info.model === 'Browser' ? 'Browser' : `Samsung ${info.model}`,
    software: `${info.platform} / KinoTV ${appVersion}`,
  };
}

/**
 * Tells kino.watch about this device whenever a session starts: right after sign-in, and on every
 * launch with a stored session, as the API docs ask. Failures are ignored; the next start retries.
 */
export function registerDeviceOnSessionStart(
  session: Session,
  api: ApiClient,
  device: () => Promise<DeviceDescription>,
): void {
  const notify = () => void device().then((d) => api.deviceNotify(d)).catch(() => undefined);
  if (session.status() === 'signedIn') notify();
  session.subscribe(() => {
    if (session.status() === 'signedIn') notify();
  });
}
