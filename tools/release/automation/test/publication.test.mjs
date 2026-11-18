import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { zipSync } from 'fflate';
import { GitHub, approve, publish } from '../publication.mjs';
import { renderConfigXml } from '../../../tizen/configXml.ts';

const repo = 'dartyuhov/kinotv', sha = 'a'.repeat(40), head = 'b'.repeat(40), bot = 'release-app[bot]';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Whole publisher including approval and existing stageDraft, with only the gh
// process replaced. Any unsupported remote command fails the test.
function server() {
  const root = mkdtempSync(join(tmpdir(), 'kinotv-publication-'));
  const pkg = JSON.stringify({ version: '0.1.0', kinotv: { githubRepo: repo } });
  const lock = JSON.stringify({ version: '0.1.0', packages: { '': { version: '0.1.0' } } });
  writeFileSync(join(root, 'package.json'), pkg);
  writeFileSync(join(root, 'package-lock.json'), lock);
  mkdirSync(join(root, 'dist-release'));
  const files = {
    'KinoTV.wgt': Buffer.from(zipSync({ 'config.xml': Buffer.from(renderConfigXml({ version: '0.1.0' })), 'index.html': Buffer.from('app') })),
    'install.sh': Buffer.from('shell installer'), 'kinotv-installer.mjs': Buffer.from('node installer'),
  };
  files.SHA256SUMS = Buffer.from(Object.entries(files).map(([name, bytes]) => `${hash(bytes)}  ${name}\n`).join(''));
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(root, 'dist-release', name), bytes);
  const notes = '## 0.1.0 (2026-11-18)\n\n### Features\n\n* automatic releases';
  const pr = { number: 42, merged: true, merged_at: '2026-11-18T10:00:00Z', merge_commit_sha: sha,
    user: { login: bot }, title: 'chore(main): release kinotv 0.1.0',
    body: `:robot: I have created a release *beep* *boop*\n---\n\n${notes}\n\n---\n\nThis PR was generated with [Release Please](https://github.com/googleapis/release-please).`,
    labels: [{ name: 'autorelease: pending' }],
    head: { ref: 'release-please--branches--main--components--kinotv', sha: head, repo: { full_name: repo } },
    base: { ref: 'main', repo: { full_name: repo } } };
  const sources = { 'package.json': pkg, 'package-lock.json': lock, '.release-please-manifest.json': '{".":"0.1.0"}', 'CHANGELOG.md': `# Changelog\n\n${notes}\n` };
  const state = { release: undefined, tag: undefined, assets: [], mutations: [], calls: [],
    mainVersion: '0.1.0', newer: false, failUpload: undefined, corruptDownload: false, failLabel: false,
    moved: false, failPublish: false };
  const gh = (args, input) => {
    state.calls.push(args);
    assert.equal(args[0], 'api');
    const endpoint = args[1].replace(`repos/${repo}`, '');
    const method = args.includes('--method') ? args[args.indexOf('--method') + 1] : 'GET';
    const body = input && !endpoint.startsWith('https://uploads') ? JSON.parse(input) : undefined;
    if (method !== 'GET') state.mutations.push(`${method} ${endpoint}`);
    let data;
    if (endpoint.startsWith('/contents/')) {
      const path = endpoint.slice('/contents/'.length).split('?')[0];
      assert.ok(endpoint.endsWith(`ref=${sha}`) || path === 'package.json' && endpoint.endsWith('ref=main'));
      const content = endpoint.endsWith('ref=main') ? JSON.stringify({ version: state.mainVersion }) : sources[path];
      data = { encoding: 'base64', content: Buffer.from(content).toString('base64') };
    } else if (endpoint === '/pulls/42') data = pr;
    else if (endpoint.startsWith('/commits/')) data = [pr];
    else if (endpoint.startsWith('/compare/')) data = { status: 'ahead' };
    else if (endpoint.startsWith('/actions/workflows/ci.yml/runs')) data = { workflow_runs: [{ id: 1, head_sha: head,
      event: 'pull_request', run_attempt: 1, head_branch: pr.head.ref,
      repository: { full_name: repo }, head_repository: { full_name: repo },
      pull_requests: [{ number: pr.number, url: `https://api.github.com/repos/${repo}/pulls/${pr.number}`,
        head: { ref: pr.head.ref, sha: head, repo: { id: 1451566604, name: 'kinotv', url: `https://api.github.com/repos/${repo}` } },
        base: { ref: 'main', sha: 'c'.repeat(40), repo: { id: 1451566604, name: 'kinotv', url: `https://api.github.com/repos/${repo}` } } }],
      path: '.github/workflows/ci.yml', status: 'completed', conclusion: 'success' }] };
    else if (endpoint.startsWith('/git/matching-refs/')) data = state.tag ? [{ ref: 'refs/tags/v0.1.0', object: { type: 'commit', sha: state.tag } }] : [];
    else if (endpoint === '/git/refs') {
      assert.equal(body.sha, sha); assert.equal(body.ref, 'refs/tags/v0.1.0'); assert.equal(state.tag, undefined);
      state.tag = sha; data = {};
    } else if (endpoint.startsWith('/git/ref/tags/')) data = { object: { type: 'commit', sha: state.moved ? 'c'.repeat(40) : state.tag } };
    else if (endpoint === '/releases' && method === 'POST') {
      assert.equal(body.draft, true);
      assert.equal(body.tag_name, 'v0.1.0');
      assert.equal(body.target_commitish, sha);
      assert.equal(state.tag, sha);
      assert.equal(state.release, undefined);
      state.release = { id: 7, ...body, published_at: null, immutable: false, prerelease: false };
      data = state.release;
    } else if (endpoint.startsWith('/releases?') || endpoint === '/releases') data = [state.release, state.newer && { tag_name: 'v0.2.0', draft: false, prerelease: false }].filter(Boolean);
    else if (endpoint === '/releases/7') {
      if (method === 'PATCH') {
        if (state.failPublish) throw new Error('publication interrupted');
        assert.equal(body.draft, false); assert.equal(state.assets.length, 4);
        state.release.draft = false; state.release.published_at = '2026-11-18T12:00:00Z';
      }
      data = state.release;
    } else if (endpoint.startsWith('/releases/7/assets?')) data = state.assets.map(({ bytes, ...metadata }) => metadata);
    else if (endpoint.startsWith('https://uploads.github.com/')) {
      const name = decodeURIComponent(endpoint.split('name=')[1]);
      if (name === state.failUpload) throw new Error('upload interrupted');
      const bytes = Buffer.from(input);
      state.assets.push({ id: Math.max(0, ...state.assets.map(a => a.id)) + 1, name, size: bytes.length,
        state: 'uploaded', digest: `sha256:${hash(bytes)}`, bytes }); data = {};
    } else if (endpoint.startsWith('/releases/assets/')) {
      const index = state.assets.findIndex(a => a.id === Number(endpoint.split('/').pop()));
      assert.ok(index >= 0);
      if (method === 'DELETE') { state.assets.splice(index, 1); data = {}; }
      else return state.corruptDownload ? Buffer.from('corrupt') : state.assets[index].bytes;
    } else if (endpoint === '/issues/42/labels') {
      if (state.failLabel) throw new Error('label update interrupted');
      pr.labels = (method === 'POST' ? [...new Set([...pr.labels.map(l => l.name), ...body.labels])] : body.labels).map(name => ({ name })); data = pr.labels;
    } else assert.fail(`Unexpected gh operation: ${args.join(' ')}`);
    return Buffer.from(JSON.stringify(args.includes('--slurp') ? [data] : data));
  };
  const api = new GitHub({ repo, gh });
  return { api, root, state, files, pr, sources, async approval() { return approve(api, { sourceSha: sha, bot }); },
    close() { rmSync(root, { recursive: true, force: true }); } };
}

