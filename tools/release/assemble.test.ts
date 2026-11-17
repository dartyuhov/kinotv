import { accessSync, constants, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { build } from 'vite';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderConfigXml } from '../tizen/configXml.ts';
import { INSTALL_OK, TV, TV_CONNECTED, useSandbox } from '../tizen/sandbox.ts';

// `npm run release:assets` (tools/release/assemble.ts) turns a production build into the files the
// release workflow attaches to a GitHub release. Run here in a sandbox project, as CI runs it.

const ASSEMBLE = resolve(import.meta.dirname, 'assemble.ts');
const ROOT = resolve(import.meta.dirname, '../..');

const sandbox = useSandbox();
const { stub, calls, tizenStub } = sandbox;
let project: string;
let home: string;
beforeEach(() => ({ project, home } = sandbox.paths));

function writeProject({ version = '1.4.0', githubRepo = 'someone/kinotv' } = {}): void {
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'kinotv', version, kinotv: { githubRepo } }));
  writeFileSync(join(project, 'package-lock.json'), JSON.stringify({ version, packages: { '': { version } } }));
}

/** A minimal production build in dist/ (the real build is covered by tools/tizen/package.test.ts). */
function fakeBuild(version = '1.4.0'): void {
  mkdirSync(join(project, 'dist/assets'), { recursive: true });
  writeFileSync(join(project, 'dist/config.xml'), renderConfigXml({ version }));
  writeFileSync(join(project, 'dist/index.html'), '<!doctype html>');
  writeFileSync(join(project, 'dist/icon.png'), 'png');
  writeFileSync(join(project, 'dist/assets/index-abc.js'), '');
  writeFileSync(join(project, 'dist/assets/index-abc.js.map'), '{}');
}

const assemble = () => sandbox.node(ASSEMBLE, []);
const released = (name: string) => join(project, 'dist-release', name);

