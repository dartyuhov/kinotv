import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { FakeApi } from './fakeApi';
import { Remote } from './remote';

/** The page clock starts here in every test. It runs normally until a test pauses or advances it. */
export const TEST_START_TIME = new Date('2026-11-02T10:00:00Z');

/** The app as a user sees it: what is on screen and which element has remote focus. */
export class App {
  constructor(private readonly page: Page) {}

  /** The one element with remote focus. Focusables mark it with data-focused="true". */
  get focused(): Locator {
    return this.page.locator('[data-focused="true"]');
  }

  async open(): Promise<void> {
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
