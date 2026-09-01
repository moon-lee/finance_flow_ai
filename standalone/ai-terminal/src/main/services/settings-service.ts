/**
 * Minimal in-memory settings-service shim for standalone harness.
 * Mirrors the real service's getSetting/setSetting/registerSettingDefault via Map
 * so standalone tests do not require better-sqlite3 native addon.
 */
const store = new Map<string, unknown>();
const defaults = new Map<string, unknown>();

export function registerSettingDefault(key: string, value: unknown): void {
  if (!defaults.has(key)) {
    defaults.set(key, value);
  }
  if (!store.has(key)) {
    store.set(key, value);
  }
}

export function getSetting<T>(key: string): T | undefined {
  if (store.has(key)) return store.get(key) as T;
  if (defaults.has(key)) return defaults.get(key) as T;
  return undefined;
}

export function setSetting(key: string, value: unknown): void {
  store.set(key, value);
}

export function initializeSettings(): void {
  // no-op for shim; real service would load from DB
}

export function __clearSettings(): void {
  store.clear();
  defaults.clear();
}

export function __getStore(): Map<string, unknown> {
  return store;
}
