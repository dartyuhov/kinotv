import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { NO_TV, TV, TV_CONNECTED, useSandbox } from './sandbox.ts';

// These tests run the real CLI as a subprocess against a sandbox of stub tools (see sandbox.ts).

const CLI = resolve(import.meta.dirname, 'cli.ts');

const { paths, stub, calls, node, saveSettings, savedSettings, tizenStub } = useSandbox();
let box: string;
let project: string;
beforeEach(() => ({ box, project } = paths));

const cli = (args: string[], input = '') => node(CLI, args, input);

describe('npm run tv', () => {
  it('stops with setup instructions when the Tizen CLI is not installed', () => {
    const { code, out } = cli(['tv']);

    expect(code).toBe(1);
    expect(out).toMatch(/Tizen CLI \(tizen\).* not found/);
    expect(out).toContain('npm run tv:setup');
  });

  it('stops with a Developer Mode checklist when the TV is not reachable, before building anything', () => {
    tizenStub();
    stub('sdb', NO_TV);
    saveSettings({ tv: TV, profile: 'KinoTV' });

    const { code, out } = cli(['tv']);

    expect(code).toBe(1);
    expect(out).toContain(`Can't reach the TV at ${TV}`);
    expect(out).toContain('Developer Mode');
    expect(out).toContain('npm run tv:setup');
    expect(calls().filter((c) => /^tizen (package|install|run)/.test(c) || c.startsWith('npm'))).toEqual([]);
  });

  it('stops and points at the wizard when no TV has been set up yet', () => {
    tizenStub();
    stub('sdb', NO_TV);

    const { code, out } = cli(['tv']);

    expect(code).toBe(1);
    expect(out).toContain('No TV address saved');
    expect(out).toContain('npm run tv:setup');
  });

  it('stops before building when no certificate profile is set up', () => {
    tizenStub();
    stub('sdb', TV_CONNECTED);
    saveSettings({ tv: TV });

    const { code, out } = cli(['tv']);

    expect(code).toBe(1);
    expect(out).toContain('No security profile saved');
    expect(calls().filter((c) => c.startsWith('npm'))).toEqual([]);
  });

  it('builds, signs, installs and launches the app on the connected TV', () => {
    tizenStub(`if (args[0] === 'install') console.log('Tizen application is successfully installed.');`);
    stub('sdb', TV_CONNECTED);
    stub('npm', BUILD);
    saveSettings({ tv: TV, profile: 'KinoTV' });

    const { code, out } = cli(['tv']);

    expect(code).toBe(0);
    expect(calls().filter((c) => !c.startsWith('sdb') && !c.includes('security-profiles'))).toEqual([
      'npm run build',
      expect.stringMatching(/^tizen package -t wgt -s KinoTV -o \S+dist-tizen -- /),
      expect.stringMatching(new RegExp(`^tizen install -n KinoTV.wgt -s ${TV}:26101 -- \\S+dist-tizen$`)),
      `tizen run -p KinoTV0001.KinoTV -s ${TV}:26101`,
    ]);
    expect(out).toContain('Launched KinoTV on QE55Q60CAU');
  });

  it('in debug mode, launches with the inspector and prints the DevTools address', () => {
    tizenStub(`if (args[0] === 'install') console.log('Tizen application is successfully installed.');`);
    stub('sdb', TV_CONNECTED);
    stub('npm', BUILD);
    saveSettings({ tv: TV, profile: 'KinoTV' });

    const { code, out } = cli(['tv', '--debug']);

    expect(code).toBe(0);
    expect(calls()).toEqual(
      expect.arrayContaining([
        `sdb -s ${TV}:26101 shell 0 debug KinoTV0001.KinoTV`,
        `sdb -s ${TV}:26101 forward tcp:34541 tcp:34541`,
      ]),
    );
    expect(calls().filter((c) => c.startsWith('tizen run'))).toEqual([]);
    expect(out).toContain('http://localhost:34541');
  });

  it('explains an install the TV rejected, even though the Tizen CLI exits with 0', () => {
    tizenStub(`if (args[0] === 'install') console.log('app_id[KinoTV0001] install failed[118, -11], reason: Author certificate not match :');`);
    stub('sdb', TV_CONNECTED);
    stub('npm', BUILD);
    saveSettings({ tv: TV, profile: 'KinoTV' });

    const { code, out } = cli(['tv']);

    expect(code).toBe(1);
    expect(out).toContain('The TV refused to install KinoTV');
    expect(out).toContain('tizen uninstall -p KinoTV0001.KinoTV');
    expect(calls().filter((c) => c.startsWith('tizen run'))).toEqual([]);
  });
});

