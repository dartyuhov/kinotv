import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { APP_ID, APP_NAME } from './configXml.ts';
import { findTool, loadSettings, ok, print, run, runAttached, setupCommand, UserError, warn } from './host.ts';
import { copyWidget, createUnsignedWgt } from './wgt.ts';

export interface TizenTools {
  tizen: string;
  sdb: string;
}

export function requireTools(): TizenTools {
  const tizen = findTool('tizen');
  const sdb = findTool('sdb');
  const missing = [!tizen && 'Tizen CLI (tizen)', !sdb && 'sdb'].filter(Boolean).join(' and ');
  if (!tizen || !sdb) {
    throw new UserError(`${missing} not found.`, [
      `Run ${setupCommand()} to install or locate the Tizen tools.`,
      'They are looked up on PATH and in $TIZEN_HOME (default ~/tizen-studio).',
    ]);
  }
  return { tizen, sdb };
}

/** This Mac's LAN IPv4 addresses: what the TV's Developer Mode "Host PC IP" must be set to. */
function hostAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => net!.address);
}

export function developerModeSteps(): string[] {
  const ips = hostAddresses();
  return [
    '1. Turn the TV on. The TV and this Mac must be on the same network.',
    '2. On the TV open Apps, then press 1 2 3 4 5 on the remote (or the on-screen keypad).',
    `3. Set Developer Mode to On and enter this Mac's IP as Host PC IP: ${ips.length ? ips.join(' or ') : '(no network address found)'}.`,
    '4. Restart the TV: hold the power button on the remote until it restarts. "Develop Mode" then shows in Apps.',
    "5. Check the TV's IP in Settings → General → Network → Network Status → IP Settings.",
  ];
}

export interface ConnectedTv {
  /** What sdb and the Tizen CLI call the device: "<ip>:26101". */
  serial: string;
  /** The TV's model name as reported by sdb, e.g. QE55Q60CAU. */
  name: string;
}

/** `sdb devices` lines look like "192.168.1.50:26101      device          QE55Q60CAU". */
function findDevice(devicesOutput: string, serial: string): { state: string; name: string } | null {
  for (const line of devicesOutput.split('\n')) {
    const [id, state, name] = line.trim().split(/\s+/);
    if (id === serial && state) return { state, name: name ?? 'TV' };
  }
  return null;
}

/** Connects sdb to the TV. Throws a checklist the user can follow when the TV can't be reached. */
export function connectTv(sdb: string, address: string): ConnectedTv {
  const serial = address.includes(':') ? address : `${address}:26101`;
  run(sdb, ['connect', serial]); // its exit code and output vary by version; `sdb devices` is the truth
  const device = findDevice(run(sdb, ['devices']).output, serial);
  if (device?.state === 'device') return { serial, name: device.name };
  throw new UserError(`Can't reach the TV at ${address}${device ? ` (sdb says "${device.state}")` : ''}.`, [
    ...developerModeSteps(),
    `Then run ${setupCommand()} again (or check the saved address in tizen/.signing/settings.json).`,
  ]);
}

function requireTv(sdb: string): ConnectedTv {
  const { tv } = loadSettings();
  if (!tv) {
    throw new UserError('No TV address saved.', [`Run ${setupCommand()} to connect a TV, or set KINOTV_TV=<tv-ip>.`]);
  }
  const connected = connectTv(sdb, tv);
  ok(`Connected to ${connected.name} (${connected.serial})`);
  return connected;
}

