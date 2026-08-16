import type Database from 'better-sqlite3';
import { getDatabase } from './database-service';

let db: Database.Database | null = null;

export function setDatabase(dbInstance: Database.Database | null): void {
  db = dbInstance;
}

const registeredNamespaces = new Set<string>();

export function registerExtensionNamespace(namespace: string): void {
  if (!namespace || !/^[A-Za-z0-9-]+$/.test(namespace)) {
    throw new Error(`Namespace "${namespace}" is invalid. Use letters, numbers, or hyphens.`);
  }
  registeredNamespaces.add(namespace);
}

function validateKey(key: string): void {
  const dotIndex = key.indexOf('.');
  if (dotIndex === -1) {
    throw new Error(
      `Settings key "${key}" has no namespace prefix. ` +
      `Keys must follow the format "namespace.localKey"`
    );
  }
  const namespace = key.substring(0, dotIndex);
  const localKey = key.substring(dotIndex + 1);
  if (!localKey) {
    throw new Error(`Settings key "${key}" has an empty local key.`);
  }
  if (!registeredNamespaces.has(namespace)) {
    throw new Error(
      `Settings namespace "${namespace}" is not registered. ` +
      `Call registerExtensionNamespace("${namespace}") first.`
    );
  }
}

export function initializeSettings(): void {
  db = getDatabase();
  registeredNamespaces.add('core');
}

export function getSetting<T = string>(key: string): T | undefined {
  if (!db) throw new Error('Settings not initialized. Call initializeSettings() first.');
  validateKey(key);
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined;
  if (!row) return undefined;
  return parseStoredValue(row.value) as T;
}

function parseStoredValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function setSetting(key: string, value: unknown): void {
  if (!db) throw new Error('Settings not initialized. Call initializeSettings() first.');
  if (value === undefined) {
    throw new Error(
      `Cannot set undefined value for settings key "${key}". ` +
      `Use deleteSetting() to remove a key.`
    );
  }
  validateKey(key);
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error(`Cannot serialize settings key "${key}".`);
  }
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, serialized);
}

/**
 * Register a default value for a settings key. If the key already exists
 * in the database, the existing value is preserved. If it does not exist,
 * the default is inserted. Call this during app initialization after
 * `initializeSettings()` for any key whose callers use `??` fallback.
 */
export function registerSettingDefault(key: string, defaultValue: unknown): void {
  if (!db) throw new Error('Settings not initialized. Call initializeSettings() first.');
  validateKey(key);
  const existing = db.prepare('SELECT key FROM settings WHERE key = ?').get(key) as
    | { key: string }
    | undefined;
  if (existing) return;
  const serialized = JSON.stringify(defaultValue);
  if (serialized === undefined) {
    throw new Error(`Cannot serialize default for settings key "${key}".`);
  }
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
    .run(key, serialized);
}

export function deleteSetting(key: string): void {
  if (!db) throw new Error('Settings not initialized. Call initializeSettings() first.');
  validateKey(key);
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

export function closeSettings(): void {
  db = null;
  registeredNamespaces.clear();
}

export function getSettings(namespace: string): Record<string, unknown> {
  if (!db) throw new Error('Settings not initialized. Call initializeSettings() first.');
  if (!registeredNamespaces.has(namespace)) {
    throw new Error(`Settings namespace "${namespace}" is not registered.`);
  }
  const prefix = namespace + '.';
  const rows = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?')
    .all(prefix + '%') as { key: string; value: string }[];
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.key] = parseStoredValue(row.value);
  }
  return result;
}
