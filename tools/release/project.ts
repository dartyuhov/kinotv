import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The release settings that live in package.json. The GitHub repo is set ONCE, in package.json:
//
//   "kinotv": { "githubRepo": "<owner>/<repo>" }
//
// The app's update check (vite.config.ts) and the end-user installer (tools/release/assemble.ts) both
// read it from here. Until it is set it stays the placeholder below, the update check is off, and the
// release gate refuses to publish.

export const GITHUB_REPO_PLACEHOLDER = 'OWNER/REPO';

export interface Project {
  version: string;
  /** "<owner>/<repo>", or null while package.json still has the placeholder. */
  githubRepo: string | null;
}

export function readProject(dir = process.cwd()): Project {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string; kinotv?: { githubRepo?: string } };
  const repo = pkg.kinotv?.githubRepo?.trim() ?? '';
  return { version: pkg.version, githubRepo: /^[\w.-]+\/[\w.-]+$/.test(repo) && repo !== GITHUB_REPO_PLACEHOLDER ? repo : null };
}
