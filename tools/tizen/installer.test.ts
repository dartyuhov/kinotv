import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderConfigXml } from './configXml.ts';
import { FFLATE, INSTALL_OK, NO_TV, TV, TV_CONNECTED, useSandbox } from './sandbox.ts';
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

// The real application uses a different prefix for the same Tizen namespace. The expected
// identity is only text, not an XML element, despite looking like the old validator's pattern.
function disguisedOtherApp(): string {
  return renderConfigXml({ version: '1.5.0' })
    .replace(/tizen:/g, 'real:').replace('xmlns:tizen=', 'xmlns:real=')
    .replace('id="KinoTV0001.KinoTV" package="KinoTV0001"', 'id="OtherApp01.Other" package="OtherApp01"')
    .replace('</description>', '<![CDATA[<tizen:application id="KinoTV0001.KinoTV" package="KinoTV0001"/>]]></description>');
}

const manifest = renderConfigXml({ version: '1.5.0' });
const application = '<tizen:application id="KinoTV0001.KinoTV" package="KinoTV0001" required_version="3.0"/>';
const invalidManifests = [
  ['expected identity only in CDATA', disguisedOtherApp()],
  ['expected identity only in a comment', manifest.replace(application, `<!-- ${application} -->`)],
  ['wrong Tizen namespace', manifest.replace('http://tizen.org/ns/widgets', 'urn:other')],
  ['wrong widget namespace', manifest.replace('http://www.w3.org/ns/widgets', 'urn:other')],
  ['unbound prefix', manifest.replace(' xmlns:tizen="http://tizen.org/ns/widgets"', '')],
  ['rebound application prefix', manifest.replace(application, application.replace(' id=', ' xmlns:tizen="urn:other" id='))],
  ['duplicate application under another prefix', manifest.replace('</widget>', '<real:application xmlns:real="http://tizen.org/ns/widgets" id="OtherApp01.Other" package="OtherApp01"/></widget>')],
  ['application nested in description', manifest.replace(application, `<description>${application}</description>`)],
  ['unrelated application element', manifest.replace(application, application.replace('tizen:application', 'application'))],
  ['nested widget', manifest.replace('</widget>', '<widget/></widget>')],
  ['widget inside another root', manifest.replace(/<\?xml[^>]+>\n/, '<outer>') + '</outer>'],
  ['multiple roots', manifest + '<other/>'],
  ['duplicate version', manifest.replace('version="1.5.0"', 'version="1.5.0" version="1.4.0"')],
  ['duplicate application id', manifest.replace('id="KinoTV0001.KinoTV"', 'id="KinoTV0001.KinoTV" id="OtherApp01.Other"')],
  ['duplicate package', manifest.replace('package="KinoTV0001"', 'package="KinoTV0001" package="OtherApp01"')],
  ['namespaced identity attribute', manifest.replace('id="KinoTV0001.KinoTV"', 'tizen:id="KinoTV0001.KinoTV"')],
  ['missing closing tag', manifest.replace('</widget>', '')],
  ['mismatched closing tag', manifest.replace('</name>', '</description>')],
  ['unterminated comment', manifest + '<!--'],
  ['unterminated CDATA', manifest.replace('</description>', '<![CDATA[never closed</description>')],
  ['malformed attribute', manifest.replace('version="1.5.0"', 'version=1.5.0')],
  ['unknown entity', manifest.replace('</description>', '&unknown;</description>')],
  ['DTD', manifest.replace('<widget ', '<!DOCTYPE widget [<!ENTITY identity "KinoTV0001">]>\n<widget ')],
  ['invalid version range', manifest.replace('version="1.5.0"', 'version="256.0.0"')],
  ['noncanonical version', manifest.replace('version="1.5.0"', 'version="01.5.0"')],
  ['wrong encoding declaration', manifest.replace('encoding="UTF-8"', 'encoding="UTF-16"')],
] as const;