/** Platform probes for an Apple Silicon Mac; `arch -x86_64` only works when Rosetta is installed. */
function appleSilicon({ rosetta }: { rosetta: boolean }) {
  stub('uname', `console.log(args[0] === '-s' ? 'Darwin' : 'arm64');`);
  stub('sysctl', `console.log('1');`);
  stub('arch', rosetta ? '' : `console.error('Bad CPU type in executable'); process.exit(1);`);
}

describe('npm run tv:setup', () => {
  it('on an Apple Silicon Mac without Rosetta, stops with the command to install it when the user declines', () => {
    appleSilicon({ rosetta: false });

    const { code, out } = cli(['setup'], 'n\n');

    expect(code).toBe(1);
    expect(out).toContain('Rosetta');
    expect(out).toContain('softwareupdate --install-rosetta --agree-to-license');
  });

  it('when the Tizen CLI is missing, says where to download it and stops if no installer is given', () => {
    appleSilicon({ rosetta: true });

    const { code, out } = cli(['setup']);

    expect(code).toBe(1);
    expect(out).toContain('Tizen CLI (tizen) is not installed');
    expect(out).toContain('https://samsungtizenos.com/tools-download/');
    expect(out).toContain('TIZEN_HOME');
  });

  it('runs a downloaded Tizen CLI installer into $TIZEN_HOME and carries on', () => {
    appleSilicon({ rosetta: true });
    const installer = join(box, 'web-cli_Tizen_SDK_10.0_macos-64.bin');
    // Installs a working tizen and sdb into the folder it is given.
    writeFileSync(
      installer,
      `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
fs.appendFileSync(${JSON.stringify(join(box, 'calls.log'))}, 'installer ' + process.argv.slice(2).join(' ') + '\\n');
const home = process.argv[3];
for (const [rel, body] of [['tools/ide/bin/tizen', "console.log('Tizen CLI 2.5.25')"], ['tools/sdb', '']]) {
  fs.mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
  fs.writeFileSync(path.join(home, rel), '#!${process.execPath}\\n' + body + '\\n', { mode: 0o755 });
}
`,
    );

    const { code, out } = cli(['setup'], `${installer}\n\n`);

    expect(calls()).toContain(`installer --accept-license ${join(box, 'home', 'tizen-studio')}`);
    expect(out).toContain('✓ Tizen CLI: Tizen CLI 2.5.25');
    // It moves on to the TV, which this sandbox has no answer for.
    expect(out).toContain('Developer Mode');
    expect(code).toBe(1);
  });

  it("stops with a Developer Mode checklist when the TV can't be reached, and remembers the address", () => {
    tizenStub();
    stub('sdb', NO_TV);

    const { code, out } = cli(['setup'], `${TV}\n`);

    expect(code).toBe(1);
    expect(out).toContain(`Can't reach the TV at ${TV}`);
    expect(out).toContain('1 2 3 4 5');
    expect(savedSettings()).toEqual({ tv: TV });
  });

  it("asks again when the TV's address is not an IP address", () => {
    tizenStub();
    stub('sdb', NO_TV);

    const { out } = cli(['setup'], `my-tv\n${TV}\n`);

    expect(out).toContain('"my-tv" is not an IP address');
    expect(out).toContain(`Can't reach the TV at ${TV}`);
  });

  it("reads the TV's DUID, guides the certificate and saves the profile", () => {
    tizenStub();
    stub('sdb', TV_CONNECTED);

    const { code, out } = cli(['setup'], `${TV}\n\n`);

    expect(code).toBe(0);
    expect(out).toContain('✓ Connected to QE55Q60CAU');
    expect(out).toContain('FAKE-DUID-0001');
    expect(out).toContain('Certificate Manager');
    expect(out).toContain('Setup complete');
    expect(out).toContain('npm run tv');
    expect(savedSettings()).toEqual({ tv: TV, profile: 'KinoTV' });
    expect(calls()).toContain('tizen install-permit -t QE55Q60CAU');
  });

  it('skips the questions it already has answers for on a second run', () => {
    tizenStub();
    stub('sdb', TV_CONNECTED);
    saveSettings({ tv: TV, profile: 'KinoTV' });

    const { code, out } = cli(['setup']);

    expect(code).toBe(0);
    expect(out).toContain('✓ Using security profile "KinoTV"');
  });

  it("stops and lists the profiles there are when the named one doesn't exist", () => {
    tizenStub();
    stub('sdb', TV_CONNECTED);

    const { code, out } = cli(['setup'], `${TV}\nMyCert\n`);

    expect(code).toBe(1);
    expect(out).toContain('Security profile "MyCert" was not found');
    expect(out).toContain('KinoTV');
  });
});

