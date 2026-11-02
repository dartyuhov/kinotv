import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin, UserConfig } from 'vite';
import { ICON_FILE, renderConfigXml, tizenVersion } from './configXml.ts';

/**
 * Makes every production build a Tizen widget folder that runs from local files.
 *
 * - Writes config.xml (version taken from package.json, so the two never drift) and the launcher icon
 *   from tizen/ next to index.html.
 * - The TV opens index.html from the installed .wgt (file://). Chromium refuses `<script type="module">`
 *   and `crossorigin` requests from file://, so the build is one classic, deferred script (IIFE) and the
 *   HTML has no `type="module"` or `crossorigin` attributes.
 *
 * The dev server is left alone.
 */
export function tizenWidget(): Plugin {
  let root = process.cwd();
  return {
    name: 'kinotv:tizen-widget',
    apply: 'build',
    config(): UserConfig {
      return {
        build: {
          // No module preload helper or polyfill: there is only one chunk and it is not a module.
          modulePreload: false,
          // One stylesheet linked from index.html, instead of CSS injected by the script at run time.
          cssCodeSplit: false,
          rolldownOptions: {
            output: { format: 'iife', codeSplitting: false },
          },
        },
      };
    },
    configResolved(config) {
      root = config.root;
    },
    transformIndexHtml: {
      // After Vite has injected its own script and stylesheet tags.
      order: 'post',
      handler: (html) => toClassicScripts(html),
    },
    generateBundle() {
      const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
      this.emitFile({ type: 'asset', fileName: 'config.xml', source: renderConfigXml({ version: tizenVersion(version) }) });
      this.emitFile({ type: 'asset', fileName: ICON_FILE, source: readFileSync(join(root, 'tizen', ICON_FILE)) });
    },
  };
}

/** Rewrites Vite's module entry tags into tags that load from file://. */
function toClassicScripts(html: string): string {
  return html
    .replace(/<script type="module" crossorigin src=/g, '<script defer src=')
    .replace(/<script type="module" src=/g, '<script defer src=')
    .replace(/<link rel="stylesheet" crossorigin href=/g, '<link rel="stylesheet" href=');
}
