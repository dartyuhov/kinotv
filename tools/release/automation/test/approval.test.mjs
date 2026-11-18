import assert from 'node:assert/strict';
import { test } from 'node:test';
import { approve, pendingApproval, resolveApproval } from '../publication.mjs';

const sha = 'a'.repeat(40), head = 'b'.repeat(40), repo = 'dartyuhov/kinotv', bot = 'release-app[bot]';
const repository = { id: 1451566604, name: 'kinotv', full_name: repo, url: `https://api.github.com/repos/${repo}` };

// Actions REST metadata, not the event's synthetic github.sha merge commit.
function prRun(overrides = {}) {
  return { id: 44393416331, workflow_id: 319791658, run_number: 12, run_attempt: 1,
    head_sha: head, head_branch: 'release-please--branches--main--components--kinotv',
    event: 'pull_request', path: '.github/workflows/ci.yml', repository: { ...repository },
    head_repository: { ...repository }, status: 'completed', conclusion: 'success',
    pull_requests: [{ number: 42, url: `${repository.url}/pulls/42`,
      head: { ref: 'release-please--branches--main--components--kinotv', sha: head,
        repo: { id: repository.id, name: repository.name, url: repository.url } },
      base: { ref: 'main', sha: 'c'.repeat(40),
        repo: { id: repository.id, name: repository.name, url: repository.url } } }],
    ...overrides };
}

function mainRun(overrides = {}) {
  return prRun({ id: 44393416332, head_sha: sha, head_branch: 'main', event: 'push', pull_requests: [], ...overrides });
}
export function fixture() {
  const pr = { number: 42, merged: true, merged_at: '2026-11-18T10:00:00Z', merge_commit_sha: sha,
    user: { login: bot }, title: 'chore(main): release kinotv 0.1.0',
    body: ':robot: I have created a release *beep* *boop*\n---\n\n## [0.1.0](https://github.com/dartyuhov/kinotv/compare/v0.0.0...v0.1.0) (2026-11-18)\n\n### Features\n\n* automatic releases\n\n---\n\nThis PR was generated with [Release Please](https://github.com/googleapis/release-please).',
    labels: [{ name: 'autorelease: pending' }],
    head: { ref: 'release-please--branches--main--components--kinotv', sha: head, repo: { full_name: repo } },
    base: { ref: 'main', repo: { full_name: repo } } };
  const files = {
    'package.json': JSON.stringify({ version: '0.1.0', kinotv: { githubRepo: repo } }),
    'package-lock.json': JSON.stringify({ version: '0.1.0', packages: { '': { version: '0.1.0' } } }),
    '.release-please-manifest.json': '{".":"0.1.0"}',
    'CHANGELOG.md': '# Changelog\n\n## 0.1.0 (2026-11-18)\n\n### Features\n\n* automatic releases\n',
  };
  const runs = [mainRun()];
  const queries = [];
  const api = {
    repo,
    async request(path) {
      if (path === '/pulls/42') return pr;
      if (path.startsWith('/compare/')) return { status: 'ahead' };
      throw new Error(`Unexpected request ${path}`);
    },
    async list(path) {
      queries.push(path);
      if (path.includes('/pulls')) return [pr];
      if (path.includes('/runs')) return runs;
      throw new Error(`Unexpected list ${path}`);
    },
    async file(path, ref) { assert.equal(ref, sha); return Buffer.from(files[path]); },
  };
  return { api, pr, files, runs, queries };
}

test('only exact merged App release PR approval resolves version, source, and notes', async () => {
  const { api } = fixture();
  const approval = await approve(api, { sourceSha: sha, bot });
  assert.equal(approval.sha, sha);
  assert.equal(approval.version, '0.1.0');
  assert.match(approval.notes, /automatic releases/);
  assert.equal((await approve(api, { prNumber: 42, bot })).sha, sha);
});

test('ordinary PRs cannot publish even when their title and labels mimic Release Please', async () => {
  const { api, pr } = fixture();
  pr.user.login = 'contributor';
  assert.equal(await approve(api, { sourceSha: sha, bot }), undefined);
  await assert.rejects(approve(api, { prNumber: 42, bot }), /trusted/);
});

test('A running, R pending, B replacing R still resolves durable R from closed PR state', async () => {
  const { api, pr } = fixture();
  const originalList = api.list;
  let closed = [];
  api.list = async path => path.startsWith('/pulls?') ? closed : originalList(path);
  assert.equal(await pendingApproval(api, { bot }), undefined); // ordinary A starts
  closed = [pr]; // R merges; its workflow is pending, then replaced by B
  const approval = await pendingApproval(api, { bot }); // B reconciles repository state
  assert.equal(approval.prNumber, 42);
  assert.equal(approval.sha, sha); // never B's ordinary push SHA
  pr.labels = [{ name: 'autorelease: tagged' }];
  assert.equal(await pendingApproval(api, { bot }), undefined);
});

