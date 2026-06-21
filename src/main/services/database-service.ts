import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { existsSync, mkdirSync, renameSync } from 'node:fs';

// Phase 2 has no rollback requirement; the `down` callback is
// intentionally omitted from the interface to keep the surface area
// honest. Revisit this if Phase 7 needs DB downgrade support.
export interface Migration {
  name: string;
  up: (db: Database.Database) => void;
}

let db: Database.Database | null = null;
const migrations: Migration[] = [];

export function registerMigration(migration: Migration): void {
  if (migrations.some(m => m.name === migration.name)) return;
  migrations.push(migration);
}

export function initializeDatabase(dbPath: string): Database.Database {
  if (db) return db;

  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Open the database and recover only from open/health-check failures.
  // Migration failures are allowed to surface: treating a bad migration
  // as corruption could replace a valid user database unnecessarily.
  try {
    db = openDatabaseWithPragmas(dbPath);
  } catch (err) {
    db = recoverUnreadableDatabase(dbPath, err);
  }

  runMigrations(db);

  return db;
}

function openDatabaseWithPragmas(dbPath: string): Database.Database {
  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  const quickCheck = database.pragma('quick_check') as { quick_check: string }[];
  if (quickCheck[0]?.quick_check !== 'ok') {
    database.close();
    throw new Error(`SQLite quick_check failed for ${dbPath}`);
  }
  return database;
}

function recoverUnreadableDatabase(dbPath: string, cause: unknown): Database.Database {
  const corruptPath = `${dbPath}.corrupt-${Date.now()}`;
  console.error(
    `Database at ${dbPath} is unreadable; renaming to ${corruptPath} and starting fresh.`,
    cause
  );
  try {
    db?.close();
  } catch {
    // db may not have opened successfully; ignore.
  }
  db = null;
  if (existsSync(dbPath)) {
    renameSync(dbPath, corruptPath);
  }
  for (const suffix of ['-wal', '-shm']) {
    const sidecarPath = `${dbPath}${suffix}`;
    if (existsSync(sidecarPath)) {
      renameSync(sidecarPath, `${corruptPath}${suffix}`);
    }
  }
  return openDatabaseWithPragmas(dbPath);
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS migration_log (
      name TEXT PRIMARY KEY,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (database.prepare('SELECT name FROM migration_log ORDER BY name').all() as { name: string }[]).map(r => r.name)
  );

  const applyMigration = database.transaction((migration: Migration) => {
    migration.up(database);
    database.prepare('INSERT INTO migration_log (name) VALUES (?)').run(migration.name);
  });

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      applyMigration(migration);
      applied.add(migration.name);
    }
  }
}

export function getDatabase(): Database.Database {
  // Guard against both null (never initialised) and a closed handle
  // (e.g. after `closeDatabase` was called, or a double-init race
  // during HMR).
  if (!db || !db.open) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
