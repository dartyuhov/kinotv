import type { PluginCreator, Rule } from 'postcss';

/**
 * Class that src/core/platform/compat.ts puts on <html> when the engine lacks flexbox `gap`.
 * Keep the two in sync.
 */
export const NO_FLEX_GAP_CLASS = 'no-flex-gap';

/**
 * Flexbox `gap` arrived in Chromium 84. Tizen 6.0 (2021 TVs) runs Chromium 76, which honours `gap`
 * only in grids, so every flex row and column there loses its spacing.
 *
 * For each rule that declares `display: flex | inline-flex` together with a gap, this emits a margin
 * fallback scoped to `html.no-flex-gap`. Engines with flex gap never get that class, so they keep
 * the real `gap` and the fallback costs them nothing.
 *
 * The fallback spaces every child after the first: `margin-left` in rows, `margin-top` in columns
 * (mirrored for the `-reverse` directions). Wrapping rows only get the horizontal gap, so a wrapped
 * line starts one gap in and the lines touch. KinoTV's wrapping rows are short chip and meta lines
 * that fit on one line at 1920×1080.
 *
 * The rule must declare `display` itself; a `gap` set elsewhere (a modifier class, say) can't be
 * matched to its flex container, so the plugin warns about it instead.
 */
export const flexGapFallback: PluginCreator<void> = () => ({
  postcssPlugin: 'kinotv-flex-gap-fallback',
  OnceExit(root, { result }) {
    root.walkRules((rule) => {
      if (insideKeyframes(rule)) return;
      const decls = declarations(rule);
      const [rowGap, columnGap] = gaps(decls);
      if (!rowGap && !columnGap) return;
      const display = decls.get('display');
      if (!display) {
        rule.warn(result, `${NO_FLEX_GAP_CLASS}: gap without display in the same rule, so Chromium < 84 gets no fallback`);
        return;
      }
      if (!/^(inline-)?flex$/.test(display)) return;

      const direction = decls.get('flex-direction') ?? split(decls.get('flex-flow') ?? '').find(isDirection) ?? 'row';
      const column = direction.startsWith('column');
      const reverse = direction.endsWith('-reverse');
      const value = column ? rowGap : columnGap;
      if (!value || value === 'normal' || value === '0') return;

      const prop = column ? (reverse ? 'margin-bottom' : 'margin-top') : reverse ? 'margin-right' : 'margin-left';
      const fallback = rule.cloneAfter({ selectors: rule.selectors.map((s) => `html.${NO_FLEX_GAP_CLASS} ${s} > * + *`) });
      fallback.removeAll();
      // Point the new declaration at the gap it replaces: Vite's url() rewriting needs every
      // declaration's source file, and source maps then lead back to the original rule.
      const origin = rule.nodes.find((node) => node.type === 'decl' && /^(row-|column-)?gap$/i.test(node.prop));
      fallback.append({ prop, value, source: origin?.source });
    });
  },
});
flexGapFallback.postcss = true;

function insideKeyframes(rule: Rule): boolean {
  type Ancestor = { type: string; name?: string; parent?: unknown };
  for (let node = rule.parent as Ancestor | undefined; node; node = node.parent as Ancestor | undefined) {
    if (node.type === 'atrule' && /keyframes$/i.test(node.name ?? '')) return true;
  }
  return false;
}

/** The rule's own declarations, last one winning, with lower-case names and values. */
function declarations(rule: Rule): Map<string, string> {
  const map = new Map<string, string>();
  rule.each((node) => {
    if (node.type === 'decl') map.set(node.prop.toLowerCase(), node.value.trim().toLowerCase());
  });
  return map;
}

/** [row gap, column gap] from `gap` and the longhands, which win when both are present. */
function gaps(decls: Map<string, string>): [string | undefined, string | undefined] {
  const [row, column = row] = split(decls.get('gap') ?? '');
  return [decls.get('row-gap') ?? row, decls.get('column-gap') ?? column];
}

/** Splits a value on top-level whitespace, keeping `var(...)` and `calc(...)` whole. */
function split(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (current) parts.push(current);
      current = '';
    } else current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

function isDirection(token: string): boolean {
  return /^(row|column)(-reverse)?$/.test(token);
}
