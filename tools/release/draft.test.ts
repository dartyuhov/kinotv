import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { stageDraft, type Gh } from './draft.ts';

const repo = 'dartyuhov/kinotv';
const sha = 'a'.repeat(40);
const env = { GITHUB_REPOSITORY: repo, GITHUB_REF_NAME: 'v1.4.0', GITHUB_SHA: sha };
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
let root: string;
let files: Record<string, Buffer>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kinotv-draft-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.4.0', kinotv: { githubRepo: repo } }));
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ version: '1.4.0', packages: { '': { version: '1.4.0' } } }));
  mkdirSync(join(root, 'dist-release'));
  files = { 'KinoTV.wgt': Buffer.from('widget'), 'install.sh': Buffer.from('installer shell'), 'kinotv-installer.mjs': Buffer.from('installer module') };
  files.SHA256SUMS = Buffer.from(Object.entries(files).map(([name, bytes]) => `${hash(bytes)}  ${name}\n`).join(''));
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(root, 'dist-release', name), bytes);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

// Controlled GitHub boundary: no test invokes gh or uses a token/network connection.
function github() {
  const calls: string[][] = [];
  const assets: Array<{ id: number; name: string; state: string; size: number; digest: string; bytes: Buffer }> = [];
  let release: { id: number; tag_name: string; draft: boolean; published_at: string | null; immutable: boolean } | null = null;
  const gh: Gh = (args, input) => {
    calls.push(args);
    if (args[1] === `repos/${repo}/releases` && args.includes('POST')) {
      expect(args).toEqual(['api', `repos/${repo}/releases`, '--method', 'POST', '--input', '-']);
      expect(JSON.parse(input!.toString())).toEqual({ tag_name: 'v1.4.0', target_commitish: sha, name: 'KinoTV v1.4.0', draft: true, generate_release_notes: true });
      release = { id: 7, tag_name: 'v1.4.0', draft: true, published_at: null, immutable: false };
      return Buffer.from(JSON.stringify(release));
    }
    const endpoint = args[1]!;
    const method = args[args.indexOf('--method') + 1];
    let result: unknown;
    if (endpoint === `repos/${repo}/releases?per_page=100`) result = [release ? [release] : []];
    else if (endpoint === `repos/${repo}/git/ref/tags/v1.4.0`) result = { object: { type: 'commit', sha } };
    else if (endpoint === `repos/${repo}/releases/7`) result = release;
    else if (endpoint === `repos/${repo}/releases/7/assets?per_page=100`) result = [assets.map(({ bytes: _bytes, ...metadata }) => metadata)];
    else if (endpoint.startsWith(`https://uploads.github.com/repos/${repo}/releases/7/assets?name=`)) {
      expect(method).toBe('POST');
      const name = decodeURIComponent(endpoint.split('name=')[1]!);
      expect(assets.some((asset) => asset.name === name)).toBe(false);
      const bytes = Buffer.from(input!);
      assets.push({ id: Math.max(0, ...assets.map((a) => a.id)) + 1, name, state: 'uploaded', size: bytes.length, digest: `sha256:${hash(bytes)}`, bytes });
      result = {};
    } else if (endpoint.startsWith(`repos/${repo}/releases/assets/`)) {
      const index = assets.findIndex((asset) => asset.id === Number(endpoint.split('/').pop()));
      if (index < 0) throw new Error('HTTP 404');
      if (method === 'DELETE') { assets.splice(index, 1); result = {}; }
      else { expect(args).toContain('Accept: application/octet-stream'); return assets[index]!.bytes; }
    } else throw new Error(`Unexpected gh command: ${args.join(' ')}`);
    return Buffer.from(JSON.stringify(result));
  };
  return { gh, calls, assets, get release() { return release; }, set release(value) { release = value; } };
}

it('creates only a draft for an existing tag and verifies the entire downloaded asset contract', async () => {
  const server = github();
  await stageDraft({ root, env, gh: server.gh });
  expect(server.calls[0]?.[1]).toBe(`repos/${repo}/releases?per_page=100`);
  expect(server.release?.draft).toBe(true);
  expect(server.assets.map((a) => a.name).sort()).toEqual(Object.keys(files).sort());
  expect(server.calls.filter((args) => args.includes('Accept: application/octet-stream'))).toHaveLength(4);
  expect(server.calls.some((args) => args.includes('PATCH') || args.includes('--clobber'))).toBe(false);
});

