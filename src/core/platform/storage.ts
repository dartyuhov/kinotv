/**
 * Small persistent key-value store (spec §7.2). On Tizen, localStorage is private to the app's package,
 * and it survives restarts and power cycles; the browser build uses the same API. Values are JSON.
 */
export interface KeyValueStore {
  get<T>(key: string): T | null;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

export const storage: KeyValueStore = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      return null; // unreadable or corrupt: behave as if nothing was stored
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota or privacy errors: the app still works for this run.
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Same as above.
    }
  },
};