describe('the installer', () => {
  describe.each(['external', 'signed'])('%s manifest validation', (source) => {
    it.each(invalidManifests)('rejects %s', (_case, manifest) => {
      const wgt = releaseWgt('1.5.0');
      if (source === 'external') {
        writeFileSync(wgt, zipSync({ 'config.xml': strToU8(manifest) }));
      } else {
        tizenStub(`
if (args[0] === 'package') {
  const fs = require('node:fs'), path = require('node:path');
  const { unzipSync, zipSync } = require(${JSON.stringify(FFLATE)});
  const file = path.join(args[args.indexOf('-o') + 1], 'KinoTV.wgt');
  const files = unzipSync(fs.readFileSync(file));
  files['config.xml'] = Buffer.from(${JSON.stringify(manifest)});
  fs.writeFileSync(file, zipSync(files));
}
${INSTALL_OK}`);
        stub('sdb', TV_CONNECTED);
        saveSettings({ tv: TV, profile: 'KinoTV' });
      }

      const { code, out } = installer(['--wgt', wgt]);

      expect(out).toContain('is not a KinoTV package');
      expect(code).toBe(1);
      if (source === 'external') expect(calls()).toEqual([]);
      else {
        expect(calls().some((c) => /^tizen package /.test(c))).toBe(true);
        expect(calls().some((c) => /^tizen (install|run) /.test(c))).toBe(false);
      }
    });
  });

  it.each([
    ['alternate Tizen prefix', manifest.replace(/tizen:/g, 'real:').replace('xmlns:tizen=', 'xmlns:real=')],
    ['default Tizen namespace on the application', manifest.replace(application, application.replace('tizen:application', 'application xmlns="http://tizen.org/ns/widgets"'))],
    ['prefixed widget root', manifest.replace('<widget ', '<w:widget xmlns:w="http://www.w3.org/ns/widgets" ').replace('</widget>', '</w:widget>')],
    ['quoted markup, comments, CDATA, and references', manifest
      .replace('<description>', '<description title="a > b &amp; c">')
      .replace('</description>', `<!-- ${application} --><![CDATA[${application}<widget version="9.9.9"/>]]>&lt;widget/&gt;</description>`)
      .replace('KinoTV0001.KinoTV', 'KinoTV0001.&#75;inoTV')],
  ])('accepts %s and preserves the exact manifest through signing', (_case, xml) => {
    const wgt = releaseWgt('1.5.0');
    const files = unzipSync(readFileSync(wgt));
    files['config.xml'] = strToU8(xml);
    writeFileSync(wgt, zipSync(files));
    tizenStub(INSTALL_OK);
    stub('sdb', TV_CONNECTED);
    saveSettings({ tv: TV, profile: 'KinoTV' });

    const { code, out } = installer(['--wgt', wgt, '--release', 'v1.5.0']);

    expect(code, out).toBe(0);
    expect(out).toContain('KinoTV 1.5.0 is installed');
    expect(unzipSync(readFileSync(join(project, 'signed/KinoTV.wgt')))['config.xml']).toEqual(strToU8(xml));
    expect(unzipSync(readFileSync(wgt))['config.xml']).toEqual(strToU8(xml));
  });

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

  it('stops for recovery when the saved profile is missing instead of defaulting to another author profile', () => {
    const wgt = releaseWgt('1.5.0');
    tizenStub(INSTALL_OK);
    stub('sdb', TV_CONNECTED);
    saveSettings({ tv: TV, profile: 'OriginalProfile' });

    const { code, out } = installer(['--wgt', wgt]);

    expect(code).toBe(1);
    expect(out).toContain('Saved security profile "OriginalProfile" was not found');
    expect(out).toContain('Recover or import the original author.p12');
    expect(out).not.toContain('create a new author certificate');
    expect(out).not.toContain('Finish creating the certificate');
    expect(out).toContain('Uninstalling removes local session/settings');
    expect(out).toContain('bash install.sh');
    expect(savedSettings()).toEqual({ tv: TV, profile: 'OriginalProfile' });
    expect(calls().some((c) => /^tizen (package|install|run|uninstall) /.test(c))).toBe(false);
  });

  it('rejects a downloaded widget that does not match the selected release before touching the TV', () => {
    const wgt = releaseWgt('1.4.0');
    const { code, out } = installer(['--wgt', wgt, '--release', 'v1.5.0']);
    expect(code).toBe(1);
    expect(out).toContain('does not match selected release v1.5.0');
    expect(calls()).toEqual([]);
  });

  it('removes stale signed output and refuses success without a newly signed widget', () => {
    const wgt = releaseWgt('1.5.0');
    mkdirSync(join(project, 'signed'));
    writeFileSync(join(project, 'signed/KinoTV.wgt'), zipSync({
      'config.xml': strToU8(renderConfigXml({ version: '1.4.0' })),
      'author-signature.xml': strToU8('<old-signature/>'),
    }));
    // A CLI that exits successfully but produces no output must not reuse the previous run's file.
    stub('tizen', `
if (args[0] === 'version') console.log('Tizen CLI 2.5.25');
if (args[0] === 'security-profiles') console.log('KinoTV O');
`);
    stub('sdb', TV_CONNECTED);
    saveSettings({ tv: TV, profile: 'KinoTV' });

    const { code, out } = installer(['--wgt', wgt]);

    expect(code).toBe(1);
    expect(out).toContain('could not sign the app');
    expect(existsSync(join(project, 'signed/KinoTV.wgt'))).toBe(false);
    expect(calls().some((c) => /^tizen (install|run) /.test(c))).toBe(false);
  });

  it.each([
    ['version', 'version="1.5.0"', 'version="1.4.0"'],
    ['application', 'id="KinoTV0001.KinoTV"', 'id="OtherApp01.Other"'],
    ['package', 'package="KinoTV0001"', 'package="OtherApp01"'],
  ])('refuses newly signed output with the wrong %s', (_field, from, to) => {
    const wgt = releaseWgt('1.5.0');
    tizenStub(`
if (args[0] === 'package') {
  const fs = require('node:fs'), path = require('node:path');
  const { unzipSync, zipSync } = require(${JSON.stringify(FFLATE)});
  const file = path.join(args[args.indexOf('-o') + 1], 'KinoTV.wgt');
  const files = unzipSync(fs.readFileSync(file));
  files['config.xml'] = Buffer.from(Buffer.from(files['config.xml']).toString('utf8').replace(${JSON.stringify(from)}, ${JSON.stringify(to)}));
  fs.writeFileSync(file, zipSync(files));
}
`);
    stub('sdb', TV_CONNECTED);
    saveSettings({ tv: TV, profile: 'KinoTV' });

    const { code } = installer(['--wgt', wgt]);

    expect(code).toBe(1);
    expect(calls().some((c) => /^tizen (install|run) /.test(c))).toBe(false);
    expect(savedSettings()).toEqual({ tv: TV, profile: 'KinoTV' });
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

  it('recovers the original author identity first when an update is refused', () => {
    const wgt = releaseWgt();
    tizenStub(`if (args[0] === 'install') console.log('app_id[KinoTV0001] install failed[118, -11], reason: Author certificate not match :');`);
    stub('sdb', TV_CONNECTED);
    saveSettings({ tv: TV, profile: 'KinoTV' });

    const { code, out } = installer(['--wgt', wgt]);

    expect(code).toBe(1);
    expect(out).toContain('The TV refused to install KinoTV');
    expect(out).toContain('Recover or import the original author.p12');
    expect(out).toContain('same Samsung account or profile name');
    expect(out).toContain('Uninstalling removes local session/settings');
    expect(out).toContain('deliberate last resort');
    expect(out).not.toContain('tizen uninstall');
    expect(calls().some((c) => /^tizen (uninstall|run) /.test(c))).toBe(false);
  });

  it.each([
    ['unknown failure', 'install failed[999, -1]', 'Read the log above'],
    ['distributor failure', 'install failed[118, -12], invalid certificate chain 1010', "TV's DUID"],
  ])('preserves update continuity in recovery advice for %s', (_case, failure, diagnostic) => {
    const wgt = releaseWgt();
    tizenStub(`if (args[0] === 'install') console.log(${JSON.stringify(failure)});`);
    stub('sdb', TV_CONNECTED);
    saveSettings({ tv: TV, profile: 'KinoTV' });

    const { code, out } = installer(['--wgt', wgt]);

    expect(code).toBe(1);
    expect(out).toContain(diagnostic);
    expect(out).toContain('original author certificate');
    expect(out).not.toContain('tizen uninstall');
    expect(out).not.toContain('recreate the Samsung certificate');
    if (_case === 'unknown failure') {
      expect(out).toContain('Uninstalling removes local session/settings');
      expect(out).toContain('deliberate last resort');
    } else expect(out).toContain('distributor certificate');
    expect(calls().some((c) => /^tizen (uninstall|run) /.test(c))).toBe(false);
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

  it.each([
    ['comment-only identity', '<!-- <tizen:application id="KinoTV0001.KinoTV" package="KinoTV0001"/> -->'],
    ['identity on an unrelated element', '<other id="KinoTV0001.KinoTV" package="KinoTV0001"/>'],
    ['invalid version', renderConfigXml({ version: '256.0.0' })],
  ])('inspects external widgets before TV setup: %s', (_case, manifest) => {
    const file = join(project, 'External.wgt');
    writeFileSync(file, zipSync({ 'config.xml': strToU8(manifest) }));
    const { code, out } = installer(['--wgt', file]);
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
