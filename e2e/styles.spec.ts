import { expect, test } from './harness/test';

// Performance rules (spec §6.3) the TV depends on, checked against the stylesheet that ships.

test('no style uses backdrop-filter, and only transform and opacity are animated', async ({ app, page }) => {
  await app.open();

  const found = await page.evaluate(() => {
    const backdropFilters: string[] = [];
    const animated = new Set<string>();
    const visit = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSKeyframesRule) {
          for (const frame of Array.from(rule.cssRules) as CSSKeyframeRule[]) {
            for (const property of Array.from(frame.style)) animated.add(property);
          }
        } else if (rule instanceof CSSStyleRule) {
          const text = rule.style.cssText;
          if (/backdrop-filter/.test(text)) backdropFilters.push(rule.selectorText);
          // `transition: transform 200ms …, opacity …` or `transition-property: …`; the first word of each item.
          for (const [, value] of text.matchAll(/transition(?:-property)?:\s*([^;]+)/g)) {
            for (const item of value!.split(',')) animated.add(item.trim().split(/\s+/)[0]!);
          }
        } else if ('cssRules' in rule) {
          visit((rule as CSSGroupingRule).cssRules);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules);
    return { backdropFilters, animated: [...animated].sort() };
  });

  expect(found.backdropFilters).toEqual([]);
  expect(found.animated.filter((property) => property !== 'transform' && property !== 'opacity')).toEqual([]);
  expect(found.animated).toContain('transform'); // the check did see the app's styles
});
