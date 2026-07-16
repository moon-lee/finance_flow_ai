import BetterSqlite3 from 'better-sqlite3';
import { dirname } from 'node:path';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import {
  infrastructureMigration,
  extensionCrashTrackingMigration,
  sharedAccountsMigration,
  salaryHistoryPaySlipsMigration,
  salaryHistoryRateHistoryMigration,
  salaryHistoryRateHistorySingleCurrentMigration,
  salaryHistoryPaySlipsHourInputsMigration,
  salaryHistoryRateHistoryDropSeedBalanceMigration,
} from './infrastructure-migration';

// Phase 2 has no rollback requirement; the `down` callback is
// intentionally omitted from the interface to keep the surface area
// honest. Revisit this if Phase 7 needs DB downgrade support.
export interface Migration {
  name: string;
  up: (db: BetterSqlite3.Database) => void;
}

// Module-level reference to the better-sqlite3 constructor. Exposed
// for testing only — production code should never swap this. Tests
// that need to simulate open failures (e.g. native-module ABI
// mismatch) can assign a stub via _setDatabaseConstructorForTesting
// to verify the service handles those failures without silently
// destroying user data.
type DatabaseConstructor = typeof BetterSqlite3;
let DatabaseCtor: DatabaseConstructor = BetterSqlite3;

/** @internal — tests only. Production code must not call this. */
export function _setDatabaseConstructorForTesting(ctor: DatabaseConstructor): void {
  DatabaseCtor = ctor;
}

let db: BetterSqlite3.Database | null = null;
const migrations: Migration[] = [];

export function registerMigration(migration: Migration): void {
  if (migrations.some(m => m.name === migration.name)) return;
  migrations.push(migration);
}

export function initializeDatabase(dbPath: string): BetterSqlite3.Database {
  if (db) return db;

  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Open the database. Failures here are environmental (native-module
  // ABI mismatch, permission denied, file locked by another process)
  // and are NOT corruption — they must propagate so the caller sees
  // the real error instead of having a valid DB silently renamed to
  // `.corrupt-<ts>`.
  const database = new DatabaseCtor(dbPath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  // Verify integrity. quick_check succeeds for empty databases and
  // for healthy ones; it only fails when the file exists but is
  // genuinely corrupt. That is the only situation in which we
  // destroy the file.
  if (!verifyDatabaseIntegrity(database)) {
    database.close();
    renameCorruptDatabase(dbPath);
    return initializeDatabase(dbPath);
  }

  db = database;
  runMigrations(db);

  return db;
}

function verifyDatabaseIntegrity(database: BetterSqlite3.Database): boolean {
  const quickCheck = database.pragma('quick_check') as { quick_check: string }[];
  return quickCheck[0]?.quick_check === 'ok';
}

function renameCorruptDatabase(dbPath: string): void {
  const corruptPath = `${dbPath}.corrupt-${Date.now()}`;
  console.error(
    `Database at ${dbPath} failed integrity check; renaming to ${corruptPath} and starting fresh.`
  );
  if (existsSync(dbPath)) {
    renameSync(dbPath, corruptPath);
  }
  for (const suffix of ['-wal', '-shm']) {
    const sidecarPath = `${dbPath}${suffix}`;
    if (existsSync(sidecarPath)) {
      renameSync(sidecarPath, `${corruptPath}${suffix}`);
    }
  }
}

function runMigrations(database: BetterSqlite3.Database): void {
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

export function getDatabase(): BetterSqlite3.Database {
  // Guard against both null (never initialised) and a closed handle
  // (e.g. after `closeDatabase` was called, or a double-init race
  // during HMR).
  if (!db || !db.open) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return db;
}

/**
 * Test-only database factory. Returns a fresh in-memory SQLite connection
 * with all migrations applied, so unit tests exercise the exact schema the
 * production code expects without touching the user's real `finance.db`.
 *
 * Each call returns a NEW database — tests that need isolation between
 * cases should call this once per `describe()` or per `beforeEach()`.
 * The returned database is the caller's responsibility to close.
 *
 * **Prerequisite for Task 15 Step 4:** the executor must verify this helper
 * exists before running `npm run test:unit`. If absent, add it here
 * (this step) before any `extensionRegistry` unit test runs. *(per
 * [Review fix §5.1] — addresses the undocumented prerequisite flagged in
 * the second-pass review.)*
 *
 * Migrations are registered idempotently (see `registerMigration`'s dedup
 * check), so calling this helper multiple times — or alongside a production
 * startup that also registers the migrations — is safe.
 */
/**
 * Register every production migration in the correct apply order. This is the
 * single source of truth for which migrations exist — both production startup
 * and the test helper below call it, so they can never drift. (Previously the
 * salary-history / accounts migrations were registered only inside the test
 * helper, so they were never created in the real `finance.db` and extension
 * activation failed with `no such table`.)
 */
export function registerAllMigrations(): void {
  registerMigration(infrastructureMigration);
  registerMigration(extensionCrashTrackingMigration);
  registerMigration(sharedAccountsMigration);
  registerMigration(salaryHistoryPaySlipsMigration);
  registerMigration(salaryHistoryRateHistoryMigration);
  registerMigration(salaryHistoryRateHistorySingleCurrentMigration);
  registerMigration(salaryHistoryPaySlipsHourInputsMigration);
  registerMigration(salaryHistoryRateHistoryDropSeedBalanceMigration);
}

export function getTestDatabase(): BetterSqlite3.Database {
  const database = new DatabaseCtor(':memory:');
  database.pragma('journal_mode = MEMORY');
  database.pragma('foreign_keys = ON');
  registerAllMigrations();
  runMigrations(database);
  return database;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
