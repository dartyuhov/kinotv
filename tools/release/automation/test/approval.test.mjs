import assert from 'node:assert/strict';
import { test } from 'node:test';
import { approve, pendingApproval, resolveApproval } from '../publication.mjs';

const sha = 'a'.repeat(40), head = 'b'.repeat(40), repo = 'dartyuhov/kinotv', bot = 'release-app[bot]';
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
  const runs = [{ id: 1, head_sha: sha, event: 'push', path: '.github/workflows/ci.yml',
    head_branch: 'main', head_repository: { full_name: repo }, status: 'completed', conclusion: 'success', run_attempt: 1 }];
  const api = {
    repo,
    async request(path) {
      if (path === '/pulls/42') return pr;
      if (path.startsWith('/compare/')) return { status: 'ahead' };
      throw new Error(`Unexpected request ${path}`);
    },
    async list(path) {
      if (path.includes('/pulls')) return [pr];
      if (path.includes('/runs')) return runs;
      throw new Error(`Unexpected list ${path}`);
    },
    async file(path, ref) { assert.equal(ref, sha); return Buffer.from(files[path]); },
  };
  return { api, pr, files, runs };
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
  const { api, pr, runs } = fixture();
  runs[0] = { ...runs[0], head_sha: head, head_branch: pr.head.ref };
  runs.push({ ...runs[0], id: 2, head_sha: sha, head_branch: 'main', status: 'in_progress', conclusion: null });
  assert.equal((await approve(api, { sourceSha: sha, bot })).sha, sha);
  runs.unshift({ ...runs[0], id: 3, conclusion: 'failure' });
  await assert.rejects(approve(api, { sourceSha: sha, bot }), /Latest trusted CI/);
});

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
    if (kind === 'stale-attempt') runs.unshift({ ...runs[0], id: 2, conclusion: 'failure' });
    await assert.rejects(approve(api, { prNumber: 42, bot }));
  });
}
