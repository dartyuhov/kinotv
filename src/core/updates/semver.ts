// Semantic Versioning 2.0.0 precedence (https://semver.org/#spec-item-11), just enough to compare release
// tags with the app's version.

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

interface Parsed {
  core: [number, number, number];
  pre: string[];
}

function parse(version: string): Parsed | null {
  const match = SEMVER.exec(version.trim());
  if (!match) return null;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ? match[4].split('.') : [] };
}

/** The version in a release tag ("v1.2.3" → "1.2.3"), or null when the tag isn't a version. */
export function releaseVersion(tag: string): string | null {
  return parse(tag) ? tag.trim().replace(/^v/, '').replace(/\+.*$/, '') : null;
}

function comparePre(a: string[], b: string[]): number {
  // A release ranks above any of its pre-releases.
  if (!a.length || !b.length) return b.length - a.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) return Number(x) - Number(y);
    if (xNum !== yNum) return xNum ? -1 : 1; // numeric identifiers rank below alphanumeric ones
    return x < y ? -1 : 1;
  }
  return 0;
}

/** True when `candidate` is a later version than `current`. Anything unreadable is never newer. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parse(candidate);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i]! > b.core[i]!;
  }
  return comparePre(a.pre, b.pre) > 0;
}
