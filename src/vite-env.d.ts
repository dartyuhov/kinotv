/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** kino.watch API base URL. Defaults to https://api.service-kp.com (see core/config.ts). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
