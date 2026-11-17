import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

// Hosted GitHub Actions runs are separate verification, so this checks what can be
// checked locally: they parse, they trigger on the right events, they run the gate before publishing,
// and every script and file they call exists. The scripts themselves have their own tests.

const repoRoot = resolve(import.meta.dirname, '../..');
const scripts = (JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Job {
  needs?: string | string[];
  uses?: string;
  permissions?: Record<string, string>;
  env?: Record<string, string>;
  steps?: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  env?: Record<string, string>;
  jobs: Record<string, Job>;
}

function workflow(name: string): Workflow {
  return parse(readFileSync(join(repoRoot, '.github/workflows', name), 'utf8')) as Workflow;
}

const runLines = (wf: Workflow) =>
  Object.values(wf.jobs)
    .flatMap((job) => job.steps ?? [])
    .flatMap((step) => (step.run ?? '').split('\n'))
    .map((line) => line.trim())
    .filter(Boolean);

function expectEverythingItCallsToExist(wf: Workflow): void {
  for (const line of runLines(wf)) {
    for (const [, script] of line.matchAll(/npm run ([\w:-]+)/g)) expect(scripts, line).toHaveProperty([script!]);
    for (const [, file] of line.matchAll(/node (\S+\.(?:ts|mjs|js))/g)) expect(existsSync(join(repoRoot, file!)), line).toBe(true);
  }
  for (const job of Object.values(wf.jobs)) {
    if (job.uses?.startsWith('./')) expect(existsSync(join(repoRoot, job.uses)), job.uses).toBe(true);
  }
}

describe('the CI workflow', () => {
  const ci = workflow('ci.yml');
  const lines = runLines(ci);

  it('runs on every push to a branch and every pull request, and can be called by the release workflow', () => {
    expect(Object.keys(ci.on).sort()).toEqual(['pull_request', 'push', 'workflow_call']);
    // Every branch. Tags are left to the release workflow, which runs this one itself.
    expect(ci.on.push).toEqual({ branches: ['**'] });
  });

  it('runs the typecheck, the unit tests, the e2e tests and the build', () => {
    expect(lines).toEqual(expect.arrayContaining(['npm ci', 'npm run typecheck', 'npm test', 'npm run e2e', 'npm run build']));
    expect(lines.some((line) => line.startsWith('npx playwright install') && line.includes('chromium'))).toBe(true);
  });

  it('only calls scripts that exist', () => expectEverythingItCallsToExist(ci));

  it('pins every external action to an immutable upstream revision and removes checkout credentials', () => {
    const steps = Object.values(ci.jobs).flatMap((job) => job.steps ?? []);
    const actions = steps.filter((step) => step.uses && !step.uses.startsWith('./'));
    expect(actions.length).toBeGreaterThan(0);
    for (const step of actions) expect(step.uses).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/);
    const checkouts = steps.filter((step) => step.uses?.startsWith('actions/checkout@'));
    expect(checkouts.length).toBeGreaterThan(0);
    for (const step of checkouts) expect(step.with?.['persist-credentials']).toBe(false);
  });

  it('builds the production app with fake OAuth configuration and assembles that build in the same job', () => {
    const buildJobs = Object.values(ci.jobs).filter((job) => job.steps?.some((step) => step.run?.includes('npm run build')));
    expect(buildJobs).toHaveLength(1);
    const job = buildJobs[0]!;
    const steps = job.steps!;
    const buildIndex = steps.findIndex((step) => step.run?.includes('npm run build'));
    const build = steps[buildIndex]!;
    expect({ ...ci.env, ...job.env, ...build.env }).toMatchObject({
      VITE_KP_CLIENT_ID: 'fixture-release-client-id',
      VITE_KP_CLIENT_SECRET: 'fixture-release-client-secret',
    });
    const commands = steps.slice(buildIndex).flatMap((step) => (step.run ?? '').split('\n')).map((line) => line.trim());
    expect(commands.indexOf('npm run release:assets')).toBeGreaterThan(commands.indexOf('npm run build'));
  });

  it('keeps fork checks read-only without requesting or referencing release secrets', () => {
    expect(ci.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(ci.jobs)) {
      expect(job.permissions ?? ci.permissions).toEqual({ contents: 'read' });
    }
    expect(ci.on.workflow_call ?? {}).not.toHaveProperty('secrets');
    expect(JSON.stringify(ci)).not.toMatch(/\bsecrets\s*[.\[]|"secrets"\s*:/);
  });
});

describe('the release workflow', () => {
  const release = workflow('release.yml');
  const jobs = Object.entries(release.jobs);
  const gateJob = jobs.find(([, job]) => job.steps?.some((step) => step.run?.includes('node tools/release/gate.ts')));
  const testJob = jobs.find(([, job]) => job.uses === './.github/workflows/ci.yml');
  const publishJob = jobs.find(([, job]) => job.steps?.some((step) => step.run?.includes('gh release create')));

  it('runs only for version tags', () => {
    expect(release.on).toEqual({ push: { tags: ['v*'] } });
  });

  it("runs the gate with the repository secrets, and only reads the project's credentials there", () => {
    expect(gateJob).toBeDefined();
    const step = gateJob![1].steps!.find((s) => s.run?.includes('gate.ts'))!;
    expect(step.env).toMatchObject({ KP_CLIENT_ID: '${{ secrets.KP_CLIENT_ID }}', KP_CLIENT_SECRET: '${{ secrets.KP_CLIENT_SECRET }}' });
  });

  it('publishes only after the gate passed and the full test run is green', () => {
    expect(testJob).toBeDefined();
    expect(publishJob).toBeDefined();
    const needs = [publishJob![1].needs].flat();
    expect(needs).toEqual(expect.arrayContaining([gateJob![0], testJob![0]]));
  });

  it('builds with the credentials and attaches the unsigned app and the installer to the release', () => {
    const steps = publishJob![1].steps!;
    const buildStep = steps.find((s) => s.run?.includes('npm run build'))!;
    // The secrets are KP_*, but the app reads them as the Vite env vars VITE_KP_* (src/core/config.ts).
    expect(buildStep.env).toEqual({
      VITE_KP_CLIENT_ID: '${{ secrets.KP_CLIENT_ID }}',
      VITE_KP_CLIENT_SECRET: '${{ secrets.KP_CLIENT_SECRET }}',
    });
    expect(steps.some((s) => s.run?.includes('npm run release:assets'))).toBe(true);
    const create = steps.find((s) => s.run?.includes('gh release create'))!.run!;
    for (const asset of ['dist-release/KinoTV.wgt', 'dist-release/install.sh', 'dist-release/kinotv-installer.mjs', 'dist-release/SHA256SUMS']) {
      expect(create).toContain(asset);
    }
  });

  it('can write releases only in the publishing job', () => {
    expect(release.permissions).toEqual({ contents: 'read' });
    expect(publishJob![1].permissions).toEqual({ contents: 'write' });
  });

  it('only calls scripts that exist', () => expectEverythingItCallsToExist(release));
});