it('returns the exact validated draft identity for the automatic publisher', async () => {
  const server = github();
  expect(await stageDraft({ root, env, gh: server.gh })).toEqual({ id: 7, tag: 'v1.4.0', sha, published: false });
});

it('resolves the created draft by its returned identity even when release lists omit it', async () => {
  const server = github();
  const gh: Gh = (args, input) => {
    if (args[1] === `repos/${repo}/releases?per_page=100`) return Buffer.from('[[]]');
    return server.gh(args, input);
  };
  expect(await stageDraft({ root, env, gh })).toEqual({ id: 7, tag: 'v1.4.0', sha, published: false });
  expect(server.assets).toHaveLength(4);
});

it.each([
  null, { id: undefined }, { id: -1 }, { id: '7' }, { id: 8, tag_name: 'v9.9.9' },
  { id: 7, draft: false, published_at: '2026-11-18T00:00:00Z' }, { id: 7, immutable: true },
])('rejects malformed or unsafe create identity before any asset mutation: %j', async (changes) => {
  const server = github();
  const gh: Gh = (args, input) => {
    const result = server.gh(args, input);
    if (args[1] === `repos/${repo}/releases` && args.includes('POST')) {
      return Buffer.from(JSON.stringify(changes === null ? null : { ...server.release, ...changes }));
    }
    return result;
  };
  await expect(stageDraft({ root, env, gh })).rejects.toThrow();
  expect(server.assets).toEqual([]);
  expect(server.calls.filter((args) => args.includes('--method'))).toHaveLength(1);
});

it.each(['id', 'visibility', 'unavailable'])('rejects changed or unreadable created draft %s before asset writes', async (kind) => {
  const server = github();
  const gh: Gh = (args, input) => {
    if (args[1] === `repos/${repo}/releases/7`) {
      if (kind === 'unavailable') throw new Error('HTTP 404');
      return Buffer.from(JSON.stringify({ ...server.release, ...(kind === 'id' ? { id: 8 } : { draft: false, published_at: '2026-11-18T00:00:00Z' }) }));
    }
    return server.gh(args, input);
  };
  await expect(stageDraft({ root, env, gh })).rejects.toThrow();
  expect(server.assets).toEqual([]);
  expect(server.calls.filter((args) => args.includes('--method'))).toHaveLength(1);
});

it('retries an interrupted upload, retains correct assets, repairs a corrupt draft asset and is then a read-only no-op', async () => {
  const server = github();
  const interrupted: Gh = (args, input) => {
    if (args[1]?.includes('name=install.sh')) throw new Error('upload interrupted');
    return server.gh(args, input);
  };
  await expect(stageDraft({ root, env, gh: interrupted })).rejects.toThrow('upload interrupted');
  expect(server.assets.map((a) => a.name)).toEqual(['KinoTV.wgt']);
  const retainedId = server.assets[0]!.id;
  server.assets.push({ id: 8, name: 'install.sh', bytes: Buffer.from('broken'), state: 'starter', size: 0, digest: '' });
  await stageDraft({ root, env, gh: server.gh });
  expect(server.assets.find((a) => a.name === 'KinoTV.wgt')?.id).toBe(retainedId);
  expect(server.calls.filter((args) => args.includes('DELETE'))).toHaveLength(1);
  server.calls.length = 0;
  await stageDraft({ root, env, gh: server.gh });
  expect(server.calls.every((args) => args[0] === 'api' && !args.includes('--method'))).toBe(true);
});

it.each([
  { draft: false, published_at: '2026-11-17T00:00:00Z' },
  { draft: true, published_at: '2026-11-17T00:00:00Z' },
  { draft: true, immutable: true },
])('rejects a public/completed release before tag lookup or any mutation: %j', async (changes) => {
  const server = github();
  server.release = Object.assign({ id: 7, tag_name: 'v1.4.0', draft: true, published_at: null, immutable: false }, changes);
  await expect(stageDraft({ root, env, gh: server.gh })).rejects.toThrow('public/completed');
  expect(server.calls).toHaveLength(1);
});

