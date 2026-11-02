// The setup wizard (spec §11): Tizen tools → TV Developer Mode → sdb connection and DUID → Samsung
// certificate. Safe to re-run: it remembers the TV address and profile and skips what is already done.
import { chmodSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ask, findTool, heading, loadSettings, ok, print, run, runAttached, saveSettings, setupCommand, style, tizenHome, UserError, warn } from './host.ts';
import { connectTv, developerModeSteps, listProfiles, type ConnectedTv, type TizenTools } from './tv.ts';

const STEPS = 4;
const step = (n: number, title: string) => heading(`Step ${n}/${STEPS} · ${title}`);
const DEFAULT_PROFILE = 'KinoTV';

function isAppleSilicon(): boolean {
  return run('uname', ['-s']).output.trim() === 'Darwin' && run('sysctl', ['-n', 'hw.optional.arm64']).output.trim() === '1';
}

/** The Tizen SDK is Intel-only on macOS, so Apple Silicon Macs need Rosetta to run it. */
async function ensureRosetta(): Promise<void> {
  if (!isAppleSilicon()) return;
  if (run('arch', ['-x86_64', '/usr/bin/true']).code === 0) {
    ok('Rosetta is installed');
    return;
  }
  const command = ['softwareupdate', '--install-rosetta', '--agree-to-license'];
  warn("Rosetta isn't installed. The Tizen SDK needs it on Apple Silicon Macs.");
  const answer = await ask(`Install it now? This runs \`sudo ${command.join(' ')}\` (y/N)`);
  if (answer?.toLowerCase().startsWith('y') && (await runAttached('sudo', command)) === 0) {
    ok('Rosetta is installed');
    return;
  }
  throw new UserError('Rosetta is required.', [`Install it with: sudo ${command.join(' ')}`, `Then run ${setupCommand()} again.`]);
}

function workingTizen(): { tizen: string; version: string } | null {
  const tizen = findTool('tizen');
  if (!tizen) return null;
  const result = run(tizen, ['version']);
  return result.code === 0 ? { tizen, version: result.output.trim().split('\n').pop() ?? '' } : null;
}

async function installTizenCli(): Promise<void> {
  const home = tizenHome();
  warn('The Tizen CLI (tizen) is not installed.');
  print('  1. Download the Tizen SDK "CLI installer" for macOS from https://samsungtizenos.com/tools-download/');
  print('     (a file named like web-cli_Tizen_SDK_<version>_macos-64.bin).');
  print(`  2. Give its path below. It installs into $TIZEN_HOME, currently ${home}.`);
  print('     To use another folder, or an SDK you already have, set TIZEN_HOME and run this again.');
  const installer = await ask('Path to the downloaded installer (Enter to stop):');
  if (!installer) {
    throw new UserError('The Tizen CLI (tizen) is not installed.', [
      `Download the CLI installer from https://samsungtizenos.com/tools-download/ and run ${setupCommand()} again,`,
      'or set TIZEN_HOME to an existing Tizen SDK folder (one with tools/ide/bin/tizen and tools/sdb).',
    ]);
  }
  const path = resolve(installer.replace(/^~(?=\/)/, process.env.HOME ?? '~'));
  if (!existsSync(path)) throw new UserError(`No file at ${path}.`, [`Check the path and run ${setupCommand()} again.`]);
  chmodSync(path, 0o755);
  if ((await runAttached(path, ['--accept-license', home])) !== 0) {
    throw new UserError('The Tizen CLI installer failed (see above).', [`Fix the problem it reports and run ${setupCommand()} again.`]);
  }

  // Samsung's certificate tooling is an extra package; its exact package names change between SDK releases.
  print();
  print("  Now add Samsung's TV tools with the SDK package manager:");
  print(`    ${home}/package-manager/package-manager-cli extra --list`);
  print(`    ${home}/package-manager/package-manager-cli extra -act <number of the "Samsung Tizen TV SDK" repository>`);
  print(`    ${home}/package-manager/package-manager-cli show-pkgs`);
  print(`    ${home}/package-manager/package-manager-cli install --accept-license <TV Extensions and Samsung Certificate Extension packages>`);
  print('  (Samsung Certificate Extension must be 2.0.73 or later.)');
  await ask('Press Enter when that is done.', 'done');
}

