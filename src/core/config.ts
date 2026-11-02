/** Build-time configuration. Values come from Vite env vars (.env.local, or the shell for e2e). */
export const config = {
  /**
   * kino.watch API base URL, without a trailing slash. Set VITE_API_BASE_URL to use the mirror
   * (https://api.srvkp.com) or, in e2e tests, the fake API host.
   */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? 'https://api.service-kp.com').replace(/\/+$/, ''),
  /** The app's version: package.json's "version", the same one config.xml carries. */
  appVersion: __APP_VERSION__,
  /**
   * Where the update check finds the latest release: GitHub's API for package.json's
   * "kinotv": { "githubRepo" }, or VITE_RELEASES_URL (e2e points it at the fake API). Null turns the
   * check off, which is the case until the repo is set.
   */
  releasesUrl: import.meta.env.VITE_RELEASES_URL || (__GITHUB_REPO__ ? `https://api.github.com/repos/${__GITHUB_REPO__}/releases/latest` : null),
} as const;
