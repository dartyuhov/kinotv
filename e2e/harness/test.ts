import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { fakeBookmarks } from './bookmarks';
import { fakeHome } from './catalog';
import { FakeApi } from './fakeApi';
import { FakeCdn } from './fakeCdn';
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
    if (signedIn) await this.seedSession({ expiresIn });
    await this.page.goto('/');
    await expect(this.focused).toHaveCount(1);
  }

  /**
   * Makes the next launch find a stored session (SEEDED_SESSION), for tests that navigate on their own
   * instead of calling `open()`. Seeds once per test, so a reload is a restart with whatever the app stored.
   */
  async seedSession({ expiresIn = 3600 }: Pick<OpenOptions, 'expiresIn'> = {}): Promise<void> {
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
}

/**
 * The page clock, for timing behaviour (polling, expiry, refresh, retries). It runs normally until
 * `pause()`; then time only moves when the test calls `runFor`.
 */
export class Clock {
  constructor(
    private readonly page: Page,
    private readonly api: FakeApi,
  ) {}

  /** Stops the clock one second after TEST_START_TIME. Call it before `app.open()`. */
  async pause(): Promise<void> {
    await this.page.clock.pauseAt(TEST_START_TIME.getTime() + 1000);
  }

  /**
   * Moves time forward by `ms`, in steps of at most `stepMs`. After each step the app gets to handle the
   * fake API's answers, as it would in real time. (One big jump would fire, say, a request's 15 s timeout
   * before the answer it was waiting for could arrive.)
   */
  async runFor(ms: number, { stepMs = 1_000 }: { stepMs?: number } = {}): Promise<void> {
    await this.settle();
    for (let left = ms; left > 0; left -= stepMs) {
      await this.page.clock.runFor(Math.min(stepMs, left));
      await this.settle();
    }
  }

  /** Waits until the fake API has answered every request so far and the page has handled the answers. */
  async settle(): Promise<void> {
    await this.api.idle();
    // A few rounds of page tasks (MessageChannel is not faked by the clock) let fetch callbacks run.
    for (let i = 0; i < 3; i++) {
      await this.page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => resolve();
            channel.port2.postMessage(null);
          }),
      );
    }
  }
}

interface Fixtures {
  api: FakeApi;
  cdn: FakeCdn;
  clock: Clock;
  remote: Remote;
  app: App;
}

export const test = base.extend<Fixtures>({
  // Auto fixtures: every test gets the fake API and the controllable clock, even if it never names them.
  clock: [
    async ({ page, api }, use) => {
      await page.clock.install({ time: TEST_START_TIME });
      await use(new Clock(page, api));
    },
    { auto: true },
  ],
  api: [
    async ({ page }, use) => {
      const api = new FakeApi();
      // Every signed-in launch lands on Home, so its endpoints get default answers too. Tests about Home
      // call fakeHome(api, …) with their own catalog.
      fakeHome(api);
      // The Bookmarks tab and the title page's folder picker: no folders unless a test routes its own.
      fakeBookmarks(api);
      await api.attach(page);
      await use(api);
      expect(api.unhandled, 'the app called endpoints that have no fake route').toEqual([]);
    },
    { auto: true },
  ],
  // Artwork URLs in fixtures point at the fake CDN, which answers with tiny generated images.
  cdn: [
    async ({ page }, use) => {
      const cdn = new FakeCdn();
      await cdn.attach(page);
      await use(cdn);
    },
    { auto: true },
  ],
  remote: async ({ page }, use) => use(new Remote(page)),
  app: async ({ page }, use) => use(new App(page)),
});

export { expect };
