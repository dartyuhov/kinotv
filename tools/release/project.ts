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
export const RELEASE_REPOSITORY = 'dartyuhov/kinotv';

/** Release versions must survive Tizen's numeric version format without normalization. */
export function releaseVersionProblems(version: string): string[] {
  const parts = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  return parts && Number(parts[1]) <= 255 && Number(parts[2]) <= 255 && Number(parts[3]) <= 65535
    ? []
    : ['package.json must use a stable numeric Tizen version: 0-255.0-255.0-65535, without leading zeros or suffixes.'];
}

export function releaseProjectProblems(project: Project, dir = process.cwd()): string[] {
  const found = releaseVersionProblems(project.version);
  try {
    const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8')) as {
      version?: string;
      packages?: Record<string, { version?: string }>;
    };
    if (lock.version !== project.version || lock.packages?.['']?.version !== project.version) {
      found.push('package-lock.json and its root package version must both match package.json. Run npm install --package-lock-only after updating the version.');
    }
  } catch {
    found.push('package-lock.json is missing or invalid. Restore a matching lockfile before releasing.');
  }
  return found;
}

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
