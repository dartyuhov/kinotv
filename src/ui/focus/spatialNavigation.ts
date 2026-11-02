import { init, navigateByDirection, SpatialNavigation } from '@noriginmedia/norigin-spatial-navigation';
import type { RemoteBus } from '../../core/input/remoteBus';
import { isDirection } from '../../core/platform/keys';
import { layoutAdapter } from './layoutAdapter';

/**
 * Starts Norigin spatial navigation and drives it from the remote bus. Norigin's own keyboard
 * listener is removed: the bus is the only keydown listener in the app.
 *
 * - Arrows: the focused component's `onArrowPress` runs first; returning false stops the default move.
 * - OK: calls the focused component's `onEnterPress`.
 *
 * Norigin marks the focused element with data-focused="true". Styles and tests key off that attribute.
 */
export function startSpatialNavigation(bus: RemoteBus): void {
  init({
    throttle: 0,
    // Focus lives in Norigin and the data-focused attribute, not in DOM focus, so the browser
    // never scrolls on its own. Screens scroll through revealInScroller.
    shouldFocusDOMNode: false,
    layoutAdapter,
  });
  SpatialNavigation.unbindEventHandlers();

  bus.subscribe(async (key) => {
    if (isDirection(key)) {
      const details = { pressedKeys: { [key]: 1 } };
      if (SpatialNavigation.onArrowPress(key, details) !== false) await navigateByDirection(key);
    } else if (key === 'ok') {
      SpatialNavigation.onEnterPress({ pressedKeys: { enter: 1 } });
    }
  });
}
