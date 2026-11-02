import { fakePlayerFactory, installFakePlayerControl } from './fakePlayer';
import { html5Factory } from './html5Adapter';
import type { PlayerAdapter, PlayerFactory } from './types';

// Which engine plays (spec §3: "the player adapter is chosen at startup"). The player screen only ever
// calls createPlayer(), so a new engine is one entry in FACTORIES, never a screen change.
//
// - fake: only in builds made with VITE_PLAYER=fake (the e2e build). The condition is a build-time
//   constant, so production bundles drop the FakePlayer entirely.
// - avplay: ticket 22 adds its factory here, before html5. Its `available()` checks for
//   `webapis.avplay` through core/platform (the only module that touches Tizen globals).
// - html5: the desktop fallback.

const FAKE = import.meta.env.VITE_PLAYER === 'fake';

const FACTORIES: readonly PlayerFactory[] = [...(FAKE ? [fakePlayerFactory] : []), html5Factory];

if (FAKE) installFakePlayerControl();

/** Makes the player for this platform. `host` is the full-screen element it may draw into. */
export function createPlayer(host: HTMLElement): PlayerAdapter {
  const factory = FACTORIES.find((f) => f.available());
  if (!factory) throw new Error('no player available');
  return factory.create(host);
}
