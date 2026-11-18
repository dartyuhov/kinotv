import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { releaseManifest } from '../release-pr.mjs';
import { approve } from '../publication.mjs';

const root = new URL('../../../../', import.meta.url);
const quiet = { info() {}, warn() {}, error() {}, debug() {}, trace() {} };
async function repository(messages, { version = '0.0.0', files = ['src/App.tsx'], bootstrap = false, overrides = {}, lifecycle } = {}) {
  const config = JSON.parse(await readFile(new URL('release-please-config.json', root)));
  const scm = {
    repository: { owner: 'dartyuhov', repo: 'kinotv' },
    async getFileJson(path) {
      return path === '.release-please-manifest.json' ? { '.': version }
        : JSON.parse(await readFile(new URL(path, root)));
    },
    async getFileContentsOnBranch(path) {
      return { parsedContent: await readFile(new URL(path, root), 'utf8') };
    },
    async *releaseIterator() {
      if (version !== '0.0.0') yield { tagName: `v${version}`, sha: 'released', notes: '' };
    },
    async *tagIterator() {},
    async *mergeCommitIterator() {
      for (const [index, message] of messages.entries()) yield { sha: String(index).padStart(40, 'a'), message, files };
      yield { sha: bootstrap ? config['bootstrap-sha'] : 'released', message: 'feat!: historical change', files };
      if (bootstrap) yield { sha: 'old', message: 'feat: obsolete change', files };
    },
    ...overrides,
  };
  return releaseManifest(scm, 'main', { logger: quiet }, { bot: 'kinotv-release[bot]',
    readPullRequest: async () => lifecycle ?? { merged: true, user: { login: 'kinotv-release[bot]' },
      head: { ref: 'release-please--branches--main--components--kinotv', repo: { full_name: 'dartyuhov/kinotv' } },
      base: { ref: 'main', repo: { full_name: 'dartyuhov/kinotv' } } },
  });
}
async function plan(messages, options) { return (await repository(messages, options)).buildPullRequests(); }

test('bootstrap plans first 0.1.0 and synchronizes package, lock, manifest, and changelog', async () => {
  const [pr] = await plan(['feat!: introduce automatic releases'], { bootstrap: true });
  assert.equal(pr.version.toString(), '0.1.0');
  assert.equal(pr.headRefName, 'release-please--branches--main--components--kinotv');
  const updates = Object.fromEntries(pr.updates.map(u => [u.path, u.updater]));
  for (const path of ['package.json', 'package-lock.json']) {
    const updated = JSON.parse(updates[path].updateContent(await readFile(new URL(path, root), 'utf8')));
    assert.equal(updated.version, '0.1.0');
    if (path.includes('lock')) assert.equal(updated.packages[''].version, '0.1.0');
  }
  assert.equal(JSON.parse(updates['.release-please-manifest.json'].updateContent('{}'))['.'], '0.1.0');
  const notes = updates['CHANGELOG.md'].updateContent('');
  assert.match(notes, /0\.1\.0[\s\S]*introduce automatic releases/);
  assert.doesNotMatch(notes, /historical change|obsolete change/);
});

test('published fixes, features, and breaking changes produce patch, minor, and major versions', async () => {
  for (const [message, expected] of [['fix: repair installer', '0.1.1'], ['feat: add player', '0.2.0'], ['feat!: change API', '1.0.0']]) {
    const [pr] = await plan([message], { version: '0.1.0' });
    assert.equal(pr.version.toString(), expected);
    const lock = pr.updates.find(u => u.path === 'package-lock.json');
    const updated = JSON.parse(lock.updater.updateContent(await readFile(new URL('package-lock.json', root), 'utf8')));
    assert.equal(updated.version, expected);
    assert.equal(updated.packages[''].version, expected);
  }
});

