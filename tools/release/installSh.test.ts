import { mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { INSTALL_OK, TV, TV_CONNECTED, useSandbox } from '../tizen/sandbox.ts';
import { renderConfigXml } from '../tizen/configXml.ts';

// tools/install.sh is what an end user downloads from a GitHub release and runs. It fetches the rest of
// the latest release and hands over to the bundled installer. Here it runs in a sandbox: `curl` is a stub
// that serves fake release files, and the "installer" it downloads just records how it was started.

const INSTALL_SH = resolve(import.meta.dirname, '../install.sh');

const sandbox = useSandbox();
const { stub, calls } = sandbox;
let home: string;
let project: string;

beforeEach(() => {
  ({ home, project } = sandbox.paths);
  for (const tool of ['mkdir']) symlinkSync(`/bin/${tool}`, join(sandbox.paths.bin, tool));
});

/** install.sh as a release ships it: with the GitHub repo filled in (tools/release/assemble.ts does that). */
function stampedInstallSh(repo: string | null = 'someone/kinotv'): string {
  const file = join(project, 'install.sh');
  const source = readFileSync(INSTALL_SH, 'utf8');
  writeFileSync(file, repo ? source.replace('${KINOTV_GITHUB_REPO:-OWNER/REPO}', `\${KINOTV_GITHUB_REPO:-${repo}}`) : source);
  return file;
}

/** curl that "downloads" fake release files (-o FILE URL); `failFor` makes URLs containing it fail like a 404. */
function fakeGitHub({ failFor, corrupt, manifest, releaseDir, omit, binary = false }: {
  failFor?: string; corrupt?: string; manifest?: string; releaseDir?: string; omit?: string; binary?: boolean;
} = {}): void {
  stub(
    'curl',
    `
const fs = require('node:fs'), crypto = require('node:crypto');
const url = args[args.length - 1], out = args[args.indexOf('-o') + 1];
if (${JSON.stringify(failFor ?? null)} && url.includes(${JSON.stringify(failFor ?? '')})) { console.error('curl: (22) The requested URL returned error: 404'); process.exit(22); }
if (url.endsWith('/releases/latest')) { console.log(JSON.stringify({ tag_name: 'v1.4.0' })); process.exit(0); }
const files = ${JSON.stringify(releaseDir)} ? Object.fromEntries(['kinotv-installer.mjs', 'KinoTV.wgt'].map(name => [name, fs.readFileSync(require('node:path').join(${JSON.stringify(releaseDir)}, name))])) : {
  'kinotv-installer.mjs': "import fs from 'node:fs'; fs.appendFileSync(process.env.CALLS_LOG, 'installer ' + process.argv.slice(2).join(' ') + ' (in ' + process.cwd() + ')\\\\n');\\n",
  'KinoTV.wgt': 'wgt',
};
const manifestFile = ${JSON.stringify(releaseDir)} && require('node:path').join(${JSON.stringify(releaseDir)}, 'SHA256SUMS');
files.SHA256SUMS = manifestFile && fs.existsSync(manifestFile) ? fs.readFileSync(manifestFile) : Object.entries(files)
  .filter(([name]) => name !== ${JSON.stringify(omit)})
  .map(([name, data]) => crypto.createHash('sha256').update(data).digest('hex').toUpperCase() + (${binary} ? ' *' : '  ') + name).join('\\r\\n') + '\\r\\n';
if (${JSON.stringify(manifest)} !== undefined) files.SHA256SUMS = ${JSON.stringify(manifest)};
if (${JSON.stringify(corrupt)}) files[${JSON.stringify(corrupt)}] = 'corrupted payload';
fs.writeFileSync(out, files[url.split('/').pop()]);
`,
  );
}

const installSh = (file: string, args: string[] = [], env: Record<string, string> = {}) =>
  sandbox.run('/bin/bash', [file, ...args], '', { CALLS_LOG: join(sandbox.paths.box, 'calls.log'), ...env });

describe('install.sh', () => {
  it("downloads the installer and the app from the repo's latest release, then runs it in ~/KinoTV", () => {
    fakeGitHub();

    const { code } = installSh(stampedInstallSh());

    expect(code).toBe(0);
    const dir = join(home, 'KinoTV');
    expect(calls()).toEqual([
      'curl -fLsS https://api.github.com/repos/someone/kinotv/releases/latest',
      `curl -fL --progress-bar -o ${dir}/SHA256SUMS https://github.com/someone/kinotv/releases/download/v1.4.0/SHA256SUMS`,
      `curl -fL --progress-bar -o ${dir}/kinotv-installer.mjs https://github.com/someone/kinotv/releases/download/v1.4.0/kinotv-installer.mjs`,
      `curl -fL --progress-bar -o ${dir}/KinoTV.wgt https://github.com/someone/kinotv/releases/download/v1.4.0/KinoTV.wgt`,
      `installer --wgt ${dir}/KinoTV.wgt --release v1.4.0 (in ${realpathSync(dir)})`,
    ]);
  });

  it('uses --wgt independently of the selected release and verifies only the downloaded module', () => {
    fakeGitHub();
    const wgt = join(project, 'My KinoTV.wgt');
    writeFileSync(wgt, 'wgt');

    const { code, out } = installSh(stampedInstallSh(), ['--release', 'v1.3.0', '--wgt', wgt]);

    expect(code).toBe(0);
    expect(calls().filter((c) => c.startsWith('curl'))).toHaveLength(2);
    expect(calls().some((c) => c.includes('/latest'))).toBe(false);
    expect(calls().filter((c) => c.startsWith('curl')).every((c) => c.includes('/download/v1.3.0/'))).toBe(true);
    expect(out).toContain('Verified kinotv-installer.mjs');
    expect(out).toContain('not verified against release SHA256SUMS');
    expect(out).not.toContain('Verified KinoTV.wgt');
    expect(calls()).toContain(`installer --wgt ${wgt} (in ${realpathSync(join(home, 'KinoTV'))})`);
  });

  it('says how to get Node.js when it is missing, and installs nothing itself', () => {
    fakeGitHub();
    rmSync(join(sandbox.paths.bin, 'node'));

    const { code, out } = installSh(stampedInstallSh());

    expect(code).toBe(1);
    expect(out).toContain('Node.js');
    expect(out).toContain('https://nodejs.org');
    expect(calls()).toEqual([]);
  });

  it('explains a failed download', () => {
    fakeGitHub({ failFor: 'KinoTV.wgt' });

    const { code, out } = installSh(stampedInstallSh());

    expect(code).toBe(1);
    expect(out).toContain("Couldn't download KinoTV.wgt from https://github.com/someone/kinotv/releases/download/v1.4.0");
    expect(calls().some((c) => c.startsWith('installer'))).toBe(false);
  });

  it('refuses to run from a copy that has no GitHub repo filled in', () => {
    fakeGitHub();

    const { code, out } = installSh(stampedInstallSh(null));

    expect(code).toBe(1);
    expect(out).toContain('Download install.sh from the Releases page');
    expect(calls()).toEqual([]);
  });

  it('can be pointed at another fork with KINOTV_GITHUB_REPO', () => {
    fakeGitHub();

    installSh(stampedInstallSh(null), [], { KINOTV_GITHUB_REPO: 'fork/kinotv' });

    expect(calls()[0]).toContain('https://api.github.com/repos/fork/kinotv/releases/latest');
  });

  it.each(['kinotv-installer.mjs', 'KinoTV.wgt'])('rejects corrupted %s before running the installer', (corrupt) => {
    fakeGitHub({ corrupt });
    const { code, out } = installSh(stampedInstallSh());
    expect(code).toBe(1);
    expect(out).toContain(`Cannot verify ${corrupt}: SHA256 mismatch`);
    expect(calls().some((c) => c.startsWith('installer'))).toBe(false);
  });

  it.each([
    '',
    `${'0'.repeat(64)}  prefix-kinotv-installer.mjs\n`,
    `${'0'.repeat(64)}  kinotv-installer.mjs.backup\n`,
    `${'0'.repeat(64)}  ./kinotv-installer.mjs\n`,
    `not-a-hash  kinotv-installer.mjs\n`,
    `${'0'.repeat(64)}  kinotv-installer.mjs\n${'0'.repeat(64)} *kinotv-installer.mjs\n`,
  ])('requires one valid exact filename checksum entry (%s)', (manifest) => {
    fakeGitHub({ manifest });
    const { code, out } = installSh(stampedInstallSh());
    expect(code).toBe(1);
    expect(out).toContain('Cannot verify kinotv-installer.mjs: missing or duplicate');
    expect(calls().some((c) => c.startsWith('installer'))).toBe(false);
  });

  it('fails closed when the checksum manifest download fails', () => {
    fakeGitHub({ failFor: 'SHA256SUMS' });
    const { code } = installSh(stampedInstallSh());
    expect(code).toBe(1);
    expect(calls().some((c) => c.includes('/kinotv-installer.mjs'))).toBe(false);
  });

  it('refuses a widget without a checksum even after verifying the module', () => {
    fakeGitHub({ omit: 'KinoTV.wgt' });
    const { code, out } = installSh(stampedInstallSh());
    expect(code).toBe(1);
    expect(out).toContain('Verified kinotv-installer.mjs');
    expect(out).toContain('Cannot verify KinoTV.wgt: missing or duplicate');
    expect(calls().some((c) => c.startsWith('installer'))).toBe(false);
  });

  it('accepts standard binary-marker checksums and downloads an explicitly selected release without resolving latest', () => {
    fakeGitHub({ binary: true });
    const { code, out } = installSh(stampedInstallSh(), ['--release', 'v1.3.0']);
    expect(code, out).toBe(0);
    expect(calls().some((c) => c.includes('/latest'))).toBe(false);
    expect(calls().filter((c) => c.startsWith('curl')).every((c) => c.includes('/download/v1.3.0/'))).toBe(true);
    expect(calls()[calls().length - 1]).toContain('--release v1.3.0');
  });

  it.each(['v1.2.3-beta', '../v1.2.3', 'v01.2.3'])('rejects invalid explicit release %s before downloading', (tag) => {
    fakeGitHub();
    const { code, out } = installSh(stampedInstallSh(), ['--release', tag]);
    expect(code).toBe(1);
    expect(out).toContain('Invalid release tag');
    expect(calls()).toEqual([]);
  });

  it.each([['--release'], ['--release', ''], ['--wgt'], ['--wgt', '']])('rejects an option without a value: %j', (...args) => {
    fakeGitHub();
    const { code, out } = installSh(stampedInstallSh(), args);
    expect(code).toBe(1);
    expect(out).toContain('needs');
    expect(calls()).toEqual([]);
  });

  it('runs the generated bootstrap and bundled installer from one selected release through signing and installation', () => {
    writeFileSync(join(project, 'THIRD_PARTY_NOTICES.md'), '# Fixture notices\n');
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'kinotv', version: '1.4.0', kinotv: { githubRepo: 'someone/kinotv' } }));
    writeFileSync(join(project, 'package-lock.json'), JSON.stringify({ version: '1.4.0', packages: { '': { version: '1.4.0' } } }));
    mkdirSync(join(project, 'dist'));
    for (const [name, contents] of Object.entries({ 'config.xml': renderConfigXml({ version: '1.4.0' }), 'index.html': '<!doctype html>', 'icon.png': 'png' })) {
      writeFileSync(join(project, 'dist', name), contents);
    }
    const result = sandbox.node(resolve(import.meta.dirname, 'assemble.ts'), []);
    expect(result.code, result.out).toBe(0);
    fakeGitHub({ releaseDir: join(project, 'dist-release') });
    sandbox.tizenStub(INSTALL_OK);
    stub('sdb', TV_CONNECTED);
    sandbox.saveSettings({ tv: TV, profile: 'KinoTV' }, join(home, 'KinoTV'));

    const { code, out } = installSh(join(project, 'dist-release/install.sh'));

    expect(code, out).toBe(0);
    expect(out).toContain('KinoTV 1.4.0 is installed');
    expect(calls().filter((c) => c.includes('/releases/latest'))).toHaveLength(1);
    expect(calls().filter((c) => c.includes(' --progress-bar ')).every((c) => c.includes('/download/v1.4.0/'))).toBe(true);
    expect(calls()).toContain(`tizen run -p KinoTV0001.KinoTV -s ${TV}:26101`);
  }, 60_000);
});
