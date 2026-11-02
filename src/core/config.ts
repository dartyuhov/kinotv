/** Build-time configuration. Values come from Vite env vars (.env.local, or the shell for e2e). */
export const config = {
  /**
   * kino.watch API base URL, without a trailing slash. Set VITE_API_BASE_URL to use the mirror
   * (https://api.srvkp.com) or, in e2e tests, the fake API host.
   */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? 'https://api.service-kp.com').replace(/\/+$/, ''),
} as const;
