import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { initializeDatabase, closeDatabase, getDatabase, registerMigration } from '../../../src/main/services/database-service';

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
});
