import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { zipSync, type Zippable } from 'fflate';

// A .wgt is a zip of the widget folder with config.xml at its root. Signing (tizen package -s) adds
// author-signature.xml and signature1.xml; an unsigned .wgt has neither.

/** Files that must never ship: dotfiles, source maps, old signatures and packages. */
function isPackaged(path: string): boolean {
  const parts = path.split('/');
  const name = parts[parts.length - 1]!;
  if (parts.some((part) => part.startsWith('.'))) return false;
  if (name.endsWith('.map') || name.endsWith('.wgt')) return false;
  return name !== 'author-signature.xml' && !/^signature\d+\.xml$/.test(name);
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .filter(isPackaged)
    .sort();
}

/** Packs a built widget folder (normally dist/) into an unsigned .wgt. Needs no Tizen tools. */
export function createUnsignedWgt(appDir: string, outFile: string): void {
  for (const required of ['config.xml', 'index.html']) {
    if (!existsSync(join(appDir, required))) {
      throw new Error(`${join(appDir, required)} is missing, so ${appDir} is not a built widget. Run \`npm run build\` first.`);
    }
  }
  const files: Zippable = {};
  // A fixed timestamp keeps the package byte-for-byte the same for the same build.
  const mtime = new Date('2026-01-01T00:00:00Z');
  for (const path of listFiles(appDir)) files[path] = [readFileSync(join(appDir, path)), { mtime }];
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, zipSync(files, { level: 9 }));
}

/** Copies the packaged files of a widget folder to `toDir`, for `tizen package` to sign in place. */
export function copyWidget(appDir: string, toDir: string): void {
  for (const path of listFiles(appDir)) {
    const target = join(toDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(appDir, path)));
  }
}
