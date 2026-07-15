import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import {
  initializeDatabase, closeDatabase, getDatabase, registerMigration,
  getTestDatabase, _setDatabaseConstructorForTesting
} from '../../../src/main/services/database-service';
import BetterSqlite3 from 'better-sqlite3';

describe('DatabaseService', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'finance-flow-test-'));
    dbPath = join(tmpDir, 'test.db');
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes an in-memory-like file database', () => {
    const db = initializeDatabase(dbPath);
    expect(db).toBeDefined();
    expect(db.open).toBe(true);
  });

  it('creates the migration_log table on init', () => {
    initializeDatabase(dbPath);
    const db = getDatabase();
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migration_log'").get();
    expect(result).toBeDefined();
  });

  it('runs registered migrations', () => {
    registerMigration({
      name: 'test-migration',
      up: (db) => {
        db.exec('CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY)');
      }
    });
    initializeDatabase(dbPath);
    const db = getDatabase();
    const logged = db.prepare("SELECT name FROM migration_log WHERE name = 'test-migration'").get() as { name: string } | undefined;
    expect(logged?.name).toBe('test-migration');
  });

  it('does not re-run already applied migrations', () => {
    let runCount = 0;
    registerMigration({
      name: 'count-migration',
      up: () => { runCount++; }
    });
    initializeDatabase(dbPath);
    closeDatabase();
    initializeDatabase(dbPath);
    expect(runCount).toBe(1);
  });

  it('throws if getDatabase is called before init', () => {
    expect(() => getDatabase()).toThrow('Database not initialized');
  });

  it('sets WAL journal mode', () => {
    initializeDatabase(dbPath);
    const db = getDatabase();
    const pragma = db.pragma('journal_mode') as { journal_mode: string }[];
    expect(pragma[0].journal_mode).toBe('wal');
  });

  // Regression test for the Phase 2 data-loss bug fixed in 0.4.1.
  // Previously `initializeDatabase` caught *any* open failure
  // (including native-module ABI mismatch, permission denied, or
  // opening a non-file path) and renamed the path's contents to
  // `.corrupt-<ts>`. That destroyed a perfectly valid user DB when
  // the only problem was a mismatch between the compiled native
  // binary and the running Electron/Node ABI.
  //
  // After the fix, open failures propagate and recovery only
  // triggers on an actual integrity-check failure (quick_check).
  // We simulate the ABI-mismatch scenario by injecting a stub
  // constructor via _setDatabaseConstructorForTesting that throws
  // on `new Ctor(path)` — the same shape as `better-sqlite3`'s
  // real `NODE_MODULE_VERSION` failure.
  it('does not rename on open failure (no silent data loss)', () => {
    // Stage: an existing valid SQLite file at dbPath. With the buggy
    // code, the open failure would cause this file to be renamed to
    // `.corrupt-<ts>` (data loss).
    writeFileSync(dbPath, '');

    class ThrowingCtor {
      constructor() {
        throw new Error('Simulated ABI mismatch');
      }
    }
    _setDatabaseConstructorForTesting(ThrowingCtor as unknown as typeof BetterSqlite3);

    try {
      expect(() => initializeDatabase(dbPath)).toThrow(/ABI mismatch/);
      const leftover = readdirSync(tmpDir).filter((f) => f.includes('.corrupt-'));
      expect(leftover).toEqual([]);
      // Original file is untouched.
      expect(readdirSync(tmpDir)).toContain('test.db');
    } finally {
      _setDatabaseConstructorForTesting(BetterSqlite3);
    }
  });

  it('enforces at most one current rate (effective_to IS NULL)', () => {
    const db = getTestDatabase();
    const insert = (from: string, to: string | null): void => {
      db.prepare(
        `INSERT INTO salary_history_rate_history (effective_from, effective_to, base_hourly_rate) VALUES (?, ?, ?)`,
      ).run(from, to, 40);
    };
    // First current (open-ended) rate is allowed.
    insert('2024-07-01', null);
    // A second open-ended rate must be rejected by the partial unique index.
    expect(() => insert('2025-07-01', null)).toThrow(/UNIQUE/);
    // A historical (closed) rate is allowed alongside the single current one.
    expect(() => insert('2025-07-01', '2025-06-30')).not.toThrow();
  });
});
