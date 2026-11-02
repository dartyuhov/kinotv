import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderConfigXml } from './configXml.ts';
import { INSTALL_OK, NO_TV, TV, TV_CONNECTED, useSandbox } from './sandbox.ts';
import { createUnsignedWgt } from './wgt.ts';

// The end-user installer (spec §11, tools/install.sh runs it): the setup wizard's TV and certificate
// steps, then it signs the unsigned release .wgt with the user's profile and installs it. Run here as a
// subprocess against stub Tizen tools (see sandbox.ts).

const INSTALLER = resolve(import.meta.dirname, 'installer.ts');

const sandbox = useSandbox();
const { stub, calls, saveSettings, savedSettings, tizenStub } = sandbox;
let project: string;
beforeEach(() => ({ project } = sandbox.paths));

const installer = (args: string[], input = '') => sandbox.node(INSTALLER, args, input);

/** The unsigned KinoTV.wgt a GitHub release carries, as the release workflow makes it. */
function releaseWgt(version = '1.4.0'): string {
  const app = join(project, 'release-build');
  mkdirSync(join(app, 'assets'), { recursive: true });
  writeFileSync(join(app, 'config.xml'), renderConfigXml({ version }));
  writeFileSync(join(app, 'index.html'), '<!doctype html>');
  writeFileSync(join(app, 'icon.png'), 'png');
  writeFileSync(join(app, 'assets/index-abc.js'), '');
  const file = join(project, 'KinoTV.wgt');
  createUnsignedWgt(app, file);
  return file;
}

function installedPackageFiles(): string[] {
  return Object.keys(unzipSync(readFileSync(join(project, 'signed/KinoTV.wgt')))).sort();
}

describe('the installer', () => {
  it('connects the TV, uses the certificate, then signs the release package with it, installs and launches it', () => {
    const wgt = releaseWgt('1.4.0');
    tizenStub(INSTALL_OK);
    stub('sdb', TV_CONNECTED);

    // Answers: the TV's IP address, then Enter to accept the suggested profile name.
    const { code, out } = installer(['--wgt', wgt], `${TV}\n\n`);

    expect(code).toBe(0);
    expect(out).toContain('Developer Mode');
    expect(out).toContain('FAKE-DUID-0001');
    expect(out).toContain('Certificate Manager');
    expect(calls().filter((c) => /^tizen (package|install |run)/.test(c))).toEqual([
      expect.stringMatching(/^tizen package -t wgt -s KinoTV -o \S+signed -- /),
      expect.stringMatching(new RegExp(`^tizen install -n KinoTV.wgt -s ${TV}:26101 -- \\S+signed$`)),
      `tizen run -p KinoTV0001.KinoTV -s ${TV}:26101`,
    ]);
    expect(installedPackageFiles()).toEqual(['assets/index-abc.js', 'author-signature.xml', 'config.xml', 'icon.png', 'index.html']);
    expect(out).toContain('KinoTV 1.4.0 is installed on QE55Q60CAU');
    expect(savedSettings()).toEqual({ tv: TV, profile: 'KinoTV' });
  });

  it('on a second run (an update), reuses the saved TV and certificate without asking again', () => {
    const wgt = releaseWgt('1.5.0');
    tizenStub(INSTALL_OK);
    stub('sdb', TV_CONNECTED);
    saveSettings({ tv: TV, profile: 'KinoTV' });

    const { code, out } = installer(['--wgt', wgt]);

    expect(code).toBe(0);
    expect(out).toContain('✓ Using security profile "KinoTV"');
    expect(out).toContain('KinoTV 1.5.0 is installed');
  });

  it("stops with the Developer Mode checklist when the TV can't be reached, and says to run the installer again", () => {
    const wgt = releaseWgt();
    tizenStub();
    stub('sdb', NO_TV);

    const { code, out } = installer(['--wgt', wgt], `${TV}\n`);

    expect(code).toBe(1);
    expect(out).toContain(`Can't reach the TV at ${TV}`);
    expect(out).toContain('1 2 3 4 5');
    expect(out).toContain('bash install.sh');
    expect(out).not.toContain('npm run');
    expect(calls().filter((c) => /^tizen (package|install )/.test(c))).toEqual([]);
  });

  it('explains a package the TV refused', () => {
    const wgt = releaseWgt();
    tizenStub(`if (args[0] === 'install') console.log('app_id[KinoTV0001] install failed[118, -11], reason: Author certificate not match :');`);
    stub('sdb', TV_CONNECTED);
    saveSettings({ tv: TV, profile: 'KinoTV' });

    const { code, out } = installer(['--wgt', wgt]);

    expect(code).toBe(1);
    expect(out).toContain('The TV refused to install KinoTV');
    expect(out).toContain('tizen uninstall -p KinoTV0001.KinoTV');
  });

  it('checks the package before touching the TV: a missing file', () => {
    const { code, out } = installer(['--wgt', join(project, 'nowhere/KinoTV.wgt')]);

    expect(code).toBe(1);
    expect(out).toContain('No KinoTV package at');
    expect(calls()).toEqual([]);
  });

  it('checks the package before touching the TV: something that is not KinoTV', () => {
    const other = join(project, 'Other.wgt');
    writeFileSync(other, zipSync({ 'config.xml': strToU8('<widget id="http://example.test/Other"/>'), 'index.html': strToU8('') }));

    const { code, out } = installer(['--wgt', other]);

    expect(code).toBe(1);
    expect(out).toContain('is not a KinoTV package');
    expect(calls()).toEqual([]);
  });

  it('refuses a package with paths that would land outside its folder', () => {
    const evil = join(project, 'Evil.wgt');
    writeFileSync(evil, zipSync({ 'config.xml': strToU8(renderConfigXml({ version: '1.0.0' })), '../escaped.txt': strToU8('x') }));

    const { code, out } = installer(['--wgt', evil]);

    expect(code).toBe(1);
    expect(out).toContain('is not a KinoTV package');
    expect(calls()).toEqual([]);
  });
});