test('exact merge creates tag, validates all hosted draft bytes, and automatically publishes once', async () => {
  const s = server();
  try {
    const result = await publish(s.api, await s.approval(), { root: s.root });
    assert.equal(result.status, 'published');
    assert.equal(s.state.tag, sha);
    assert.equal(s.state.release.draft, false);
    assert.deepEqual(s.state.assets.map(a => a.name).sort(), Object.keys(s.files).sort());
    assert.deepEqual(s.pr.labels, [{ name: 'autorelease: tagged' }]);
    s.state.mutations.length = 0;
    assert.equal((await publish(s.api, await s.approval(), { root: s.root })).status, 'already-published');
    assert.ok(s.state.mutations.every(m => m.includes('/labels')));
  } finally { s.close(); }
});

test('new draft omitted from lists until direct ID read still completes validated publication', async () => {
  const s = server();
  let readCreatedId = false;
  const api = new GitHub({ repo, gh(args, input) {
    if (args[1] === `repos/${repo}/releases/7`) readCreatedId = true;
    if (s.state.release && !readCreatedId && args[1]?.startsWith(`repos/${repo}/releases?`)) return Buffer.from('[[]]');
    return s.api.gh(args, input);
  } });
  try {
    assert.equal((await publish(api, await s.approval(), { root: s.root })).status, 'published');
    assert.equal(readCreatedId, true);
    assert.equal(s.state.release.id, 7);
    assert.equal(s.state.mutations.filter(m => m === 'POST /releases').length, 1);
    assert.equal(s.state.assets.length, 4);
  } finally { s.close(); }
});

