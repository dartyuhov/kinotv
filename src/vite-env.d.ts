/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** kino.watch API base URL. Defaults to https://api.service-kp.com (see core/config.ts). */
  readonly VITE_API_BASE_URL?: string;
  /** GitHub "latest release" URL for the update check. Defaults to the repo in package.json (see core/config.ts). */
  readonly VITE_RELEASES_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** package.json "version", injected by vite.config.ts. */
declare const __APP_VERSION__: string;
/** package.json "kinotv": { "githubRepo" } ("<owner>/<repo>"), or null while it is the placeholder. Injected by vite.config.ts. */
declare const __GITHUB_REPO__: string | null;