test('pending reconciliation orders all candidates oldest first and never skips a broken oldest approval', async () => {
  const { api, pr } = fixture();
  const originalList = api.list;
  const later = { ...pr, number: 43, merged_at: '2026-11-18T11:00:00Z' };
  const spoof = { ...pr, number: 44, user: { login: 'contributor' } };
  api.list = async path => path.startsWith('/pulls?') ? [later, spoof, pr] : originalList(path);
  assert.equal((await pendingApproval(api, { bot })).prNumber, 42);
  pr.body = 'invalid release markers';
  await assert.rejects(pendingApproval(api, { bot }), /markers/);
});

test('dispatch cannot bypass oldest pending approval, while completed verification retries remain available', async () => {
  const { api, pr } = fixture();
  const originalList = api.list;
  const originalRequest = api.request;
  const later = { ...pr, number: 43, merged_at: '2026-11-18T11:00:00Z' };
  api.list = async path => path.startsWith('/pulls?') ? [later, pr] : originalList(path);
  api.request = async path => path === '/pulls/43' ? later : originalRequest(path);
  await assert.rejects(resolveApproval(api, { bot, prNumber: 43 }), /older pending release/);
  assert.equal((await resolveApproval(api, { bot })).prNumber, 42);
  pr.labels = [{ name: 'autorelease: tagged' }];
  assert.equal((await resolveApproval(api, { bot })).prNumber, 43);
  assert.equal((await resolveApproval(api, { bot, prNumber: 42, sourceSha: sha })).prNumber, 42);
  later.labels = [{ name: 'autorelease: tagged' }];
  assert.equal(await resolveApproval(api, { bot }), undefined);
});

test('latest exact PR-head CI qualifies without waiting for the concurrent main CI push', async () => {
  const { api, runs, queries } = fixture();
  runs.splice(0, runs.length, prRun(), mainRun({ status: 'in_progress', conclusion: null }));
  assert.equal((await approve(api, { sourceSha: sha, bot })).sha, sha);
  assert.ok(queries.includes(`/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${head}`));
  assert.ok(!queries.some(path => path.includes(`head_sha=${sha}`)));
  runs.unshift(prRun({ id: 44393416333, conclusion: 'failure' }));
  await assert.rejects(approve(api, { sourceSha: sha, bot }), /Latest trusted CI/);
});

test('a later update of the managed release branch does not invalidate the approved PR run', async () => {
  const { api, runs } = fixture();
  const run = prRun();
  // The run SHA is immutable; the linked PR head metadata can reflect a later
  // branch update when GitHub serializes an old run's association.
  run.pull_requests[0].head.sha = 'd'.repeat(40);
  runs.splice(0, runs.length, run, prRun({ id: run.id + 1, head_sha: 'd'.repeat(40), conclusion: 'failure' }));
  assert.equal((await approve(api, { prNumber: 42, bot })).sha, sha);
});

for (const kind of ['fork', 'repository', 'workflow', 'sha', 'event', 'branch', 'pr-number', 'pr-url', 'head-repo', 'base-repo', 'base-ref', 'missing-association']) {
  test(`PR CI rejects ${kind} metadata and only falls back to exact main push CI`, async () => {
    const { api, runs } = fixture();
    const run = prRun();
    if (kind === 'fork') run.head_repository.full_name = 'fork/kinotv';
    if (kind === 'repository') run.repository.full_name = 'fork/kinotv';
    if (kind === 'workflow') run.path = '.github/workflows/spoof.yml';
    if (kind === 'sha') run.head_sha = 'd'.repeat(40);
    if (kind === 'event') run.event = 'pull_request_target';
    if (kind === 'branch') run.head_branch = 'ordinary';
    if (kind === 'pr-number') run.pull_requests[0].number = 43;
    if (kind === 'pr-url') run.pull_requests[0].url = 'https://api.github.com/repos/fork/kinotv/pulls/42';
    if (kind === 'head-repo') run.pull_requests[0].head.repo.url = 'https://api.github.com/repos/fork/kinotv';
    if (kind === 'base-repo') run.pull_requests[0].base.repo.url = 'https://api.github.com/repos/fork/kinotv';
    if (kind === 'base-ref') run.pull_requests[0].base.ref = 'other';
    if (kind === 'missing-association') run.pull_requests = [];
    runs.splice(0, runs.length, run);
    await assert.rejects(approve(api, { prNumber: 42, bot }), /No successful trusted CI/);
    runs.push(mainRun());
    assert.equal((await approve(api, { prNumber: 42, bot })).sha, sha);
  });
}