test('interrupted draft upload and visibility transition recover without moving tag or replacing correct assets', async () => {
  const s = server();
  try {
    const approval = await s.approval();
    s.state.failUpload = 'install.sh';
    await assert.rejects(publish(s.api, approval, { root: s.root }), /upload interrupted/);
    assert.equal(s.state.release.draft, true);
    const id = s.state.assets[0].id;
    s.state.failUpload = undefined;
    s.state.failPublish = true;
    await assert.rejects(publish(s.api, approval, { root: s.root }), /publication interrupted/);
    assert.equal(s.state.release.draft, true);
    s.state.failPublish = false;
    await publish(s.api, approval, { root: s.root });
    assert.equal(s.state.assets[0].id, id);
    assert.equal(s.state.mutations.filter(m => m === 'POST /git/refs').length, 1);
  } finally { s.close(); }
});

test('lost label response after public transition resumes by verifying immutable public assets', async () => {
  const s = server();
  try {
    const approval = await s.approval();
    s.state.failLabel = true;
    await assert.rejects(publish(s.api, approval, { root: s.root }), /label update/);
    assert.equal(s.state.release.draft, false);
    s.state.failLabel = false;
    s.state.mutations.length = 0;
    await publish(s.api, approval, { root: s.root });
    assert.ok(s.state.mutations.every(m => m.includes('/labels')));
  } finally { s.close(); }
});

for (const kind of ['stale-main', 'newer-public', 'moved-tag', 'bad-checksum', 'signed-widget', 'wrong-widget', 'wrong-local-version', 'extra-file']) {
  test(`rejects ${kind} without remote mutation`, async () => {
    const s = server();
    try {
      const approval = await s.approval();
      if (kind === 'stale-main') s.state.mainVersion = '0.2.0';
      if (kind === 'newer-public') s.state.newer = true;
      if (kind === 'moved-tag') s.state.tag = 'c'.repeat(40);
      if (kind === 'bad-checksum') writeFileSync(join(s.root, 'dist-release/SHA256SUMS'), 'bad');
      if (kind === 'extra-file') writeFileSync(join(s.root, 'dist-release/unexpected'), 'extra');
      if (kind === 'wrong-local-version') writeFileSync(join(s.root, 'package.json'), '{"version":"0.2.0"}');
      if (['signed-widget', 'wrong-widget'].includes(kind)) {
        s.files['KinoTV.wgt'] = Buffer.from(zipSync({ 'config.xml': Buffer.from(renderConfigXml({ version: kind === 'wrong-widget' ? '0.2.0' : '0.1.0' })),
          ...(kind === 'signed-widget' ? { 'signature1.xml': Buffer.from('signature') } : {}) }));
        writeFileSync(join(s.root, 'dist-release/KinoTV.wgt'), s.files['KinoTV.wgt']);
        writeFileSync(join(s.root, 'dist-release/SHA256SUMS'), ['KinoTV.wgt', 'install.sh', 'kinotv-installer.mjs'].map(name => `${hash(s.files[name])}  ${name}\n`).join(''));
      }
      await assert.rejects(publish(s.api, approval, { root: s.root }));
      assert.deepEqual(s.state.mutations, []);
    } finally { s.close(); }
  });
}

for (const kind of ['identity', 'target', 'unexpected-assets', 'bytes']) {
  test(`public retry rejects ${kind} and never replaces or republishes assets`, async () => {
    const s = server();
    try {
      const approval = await s.approval();
      await publish(s.api, approval, { root: s.root });
      if (kind === 'identity') s.state.release.body = 'other approval';
      if (kind === 'target') s.state.release.target_commitish = head;
      if (kind === 'unexpected-assets') s.state.assets.push({ ...s.state.assets[0], id: 99, name: 'extra' });
      if (kind === 'bytes') s.state.assets[0].bytes = Buffer.from('wrong');
      s.state.mutations.length = 0;
      await assert.rejects(publish(s.api, approval, { root: s.root }));
      assert.deepEqual(s.state.mutations, []);
    } finally { s.close(); }
  });
}

test('hosted readback corruption never makes a draft public', async () => {
  const s = server();
  try {
    s.state.corruptDownload = true;
    await assert.rejects(publish(s.api, await s.approval(), { root: s.root }), /validation failed/);
    assert.equal(s.state.release.draft, true);
    assert.ok(!s.state.mutations.includes('PATCH /releases/7'));
  } finally { s.close(); }
});
