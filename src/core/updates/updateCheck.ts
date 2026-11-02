// The update check (spec §11). At launch the app asks GitHub for the latest release, at most once a day,
// and compares it with its own version. Sideloaded apps can't update themselves; Settings tells the
// viewer to run the installer again. No React here: the UI reads `availableUpdate` through `subscribe`.
import { isNewerVersion, releaseVersion } from './semver';

const STORAGE_KEY = 'kinotv.updateCheck';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 15_000;

export interface AvailableUpdate {
  /** The newer version, e.g. "1.2.0" (no "v"). */
  version: string;
}

/** What the last successful check found, kept between launches. */
interface SavedCheck {
  checkedAt: number;
  /** The latest release's version, or null when the repo has no (readable) release. */
  latest: string | null;
}

export interface UpdateCheckOptions {
  /** GitHub's "latest release" API URL, or null to never check (no repo configured). */
  releasesUrl: string | null;
  currentVersion: string;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  now?: () => number;
  fetch?: typeof fetch;
}

function readSaved(storage: UpdateCheckOptions['storage']): SavedCheck | null {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null') as SavedCheck | null;
    return saved && typeof saved.checkedAt === 'number' ? saved : null;
  } catch {
    return null;
  }
}

async function fetchLatest(url: string, fetchFn: typeof fetch): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchFn(url, { headers: { Accept: 'application/vnd.github+json' }, signal: controller.signal });
    if (response.status === 404) return null; // the repo has no published release yet
    if (!response.ok) throw new Error(`releases: HTTP ${response.status}`);
    const { tag_name: tag } = (await response.json()) as { tag_name?: unknown };
    return typeof tag === 'string' ? releaseVersion(tag) : null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns the newer release, if there is one. Asks GitHub only when the last successful check is a day
 * old or more; a failed check is not remembered, so the next launch tries again.
 */
export async function checkForUpdate(options: UpdateCheckOptions): Promise<AvailableUpdate | null> {
  const { releasesUrl, currentVersion, storage, now = Date.now, fetch: fetchFn = fetch } = options;
  if (!releasesUrl) return null;

  const time = now();
  const saved = readSaved(storage);
  let latest: string | null;
  if (saved && saved.checkedAt <= time && time - saved.checkedAt < CHECK_INTERVAL_MS) {
    latest = saved.latest;
  } else {
    try {
      latest = await fetchLatest(releasesUrl, fetchFn);
    } catch {
      return null;
    }
    storage.setItem(STORAGE_KEY, JSON.stringify({ checkedAt: time, latest } satisfies SavedCheck));
  }
  return latest && isNewerVersion(latest, currentVersion) ? { version: latest } : null;
}

let availableUpdate: AvailableUpdate | null = null;
const listeners = new Set<() => void>();

/** The result of this launch's check: null until it finishes, or when there is nothing newer. */
export function getAvailableUpdate(): AvailableUpdate | null {
  return availableUpdate;
}

export function subscribeToUpdates(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Runs the check in the background at launch. Never throws: a failed check just shows nothing. */
export function startUpdateCheck(options: UpdateCheckOptions): void {
  void checkForUpdate(options)
    .catch(() => null)
    .then((update) => {
      availableUpdate = update;
      for (const listener of listeners) listener();
    });
}
