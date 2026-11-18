import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { PullRequestBody } from 'release-please/build/src/util/pull-request-body.js';
import { PullRequestTitle } from 'release-please/build/src/util/pull-request-title.js';
import { releaseVersionProblems } from '../project.ts';
import { stageDraft } from '../draft.ts';
import { kinoTvManifestVersion } from '../../tizen/configXml.ts';
export { ghCli } from '../gh.ts';
import { ghCli } from '../gh.ts';

export const check = (condition, message) => { if (!condition) throw new Error(message); };
const fullSha = /^[0-9a-f]{40}$/;
const branch = 'release-please--branches--main--components--kinotv';
const quiet = { warn() {}, info() {}, debug() {}, error() {}, trace() {} };

export class GitHub {
  constructor({ repo, gh = ghCli }) {
    check(repo === 'dartyuhov/kinotv', 'Expected dartyuhov/kinotv repository');
    this.repo = repo;
    this.gh = gh;
  }
  async request(path, { method, body } = {}) {
    const args = ['api', `repos/${this.repo}${path}`];
    if (method) args.push('--method', method);
    if (body !== undefined) args.push('--input', '-');
    const bytes = this.gh(args, body === undefined ? undefined : Buffer.from(JSON.stringify(body)));
    return bytes.length ? JSON.parse(bytes) : undefined;
  }
  async list(path) {
    const pages = JSON.parse(this.gh(['api', `repos/${this.repo}${path}${path.includes('?') ? '&' : '?'}per_page=100`, '--paginate', '--slurp']));
    return pages.flatMap(page => Array.isArray(page) ? page : page.workflow_runs);
  }
  async file(path, sha) {
    const file = await this.request(`/contents/${path}?ref=${sha}`);
    check(file.encoding === 'base64', `Unsupported content encoding: ${path}`);
    return Buffer.from(file.content, 'base64');
  }
}

// Actions concurrency is a lossy wake-up mechanism, not the release queue.
// Closed PR state is durable; enumerate every page without search-index lag or
// update-order assumptions, then always attempt the oldest pending merge first.
export async function pendingApproval(api, { bot }) {
  check(bot && /^[\w-]+\[bot\]$/.test(bot), 'Configure RELEASE_APP_BOT_LOGIN; see docs/releases.md');
  const pending = (await api.list('/pulls?state=closed&base=main&sort=updated&direction=asc'))
    .filter(pr => pr.merged_at && pr.user?.login === bot && pr.head?.ref === branch &&
      pr.head.repo?.full_name === api.repo && pr.base?.repo?.full_name === api.repo &&
      pr.base.ref === 'main' && pr.labels.some(l => l.name === 'autorelease: pending'))
    .sort((a, b) => Date.parse(a.merged_at) - Date.parse(b.merged_at) || a.number - b.number);
  if (!pending.length) return undefined;
  // Do not skip a failed/unready/stale oldest approval to publish a later one.
  return approve(api, { prNumber: pending[0].number, bot });
}

export async function resolveApproval(api, { bot, prNumber, sourceSha }) {
  if (!prNumber) return pendingApproval(api, { bot });
  const approval = await approve(api, { bot, prNumber, sourceSha });
  if (approval.pending) {
    const oldest = await pendingApproval(api, { bot });
    check(oldest?.prNumber === approval.prNumber, 'An older pending release must complete first');
  }
  return approval;
}