export async function setUpTools(): Promise<TizenTools> {
  let tizen = workingTizen();
  if (!tizen) {
    await ensureRosetta();
    if (findTool('tizen')) {
      throw new UserError('The Tizen CLI is installed but does not run.', [
        `Try \`${findTool('tizen')} version\` to see why. Reinstalling the Tizen SDK CLI usually fixes it.`,
      ]);
    }
    await installTizenCli();
    tizen = workingTizen();
    if (!tizen) {
      throw new UserError(`The Tizen CLI is still not found in ${tizenHome()}.`, [
        `If the installer used another folder, set TIZEN_HOME to it and run ${setupCommand()} again.`,
      ]);
    }
  }
  ok(`Tizen CLI: ${tizen.version}`);
  const sdb = findTool('sdb');
  if (!sdb) {
    throw new UserError('sdb was not found.', [`It ships with the Tizen SDK in ${tizenHome()}/tools/sdb. Reinstall the SDK or set TIZEN_HOME.`]);
  }
  ok(`sdb: ${sdb}`);
  return { tizen: tizen.tizen, sdb };
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

async function askTvAddress(): Promise<string> {
  for (;;) {
    const answer = await ask("The TV's IP address:", loadSettings().tv ?? '');
    if (!answer) {
      throw new UserError("The TV's IP address is needed.", [
        `Find it on the TV in Settings → General → Network → Network Status → IP Settings, then run ${setupCommand()} again.`,
      ]);
    }
    if (IPV4.test(answer)) return answer;
    warn(`"${answer}" is not an IP address. It looks like 192.168.1.50.`);
  }
}

export async function setUpTv(sdb: string): Promise<ConnectedTv> {
  print('Turn on Developer Mode on the TV if it is not on yet:');
  for (const line of developerModeSteps()) print(`  ${line}`);
  const address = await askTvAddress();
  saveSettings({ tv: address }); // remembered even if the connection fails, for the next run
  const tv = connectTv(sdb, address);
  ok(`Connected to ${tv.name} (${tv.serial})`);
  return tv;
}

export function readDuid(sdb: string, tv: ConnectedTv): void {
  const duid = run(sdb, ['-s', tv.serial, 'shell', '0', 'getduid']).output.trim();
  if (duid && !/error|not found|closed/i.test(duid)) {
    ok(`The TV's DUID: ${style.bold(duid)}`);
    print('  The certificate step below needs it. It is not saved anywhere.');
  } else {
    warn("Couldn't read the DUID over sdb. On the TV it is in Settings → Support → About This TV (or Contact Samsung) → Unique Device ID.");
  }
}

export async function setUpCertificate(tizen: string, tv: ConnectedTv): Promise<string> {
  const saved = loadSettings().profile;
  if (saved && listProfiles(tizen).includes(saved)) {
    ok(`Using security profile "${saved}"`);
    return saved;
  }
  print('A TV only installs apps signed with a Samsung certificate made for that TV. Create one in Certificate Manager:');
  print('  - VS Code with the Samsung "Tizen TV" extension (tizensdk.tizentv): run "Tizen: Run Certificate Manager", or');
  print('  - Tizen Studio: Tools → Certificate Manager.');
  print(`  1. Click + and choose Samsung (not Tizen), then TV. Name the profile, e.g. ${DEFAULT_PROFILE}.`);
  print('  2. Author certificate: create a new one (sign in with your Samsung account). Back up author.p12: updates must use it.');
  print('  3. Distributor certificate: privilege Public, and add the DUID shown above.');
  print('  4. Finish. Certificate Manager saves the profile where the Tizen CLI finds it.');
  const name = await ask('Profile name, once it is created:', saved ?? DEFAULT_PROFILE);
  const profiles = listProfiles(tizen);
  if (!name || !profiles.includes(name)) {
    throw new UserError(`Security profile "${name}" was not found.`, [
      `Profiles the Tizen CLI knows: ${profiles.length ? profiles.join(', ') : 'none'}.`,
      `Finish creating the certificate in Certificate Manager, then run ${setupCommand()} again.`,
    ]);
  }
  saveSettings({ profile: name });
  ok(`Using security profile "${name}"`);

  // Lets the TV accept apps signed with this certificate.
  const permit = run(tizen, ['install-permit', '-t', tv.name]);
  if (permit.code === 0 && !/fail|error/i.test(permit.output)) ok('The TV accepts apps signed with this certificate');
  else warn('`tizen install-permit` did not succeed. If installing fails, use "Permit to install applications" in Device Manager.');
  return name;
}

export async function runSetup(): Promise<void> {
  print(style.bold('KinoTV · TV setup'));
  print('Prepares this Mac and your Samsung TV for `npm run tv`. Safe to run again.');

  step(1, 'Tizen tools');
  const tools = await setUpTools();

  step(2, 'TV Developer Mode and connection');
  const tv = await setUpTv(tools.sdb);

  step(3, "The TV's device ID (DUID)");
  readDuid(tools.sdb, tv);

  step(4, 'Samsung certificate');
  await setUpCertificate(tools.tizen, tv);

  heading(`${style.green('✓')} Setup complete.`);
  print('Run `npm run tv` to build, install and launch KinoTV, or `npm run tv:debug` to debug it from Chrome.');
}