test('documentation-only commits cannot trigger a release, including misleading feature titles', async () => {
  for (const version of ['0.0.0', '0.1.0']) {
    assert.deepEqual(await plan(['feat!: improve guide'], { version, files: ['README.md', 'docs/installation.md'] }), []);
    assert.equal((await plan(['fix: improve installer and guide'], { version, files: ['README.md', 'tools/install.sh'] })).length, 1);
  }
});

test('publisher accepts the actual Node strategy title, body, and updated files at the exact merge', async () => {
  const [pr] = await plan(['feat: ship automated releases'], { bootstrap: true });
  const sha = 'a'.repeat(40), head = 'b'.repeat(40), bot = 'kinotv-release[bot]', repo = 'dartyuhov/kinotv';
  const merged = { number: 42, merged: true, merged_at: '2026-11-18', merge_commit_sha: sha,
    user: { login: bot }, title: pr.title.toString(), body: pr.body.toString(), labels: [{ name: 'autorelease: pending' }],
    head: { sha: head, ref: pr.headRefName, repo: { full_name: repo } }, base: { ref: 'main', repo: { full_name: repo } } };
  const files = {};
  for (const update of pr.updates) {
    let original = '';
    try { original = await readFile(new URL(update.path, root), 'utf8'); } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      if (!update.createIfMissing) continue;
    }
    files[update.path] = update.updater.updateContent(original);
  }
  const api = { repo,
    async request(path) { return path.startsWith('/compare/') ? { status: 'ahead' } : merged; },
    async list() { return [{ id: 1, run_attempt: 1, head_sha: head, head_branch: pr.headRefName,
      event: 'pull_request', path: '.github/workflows/ci.yml', repository: { full_name: repo },
      head_repository: { full_name: repo }, status: 'completed', conclusion: 'success',
      pull_requests: [{ number: 42, url: `https://api.github.com/repos/${repo}/pulls/42`,
        head: { ref: pr.headRefName, sha: head, repo: { id: 1451566604, name: 'kinotv', url: `https://api.github.com/repos/${repo}` } },
        base: { ref: 'main', sha: 'c'.repeat(40), repo: { id: 1451566604, name: 'kinotv', url: `https://api.github.com/repos/${repo}` } } }] }]; },
    async file(path, ref) { assert.equal(ref, sha); return Buffer.from(files[path]); },
  };
  const approval = await approve(api, { prNumber: 42, bot });
  assert.equal(approval.version, '0.1.0');
  assert.equal(approval.sha, sha);
  assert.match(approval.notes, /ship automated releases/);
});

test('one managed PR accumulates changes, updates in place, and is unchanged when the plan is unchanged', async () => {
  const messages = ['fix: repair installer'];
  let stored, creates = 0, updates = 0;
  const manifest = await repository(messages, { version: '0.1.0', overrides: {
    async *pullRequestIterator(branch, state) {
      assert.equal(branch, 'main');
      if (state === 'OPEN' && stored) yield stored;
    },
    async createPullRequest(pr, branch, message, fileUpdates) {
      creates++;
      assert.equal(branch, 'main');
      assert.equal(message, pr.title);
      assert.ok(fileUpdates.some(u => u.path === '.release-please-manifest.json'));
      stored = { ...pr, number: 42 };
      return stored;
    },
    async updatePullRequest(number, pr) {
      updates++;
      assert.equal(number, 42);
      stored = { ...stored, title: pr.title.toString(), body: pr.body.toString() };
      return stored;
    },
  } });
  assert.equal((await manifest.createPullRequests())[0].number, 42);
  assert.match(stored.title, /0\.1\.1/);
  messages.unshift('feat: add player');
  assert.equal((await manifest.createPullRequests())[0].number, 42);
  assert.match(stored.title, /0\.2\.0/);
  assert.equal(creates, 1);
  assert.equal(updates, 1);
  assert.deepEqual(await manifest.createPullRequests(), []);
  assert.equal(updates, 1);
});

