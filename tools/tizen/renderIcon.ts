// Renders tizen/icon.svg to tizen/icon.png (512x512) with Playwright's Chromium and the bundled Inter font.
// Run after editing the SVG: node tools/tizen/renderIcon.ts
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '../..');
const svg = readFileSync(join(root, 'tizen/icon.svg'), 'utf8');
// A data URL, because a page made with setContent may not load file:// fonts.
const fontBytes = readFileSync(join(root, 'node_modules/@fontsource/inter/files/inter-latin-800-normal.woff2'));
const font = `data:font/woff2;base64,${fontBytes.toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
await page.setContent(
  `<style>@font-face{font-family:Inter;font-weight:800;src:url(${font})}html,body{margin:0}</style>${svg}`,
);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(root, 'tizen/icon.png'), omitBackground: false });
await browser.close();
console.log('Wrote tizen/icon.png');
