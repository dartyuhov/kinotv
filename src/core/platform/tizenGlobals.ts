// The only place that reads the `tizen` / `webapis` globals. Everything else in the app goes
// through the functions exported from core/platform, which fall back to browser behaviour.

interface TizenApi {
  tvinputdevice?: { registerKey(name: string): void };
  application?: { getCurrentApplication(): { exit(): void } };
  systeminfo?: { getCapability(key: string): unknown };
}

interface WebApis {
  productinfo?: { getRealModel(): string; getModel(): string };
}

export function tizen(): TizenApi | undefined {
  return (globalThis as { tizen?: TizenApi }).tizen;
}

export function webapis(): WebApis | undefined {
  return (globalThis as { webapis?: WebApis }).webapis;
}
