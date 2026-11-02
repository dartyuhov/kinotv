import { accessSync, constants, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderConfigXml } from '../tizen/configXml.ts';
import { INSTALL_OK, TV, TV_CONNECTED, useSandbox } from '../tizen/sandbox.ts';

// `npm run release:assets` (tools/release/assemble.ts) turns a production build into the files the
// release workflow attaches to a GitHub release. Run here in a sandbox project, as CI runs it.

const ASSEMBLE = resolve(import.meta.dirname, 'assemble.ts');

const sandbox = useSandbox();
const { stub, calls, tizenStub } = sandbox;
let project: string;
let home: string;
beforeEach(() => ({ project, home } = sandbox.paths));

function writeProject({ version = '1.4.0', githubRepo = 'someone/kinotv' } = {}): void {
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'kinotv', version, kinotv: { githubRepo } }));
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
});
