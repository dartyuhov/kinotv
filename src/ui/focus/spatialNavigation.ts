import { init, navigateByDirection, SpatialNavigation } from '@noriginmedia/norigin-spatial-navigation';
import type { RemoteBus } from '../../core/input/remoteBus';
import { isDirection } from '../../core/platform/keys';

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
    // Must stay true: Norigin only removes data-focused on blur when it also moves DOM focus.
    // preventScroll stops the browser scrolling on its own; screens manage scrolling themselves.
    shouldFocusDOMNode: true,
    domNodeFocusOptions: { preventScroll: true },
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
