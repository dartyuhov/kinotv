import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The release gate runs first in the release workflow. These tests run it as CI does: a subprocess in a
// project folder, with the repository secrets and GitHub's variables passed as environment variables.

const GATE = resolve(import.meta.dirname, 'gate.ts');
const SECRETS = { KP_CLIENT_ID: 'fixture-client-id', KP_CLIENT_SECRET: 'fixture-client-secret' };
const GITHUB = { GITHUB_REF_NAME: 'v1.4.0', GITHUB_REPOSITORY: 'dartyuhov/kinotv' };

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'kinotv-gate-'));
  writePackageJson({ version: '1.4.0', githubRepo: 'dartyuhov/kinotv' });
  writeFileSync(join(project, 'package-lock.json'), JSON.stringify({ version: '1.4.0', packages: { '': { version: '1.4.0' } } }));
});

afterEach(() => rmSync(project, { recursive: true, force: true }));

function writePackageJson({ version, githubRepo }: { version: string; githubRepo: string }): void {
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'kinotv', version, kinotv: { githubRepo } }));
}

function gate(env: Record<string, string>) {
  const result = spawnSync(process.execPath, [GATE], { cwd: project, encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

describe('the release gate', () => {
  it.each(['1.4.0-beta.1', '1.4.0+build.2', '01.4.0', '256.0.0', '1.256.0', '1.4.65536', '1.4'])('blocks non-stable or non-Tizen release version %s even with a matching tag', (version) => {
    writePackageJson({ version, githubRepo: 'dartyuhov/kinotv' });
    const { code, out } = gate({ ...SECRETS, ...GITHUB, GITHUB_REF_NAME: `v${version}` });

    expect(code).toBe(1);
    expect(out).toContain('stable numeric Tizen version');
  });

  it('lets the release through with client configuration present, a matching tag and the intended repo', () => {
    const { code, out } = gate({ ...SECRETS, ...GITHUB });

    expect(code).toBe(0);
    expect(out).toContain('Release v1.4.0 can be published');
    expect(out).toContain('client configuration is present');
    expect(out).not.toMatch(/own API|ownership verified|authorized client/i);
  });

  it('uses the approved release version on main without overriding reserved GitHub variables', () => {
    const { code, out } = gate({ ...SECRETS, ...GITHUB, GITHUB_REF_NAME: 'main', RELEASE_TAG: 'v1.4.0' });
    expect(code).toBe(0);
    expect(out).toContain('Release v1.4.0 can be published');
    expect(gate({ ...SECRETS, ...GITHUB, RELEASE_TAG: 'v1.5.0' }).code).toBe(1);
  });

  it('blocks the release and says which repository secrets to add when the credentials are missing', () => {
    const { code, out } = gate({ ...GITHUB });

    expect(code).toBe(1);
    expect(out).toContain('::error title=Release blocked::kino.watch app client configuration is missing');
    expect(out).toContain('KP_CLIENT_ID');
    expect(out).toContain('KP_CLIENT_SECRET');
    expect(out).toContain('Settings → Secrets and variables → Actions');
  });

  it('names only the secret that is missing, and treats a blank secret as missing', () => {
    const { code, out } = gate({ ...GITHUB, KP_CLIENT_ID: SECRETS.KP_CLIENT_ID, KP_CLIENT_SECRET: '  ' });

    expect(code).toBe(1);
    expect(out).toContain('Missing: KP_CLIENT_SECRET');
    expect(out).not.toContain('Missing: KP_CLIENT_ID');
  });

  it('never prints the secret values', () => {
    const { out } = gate({ ...SECRETS, GITHUB_REF_NAME: 'v9.9.9', GITHUB_REPOSITORY: 'other/repo' });

    expect(out).not.toContain(SECRETS.KP_CLIENT_ID);
    expect(out).not.toContain(SECRETS.KP_CLIENT_SECRET);
  });

  it.each(['version', 'root', 'missing', 'invalid'])('blocks a %s lockfile version mismatch', (kind) => {
    writeFileSync(join(project, 'package-lock.json'), kind === 'invalid' ? '{' : JSON.stringify({
      version: kind === 'version' ? '1.3.0' : '1.4.0',
      packages: kind === 'missing' ? {} : { '': { version: kind === 'root' ? '1.3.0' : '1.4.0' } },
    }));
    const { code, out } = gate({ ...SECRETS, ...GITHUB });

    expect(code).toBe(1);
    expect(out).toContain('package-lock.json');
  });

  it("blocks a tag that doesn't match the package.json version, so the app and package versions stay in sync", () => {
    const { code, out } = gate({ ...SECRETS, ...GITHUB, GITHUB_REF_NAME: 'v1.5.0' });

    expect(code).toBe(1);
    expect(out).toContain('The tag v1.5.0 does not match the package.json version 1.4.0');
  });

  it('blocks the release while the GitHub repo in package.json is still the placeholder', () => {
    writePackageJson({ version: '1.4.0', githubRepo: 'OWNER/REPO' });

    const { code, out } = gate({ ...SECRETS, ...GITHUB });

    expect(code).toBe(1);
    expect(out).toContain('"kinotv": { "githubRepo" }');
    expect(out).toContain('dartyuhov/kinotv');
  });

  it('blocks the release when package.json names a different GitHub repo than the one being released from', () => {
    writePackageJson({ version: '1.4.0', githubRepo: 'someone-else/kinotv' });

    const { code, out } = gate({ ...SECRETS, ...GITHUB });

    expect(code).toBe(1);
    expect(out).toContain('package.json points the app and installer at someone-else/kinotv');
  });

  it('reports every problem at once', () => {
    writePackageJson({ version: '1.4.0', githubRepo: 'OWNER/REPO' });

    const { code, out } = gate({ ...GITHUB, GITHUB_REF_NAME: 'v2.0.0' });

    expect(code).toBe(1);
    expect(out.match(/::error /g)).toHaveLength(3);
  });

  it('blocks a matching package and workflow repository that is not the intended publishing repository', () => {
    writePackageJson({ version: '1.4.0', githubRepo: 'fork/kinotv' });
    const { code, out } = gate({ ...SECRETS, ...GITHUB, GITHUB_REPOSITORY: 'fork/kinotv' });

    expect(code).toBe(1);
    expect(out).toContain('dartyuhov/kinotv');
  });

  it('requires the workflow repository identity', () => {
    const { code } = gate({ ...SECRETS, ...GITHUB, GITHUB_REPOSITORY: '' });
    expect(code).toBe(1);
  });
});