it.each(['GITHUB_REF_NAME', 'GITHUB_REPOSITORY', 'GITHUB_SHA'] as const)('rejects incorrect %s before contacting GitHub', async (key) => {
  const server = github();
  await expect(stageDraft({ root, env: { ...env, [key]: 'wrong' }, gh: server.gh })).rejects.toThrow('configuration');
  expect(server.calls).toEqual([]);
});

it.each(['package', 'lock', 'manifest', 'missing', 'empty'])('rejects invalid local %s without remote mutation', async (kind) => {
  const server = github();
  if (kind === 'package') writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.4.0', kinotv: { githubRepo: 'fork/kinotv' } }));
  if (kind === 'lock') writeFileSync(join(root, 'package-lock.json'), '{}');
  if (kind === 'manifest') writeFileSync(join(root, 'dist-release/SHA256SUMS'), 'bad checksum');
  if (kind === 'missing') rmSync(join(root, 'dist-release/KinoTV.wgt'));
  if (kind === 'empty') writeFileSync(join(root, 'dist-release/KinoTV.wgt'), '');
  await expect(stageDraft({ root, env, gh: server.gh })).rejects.toThrow();
  expect(server.calls.every((args) => args[0] === 'api' && !args.includes('--method'))).toBe(true);
});

it.each(['missing', 'moved'])('refuses a %s remote tag rather than creating or moving one', async (kind) => {
  const server = github();
  const gh: Gh = (args, input) => {
    if (args[1]?.includes('/git/ref/')) {
      if (kind === 'missing') throw new Error('HTTP 404');
      return Buffer.from(JSON.stringify({ object: { type: 'commit', sha: 'b'.repeat(40) } }));
    }
    return server.gh(args, input);
  };
  await expect(stageDraft({ root, env, gh })).rejects.toThrow();
  expect(server.release).toBeNull();
});

it('resolves an annotated existing tag to the source commit', async () => {
  const server = github();
  const gh: Gh = (args, input) => {
    if (args[1]?.includes('/git/ref/')) return Buffer.from(JSON.stringify({ object: { type: 'tag', sha: 'b'.repeat(40) } }));
    if (args[1]?.includes('/git/tags/')) return Buffer.from(JSON.stringify({ object: { type: 'commit', sha } }));
    return server.gh(args, input);
  };
  await stageDraft({ root, env, gh });
  expect(server.assets).toHaveLength(4);
});

it('does not interpret failed release lookup as absence', async () => {
  const gh: Gh = () => { throw new Error('HTTP 403'); };
  await expect(stageDraft({ root, env, gh })).rejects.toThrow('HTTP 403');
});

it.each(['bytes', 'size', 'digest', 'state', 'missing', 'extra', 'duplicate', 'identity'])('fails final validation for server %s corruption', async (kind) => {
  const server = github();
  let uploaded = false;
  const gh: Gh = (args, input) => {
    if (uploaded && args[1]?.endsWith('/assets?per_page=100')) {
      uploaded = false;
      const asset = server.assets[0]!;
      if (kind === 'bytes') asset.bytes = Buffer.from('WRONG!'); // same length as widget
      if (kind === 'size') asset.size++;
      if (kind === 'digest') asset.digest = `sha256:${'0'.repeat(64)}`;
      if (kind === 'state') asset.state = 'starter';
      if (kind === 'identity') asset.id = -1;
      if (kind === 'missing') server.assets.shift();
      if (kind === 'extra' || kind === 'duplicate') server.assets.push({ ...asset, id: 99, name: kind === 'extra' ? 'unexpected.zip' : asset.name });
    }
    const result = server.gh(args, input);
    if (args[1]?.includes('name=SHA256SUMS')) uploaded = true;
    return result;
  };
  await expect(stageDraft({ root, env, gh })).rejects.toThrow(/validation|asset set|identities/);
  expect(server.release?.draft).toBe(true);
});

