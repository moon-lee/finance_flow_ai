import type { Migration } from './database-service';

export const infrastructureMigration: Migration = {
  name: '001-init-infrastructure',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS extension_registry (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        installed_at TEXT NOT NULL DEFAULT (datetime('now')),
        activated_at TEXT
      )
    `);
  }
};

/**
 * [Review fix §4.2] Phase 3 adds crash diagnostics to the extension registry.
 * `crash_count` powers the auto-disable threshold (AUTO_DISABLE_CRASH_THRESHOLD)
 * and `last_error` surfaces the most recent activation failure to the
 * Extension Manager UI (Phase 8).
 *
 * Uses ALTER TABLE so the migration is safe to apply to databases created by
 * Phase 2's `001-init-infrastructure`. SQLite does not support IF NOT EXISTS
 * on ALTER TABLE ADD COLUMN, so we guard with a PRAGMA table_info check.
 */
export const extensionCrashTrackingMigration: Migration = {
  name: '002-extension-crash-tracking',
  up: (db) => {
    const columns = db.pragma('table_info(extension_registry)') as { name: string }[];
    const hasColumn = (name: string) => columns.some((c) => c.name === name);

    if (!hasColumn('crash_count')) {
      db.exec(`ALTER TABLE extension_registry ADD COLUMN crash_count INTEGER NOT NULL DEFAULT 0`);
    }
    if (!hasColumn('last_error')) {
      db.exec(`ALTER TABLE extension_registry ADD COLUMN last_error TEXT`);
    }
  }
};
