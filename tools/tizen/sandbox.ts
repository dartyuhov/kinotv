// Test helper (not a test): runs the Tizen tools as subprocesses against a sandbox. The sandbox is a temp
// project folder, a temp HOME, and a PATH that holds only `node` and the stub tools a test puts there.
// Nothing real (Tizen CLI, sdb, a TV) is needed. Stubs append their arguments to calls.log, so tests
// can check what was run.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach } from 'vitest';

export const FFLATE = resolve(import.meta.dirname, '../../node_modules/fflate/lib/node.cjs');
export const TV = '192.0.2.10'; // TEST-NET-1: documentation-only address

export interface SandboxPaths {
  box: string;
  /** The only folder on PATH. */
  bin: string;
  /** The working directory the tool runs in. */
  project: string;
  home: string;
}

/** Registers beforeEach/afterEach that give every test a fresh sandbox. */
export function useSandbox() {
  const paths: SandboxPaths = { box: '', bin: '', project: '', home: '' };

  beforeEach(() => {
    paths.box = mkdtempSync(join(tmpdir(), 'kinotv-cli-'));
    paths.bin = join(paths.box, 'bin');
    paths.project = join(paths.box, 'project');
    paths.home = join(paths.box, 'home');
    for (const dir of [paths.bin, paths.project, paths.home]) mkdirSync(dir);
    symlinkSync(process.execPath, join(paths.bin, 'node'));
  });

  afterEach(() => rmSync(paths.box, { recursive: true, force: true }));

  /** A stub tool written in JavaScript. `body` sees `args` (argv without node and script) and `log`. */
  function stub(name: string, body: string): void {
    const path = join(paths.bin, name);
    writeFileSync(
      path,
      `#!${process.execPath}
const args = process.argv.slice(2);
require('node:fs').appendFileSync(${JSON.stringify(join(paths.box, 'calls.log'))}, ${JSON.stringify(name)} + ' ' + args.join(' ') + '\\n');
${body}
`,
    );
    chmodSync(path, 0o755);
  }

  function calls(): string[] {
    const log = join(paths.box, 'calls.log');
    return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  }

  /** Runs `command args` in the project folder with the sandbox's PATH and HOME. */
  function run(command: string, args: string[], input = '', env: Record<string, string> = {}) {
    const result = spawnSync(command, args, {
      cwd: paths.project,
      input,
      encoding: 'utf8',
      env: { PATH: paths.bin, HOME: paths.home, TIZEN_HOME: join(paths.home, 'tizen-studio'), ...env },
    });
    return { code: result.status, out: `${result.stdout}${result.stderr}` };
  }

  /** Runs a Node script (TypeScript or a bundle) with the sandbox's node. */
  function node(script: string, args: string[], input = '', env: Record<string, string> = {}) {
    return run(join(paths.bin, 'node'), [script, ...args], input, env);
  }

  function saveSettings(settings: { tv?: string; profile?: string }, dir = paths.project): void {
    mkdirSync(join(dir, 'tizen/.signing'), { recursive: true });
    writeFileSync(join(dir, 'tizen/.signing/settings.json'), JSON.stringify(settings));
  }

  function savedSettings(dir = paths.project): unknown {
    return JSON.parse(readFileSync(join(dir, 'tizen/.signing/settings.json'), 'utf8'));
  }

  /** A Tizen CLI with one security profile, "KinoTV". `package -o out -- dir` signs dir into out/KinoTV.wgt. */
  function tizenStub(extra = ''): void {
    stub(
      'tizen',
      `
if (args[0] === 'version') console.log('Tizen CLI 2.5.25');
if (args[0] === 'security-profiles' && args[1] === 'list') console.log('[Profile Name]   [Active]\\nKinoTV           O');
if (args[0] === 'package') {
  const fs = require('node:fs'), path = require('node:path');
  const { zipSync } = require(${JSON.stringify(FFLATE)});
  const dir = args[args.indexOf('--') + 1], out = args[args.indexOf('-o') + 1];
  const files = { 'author-signature.xml': Buffer.from('<signed/>') };
  for (const name of fs.readdirSync(dir, { recursive: true })) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isFile()) files[name.split(path.sep).join('/')] = fs.readFileSync(full);
  }
  fs.writeFileSync(path.join(out, 'KinoTV.wgt'), zipSync(files));
  console.log('Package File Location: ' + path.join(out, 'KinoTV.wgt'));
}
${extra}
`,
    );
  }

  return { paths, stub, calls, run, node, saveSettings, savedSettings, tizenStub };
}

// sdb that never finds a TV: connect fails, devices lists nothing.
export const NO_TV = `
if (args[0] === 'connect') console.log('failed to connect to ' + args[1] + ':26101');
if (args[0] === 'devices') console.log('List of devices attached ');
`;

// sdb with the TV connected. Debug launches report port 34541.
export const TV_CONNECTED = `
if (args[0] === 'connect') console.log('connected to ${TV}:26101');
if (args[0] === 'devices') console.log('List of devices attached \\n${TV}:26101      device          QE55Q60CAU');
if (args.includes('getduid')) console.log('FAKE-DUID-0001');
if (args.includes('debug')) console.log('... successfully launched pid = 12915 with debug 1 port: 34541');
`;

/** `tizen install` that reports success, as the real CLI does. */
export const INSTALL_OK = `if (args[0] === 'install') console.log('Tizen application is successfully installed.');`;