export async function approve(api, { sourceSha, prNumber, bot }) {
  check(bot && /^[\w-]+\[bot\]$/.test(bot), 'Configure RELEASE_APP_BOT_LOGIN to the installed release App bot login; see docs/releases.md');
  let pr;
  if (prNumber) {
    check(/^[1-9]\d*$/.test(String(prNumber)), 'Invalid release PR number');
    pr = await api.request(`/pulls/${prNumber}`);
  } else {
    check(fullSha.test(sourceSha), 'Expected exact push source SHA');
    const matches = (await api.list(`/commits/${sourceSha}/pulls`)).filter(p =>
      p.merge_commit_sha === sourceSha && p.head?.ref === branch && p.user?.login === bot);
    if (!matches.length) return undefined;
    check(matches.length === 1, 'Ambiguous release approval');
    pr = await api.request(`/pulls/${matches[0].number}`);
  }
  check(pr.merged && pr.merged_at && fullSha.test(pr.merge_commit_sha) && fullSha.test(pr.head?.sha), 'Release PR must be merged with exact source SHAs');
  check(!sourceSha || pr.merge_commit_sha === sourceSha, 'Release PR merge differs from push');
  check(pr.user?.login === bot && pr.head.ref === branch && pr.head.repo?.full_name === api.repo &&
    pr.base?.repo?.full_name === api.repo && pr.base.ref === 'main', 'Not a trusted Release Please PR');
  check(pr.labels.some(l => ['autorelease: pending', 'autorelease: tagged'].includes(l.name)), 'Release PR lacks lifecycle label');
  const sha = pr.merge_commit_sha;
  check(['ahead', 'identical'].includes((await api.request(`/compare/${sha}...main`)).status), 'Approved source is not on main');
  const pkg = JSON.parse(await api.file('package.json', sha));
  const version = pkg.version;
  check(typeof version === 'string' && !releaseVersionProblems(version).length && version !== '0.0.0', 'Invalid release version');
  check(pkg.kinotv?.githubRepo === api.repo, 'Package/repository mismatch');
  const lock = JSON.parse(await api.file('package-lock.json', sha));
  check(lock.version === version && lock.packages?.['']?.version === version, 'Package lock/version mismatch');
  check(JSON.parse(await api.file('.release-please-manifest.json', sha))['.'] === version, 'Release manifest/version mismatch');
  const title = PullRequestTitle.parse(pr.title, undefined, undefined, quiet);
  const data = PullRequestBody.parse(pr.body ?? '', quiet)?.releaseData;
  check(title?.getVersion()?.toString() === version && data?.length === 1 && data[0].version.toString() === version && data[0].notes?.trim(), 'Release Please PR/version markers mismatch');
  const changelog = (await api.file('CHANGELOG.md', sha)).toString();
  check(new RegExp(`^## \\[?${version.replaceAll('.', '\\.')}[\\] (]`, 'm').test(changelog), 'Missing committed changelog entry');
  await trustedChecks(api, pr);
  return { sha, version, tag: `v${version}`, prNumber: pr.number, notes: data[0].notes, bot,
    pending: pr.labels.some(l => l.name === 'autorelease: pending') };
}

async function trustedChecks(api, pr) {
  // REST head_sha is the PR head, not the synthetic merge github.sha tested by
  // checkout. PR associations use minimal repo objects (url, not full_name).
  const repoUrl = `https://api.github.com/repos/${api.repo}`;
  let commitAssociation;
  async function associated(run) {
    if (!Array.isArray(run.pull_requests)) return false;
    if (run.pull_requests.length) return run.pull_requests.some(p =>
      p.number === pr.number && p.url === `${repoUrl}/pulls/${pr.number}` &&
      p.head?.repo?.url === repoUrl && p.base?.repo?.url === repoUrl && p.base.ref === 'main');
    // GitHub can serialize merged PR runs with pull_requests: []. Establish
    // the link independently; exact run SHA/repository/workflow/branch checks
    // below still apply, and a conflicting nonempty association never falls back.
    commitAssociation ??= (await api.list(`/commits/${pr.head.sha}/pulls`)).some(p =>
      p.number === pr.number && p.merged_at && p.merge_commit_sha === pr.merge_commit_sha &&
      p.head?.sha === pr.head.sha && p.head.ref === branch && p.head.repo?.full_name === api.repo &&
      p.base?.ref === 'main' && p.base.repo?.full_name === api.repo);
    return commitAssociation;
  }
  for (const [sha, event, expectedBranch] of [[pr.head.sha, 'pull_request', branch], [pr.merge_commit_sha, 'push', 'main']]) {
    const candidates = (await api.list(`/actions/workflows/ci.yml/runs?event=${event}&head_sha=${sha}`))
      .filter(r => r.head_sha === sha && r.path === '.github/workflows/ci.yml' &&
        r.event === event && r.head_branch === expectedBranch && r.repository?.full_name === api.repo &&
        r.head_repository?.full_name === api.repo)
      .sort((a, b) => b.id - a.id || b.run_attempt - a.run_attempt);
    const runs = [];
    for (const run of candidates) if (event === 'push' || await associated(run)) runs.push(run);
    if (runs.length) {
      // Latest run/attempt wins, even when queued or failed. Main is only a
      // fallback for absent trusted PR CI, never a bypass of a known failure.
      check(runs[0].status === 'completed' && runs[0].conclusion === 'success', 'Latest trusted CI is not successful; wait for CI and retry this merged release PR');
      return;
    }
  }
  throw new Error('No successful trusted CI at exact release merge or PR head SHA; wait for CI and retry');
}

export function validateLocal(root, approval) {
  const directory = join(root, 'dist-release');
  const names = ['KinoTV.wgt', 'install.sh', 'kinotv-installer.mjs'];
  check(readdirSync(directory).sort().join() === [...names, 'SHA256SUMS'].sort().join(), 'Expected exactly four release assets');
  const sums = names.map(name => {
    const bytes = readFileSync(join(directory, name));
    check(bytes.length, `Empty release asset: ${name}`);
    return `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`;
  }).join('');
  check(readFileSync(join(directory, 'SHA256SUMS'), 'utf8') === sums, 'Local checksum mismatch');
  const widget = unzipSync(readFileSync(join(directory, 'KinoTV.wgt')));
  check(!Object.keys(widget).some(name => /(^|\/)(author-signature|signature\d+)\.xml$/.test(name)), 'Release WGT must be unsigned');
  check(kinoTvManifestVersion(Buffer.from(widget['config.xml'] ?? []).toString()) === approval.version, 'Widget/version mismatch');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
  check(pkg.version === approval.version && pkg.kinotv?.githubRepo === 'dartyuhov/kinotv', 'Local package/source mismatch');
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json')));
  check(lock.version === approval.version && lock.packages?.['']?.version === approval.version, 'Local package lock/version mismatch');
}

