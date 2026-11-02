import { tizen, webapis } from './tizenGlobals';

export interface DeviceInfo {
  /** The TV model, e.g. "QE65Q60CAUXXC", or "Browser" outside a TV. */
  model: string;
  /** "Tizen 7.0.0", or "Browser" outside a TV. */
  platform: string;
}

/** What this device is, for the kino.watch device list. Never throws. */
export function deviceInfo(): DeviceInfo {
  return { model: tvModel() ?? 'Browser', platform: tizenVersion() ?? 'Browser' };
}

function tvModel(): string | null {
  const productinfo = webapis()?.productinfo;
  if (!productinfo) return null;
  try {
    return productinfo.getRealModel() || productinfo.getModel() || null;
  } catch {
    return null; // missing privilege or old firmware
  }
}

function tizenVersion(): string | null {
  const systeminfo = tizen()?.systeminfo;
  if (!systeminfo) return null;
  try {
    const version = systeminfo.getCapability('http://tizen.org/feature/platform.version');
    return typeof version === 'string' && version ? `Tizen ${version}` : 'Tizen';
  } catch {
    return 'Tizen';
  }
}
