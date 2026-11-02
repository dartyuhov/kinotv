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

let webapisLoading: Promise<WebApis | undefined> | undefined;

/**
 * Samsung's Product APIs (`webapis`), loaded on first use. They come from a script the TV serves at
 * `$WEBAPIS/webapis/webapis.js`. It is only requested on Tizen, so the browser build (and its e2e tests)
 * never sees a failing request. Resolves undefined outside a TV or if the script can't be loaded.
 */
export function loadWebapis(): Promise<WebApis | undefined> {
  if (webapis() || !tizen() || typeof document === 'undefined') return Promise.resolve(webapis());
  webapisLoading ??= new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = '$WEBAPIS/webapis/webapis.js';
    script.onload = script.onerror = () => resolve(webapis());
    document.head.appendChild(script);
  });
  return webapisLoading;
}
