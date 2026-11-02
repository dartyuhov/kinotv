import { readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSandbox } from '../tizen/sandbox.ts';

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
function fakeGitHub({ failFor }: { failFor?: string } = {}): void {
  stub(
    'curl',
    `
const fs = require('node:fs');
const url = args[args.length - 1], out = args[args.indexOf('-o') + 1];
if (${JSON.stringify(failFor ?? null)} && url.includes(${JSON.stringify(failFor ?? '')})) { console.error('curl: (22) The requested URL returned error: 404'); process.exit(22); }
if (url.endsWith('/kinotv-installer.mjs')) {
  fs.writeFileSync(out, "import fs from 'node:fs'; fs.appendFileSync(process.env.CALLS_LOG, 'installer ' + process.argv.slice(2).join(' ') + ' (in ' + process.cwd() + ')\\\\n');\\n");
} else {
  fs.writeFileSync(out, 'wgt');
}
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
      `curl -fL --progress-bar -o ${dir}/kinotv-installer.mjs https://github.com/someone/kinotv/releases/latest/download/kinotv-installer.mjs`,
      `curl -fL --progress-bar -o ${dir}/KinoTV.wgt https://github.com/someone/kinotv/releases/latest/download/KinoTV.wgt`,
      `installer --wgt ${dir}/KinoTV.wgt (in ${realpathSync(dir)})`,
    ]);
  });

  it('installs a package the user already has with --wgt, downloading only the installer', () => {
    fakeGitHub();
    const wgt = join(project, 'My KinoTV.wgt');
    writeFileSync(wgt, 'wgt');

    const { code } = installSh(stampedInstallSh(), ['--wgt', wgt]);

    expect(code).toBe(0);
    expect(calls().filter((c) => c.startsWith('curl'))).toHaveLength(1);
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
    expect(out).toContain("Couldn't download KinoTV.wgt from https://github.com/someone/kinotv/releases/latest");
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

    expect(calls()[0]).toContain('https://github.com/fork/kinotv/releases/latest/download/kinotv-installer.mjs');
  });
});