async function tagCommit(api, tag) {
  const refs = await api.request(`/git/matching-refs/tags/${tag}`);
  const matching = refs.filter(ref => ref.ref === `refs/tags/${tag}`);
  check(matching.length <= 1, 'Ambiguous release tag');
  let object = matching[0]?.object;
  if (!object) return undefined;
  for (let depth = 0; object.type === 'tag' && depth < 8; depth++) object = (await api.request(`/git/tags/${object.sha}`)).object;
  check(object.type === 'commit', 'Release tag must resolve to a commit');
  return object.sha;
}

async function guard(api, approval) {
  const main = JSON.parse(await api.file('package.json', 'main'));
  check(main.version === approval.version, 'Stale release version: main now names another version');
  const releases = await api.list('/releases');
  check(releases.filter(r => r.tag_name === approval.tag).length <= 1, 'Ambiguous releases for tag');
  for (const release of releases.filter(r => !r.draft && !r.prerelease)) {
    const version = release.tag_name.replace(/^v/, '');
    check(!releaseVersionProblems(version).length, 'Unrecognized public release version');
    const left = version.split('.').map(Number), right = approval.version.split('.').map(Number);
    const different = left.findIndex((value, i) => value !== right[i]);
    check(different === -1 || left[different] < right[different], 'Stale release: newer version already published');
    if (release.tag_name !== approval.tag) {
      const source = await tagCommit(api, release.tag_name);
      check(source && ['ahead', 'identical'].includes((await api.request(`/compare/${source}...${approval.sha}`)).status), 'Release would move source history backward');
    }
  }
  const source = await tagCommit(api, approval.tag);
  check(!source || source === approval.sha, 'Existing release tag/source mismatch; tags are never moved');
  return { source, release: releases.find(r => r.tag_name === approval.tag) };
}

export async function publish(api, expected, { root = process.cwd() } = {}) {
  const approval = await approve(api, { prNumber: expected.prNumber, bot: expected.bot });
  check(approval.sha === expected.sha && approval.version === expected.version, 'Approval changed');
  validateLocal(root, approval);
  const marker = `<!-- kinotv-release pr=${approval.prNumber} sha=${approval.sha} -->`;
  const before = await guard(api, approval);
  if (before.release) check(before.release.body === `${approval.notes}\n\n${marker}` &&
    before.release.target_commitish === approval.sha && before.release.prerelease === false, 'Release identity mismatch');
  check(approval.pending || before.release?.draft === false, 'Only pending approval can stage a release');
  if (!before.source) {
    check(!before.release || before.release.draft, 'Public release tag missing');
    await api.request('/git/refs', { method: 'POST', body: { ref: `refs/tags/${approval.tag}`, sha: approval.sha } });
  }
  const staged = await stageDraft({ root, gh: api.gh, approval: { marker, notes: approval.notes }, env: {
    GITHUB_REPOSITORY: api.repo, GITHUB_REF_NAME: approval.tag, GITHUB_SHA: approval.sha,
  } });
  if (!staged.published) {
    // Recheck identity, approval, chronology, and source after hosted readback.
    const current = await approve(api, { prNumber: approval.prNumber, bot: approval.bot });
    check(current.pending && current.sha === approval.sha && current.version === approval.version, 'Approval changed during staging');
    const final = await guard(api, approval);
    check(final.source === approval.sha && final.release?.id === staged.id && final.release.draft &&
      final.release.body === `${approval.notes}\n\n${marker}` && final.release.target_commitish === approval.sha &&
      final.release.prerelease === false, 'Validated draft identity changed');
    await api.request(`/releases/${staged.id}`, { method: 'PATCH', body: { draft: false, prerelease: false, make_latest: 'true' } });
  }
  await api.request(`/issues/${approval.prNumber}/labels`, { method: 'POST', body: { labels: ['autorelease: tagged'] } });
  // Replace labels as one update, retaining unrelated labels and avoiding a
  // delete-404 ambiguity on retries after publication.
  const pr = await api.request(`/pulls/${approval.prNumber}`);
  await api.request(`/issues/${approval.prNumber}/labels`, { method: 'PUT', body: {
    labels: [...new Set([...pr.labels.map(l => l.name).filter(l => l !== 'autorelease: pending'), 'autorelease: tagged'])],
  } });
  return { status: staged.published ? 'already-published' : 'published', tag: approval.tag, sha: approval.sha };
}
