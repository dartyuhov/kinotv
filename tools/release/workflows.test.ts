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
  it('accepts main pushes and only a merged release PR number for recovery, never a tag/ref input', () => {
    expect(release.on.push).toEqual({ branches: ['main'] });
    expect(release.on.workflow_dispatch).toEqual({ inputs: {
      release_pr: { description: 'Merged release PR number to retry or verify', required: true, type: 'string' },
    } });
    expect(Object.keys(release.on).sort()).toEqual(['push', 'schedule', 'workflow_dispatch']);
    expect(release.on.schedule).toEqual([{ cron: '17,47 * * * *' }]);
    expect(release.jobs.approval!.steps!.find(s => s.run?.endsWith('publish.mjs prepare'))!.env).not.toHaveProperty('SOURCE_SHA');
  });

  it('runs exact-source CI and packaging only after approval and publishes after both pass', () => {
    expect(release.jobs.test!.needs).toBe('approval');
    expect(release.jobs.test!.uses).toBe('./.github/workflows/ci.yml');
    expect(release.jobs.test).toHaveProperty('with.source_sha', '${{ needs.approval.outputs.source_sha }}');
    expect(release.jobs.test).toHaveProperty('if', "needs.approval.outputs.approved == 'true'");
    expect(release.jobs.package!.needs).toEqual(['approval', 'test']);
    expect(release.jobs.publish!.needs).toEqual(['approval', 'test', 'package']);
    const checkout = release.jobs.package!.steps!.find(s => s.uses?.startsWith('actions/checkout@'))!;
    expect(checkout.with?.ref).toBe('${{ needs.approval.outputs.source_sha }}');
    const ci = workflow('ci.yml');
    expect(ci.jobs.test!.steps!.find(s => s.uses?.startsWith('actions/checkout@'))!.with?.ref).toBe('${{ inputs.source_sha || github.sha }}');
  });

  it('retains the gate, real OAuth build, and four-asset assembly before artifact upload', () => {
    const steps = release.jobs.package!.steps!;
    const gate = steps.findIndex(s => s.run === 'node tools/release/gate.ts');
    const build = steps.findIndex(s => s.run === 'npm run build');
    const assemble = steps.findIndex(s => s.run === 'npm run release:assets');
    const upload = steps.findIndex(s => s.uses?.startsWith('actions/upload-artifact@'));
    expect(gate).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(gate);
    expect(assemble).toBeGreaterThan(build);
    expect(upload).toBeGreaterThan(assemble);
    expect(steps[gate]!.env).toMatchObject({ KP_CLIENT_ID: '${{ secrets.KP_CLIENT_ID }}', KP_CLIENT_SECRET: '${{ secrets.KP_CLIENT_SECRET }}' });
    expect(steps[build]!.env).toEqual({ VITE_KP_CLIENT_ID: '${{ secrets.KP_CLIENT_ID }}', VITE_KP_CLIENT_SECRET: '${{ secrets.KP_CLIENT_SECRET }}' });
    expect(steps[upload]!.with).toMatchObject({ name: 'release-candidate', 'if-no-files-found': 'error' });
  });

  it('keeps App tokens out of approval, CI, packaging, and all checkouts', () => {
    expect(release.permissions).toEqual({ contents: 'read' });
    for (const [name, job] of jobs) {
      expect(Object.values(job.permissions ?? release.permissions!)).not.toContain('write');
      if (name !== 'publish') expect(JSON.stringify(job)).not.toContain('create-github-app-token');
      if (name === 'approval') expect(JSON.stringify(job)).not.toContain('secrets.');
    }
    const publish = release.jobs.publish!.steps!;
    expect(publish.find(s => s.uses?.startsWith('actions/checkout@'))!.with).toEqual({ 'persist-credentials': false });
    expect(publish.findIndex(s => s.uses?.startsWith('actions/create-github-app-token@'))).toBeGreaterThan(publish.findIndex(s => s.uses?.startsWith('actions/download-artifact@')));
    expect(publish[publish.length - 1]!.env!.GH_TOKEN).toBe('${{ steps.publisher.outputs.token }}');
    expect(publish[publish.length - 1]!.run).toBe('node tools/release/automation/publish.mjs publish');
  });

  it('serializes every publication under one non-cancelling concurrency group', () => {
    expect(release).toHaveProperty('concurrency', { group: 'release-publication', 'cancel-in-progress': false });
    expect(release.jobs.approval).toHaveProperty('if', "github.ref == 'refs/heads/main'");
  });
  it('only calls scripts that exist', () => expectEverythingItCallsToExist(release));
});

describe('the release PR workflow', () => {
  const wf = workflow('release-please.yml');
  it('creates App-authored release PRs on main without creating releases or circular tag triggers', () => {
    expect(wf.on).toEqual({ push: { branches: ['main'] },
      workflow_run: { workflows: ['Publish release'], types: ['completed'], branches: ['main'] },
      schedule: [{ cron: '23,53 * * * *' }],
    });
    expect(wf.permissions).toEqual({ contents: 'read' });
    const steps = wf.jobs['release-pr']!.steps!;
    expect(steps[steps.length - 1]!.run).toBe('node tools/release/automation/release-pr.mjs');
    expect(steps[steps.length - 1]!.env!.GH_TOKEN).toBe('${{ steps.app.outputs.token }}');
    expect(steps.some(s => s.run === 'node tools/release/automation/config.mjs')).toBe(true);
    expect(steps.find(s => s.uses?.startsWith('actions/checkout@'))!.with?.ref).toBe('main');
    expect(wf.jobs['release-pr']).toHaveProperty('if', expect.stringContaining("github.event.workflow_run.conclusion == 'success'"));
    expect(steps.find(s => s.uses?.startsWith('actions/create-github-app-token@'))!.with).toMatchObject({
      'client-id': '${{ vars.RELEASE_APP_CLIENT_ID }}', 'private-key': '${{ secrets.RELEASE_APP_PRIVATE_KEY }}',
      repositories: '${{ github.event.repository.name }}', 'permission-contents': 'write',
      'permission-pull-requests': 'write', 'permission-issues': 'write',
    });
  });
  it('only calls scripts that exist', () => expectEverythingItCallsToExist(wf));
});

it('pins every release action to an immutable verified revision and removes checkout credentials', () => {
  for (const name of ['release.yml', 'release-please.yml']) {
    const steps = Object.values(workflow(name).jobs).flatMap(j => j.steps ?? []);
    for (const step of steps.filter(s => s.uses)) {
      expect(step.uses).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/);
      if (step.uses?.startsWith('actions/checkout@')) expect(step.with?.['persist-credentials']).toBe(false);
    }
  }
});