for (const [status, conclusion] of [['queued', null], ['in_progress', null], ['waiting', null],
  ['completed', 'failure'], ['completed', 'cancelled'], ['completed', 'skipped'],
  ['completed', 'timed_out'], ['completed', 'neutral'], ['completed', 'action_required']]) {
  for (const rerun of [false, true]) {
    test(`latest PR ${rerun ? 'attempt' : 'run'} ${status}/${conclusion} blocks successful main fallback`, async () => {
      const { api, runs } = fixture();
      const latest = prRun({ id: rerun ? 44393416331 : 44393416333,
        run_attempt: rerun ? 2 : 1, status, conclusion });
      // Out of order on purpose: never choose the first returned success.
      runs.splice(0, runs.length, prRun(), mainRun(), latest);
      await assert.rejects(approve(api, { prNumber: 42, bot }), /Latest trusted CI/);
      latest.status = 'completed'; latest.conclusion = 'success';
      assert.equal((await approve(api, { prNumber: 42, bot })).sha, sha);
    });
  }
}

for (const kind of ['branch-push', 'wrong-sha', 'wrong-branch', 'wrong-workflow', 'fork', 'repository', 'failed', 'queued', 'stale-attempt']) {
  test(`absent PR CI cannot use ${kind} as the main fallback`, async () => {
    const { api, runs } = fixture();
    const run = mainRun();
    if (kind === 'branch-push') { run.head_sha = head; run.head_branch = prRun().head_branch; }
    if (kind === 'wrong-sha') run.head_sha = 'd'.repeat(40);
    if (kind === 'wrong-branch') run.head_branch = 'other';
    if (kind === 'wrong-workflow') run.path = '.github/workflows/spoof.yml';
    if (kind === 'fork') run.head_repository.full_name = 'fork/kinotv';
    if (kind === 'repository') run.repository.full_name = 'fork/kinotv';
    if (kind === 'failed') run.conclusion = 'failure';
    if (kind === 'queued') { run.status = 'queued'; run.conclusion = null; }
    runs.splice(0, runs.length, run);
    if (kind === 'stale-attempt') runs.push(mainRun({ run_attempt: 2, conclusion: 'failure' }));
    await assert.rejects(approve(api, { prNumber: 42, bot }));
  });
}

test('wrong push source, ambiguous release PRs, and invalid dispatch numbers fail closed', async () => {
  const { api, pr } = fixture();
  await assert.rejects(approve(api, { sourceSha: 'c'.repeat(40), prNumber: 42, bot }), /differs from push/);
  for (const prNumber of ['main', '-1', '1; command']) await assert.rejects(approve(api, { prNumber, bot }), /Invalid release PR/);
  api.list = async () => [pr, { ...pr, number: 43 }];
  await assert.rejects(approve(api, { sourceSha: sha, bot }), /Ambiguous/);
});

for (const kind of ['unmerged', 'fork', 'base', 'branch', 'label', 'body', 'title', 'manifest', 'lock', 'repo', 'version', 'ancestry', 'failed-check', 'spoofed-check', 'wrong-sha', 'stale-attempt']) {
  test(`rejects ${kind} approval before any write`, async () => {
    const { api, pr, files, runs } = fixture();
    if (kind === 'unmerged') pr.merged = false;
    if (kind === 'fork') pr.head.repo.full_name = 'fork/kinotv';
    if (kind === 'base') pr.base.ref = 'other';
    if (kind === 'branch') pr.head.ref = 'ordinary';
    if (kind === 'label') pr.labels = [];
    if (kind === 'body') pr.body = 'release 0.1.0';
    if (kind === 'title') pr.title = 'chore: release 9.0.0';
    if (kind === 'manifest') files['.release-please-manifest.json'] = '{".":"0.2.0"}';
    if (kind === 'lock') files['package-lock.json'] = '{}';
    if (kind === 'repo') files['package.json'] = '{"version":"0.1.0","kinotv":{"githubRepo":"fork/kinotv"}}';
    if (kind === 'version') files['package.json'] = '{"version":"999.0.0"}';
    if (kind === 'ancestry') api.request = async path => path.startsWith('/compare/') ? { status: 'diverged' } : pr;
    if (kind === 'failed-check') runs[0].conclusion = 'failure';
    if (kind === 'spoofed-check') runs[0].path = '.github/workflows/spoof.yml';
    if (kind === 'wrong-sha') runs[0].head_sha = 'c'.repeat(40);
    if (kind === 'stale-attempt') runs.unshift({ ...runs[0], id: runs[0].id + 1, conclusion: 'failure' });
    await assert.rejects(approve(api, { prNumber: 42, bot }));
  });
}
