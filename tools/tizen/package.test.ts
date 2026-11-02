import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUnsignedWgt } from './wgt.ts';

const repoRoot = resolve(import.meta.dirname, '../..');
const packageVersion = (JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { version: string }).version;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let work: string;
let appDir: string;

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'kinotv-package-'));
  appDir = join(work, 'dist');
  await build({ root: repoRoot, logLevel: 'silent', build: { outDir: appDir, emptyOutDir: true } });
}, 60_000);

afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('the production build', () => {
  it('is a Tizen widget whose config.xml carries the package.json version', () => {
    const configXml = readFileSync(join(appDir, 'config.xml'), 'utf8');
    expect(configXml).toContain(` version="${packageVersion}" `);
    expect(configXml).toContain('<icon src="icon.png"/>');
  });

  it('includes the launcher icon as a PNG', () => {
    expect([...readFileSync(join(appDir, 'icon.png')).subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  });
});

describe('createUnsignedWgt', () => {
  it('zips the build with config.xml, index.html and the icon at the root of the .wgt', () => {
    const wgt = join(work, 'KinoTV.wgt');
    createUnsignedWgt(appDir, wgt);

    const files = unzipSync(readFileSync(wgt));
    const names = Object.keys(files);
    expect(names).toEqual(expect.arrayContaining(['config.xml', 'index.html', 'icon.png']));
    expect(names.some((name) => /^assets\/index-[\w-]+\.js$/.test(name))).toBe(true);
    expect(Buffer.from(files['config.xml']!).toString('utf8')).toBe(readFileSync(join(appDir, 'config.xml'), 'utf8'));
  });

  it('leaves out source maps, dotfiles and leftovers from signing', () => {
    writeFileSync(join(appDir, '.DS_Store'), '');
    writeFileSync(join(appDir, 'assets', 'index.js.map'), '{}');
    writeFileSync(join(appDir, 'author-signature.xml'), '<old/>');
    writeFileSync(join(appDir, 'signature1.xml'), '<old/>');
    const wgt = join(work, 'clean.wgt');

    createUnsignedWgt(appDir, wgt);

    const names = Object.keys(unzipSync(readFileSync(wgt)));
    expect(names.filter((name) => /(^|\/)\.|\.map$|signature/.test(name))).toEqual([]);
  });

  it('refuses a folder that is not a built widget, and says how to make one', () => {
    const empty = mkdtempSync(join(work, 'empty-'));
    expect(() => createUnsignedWgt(empty, join(work, 'nope.wgt'))).toThrow(/config\.xml.*npm run build/s);
  });
});
