import { expect, type Page } from '@playwright/test';
import type { RemoteKey } from '../../src/core/platform/keys';

// Desktop stand-ins for the remote (spec §5.1). Keys without a desktop stand-in are sent as Tizen keycodes.
const DESKTOP_KEY: Partial<Record<RemoteKey, string>> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  ok: 'Enter',
  back: 'Backspace',
  playPause: 'Space',
  rewind: 'BracketLeft',
  fastForward: 'BracketRight',
  channelUp: 'PageUp',
  channelDown: 'PageDown',
};

const TIZEN_KEYCODE: Record<'play' | 'pause' | 'stop', number> = { play: 415, pause: 19, stop: 413 };

/** Drives the app the way a user would: one remote key at a time. */
export class Remote {
  constructor(private readonly page: Page, private readonly artworkReady = false) {}

  async press(...keys: RemoteKey[]): Promise<void> {
    for (const key of keys) {
      if (this.artworkReady) await this.waitForArtwork();
      if (this.artworkReady && (key === 'left' || key === 'right')) {
        const target = await this.page.locator('.row .card[data-focused="true"]').evaluateAll((cards, direction) => {
          const current = cards[0];
          if (!current) return null;
          const siblings = [...current.parentElement!.querySelectorAll('.card')];
          return siblings[siblings.indexOf(current) + (direction === 'right' ? 1 : -1)]?.getAttribute('aria-label') ?? null;
        }, key);
        if (target) await expect(this.page.getByRole('button', { name: target, exact: true }).first()).not.toHaveAttribute('data-artwork', 'loading');
      }
      const desktop = DESKTOP_KEY[key];
      if (desktop) {
        await this.page.keyboard.press(desktop);
      } else {
        await this.pressTizenKey(TIZEN_KEYCODE[key as keyof typeof TIZEN_KEYCODE]);
      }
      if (this.artworkReady) await this.waitForArtwork();
    }
  }

  // Ordinary browsing journeys operate revealed cards. Timing/loading journeys
  // use the unpaced remote to exercise input while artwork is still pending.
  private async waitForArtwork(): Promise<void> {
    await this.page.waitForTimeout(80);
    await expect.poll(() => this.page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.card[data-artwork="loading"]')]
      .filter(card => {
        const box = card.getBoundingClientRect();
        if (box.right <= 0 || box.left >= innerWidth || box.bottom <= 0 || box.top >= innerHeight) return false;
        let parent = card.parentElement;
        while (parent) {
          if (/hidden|auto|scroll/.test(getComputedStyle(parent).overflow)) {
            const clip = parent.getBoundingClientRect();
            if (box.bottom <= clip.top || box.top >= clip.bottom || box.right <= clip.left || box.left >= clip.right) return false;
          }
          parent = parent.parentElement;
        }
        return true;
      }).length)).toBe(0);
    await this.page.waitForTimeout(80);
  }

  /** Presses a key `times` times, e.g. `repeat('right', 3)`. */
  async repeat(key: RemoteKey, times: number): Promise<void> {
    for (let i = 0; i < times; i++) await this.press(key);
  }

  // Tizen media keys have no desktop key; synthesise the keydown with the TV's keycode.
  private async pressTizenKey(keyCode: number): Promise<void> {
    await this.page.evaluate((code) => {
      const event = new KeyboardEvent('keydown', { key: 'Unidentified', bubbles: true, cancelable: true });
      Object.defineProperty(event, 'keyCode', { get: () => code });
      window.dispatchEvent(event);
    }, keyCode);
  }
}
