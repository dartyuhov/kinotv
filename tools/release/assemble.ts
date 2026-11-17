// Makes the files a GitHub release carries, from a production build (`npm run build`):
//
//   npm run release:assets      dist/ → dist-release/{KinoTV.wgt, install.sh, kinotv-installer.mjs, SHA256SUMS}
//
// - KinoTV.wgt: the app, unsigned. Each user signs it with their own Samsung certificate.
// - install.sh: tools/install.sh with the GitHub repo from package.json filled in.
// - kinotv-installer.mjs: tools/tizen/installer.ts and everything it uses (fflate included) bundled into one
//   plain JavaScript file, so users need only Node.js, not this repository or npm.
// - SHA256SUMS: standard sha256sum records for the three completed payloads (not itself).
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { APP_ID, APP_NAME, PACKAGE_ID } from '../tizen/configXml.ts';
import { ok, runMain, UserError } from '../tizen/host.ts';
import { createUnsignedWgt } from '../tizen/wgt.ts';
import { readProject, releaseProjectProblems } from './project.ts';

const TOOLS = resolve(import.meta.dirname, '..');
const ROOT = resolve(TOOLS, '..');
export const INSTALLER_FILE = 'kinotv-installer.mjs';

async function bundleInstaller(outDir: string): Promise<void> {
  const license = ['fflate-mit.txt', 'saxes-isc.txt', 'xmlchars-mit.txt']
    .map((name) => readFileSync(join(ROOT, 'public/licenses', name), 'utf8')).join('\n');
  await build({
    configFile: false,
    root: TOOLS,
    logLevel: 'warn',
    ssr: { noExternal: true, target: 'node' },
    build: {
      ssr: join(TOOLS, 'tizen', 'installer.ts'),
      outDir,
      emptyOutDir: false,
      target: 'node22',
      minify: false, // readable, so anyone can check what they are about to run
      rolldownOptions: {
        output: { format: 'es', entryFileNames: INSTALLER_FILE, codeSplitting: false, banner: `/*!\n${license}*/` },
      },
    },
  });
}

function stampInstallSh(githubRepo: string, outFile: string): void {
  const source = readFileSync(join(TOOLS, 'install.sh'), 'utf8');
  const stamped = source.replace('${KINOTV_GITHUB_REPO:-OWNER/REPO}', `\${KINOTV_GITHUB_REPO:-${githubRepo}}`);
  if (stamped === source) throw new Error('tools/install.sh has no GITHUB_REPO placeholder to fill in.');
  writeFileSync(outFile, stamped);
  chmodSync(outFile, 0o755);
}

async function main(): Promise<void> {
  const appDir = resolve('dist');
  const outDir = resolve('dist-release');
  const project = readProject();
  const { version, githubRepo } = project;
  const problems = releaseProjectProblems(project);
  if (problems.length) throw new UserError('Release source versions are invalid.', problems);

  if (!githubRepo) {
    throw new UserError('The GitHub repo for updates and the installer is not set.', [
      'Set "kinotv": { "githubRepo" } in package.json to the repo releases are published from, e.g. "someone/kinotv".',
    ]);
  }
  if (!existsSync(join(appDir, 'config.xml'))) throw new UserError('No build in dist/.', ['Run `npm run build` first.']);
  const manifest = readFileSync(join(appDir, 'config.xml'), 'utf8');
  const built = /<widget\b[^>]*\sversion="([^"]+)"/.exec(manifest)?.[1];
  if (built !== version) {
    throw new UserError(`dist/ is version ${built} but package.json says ${version}.`, ['Run `npm run build` again.']);
  }
  const application = /<tizen:application\b[^>]*>/.exec(manifest)?.[0] ?? '';
  if (!application.includes(` id="${APP_ID}"`) || !application.includes(` package="${PACKAGE_ID}"`)) {
    throw new UserError(`dist/ must identify ${APP_ID} in package ${PACKAGE_ID}.`, ['Run `npm run build` again.']);
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const notices = readFileSync(resolve('THIRD_PARTY_NOTICES.md'), 'utf8');
  writeFileSync(join(appDir, 'THIRD_PARTY_NOTICES.md'), notices.replace(/\]\(public\/licenses\//g, '](licenses/'));
  createUnsignedWgt(appDir, join(outDir, `${APP_NAME}.wgt`));
  stampInstallSh(githubRepo, join(outDir, 'install.sh'));
  await bundleInstaller(outDir);
  const payloads = [`${APP_NAME}.wgt`, 'install.sh', INSTALLER_FILE];
  const checksums = payloads.map((name) => `${createHash('sha256').update(readFileSync(join(outDir, name))).digest('hex')}  ${name}\n`).join('');
  writeFileSync(join(outDir, 'SHA256SUMS'), checksums);
  ok(`Release ${version} assets for ${githubRepo} are in dist-release/: ${payloads.join(', ')}, SHA256SUMS`);
}

await runMain(main);
