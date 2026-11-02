import type { Page } from '@playwright/test';
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
  constructor(private readonly page: Page) {}

  async press(...keys: RemoteKey[]): Promise<void> {
    for (const key of keys) {
      const desktop = DESKTOP_KEY[key];
      if (desktop) {
        await this.page.keyboard.press(desktop);
      } else {
        await this.pressTizenKey(TIZEN_KEYCODE[key as keyof typeof TIZEN_KEYCODE]);
      }
    }
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
