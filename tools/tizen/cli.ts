// KinoTV's Tizen commands. Run through npm (see package.json):
//   npm run tv:setup    setup wizard: Tizen tools, TV Developer Mode, sdb connection, Samsung certificate
//   npm run package     build, then package dist/ as dist-tizen/KinoTV.wgt (signed if a profile is set up)
//   npm run tv          build, package signed, install and launch on the TV
//   npm run tv:debug    the same, launched in debug mode; prints the DevTools address
import { print, runMain } from './host.ts';
import { runSetup } from './setup.ts';
import { packageCommand, tvCommand } from './tv.ts';

const USAGE = `Usage: node tools/tizen/cli.ts <command>

  setup                      Prepare this Mac and the TV (interactive)
  package [--from dir] [--out dir]
                             Package a build (default dist/) into <out>/KinoTV.wgt (default dist-tizen/)
  tv [--debug] [--no-build]  Build, package, install and launch on the TV`;

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const flag = (name: string) => rest.includes(name);
  const option = (name: string) => {
    const index = rest.indexOf(name);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  switch (command) {
    case 'setup':
      return runSetup();
    case 'package':
      return packageCommand({ from: option('--from'), out: option('--out') });
    case 'tv':
      return tvCommand({ debug: flag('--debug'), build: !flag('--no-build') });
    default:
      print(USAGE);
      process.exitCode = 2;
  }
}

await runMain(() => main(process.argv.slice(2)));