// `npm run build` that writes a minimal widget to dist/.
const BUILD = `
const fs = require('node:fs');
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/config.xml', '<widget version="0.1.0"/>');
fs.writeFileSync('dist/index.html', '<!doctype html>');
`;

/** A minimal built widget in project/dist (the real build is covered by package.test.ts). */
function fakeBuild(): void {
  mkdirSync(join(project, 'dist/assets'), { recursive: true });
  writeFileSync(join(project, 'dist/config.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<widget version="0.1.0"/>\n');
  writeFileSync(join(project, 'dist/index.html'), '<!doctype html>');
  writeFileSync(join(project, 'dist/icon.png'), 'png');
  writeFileSync(join(project, 'dist/assets/index-abc.js'), '');
}

function packagedFiles(): string[] {
  return Object.keys(unzipSync(readFileSync(join(project, 'dist-tizen/KinoTV.wgt')))).sort();
}

describe('npm run package', () => {
  it('makes an unsigned .wgt without any Tizen tools, and says how to get a signed one', () => {
    fakeBuild();

    const { code, out } = cli(['package']);

    expect(code).toBe(0);
    expect(packagedFiles()).toEqual(['assets/index-abc.js', 'config.xml', 'icon.png', 'index.html']);
    expect(out).toContain('Unsigned package: dist-tizen/KinoTV.wgt');
    expect(out).toContain('npm run tv:setup');
  });

  it('signs the package with the saved profile when the Tizen CLI is installed', () => {
    fakeBuild();
    tizenStub();
    saveSettings({ profile: 'KinoTV' });

    const { code, out } = cli(['package']);

    expect(code).toBe(0);
    expect(packagedFiles()).toEqual(['assets/index-abc.js', 'author-signature.xml', 'config.xml', 'icon.png', 'index.html']);
    expect(out).toContain('Signed package: dist-tizen/KinoTV.wgt (profile "KinoTV")');
    expect(calls()).toContainEqual(expect.stringMatching(/^tizen package -t wgt -s KinoTV /));
  });

  it('falls back to an unsigned package when the saved profile is not in the Tizen CLI', () => {
    fakeBuild();
    tizenStub();
    saveSettings({ profile: 'Renamed' });

    const { code, out } = cli(['package']);

    expect(code).toBe(0);
    expect(packagedFiles()).not.toContain('author-signature.xml');
    expect(out).toContain('Security profile "Renamed" was not found');
    expect(out).toContain('Unsigned package');
  });

  it('asks for a build first when there is none', () => {
    const { code, out } = cli(['package']);

    expect(code).toBe(1);
    expect(out).toContain('npm run build');
  });
});
