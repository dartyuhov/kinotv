import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { tizenWidget } from './tools/tizen/vitePlugin.ts';

export default defineConfig({
  // Tizen loads the app from local files inside the .wgt, so every asset URL must be relative.
  base: './',
  plugins: [react(), tizenWidget()],
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
