/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** kino.watch API base URL. Defaults to https://api.service-kp.com (see core/config.ts). */
  readonly VITE_API_BASE_URL?: string;
  /** OAuth client id for the device flow. Set in .env.local; never committed (spec §7.6). */
  readonly VITE_KP_CLIENT_ID?: string;
  /** OAuth client secret for the device flow. Set in .env.local; never committed (spec §7.6). */
  readonly VITE_KP_CLIENT_SECRET?: string;
  /** GitHub "latest release" URL for the update check. Defaults to the repo in package.json (see core/config.ts). */
  readonly VITE_RELEASES_URL?: string;
  /** "fake" builds the app with the FakePlayer (e2e tests; see core/player/createPlayer.ts). Unset otherwise. */
  readonly VITE_PLAYER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** package.json "version", injected by vite.config.ts. */
declare const __APP_VERSION__: string;
/** package.json "kinotv": { "githubRepo" } ("<owner>/<repo>"), or null while it is the placeholder. Injected by vite.config.ts. */
declare const __GITHUB_REPO__: string | null;
