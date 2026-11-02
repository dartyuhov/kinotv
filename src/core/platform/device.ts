import { loadWebapis, tizen } from './tizenGlobals';

export interface DeviceInfo {
  /** The TV model, e.g. "QE65Q60CAUXXC", or "Browser" outside a TV. */
  model: string;
  /** "Tizen 7.0.0", or "Browser" outside a TV. */
  platform: string;
}

/** What this device is, for the kino.watch device list. Never rejects. */
export async function deviceInfo(): Promise<DeviceInfo> {
  return { model: (await tvModel()) ?? 'Browser', platform: tizenVersion() ?? 'Browser' };
}

async function tvModel(): Promise<string | null> {
  const productinfo = (await loadWebapis())?.productinfo;
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
