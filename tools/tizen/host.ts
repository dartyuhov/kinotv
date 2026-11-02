// What the Tizen commands need from the machine: finding and running tools, asking questions, printing,
// and the project's local (git-ignored) TV settings. Everything is resolved from PATH and the working
// directory, so the commands can be run against a sandbox.
import { spawn, spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

/** A failure the user can fix. Printed as the title plus the steps, without a stack trace. */
export class UserError extends Error {
  readonly steps: string[];
  constructor(title: string, steps: string[] = []) {
    super(title);
    this.steps = steps;
  }
}

// How the user runs the setup steps again: `npm run tv:setup` in a checkout, `bash install.sh` for the
// end-user installer. Messages that end in "run … again" use it.
let setupCommandText = '`npm run tv:setup`';
export const setupCommand = (): string => setupCommandText;
export function setSetupCommand(command: string): void {
  setupCommandText = command;
}

export interface RunResult {
  code: number;
  /** stdout and stderr together, in order (the Tizen tools are not consistent about which one they use). */
  output: string;
}

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
export const style = { bold: paint('1'), dim: paint('2'), green: paint('32'), red: paint('31'), yellow: paint('33') };

export const print = (line = '') => console.log(line);
export const ok = (line: string) => print(`${style.green('✓')} ${line}`);
export const warn = (line: string) => print(`${style.yellow('!')} ${line}`);
export const heading = (line: string) => print(`\n${style.bold(line)}`);

export function tizenHome(): string {
  return process.env.TIZEN_HOME || join(process.env.HOME ?? '', 'tizen-studio');
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Looks on PATH, then in the default Tizen SDK folders ($TIZEN_HOME, default ~/tizen-studio). */
export function findTool(name: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir && isExecutable(join(dir, name))) return join(dir, name);
  }
  const sdkPaths: Record<string, string> = {
    tizen: join(tizenHome(), 'tools', 'ide', 'bin', 'tizen'),
    sdb: join(tizenHome(), 'tools', 'sdb'),
  };
  const fallback = sdkPaths[name];
  return fallback && isExecutable(fallback) ? fallback : null;
}

/** Runs a tool and captures its output. A tool that can't be started counts as exit code 127. */
export function run(command: string, args: string[]): RunResult {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) return { code: 127, output: result.error.message };
  return { code: result.status ?? 1, output: `${result.stdout}${result.stderr}` };
}

/** Runs a tool with the terminal attached (installers, builds, sudo prompts). */
export function runAttached(command: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', () => resolve(127));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

// One reader for the whole run, so answers piped into stdin are read line by line.
let lines: AsyncIterator<string> | undefined;

/**
 * Asks a question on the terminal. An empty answer, or the end of input (stdin closed or not a
 * terminal), gives `fallback`; null when there is no fallback either.
 */
export async function ask(question: string, fallback = ''): Promise<string | null> {
  lines ??= createInterface({ input: process.stdin, terminal: false })[Symbol.asyncIterator]();
  process.stdout.write(`${style.bold('?')} ${question}${fallback ? style.dim(` [${fallback}]`) : ''} `);
  const next = await lines.next();
  const answer = next.done ? '' : next.value.trim();
  if (next.done) print(fallback ? style.dim('(using the saved answer)') : style.dim('(no answer)'));
  return answer || fallback || null;
}

export function closeInput(): void {
  void lines?.return?.();
}

export interface Settings {
  /** The TV's address, e.g. 192.168.1.50 (sdb port 26101 implied). */
  tv?: string;
  /** The Tizen security profile that holds the Samsung certificate. */
  profile?: string;
}

const settingsFile = () => join(process.cwd(), 'tizen', '.signing', 'settings.json');

/** Saved settings, overridden by KINOTV_TV / KINOTV_TIZEN_PROFILE. */
export function loadSettings(): Settings {
  const saved: Settings = existsSync(settingsFile()) ? (JSON.parse(readFileSync(settingsFile(), 'utf8')) as Settings) : {};
  return {
    tv: process.env.KINOTV_TV || saved.tv,
    profile: process.env.KINOTV_TIZEN_PROFILE || saved.profile,
  };
}

export function saveSettings(update: Settings): void {
  const file = settingsFile();
  const saved: Settings = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Settings) : {};
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ ...saved, ...update }, null, 2)}\n`);
}

/**
 * Runs a command's main function: a UserError is printed as the title plus the steps (no stack trace)
 * and sets exit code 1; anything else is a bug and is rethrown.
 */
export async function runMain(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (error) {
    if (!(error instanceof UserError)) throw error;
    print(`\n${style.red('✗')} ${style.bold(error.message)}`);
    for (const step of error.steps) print(`  ${step}`);
    process.exitCode = 1;
  } finally {
    closeInput();
  }
}