test('merged pending release blocks a second release PR until publisher completes lifecycle labels', async () => {
  const [pending] = await plan(['fix: repair installer'], { version: '0.1.0' });
  const manifest = await repository(['feat: add player'], { version: '0.1.0', overrides: {
    async *pullRequestIterator(branch, state) {
      if (state === 'MERGED') yield { number: 42, title: pending.title.toString(), body: pending.body.toString(),
        headBranchName: pending.headRefName, labels: ['autorelease: pending'] };
    },
    async createPullRequest() { assert.fail('must publish pending release first'); },
  } });
  assert.deepEqual(await manifest.createPullRequests(), []);
});

test('publication completion reconciles F deferred while R was pending using real Release Please', async () => {
  const [pending] = await plan(['fix: release R'], { version: '0.1.0' });
  let labels = ['autorelease: pending'];
  let created;
  const manifest = () => repository(['feat: feature F merged during R publication'], { version: '0.1.1', overrides: {
    async *pullRequestIterator(branch, state) {
      assert.equal(branch, 'main');
      if (state === 'MERGED') yield { number: 42, title: pending.title.toString(), body: pending.body.toString(),
        headBranchName: pending.headRefName, labels };
    },
    async createPullRequest(pr) { created = { ...pr, number: 43 }; return created; },
  } });
  assert.deepEqual(await (await manifest()).createPullRequests(), []); // F push's writer ran too early
  assert.equal(created, undefined);
  labels = ['autorelease: tagged']; // R publisher finishes
  // The completion-triggered writer (no further main push) rereads main history.
  assert.equal((await (await manifest()).createPullRequests())[0].number, 43);
  assert.match(created.title, /0\.2\.0/);
  assert.match(created.body.toString(), /feature F merged during R publication/);
});

test('copied release body and pending label on unrelated contributor PR cannot block the real planner', async () => {
  const [copied] = await plan(['fix: copied release'], { version: '0.1.0' });
  for (const kind of ['author', 'branch', 'head-repo', 'base-repo']) {
    const raw = { merged: true, user: { login: 'kinotv-release[bot]' },
      head: { ref: copied.headRefName, repo: { full_name: 'dartyuhov/kinotv' } },
      base: { ref: 'main', repo: { full_name: 'dartyuhov/kinotv' } } };
    if (kind === 'author') raw.user.login = 'contributor';
    if (kind === 'branch') raw.head.ref = 'ordinary-feature';
    if (kind === 'head-repo') raw.head.repo.full_name = 'fork/kinotv';
    if (kind === 'base-repo') raw.base.repo.full_name = 'other/kinotv';
    const manifest = await repository(['feat: genuine contributor feature'], { version: '0.1.0', lifecycle: raw, overrides: {
      async *pullRequestIterator(branch, state) {
        if (state === 'MERGED') yield { number: 99, title: copied.title.toString(), body: copied.body.toString(),
          headBranchName: copied.headRefName, labels: ['autorelease: pending'] };
      },
      async createPullRequest(pr) { return { ...pr, number: 100 }; },
    } });
    const result = await manifest.createPullRequests();
    assert.equal(result.length, 1, kind);
    assert.match(result[0].body.toString(), /genuine contributor feature/);
  }
});

test('completed tagged release history reaches the planner without pending identity reads', async () => {
  const [completed] = await plan(['fix: completed release'], { version: '0.1.0' });
  const manifest = await repository(['fix: follow-up after completed release'], { version: '0.1.1',
    overrides: {
      async *pullRequestIterator(branch, state) {
        if (state === 'MERGED') yield { number: 42, title: completed.title.toString(), body: completed.body.toString(),
          headBranchName: completed.headRefName, labels: ['autorelease: tagged'] };
      },
      async createPullRequest(pr) { return { ...pr, number: 43 }; },
    },
    lifecycle: new Proxy({}, { get() { assert.fail('tagged history must not require pending identity verification'); } }),
  });
  const [next] = await manifest.createPullRequests();
  assert.match(next.title, /0\.1\.2/);
  assert.match(next.body.toString(), /follow-up after completed release/);
});