it('stops before the next mutation if a maintainer publishes during a retry', async () => {
  const server = github();
  const gh: Gh = (args, input) => {
    const result = server.gh(args, input);
    if (args[1]?.includes('name=KinoTV.wgt')) server.release!.draft = false;
    return result;
  };
  await expect(stageDraft({ root, env, gh })).rejects.toThrow('public/completed');
  expect(server.assets.map((a) => a.name)).toEqual(['KinoTV.wgt']);
});

it('refuses unexpected existing assets before repairing anything', async () => {
  const server = github();
  await stageDraft({ root, env, gh: server.gh });
  server.assets.push({ ...server.assets[0]!, id: 99, name: 'unreviewed.zip' });
  server.assets[0]!.state = 'starter';
  server.calls.length = 0;
  await expect(stageDraft({ root, env, gh: server.gh })).rejects.toThrow('unexpected');
  expect(server.calls.some((args) => args.includes('--method'))).toBe(false);
});

it.each(['bytes', 'size', 'digest'])('repairs an uploaded draft asset with bad %s', async (kind) => {
  const server = github();
  await stageDraft({ root, env, gh: server.gh });
  const asset = server.assets[0]!;
  if (kind === 'bytes') asset.bytes = Buffer.from('WRONG!');
  if (kind === 'size') asset.size++;
  if (kind === 'digest') asset.digest = `sha256:${'0'.repeat(64)}`;
  server.calls.length = 0;
  await stageDraft({ root, env, gh: server.gh });
  expect(server.calls.filter((args) => args.includes('DELETE'))).toHaveLength(1);
  expect(server.assets.find((a) => a.name === 'KinoTV.wgt')!.bytes).toEqual(files['KinoTV.wgt']);
});

it('fails closed on a download error without deleting the existing asset', async () => {
  const server = github();
  await stageDraft({ root, env, gh: server.gh });
  server.calls.length = 0;
  const gh: Gh = (args, input) => {
    if (args.includes('Accept: application/octet-stream')) throw new Error('HTTP 503');
    return server.gh(args, input);
  };
  await expect(stageDraft({ root, env, gh })).rejects.toThrow('HTTP 503');
  expect(server.calls.some((args) => args.includes('--method'))).toBe(false);
});

it('leaves a recoverable draft when replacement upload fails after deleting a bad asset', async () => {
  const server = github();
  await stageDraft({ root, env, gh: server.gh });
  server.assets[0]!.state = 'starter';
  const gh: Gh = (args, input) => {
    if (args[1]?.includes('name=KinoTV.wgt')) throw new Error('HTTP 502');
    return server.gh(args, input);
  };
  await expect(stageDraft({ root, env, gh })).rejects.toThrow('HTTP 502');
  expect(server.assets).toHaveLength(3);
  expect(server.release?.draft).toBe(true);
  await stageDraft({ root, env, gh: server.gh });
  expect(server.assets).toHaveLength(4);
});

it('does not recover a competing create failure by modifying the other release', async () => {
  const server = github();
  const gh: Gh = (args, input) => {
    if (args[1] === `repos/${repo}/releases` && args.includes('POST')) throw new Error('already exists');
    return server.gh(args, input);
  };
  await expect(stageDraft({ root, env, gh })).rejects.toThrow('already exists');
  expect(server.assets).toEqual([]);
});

it('stops before deleting a corrupt asset if the draft was just published', async () => {
  const server = github();
  await stageDraft({ root, env, gh: server.gh });
  server.assets[0]!.size++;
  server.calls.length = 0;
  const gh: Gh = (args, input) => {
    const result = server.gh(args, input);
    if (args[1]?.endsWith('/assets?per_page=100')) server.release!.draft = false;
    return result;
  };
  await expect(stageDraft({ root, env, gh })).rejects.toThrow('public/completed');
  expect(server.calls.some((args) => args.includes('--method'))).toBe(false);
});

it('detects an asset removed after its final download', async () => {
  const server = github();
  const gh: Gh = (args, input) => {
    const result = server.gh(args, input);
    if (args.includes('Accept: application/octet-stream') && server.assets.find((a) => a.id === Number(args[1]!.split('/').pop()))?.name === 'SHA256SUMS') {
      server.assets.shift();
    }
    return result;
  };
  await expect(stageDraft({ root, env, gh })).rejects.toThrow('changed');
});
