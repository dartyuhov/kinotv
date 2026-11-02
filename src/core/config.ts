/** Build-time configuration. Values come from Vite env vars (.env.local, or the shell for e2e). */
export const config = {
  /**
   * kino.watch API base URL, without a trailing slash. Set VITE_API_BASE_URL to use the mirror
   * (https://api.srvkp.com) or, in e2e tests, the fake API host.
   */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || 'https://api.service-kp.com').replace(/\/+$/, ''),

  /**
   * OAuth client credentials (spec §7.6), from the git-ignored .env.local. See .env.example.
   * Never log them: they travel in OAuth query strings, which the diagnostics log scrubs.
   */
  client: {
    id: import.meta.env.VITE_KP_CLIENT_ID ?? '',
    secret: import.meta.env.VITE_KP_CLIENT_SECRET ?? '',
  },

  /** package.json version, injected by vite.config.ts. Sent to kino.watch in the device notify. */
  appVersion: __APP_VERSION__,
} as const;
