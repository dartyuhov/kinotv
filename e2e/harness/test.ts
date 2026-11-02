import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { FakeApi } from './fakeApi';
import { Remote } from './remote';

/** The page clock starts here in every test. It runs normally until a test pauses or advances it. */
export const TEST_START_TIME = new Date('2026-11-02T10:00:00Z');

/** The tokens of the session that `app.open()` starts with. */
export const SEEDED_SESSION = { accessToken: 'seeded-access-token', refreshToken: 'seeded-refresh-token' } as const;

export interface OpenOptions {
  /** Start with a stored session (default) or signed out, on the Sign-in screen. */
  signedIn?: boolean;
  /** Seconds from TEST_START_TIME until the seeded access token expires. Default: one hour. */
  expiresIn?: number;
}

// Where the app keeps its session (core/platform/storage + core/auth/session). Only the harness knows it.
const SESSION_STORAGE_KEY = 'kinotv:session';

/** The app as a user sees it: what is on screen and which element has remote focus. */
export class App {
  constructor(private readonly page: Page) {}

  /** The one element with remote focus. Focusables mark it with data-focused="true". */
  get focused(): Locator {
    return this.page.locator('[data-focused="true"]');
  }

  /**
   * Launches the app. By default it starts signed in, as if the viewer had signed in on an earlier run,
   * so journeys that are not about sign-in skip the device flow. Reloading the page is an app restart:
   * the seeded session is written once per test, so a reload sees whatever the app stored since.
   */
  async open({ signedIn = true, expiresIn = 3600 }: OpenOptions = {}): Promise<void> {
    if (signedIn) {
      const session = { ...SEEDED_SESSION, expiresAt: TEST_START_TIME.getTime() + expiresIn * 1000 };
      await this.page.addInitScript(
        ({ key, value }) => {
          if (sessionStorage.getItem('e2e:seeded')) return;
          sessionStorage.setItem('e2e:seeded', '1');
          localStorage.setItem(key, value);
        },
        { key: SESSION_STORAGE_KEY, value: JSON.stringify(session) },
      );
    }
    await this.page.goto('/');
    await expect(this.focused).toHaveCount(1);
  }
}

interface Fixtures {
  api: FakeApi;
  remote: Remote;
  app: App;
}

export const test = base.extend<Fixtures & { clock: void }>({
  // Auto fixtures: every test gets the fake API and the controllable clock, even if it never names them.
  clock: [
    async ({ page }, use) => {
      await page.clock.install({ time: TEST_START_TIME });
      await use();
    },
    { auto: true },
  ],
  api: [
    async ({ page }, use) => {
      const api = new FakeApi();
      await api.attach(page);
      await use(api);
      expect(api.unhandled, 'the app called endpoints that have no fake route').toEqual([]);
    },
    { auto: true },
  ],
  remote: async ({ page }, use) => use(new Remote(page)),
  app: async ({ page }, use) => use(new App(page)),
});

export { expect };
