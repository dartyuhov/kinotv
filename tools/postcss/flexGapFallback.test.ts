import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { flexGapFallback } from './flexGapFallback.ts';

async function run(input: string) {
  const result = await postcss([flexGapFallback()]).process(input, { from: undefined });
  const css =result.css.replace(/\s+/g, ' ').replace(/;?\s*\}/g, ' }').replace(/\}(?=\S)/g, '} ').trim();
  return { css, warnings: result.warnings().map((w) => w.text) };
}

describe('flexGapFallback', () => {
  it('spaces row children with margin-left under html.no-flex-gap', async () => {
    const { css } = await run('.row { display: flex; gap: var(--space-3); }');
    expect(css).toContain('html.no-flex-gap .row > * + * { margin-left: var(--space-3) }');
  });

  it('uses margin-top for columns and the row value of a two-value gap', async () => {
    const { css } = await run('.col { display: flex; flex-direction: column; gap: 10px 20px; }');
    expect(css).toContain('html.no-flex-gap .col > * + * { margin-top: 10px }');
  });

  it('mirrors reverse directions, read from flex-flow too', async () => {
    const { css } = await run('.a { display: inline-flex; flex-flow: row-reverse wrap; gap: 4px; }');
    expect(css).toContain('html.no-flex-gap .a > * + * { margin-right: 4px }');
  });

  it('keeps calc() whole and prefixes every selector in a list', async () => {
    const { css } = await run('.a, .b span { display: flex; gap: calc(var(--x) * 2) 8px; }');
    expect(css).toContain('html.no-flex-gap .a > * + *');
    expect(css).toContain('html.no-flex-gap .b span > * + *');
    expect(css).toContain('margin-left: 8px');
  });

  it('keeps the fallback inside its media query', async () => {
    const { css } = await run('@media (min-width: 1px) { .m { display: flex; gap: 2px; } }');
    expect(css).toMatch(/@media \(min-width: 1px\) \{ .m \{[^}]*\} html\.no-flex-gap \.m > \* \+ \* \{ margin-left: 2px \} \}/);
  });

  it('leaves grids and zero gaps alone', async () => {
    const grid = await run('.g { display: grid; gap: 8px; }');
    const zero = await run('.z { display: flex; gap: 0; }');
    expect(grid.css).not.toContain('no-flex-gap');
    expect(zero.css).not.toContain('no-flex-gap');
  });

  it('warns about a gap whose display is set by another rule', async () => {
    const { css, warnings } = await run('.x--wide { gap: 8px; }');
    expect(css).not.toContain('no-flex-gap');
    expect(warnings).toHaveLength(1);
  });
});
