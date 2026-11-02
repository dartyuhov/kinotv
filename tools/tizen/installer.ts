// The end-user installer (spec §11). `tools/install.sh` downloads it from a GitHub release, as one bundled
// file (kinotv-installer.mjs, see tools/release/assemble.ts), together with the unsigned KinoTV.wgt, and
// runs it:
//
//   node kinotv-installer.mjs --wgt KinoTV.wgt
//
// It runs the setup wizard's steps (tools/tizen/setup.ts): Tizen tools, TV Developer Mode and connection,
// the TV's DUID and the Samsung certificate. Then it signs the release package with the user's own
// certificate profile and installs and launches it. Settings (TV address, profile name) are kept in
// tizen/.signing/settings.json under the working directory, so running it again to update asks nothing.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { APP_ID, APP_NAME, PACKAGE_ID } from './configXml.ts';
import { heading, ok, print, runMain, setSetupCommand, style, UserError } from './host.ts';
import { readDuid, setUpCertificate, setUpTools, setUpTv } from './setup.ts';
import { install, launch, signWidget } from './tv.ts';
import { extractWgt } from './wgt.ts';

const STEPS = 5;
const step = (n: number, title: string) => heading(`Step ${n}/${STEPS} · ${title}`);

/** Checks that `file` is a KinoTV package before anything touches the TV, and returns its version. */
function checkPackage(file: string): string {
  if (!existsSync(file)) {
    throw new UserError(`No KinoTV package at ${file}.`, ['Run `bash install.sh` again to download it.']);
  }
  const notKinoTv = new UserError(`${file} is not a KinoTV package.`, ['Run `bash install.sh` again to download the release package.']);
  let configXml: string;
  try {
    const entries = unzipSync(readFileSync(file));
    if (Object.keys(entries).some((path) => path.split('/').includes('..') || path.startsWith('/'))) throw notKinoTv;
    configXml = Buffer.from(entries['config.xml'] ?? []).toString('utf8');
  } catch {
    throw notKinoTv;
  }
  const version = /<widget\b[^>]*\sversion="([^"]+)"/.exec(configXml)?.[1];
  if (!configXml.includes(`id="${APP_ID}"`) || !configXml.includes(`package="${PACKAGE_ID}"`) || !version) throw notKinoTv;
  return version;
}

async function main(argv: string[]): Promise<void> {
  const index = argv.indexOf('--wgt');
  const wgt = resolve(index >= 0 && argv[index + 1] ? argv[index + 1]! : `${APP_NAME}.wgt`);
  const version = checkPackage(wgt);

  print(style.bold(`KinoTV ${version} · installer`));
  print('Installs KinoTV on your Samsung TV, signed with your own Samsung certificate. Safe to run again.');

  step(1, 'Tizen tools');
  const tools = await setUpTools();

  step(2, 'TV Developer Mode and connection');
  const tv = await setUpTv(tools.sdb);

  step(3, "The TV's device ID (DUID)");
  readDuid(tools.sdb, tv);

  step(4, 'Samsung certificate');
  const profile = await setUpCertificate(tools.tizen, tv);

  step(5, `Sign and install KinoTV ${version}`);
  const outDir = resolve('signed');
  const unpacked = join(outDir, 'release');
  rmSync(unpacked, { recursive: true, force: true });
  extractWgt(wgt, unpacked);
  const signed = signWidget(tools.tizen, profile, unpacked, outDir);
  rmSync(unpacked, { recursive: true, force: true });
  ok(`Signed with profile "${profile}"`);
  install(tools.tizen, tv, signed);
  launch(tools.tizen, tv);

  heading(`${style.green('✓')} KinoTV ${version} is installed on ${tv.name}.`);
  print('It is in Apps on the TV. To update later, run `bash install.sh` again.');
}

setSetupCommand('`bash install.sh`');
await runMain(() => main(process.argv.slice(2)));
