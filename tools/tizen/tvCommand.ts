// Checkout-only build orchestration. Keep Vite out of tv.ts: the standalone release installer
// shares its TV operations, and even an unused dynamic import can emit extra bundle chunks.
import { resolve } from 'node:path';
import { print, runAttached, UserError } from './host.ts';
import { describePackage, install, launch, launchForDebugging, packageWidget, requireProfile, requireTools, requireTv } from './tv.ts';

export async function tvCommand(options: { debug: boolean; build: boolean }): Promise<void> {
  // Check everything that needs the user first, so a missing TV doesn't cost a build.
  const tools = requireTools();
  const tv = requireTv(tools.sdb);
  requireProfile(tools.tizen);

  if (options.build) {
    // Match `vite build`'s production env loading, including ephemeral shell overrides.
    // Only gate TV rebuilds: generic/E2E builds can omit OAuth, and --no-build uses its artifact.
    const { loadEnv } = await import('vite');
    const env = loadEnv('production', process.cwd());
    const missing = ['VITE_KP_CLIENT_ID', 'VITE_KP_CLIENT_SECRET'].filter((key) => !env[key]?.trim());
    if (missing.length) {
      throw new UserError(`Can't rebuild for TV: missing OAuth build configuration (${missing.join(', ')}).`, [
        'Supply nonempty values through the build environment before running `npm run tv`.',
        'To deploy an already configured artifact without rebuilding, use `npm run tv -- --no-build`.',
      ]);
    }
    print('\nBuilding…');
    if ((await runAttached('npm', ['run', 'build'])) !== 0) throw new UserError('The build failed (see above).');
  }
  const packaged = packageWidget(resolve('dist'), resolve('dist-tizen'), { required: true });
  describePackage(packaged);
  install(tools.tizen, tv, packaged.file);
  if (options.debug) launchForDebugging(tools.sdb, tv);
  else launch(tools.tizen, tv);
}
