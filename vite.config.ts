import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readProject } from './tools/release/project.ts';
import { tizenWidget } from './tools/tizen/vitePlugin.ts';
import { flexGapFallback } from './tools/postcss/flexGapFallback.ts';

const project = readProject(import.meta.dirname);

export default defineConfig({
  // Tizen loads the app from local files inside the .wgt, so every asset URL must be relative.
  base: './',
  plugins: [react(), tizenWidget()],
  // From package.json, like config.xml's version, so the app, the package and the release always agree.
  define: {
    __APP_VERSION__: JSON.stringify(project.version),
    __GITHUB_REPO__: JSON.stringify(project.githubRepo),
  },
  build: {
    // Tizen 6.0 (2021 TVs) runs Chromium 76, the oldest engine KinoTV supports. Syntax is lowered to
    // it here; missing runtime APIs are shimmed in src/core/platform/compat.ts. See spec §2.
    target: 'chrome76',
  },
  css: {
    // Chromium < 84 has no flexbox gap: generate margin fallbacks that compat.ts switches on.
    postcss: { plugins: [flexGapFallback()] },
  },
  test: {
    // Vitest is only for small pure-logic tests next to the code. Journeys live in e2e/ (Playwright).
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});
