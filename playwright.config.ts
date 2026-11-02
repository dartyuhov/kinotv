import { defineConfig, devices } from '@playwright/test';
import { FAKE_API_BASE_URL, FAKE_CLIENT, FAKE_RELEASES_URL } from './e2e/harness/fakeApi';

// One port per checkout, so parallel worktrees can run e2e at the same time without sharing a server.
function portFor(dir: string): number {
  let hash = 0;
  for (const ch of dir) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return 5200 + (hash % 700);
}
const port = Number(process.env.E2E_PORT) || portFor(process.cwd());

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  // Tests run against the production build (chrome85 target), served by vite preview. The fake API
  // host is baked in at build time, so the build goes to its own folder and never clobbers dist/.
  webServer: {
    command: `npx vite build --outDir dist-e2e --emptyOutDir --logLevel warn && npx vite preview --outDir dist-e2e --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    // Never attach to a server we didn't start: it could be serving another checkout.
    reuseExistingServer: false,
    // Shell env vars win over .env.local, so a developer's real credentials never reach the e2e build.
    env: {
      VITE_API_BASE_URL: FAKE_API_BASE_URL,
      VITE_KP_CLIENT_ID: FAKE_CLIENT.id,
      VITE_KP_CLIENT_SECRET: FAKE_CLIENT.secret,
      VITE_RELEASES_URL: FAKE_RELEASES_URL,
      // Play through the FakePlayer, which tests drive via e2e/harness/player.ts (spec §10, player seam).
      VITE_PLAYER: 'fake',
    },
  },
});
