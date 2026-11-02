/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** kino.watch API base URL. Defaults to https://api.service-kp.com (see core/config.ts). */
  readonly VITE_API_BASE_URL?: string;
  /** OAuth client id for the device flow. Set in .env.local; never committed (spec §7.6). */
  readonly VITE_KP_CLIENT_ID?: string;
  /** OAuth client secret for the device flow. Set in .env.local; never committed (spec §7.6). */
  readonly VITE_KP_CLIENT_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The app version from package.json (vite.config.ts `define`). */
declare const __APP_VERSION__: string;
