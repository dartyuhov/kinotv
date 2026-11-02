import type { FocusableComponentLayout, LayoutAdapter } from '@noriginmedia/norigin-spatial-navigation';

/**
 * Overrides for Norigin's web layout adapter.
 *
 * measureLayout: positions in "content space", summing offsets and ignoring scroll and transforms.
 * Norigin's default subtracts scrollTop, but it only re-measures sibling layouts every so often,
 * so right after a scroll it compared fresh and stale positions and sometimes skipped an element.
 * Content-space positions don't change when a scroller moves, so cached layouts stay valid.
 *
 * focusNode / blurNode: only toggle data-focused="true", the attribute styles and tests rely on.
 * (Norigin's own blurNode leaves the attribute behind unless it also moves DOM focus.)
 */
export const layoutAdapter: Partial<LayoutAdapter> = {
  async measureLayout({ node }) {
    const rect = contentRect(node);
    const parent = node.parentElement ? contentRect(node.parentElement) : { left: 0, top: 0 };
    const layout: FocusableComponentLayout = {
      ...rect,
      x: rect.left - parent.left,
      y: rect.top - parent.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      node,
    };
    return layout;
  },
  focusNode({ node }) {
    node?.setAttribute('data-focused', 'true');
  },
  blurNode({ node }) {
    node?.removeAttribute('data-focused');
  },
};

function contentRect(node: HTMLElement) {
  let left = node.offsetLeft;
  let top = node.offsetTop;
  let parent = node.offsetParent as HTMLElement | null;
  while (parent) {
    left += parent.offsetLeft;
    top += parent.offsetTop;
    parent = parent.offsetParent as HTMLElement | null;
  }
  return { left, top, width: node.offsetWidth, height: node.offsetHeight };
}