describe('the release assets', () => {
  it('assemble the actual configured project with matching source, lockfile, app and unsigned widget identity', async () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string; kinotv: { githubRepo: string } };
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as { version: string; packages: Record<string, { version: string }> };
    expect(pkg.kinotv.githubRepo).toBe('dartyuhov/kinotv');
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages['']?.version).toBe(pkg.version);
    for (const name of ['package.json', 'package-lock.json']) {
      writeFileSync(join(project, name), readFileSync(join(ROOT, name)));
    }
    // Ignore local env files and replace client configuration explicitly. These fixtures never make
    // a network request and cannot pick up a maintainer's app client or per-user session.
    await build({
      root: ROOT,
      envDir: false,
      logLevel: 'silent',
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        'import.meta.env.VITE_KP_CLIENT_ID': JSON.stringify('fixture-release-client-id'),
        'import.meta.env.VITE_KP_CLIENT_SECRET': JSON.stringify('fixture-release-client-secret'),
        'import.meta.env.VITE_RELEASES_URL': JSON.stringify(''),
      },
      build: { outDir: join(project, 'dist'), emptyOutDir: true },
    });
    const { code, out } = assemble();
    expect(code, out).toBe(0);
    const files = unzipSync(readFileSync(released('KinoTV.wgt')));
    const manifest = Buffer.from(files['config.xml']!).toString('utf8');
    expect(manifest).toContain(`version="${pkg.version}"`);
    expect(manifest).toContain('id="KinoTV0001.KinoTV" package="KinoTV0001"');
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['index.html', 'icon.png', 'config.xml']));
    expect(Object.keys(files).some((name) => /signature|\.map$|(^|\/)\./.test(name))).toBe(false);
    const script = Object.entries(files).filter(([name]) => name.endsWith('.js')).map(([, bytes]) => Buffer.from(bytes).toString('utf8')).join('\n');
    expect(script.includes('fixture-release-client-id') && script.includes('fixture-release-client-secret')).toBe(true);
    expect(script.match(/appVersion:["'`]([^"'`]+)["'`]/)?.[1]).toBe(pkg.version);
    expect(script).toContain('dartyuhov/kinotv');
    expect(readFileSync(released('install.sh'), 'utf8')).toContain('KINOTV_GITHUB_REPO:-dartyuhov/kinotv');
  }, 60_000);

  it('are the unsigned app, install.sh with the GitHub repo filled in, and the installer as one file', () => {
    writeProject();
    fakeBuild();

    const { code, out } = assemble();

    expect(code, out).toBe(0);
    expect(readdirSync(join(project, 'dist-release')).sort()).toEqual(['KinoTV.wgt', 'install.sh', 'kinotv-installer.mjs']);
    expect(Object.keys(unzipSync(readFileSync(released('KinoTV.wgt')))).sort()).toEqual([
      'assets/index-abc.js',
      'config.xml',
      'icon.png',
      'index.html',
    ]);
    expect(readFileSync(released('install.sh'), 'utf8')).toContain('GITHUB_REPO="${KINOTV_GITHUB_REPO:-someone/kinotv}"');
    expect(() => accessSync(released('install.sh'), constants.X_OK)).not.toThrow();
  }, 60_000);

  it('install a release on the TV through install.sh alone, with nothing else from the project', () => {
    writeProject();
    fakeBuild('1.4.0');
    expect(assemble().code).toBe(0);
    // GitHub, serving this release's files as "latest".
    stub(
      'curl',
      `const fs = require('node:fs'), path = require('node:path');
const url = args[args.length - 1], out = args[args.indexOf('-o') + 1];
if (!url.startsWith('https://github.com/someone/kinotv/releases/latest/download/')) process.exit(22);
fs.copyFileSync(path.join(${JSON.stringify(join(project, 'dist-release'))}, path.basename(url)), out);`,
    );
    symlinkSync('/bin/mkdir', join(sandbox.paths.bin, 'mkdir'));
    tizenStub(INSTALL_OK);
    stub('sdb', TV_CONNECTED);

    // Answers: the TV's IP address, then Enter to accept the suggested certificate profile name.
    const { code, out } = sandbox.run('/bin/bash', [released('install.sh')], `${TV}\n\n`);

    expect(code, out).toBe(0);
    expect(out).toContain('KinoTV 1.4.0 is installed on QE55Q60CAU');
    expect(calls()).toContain(`tizen run -p KinoTV0001.KinoTV -s ${TV}:26101`);
    const signed = Object.keys(unzipSync(readFileSync(join(home, 'KinoTV/signed/KinoTV.wgt'))));
    expect(signed).toEqual(expect.arrayContaining(['author-signature.xml', 'config.xml', 'index.html']));
  }, 60_000);

  it('are not made while the GitHub repo in package.json is the placeholder', () => {
    writeProject({ githubRepo: 'OWNER/REPO' });
    fakeBuild();

    const { code, out } = assemble();

    expect(code).toBe(1);
    expect(out).toContain('"kinotv": { "githubRepo" }');
  });

  it("are not made from a build whose version doesn't match package.json", () => {
    writeProject({ version: '1.5.0' });
    fakeBuild('1.4.0');

    const { code, out } = assemble();

    expect(code).toBe(1);
    expect(out).toContain('dist/ is version 1.4.0 but package.json says 1.5.0');
  });

  it('ask for a build first when there is none', () => {
    writeProject();

    const { code, out } = assemble();

    expect(code).toBe(1);
    expect(out).toContain('npm run build');
  });

  it.each(['1.4.0-beta.1', '1.4.0+build.2', '01.4.0', '256.0.0'])('refuses release version %s rather than silently normalizing it', (version) => {
    writeProject({ version });
    fakeBuild('1.4.0');
    const { code, out } = assemble();
    expect(code).toBe(1);
    expect(out).toContain('stable numeric Tizen version');
  });

  it('refuses a stale lockfile even when the widget matches package.json', () => {
    writeProject();
    fakeBuild();
    writeFileSync(join(project, 'package-lock.json'), JSON.stringify({ version: '1.3.0', packages: { '': { version: '1.3.0' } } }));
    const { code, out } = assemble();
    expect(code).toBe(1);
    expect(out).toContain('package-lock.json');
  });

  it('refuses a matching version with a different application identity', () => {
    writeProject();
    fakeBuild();
    const manifest = join(project, 'dist/config.xml');
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('id="KinoTV0001.KinoTV"', 'id="OtherApp01.Other"'));
    const { code, out } = assemble();
    expect(code).toBe(1);
    expect(out).toContain('KinoTV0001.KinoTV');
  });
});
