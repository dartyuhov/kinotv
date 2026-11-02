import { init, SpatialNavigation } from '@noriginmedia/norigin-spatial-navigation';

/**
 * Starts Norigin spatial navigation without its own keyboard listener: the remote bus
 * (core/input/remoteBus) is the only keydown listener in the app, and it drives Norigin.
 *
 * Norigin marks the focused element with data-focused="true". Styles and tests key off that attribute.
 */
export function startSpatialNavigation(): void {
  init({
    throttle: 0,
    // Moving DOM focus would make the browser scroll on its own; we manage scrolling ourselves.
    shouldFocusDOMNode: false,
  });
  SpatialNavigation.unbindEventHandlers();
}
