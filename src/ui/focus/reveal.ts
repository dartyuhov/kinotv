/** Space kept between a focused element and the edge of its scroller. */
const EDGE_MARGIN = 96;

/**
 * Scrolls the nearest `[data-scroller]` ancestor just enough for `node` to be fully visible.
 * Call it from a focusable's `onFocus`. Uses offsets, not client rects, so focus scale transforms
 * and the dev stage scale don't skew it.
 */
export function revealInScroller(node: HTMLElement): void {
  const scroller = node.parentElement?.closest<HTMLElement>('[data-scroller]');
  if (!scroller) return;
  const top = offsetTopWithin(node, scroller);
  const bottom = top + node.offsetHeight;
  if (top - EDGE_MARGIN < scroller.scrollTop) {
    scroller.scrollTop = Math.max(0, top - EDGE_MARGIN);
  } else if (bottom + EDGE_MARGIN > scroller.scrollTop + scroller.clientHeight) {
    scroller.scrollTop = bottom + EDGE_MARGIN - scroller.clientHeight;
  }
}

function offsetTopWithin(node: HTMLElement, ancestor: HTMLElement): number {
  let top = 0;
  let el: HTMLElement | null = node;
  while (el && el !== ancestor) {
    top += el.offsetTop;
    const parent = el.offsetParent as HTMLElement | null;
    // The scroller must be positioned so it is in the offsetParent chain.
    if (parent && !ancestor.contains(parent)) break;
    el = parent;
  }
  return top;
}
