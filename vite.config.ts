import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readProject } from './tools/release/project.ts';
import { tizenWidget } from './tools/tizen/vitePlugin.ts';

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
    // Tizen 7.0 is about Chrome 94; Chrome 85 keeps Tizen 6.5 (2022) in reach. See spec §2.
    target: 'chrome85',
  },
  test: {
    // Vitest is only for small pure-logic tests next to the code. Journeys live in e2e/ (Playwright).
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});
