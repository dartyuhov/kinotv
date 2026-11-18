// Stage/retry a draft only: node tools/release/draft.ts
// Run from the checked-out tagged project after release:assets. No OAuth secrets needed here.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readProject, RELEASE_REPOSITORY, releaseProjectProblems } from './project.ts';

/** GitHub CLI boundary. Binary bodies in both directions; tests inject an in-memory server. */
export type Gh = (args: string[], input?: Buffer) => Buffer;
const ghCli: Gh = (args, input) => {
  const result = spawnSync('gh', args, {
    input, maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1' },
  });
  if (result.error || result.status !== 0) {
    throw new Error(`gh failed; draft may be incomplete. Re-run after resolving the failure. ${result.error?.message ?? result.stderr?.toString()}`);
  }
  return result.stdout;
};

const names = ['KinoTV.wgt', 'install.sh', 'kinotv-installer.mjs', 'SHA256SUMS'] as const;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
interface Release { id: number; tag_name: string; draft: boolean; published_at: string | null; immutable?: boolean }
interface Asset { id: number; name: string; state: string; size: number; digest?: string | null }

export async function stageDraft({ root = process.cwd(), env = process.env, gh = ghCli }: {
  root?: string; env?: NodeJS.ProcessEnv; gh?: Gh;
} = {}): Promise<void> {
  const project = readProject(root);
  const tag = env.GITHUB_REF_NAME;
  const repo = env.GITHUB_REPOSITORY;
  const sha = env.GITHUB_SHA;
  const problems = releaseProjectProblems(project, root);
  if (problems.length || tag !== `v${project.version}` || repo?.toLowerCase() !== RELEASE_REPOSITORY || project.githubRepo?.toLowerCase() !== RELEASE_REPOSITORY || !/^[0-9a-f]{40}$/.test(sha ?? '')) {
    throw new Error(`Invalid release tag, repository, source SHA or project configuration. ${problems.join(' ')}`);
  }
  const base = `repos/${RELEASE_REPOSITORY}`;
  const api = (endpoint: string, extra: string[] = [], input?: Buffer) => gh(['api', endpoint, ...extra], input);
  const json = <T>(endpoint: string, extra: string[] = []): T => JSON.parse(api(endpoint, extra).toString()) as T;
  const pages = <T>(endpoint: string): T[] => json<T[][]>(endpoint, ['--paginate', '--slurp']).flat();
  const draft = (release: Release): Release => {
    if (!Number.isSafeInteger(release?.id) || release.id <= 0 || release.tag_name !== tag || release.draft !== true || release.published_at !== null || release.immutable === true) {
      throw new Error('Refusing public/completed or mismatched release; no asset or tag recovery is allowed.');
    }
    return release;
  };

  // First remote operation: include drafts and distinguish absence from authentication/network errors.
  // Do not infer "absent" from a failed `release view` / HTTP 404.
  const matches = pages<Release>(`${base}/releases?per_page=100`).filter((release) => release.tag_name === tag);
  if (matches.length > 1) throw new Error('Ambiguous releases for this tag.');
  let release = matches[0] ? draft(matches[0]) : undefined;

  const verifyTag = () => {
    let object = json<{ object: { type: string; sha: string } }>(`${base}/git/ref/tags/${tag}`).object;
    for (let depth = 0; object?.type === 'tag' && depth < 8; depth++) {
      object = json<{ object: { type: string; sha: string } }>(`${base}/git/tags/${object.sha}`).object;
    }
    if (object?.type !== 'commit' || object.sha !== sha) throw new Error('Existing remote tag does not resolve to the checked-out source SHA. No tag will be created or moved.');
  };
  verifyTag();

  // Validate local bytes before creating a draft or changing any existing asset.
  const local = new Map(names.map((name) => [name, readFileSync(join(root, 'dist-release', name))]));
  if ([...local.values()].some((bytes) => !bytes.length)) throw new Error('Empty local release asset.');
  const manifest = names.slice(0, 3).map((name) => `${hash(local.get(name)!)}  ${name}\n`).join('');
  if (local.get('SHA256SUMS')!.toString() !== manifest) throw new Error('Local SHA256SUMS does not match the complete payload set.');

  if (!release) {
    gh(['release', 'create', tag!, '--repo', RELEASE_REPOSITORY, '--draft', '--verify-tag', '--title', `KinoTV ${tag}`, '--generate-notes']);
    const created = pages<Release>(`${base}/releases?per_page=100`).filter((item) => item.tag_name === tag);
    if (created.length !== 1) throw new Error('Could not uniquely resolve the created draft; retry after inspection.');
    release = draft(created[0]!);
  }
  const id = release.id;
  const checkDraft = () => {
    const current = draft(json<Release>(`${base}/releases/${id}`));
    if (current.id !== id) throw new Error('Release identity changed.');
    verifyTag();
  };
  const assets = () => {
    const listed = pages<Asset>(`${base}/releases/${id}/assets?per_page=100`);
    if (listed.some((asset) => !Number.isSafeInteger(asset.id) || asset.id <= 0) || new Set(listed.map((asset) => asset.id)).size !== listed.length) {
      throw new Error('Invalid server asset identities.');
    }
    return listed;
  };
  const download = (asset: Asset) => api(`${base}/releases/assets/${asset.id}`, ['-H', 'Accept: application/octet-stream']);
  const valid = (asset: Asset, bytes: Buffer) => asset.state === 'uploaded' && asset.size === bytes.length &&
    (!asset.digest || asset.digest === `sha256:${hash(bytes)}`) && download(asset).equals(bytes);

  const initial = assets();
  if (initial.some((asset) => !names.some((name) => name === asset.name)) || new Set(initial.map((asset) => asset.name)).size !== initial.length) {
    throw new Error('Duplicate or unexpected existing server assets; inspect the draft manually.');
  }
  for (const name of names) {
    checkDraft();
    const found = assets().filter((asset) => asset.name === name);
    if (found.length > 1) throw new Error(`Duplicate server asset: ${name}.`);
    if (found[0]) {
      if (valid(found[0], local.get(name)!)) continue;
      // Delete only the observed bad asset ID, never a name-based --clobber that
      // could resolve a different release/asset after a concurrent change.
      checkDraft();
      api(`${base}/releases/assets/${found[0].id}`, ['--method', 'DELETE']);
    }
    checkDraft();
    api(`https://uploads.github.com/${base}/releases/${id}/assets?name=${encodeURIComponent(name)}`,
      ['--method', 'POST', '-H', 'Content-Type: application/octet-stream', '--input', '-'], local.get(name));
  }
  checkDraft();
  const final = assets();
  if (final.length !== names.length || new Set(final.map((asset) => asset.name)).size !== names.length) throw new Error('Incomplete or unexpected server asset set.');
  for (const name of names) {
    const asset = final.find((item) => item.name === name);
    if (!asset || !valid(asset, local.get(name)!)) throw new Error(`Server asset validation failed: ${name}.`);
  }
  checkDraft();
  const afterDownloads = assets();
  if (afterDownloads.length !== final.length || final.some((asset) => !afterDownloads.some((current) =>
    current.id === asset.id && current.name === asset.name && current.state === asset.state && current.size === asset.size && current.digest === asset.digest))) {
    throw new Error('Server asset set changed during validation; retry after inspection.');
  }
  // GitHub has no conditional "mutate only if draft" asset API. Concurrency serializes
  // this workflow; maintainers must wait for it to finish before publishing manually.
  checkDraft();
  console.log(`Validated draft ${tag}: all four assets match local bytes and SHA256SUMS. Manual maintainer publication only after legal and launch acceptance; this does not establish publication readiness.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await stageDraft(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