/** Names from `tizen security-profiles list`: the first word of each line, without the table chrome. */
export function listProfiles(tizen: string): string[] {
  return run(tizen, ['security-profiles', 'list'])
    .output.split('\n')
    .map((line) => line.trim().split(/\s+/)[0] ?? '')
    .filter((name) => name && !/^[[=-]/.test(name));
}

const WGT_NAME = `${APP_NAME}.wgt`;

interface Packaged {
  file: string;
  signedWith: string | null;
}

/** Signs a copy of the widget folder with `tizen package`, into outDir/KinoTV.wgt. */
export function signWidget(tizen: string, profile: string, appDir: string, outDir: string): string {
  const stage = join(outDir, 'widget');
  rmSync(stage, { recursive: true, force: true });
  copyWidget(appDir, stage); // tizen package writes its signature files into the folder it signs
  const result = run(tizen, ['package', '-t', 'wgt', '-s', profile, '-o', outDir, '--', stage]);
  rmSync(stage, { recursive: true, force: true });
  const file = join(outDir, WGT_NAME);
  const signed = existsSync(file) && 'author-signature.xml' in unzipSync(readFileSync(file));
  if (result.code !== 0 || !signed) {
    throw new UserError(`tizen package could not sign the app with profile "${profile}".`, [
      ...result.output.trim().split('\n').map((line) => `| ${line}`),
      `Check the certificate passwords with \`tizen security-profiles list\`, or recreate the profile with ${setupCommand()}.`,
    ]);
  }
  return file;
}

/**
 * Packages a built widget folder into outDir/KinoTV.wgt: signed when the Tizen CLI and the saved security
 * profile are available, otherwise unsigned (made with Node, no Tizen tools needed).
 */
export function packageWidget(appDir: string, outDir: string, signing: { required: boolean }): Packaged {
  if (!existsSync(join(appDir, 'config.xml'))) {
    throw new UserError(`No built app in ${relative(process.cwd(), appDir) || '.'}.`, ['Run `npm run build` first (`npm run package` does both).']);
  }
  mkdirSync(outDir, { recursive: true });
  rmSync(join(outDir, WGT_NAME), { force: true });

  const tizen = findTool('tizen');
  const { profile } = loadSettings();
  let whyUnsigned: string;
  if (!tizen) whyUnsigned = 'the Tizen CLI is not installed';
  else if (!profile) whyUnsigned = 'no security profile is saved';
  else if (!listProfiles(tizen).includes(profile)) {
    whyUnsigned = `security profile "${profile}" was not found in the Tizen CLI`;
    warn(`Security profile "${profile}" was not found in the Tizen CLI (\`tizen security-profiles list\`).`);
  } else {
    return { file: signWidget(tizen, profile, appDir, outDir), signedWith: profile };
  }

  if (signing.required) {
    throw new UserError(`Can't make a signed package: ${whyUnsigned}.`, [
      'A TV only installs packages signed with a Samsung certificate for that TV.',
      `Run ${setupCommand()} to create or select the certificate profile.`,
    ]);
  }
  const file = join(outDir, WGT_NAME);
  createUnsignedWgt(appDir, file);
  return { file, signedWith: null };
}

function describePackage({ file, signedWith }: Packaged): void {
  const where = relative(process.cwd(), file);
  if (signedWith) {
    ok(`Signed package: ${where} (profile "${signedWith}")`);
  } else {
    ok(`Unsigned package: ${where}`);
    print(`  A TV only installs signed packages. Run ${setupCommand()} to set up a Samsung certificate,`);
    print('  then `npm run package` signs it, or `npm run tv` signs, installs and launches it.');
  }
}

export async function packageCommand(options: { from?: string; out?: string }): Promise<void> {
  const appDir = resolve(options.from ?? 'dist');
  const outDir = resolve(options.out ?? 'dist-tizen');
  describePackage(packageWidget(appDir, outDir, { required: false }));
}

function requireProfile(tizen: string): string {
  const { profile } = loadSettings();
  if (!profile) {
    throw new UserError('No security profile saved.', [
      'The TV only installs apps signed with a Samsung certificate made for it.',
      `Run ${setupCommand()} to create one, or set KINOTV_TIZEN_PROFILE=<profile name>.`,
    ]);
  }
  if (!listProfiles(tizen).includes(profile)) {
    throw new UserError(`Security profile "${profile}" was not found in the Tizen CLI.`, [
      `See the profiles you have with \`tizen security-profiles list\`, then run ${setupCommand()} again.`,
    ]);
  }
  return profile;
}

/** Reasons the TV gives for refusing a package, from Samsung's docs and common reports. */
function installFailureSteps(output: string): string[] {
  if (/118,\s*-11|author certificate not match/i.test(output)) {
    return [
      'KinoTV is already on the TV, signed with a different author certificate. Remove it first:',
      `  tizen uninstall -p ${APP_ID} -s <tv-ip>:26101   (or delete it from Apps on the TV), then run this again.`,
    ];
  }
  if (/118,\s*-12|invalid certificate chain|1010/i.test(output)) {
    return [
      "The certificate doesn't allow this TV. Its distributor certificate must list this TV's DUID.",
      `Run ${setupCommand()} to read the DUID and recreate the Samsung certificate.`,
    ];
  }
  return [
    'Read the log above for the reason. Removing the old app first can help:',
    `  tizen uninstall -p ${APP_ID} -s <tv-ip>:26101`,
  ];
}

export function install(tizen: string, tv: ConnectedTv, wgt: string): void {
  const result = run(tizen, ['install', '-n', WGT_NAME, '-s', tv.serial, '--', dirname(wgt)]);
  // The Tizen CLI can report a failed install and still exit with 0, so read what it says.
  if (result.code !== 0 || /install failed|failed\[|cmd_ret:\s*[1-9]/i.test(result.output)) {
    print(result.output.trim());
    throw new UserError(`The TV refused to install ${APP_NAME}.`, installFailureSteps(result.output));
  }
  ok(`Installed on ${tv.name}`);
}

export function launch(tizen: string, tv: ConnectedTv): void {
  const result = run(tizen, ['run', '-p', APP_ID, '-s', tv.serial]);
  if (result.code !== 0 || /fail|error/i.test(result.output)) {
    print(result.output.trim());
    throw new UserError(`${APP_NAME} is installed but did not start.`, ['Open it from Apps on the TV.']);
  }
  ok(`Launched ${APP_NAME} on ${tv.name}`);
}

/** Starts the app with the Web Inspector enabled and forwards its port to this Mac. */
function launchForDebugging(sdb: string, tv: ConnectedTv): void {
  const result = run(sdb, ['-s', tv.serial, 'shell', '0', 'debug', APP_ID]);
  const port = /port:\s*(\d+)/.exec(result.output)?.[1];
  if (!port) {
    print(result.output.trim());
    throw new UserError(`${APP_NAME} did not start in debug mode.`, ['Close the app on the TV and run `npm run tv:debug` again.']);
  }
  run(sdb, ['-s', tv.serial, 'forward', `tcp:${port}`, `tcp:${port}`]);
  ok(`Launched ${APP_NAME} on ${tv.name} in debug mode`);
  print();
  print(`  DevTools: http://localhost:${port}`);
  print(`  Or open chrome://inspect in Chrome → Configure… → add localhost:${port}.`);
  print('  Samsung notes that recent Chrome versions may not work with the TV inspector; an older Chromium helps.');
  print('  The connection closes when the app exits.');
}

export async function tvCommand(options: { debug: boolean; build: boolean }): Promise<void> {
  // Check everything that needs the user first, so a missing TV doesn't cost a build.
  const tools = requireTools();
  const tv = requireTv(tools.sdb);
  requireProfile(tools.tizen);

  if (options.build) {
    print('\nBuilding…');
    if ((await runAttached('npm', ['run', 'build'])) !== 0) throw new UserError('The build failed (see above).');
  }
  const packaged = packageWidget(resolve('dist'), resolve('dist-tizen'), { required: true });
  describePackage(packaged);
  install(tools.tizen, tv, packaged.file);
  if (options.debug) launchForDebugging(tools.sdb, tv);
  else launch(tools.tizen, tv);
}
