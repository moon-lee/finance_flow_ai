import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { initializeDatabase, closeDatabase, getDatabase, registerMigration } from '../../../src/main/services/database-service';
import {
  initializeSettings, closeSettings, getSetting, setSetting, deleteSetting, getSettings,
  registerExtensionNamespace
} from '../../../src/main/services/settings-service';
import { infrastructureMigration } from '../../../src/main/services/infrastructure-migration';

describe('SettingsService', () => {
  let tmpDir: string;

  beforeAll(() => {
    registerMigration(infrastructureMigration);
  });

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'finance-flow-test-'));
    initializeDatabase(join(tmpDir, 'test.db'));
    initializeSettings();
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- Basic CRUD ---

  it('stores and retrieves a string value', () => {
    setSetting('core.test', 'hello');
    expect(getSetting('core.test')).toBe('hello');
  });

  it('stores and retrieves a number value', () => {
    setSetting('core.num', 42);
    expect(getSetting<number>('core.num')).toBe(42);
  });

  it('stores and retrieves a boolean value', () => {
    setSetting('core.flag', true);
    expect(getSetting<boolean>('core.flag')).toBe(true);
  });

  it('stores and retrieves an object value', () => {
    const obj = { a: 1, b: 'two' };
    setSetting('core.obj', obj);
    expect(getSetting<typeof obj>('core.obj')).toEqual(obj);
  });

  it('returns undefined for non-existent keys', () => {
    expect(getSetting('core.nonexistent')).toBeUndefined();
  });

  it('overwrites existing values', () => {
    setSetting('core.key', 'first');
    setSetting('core.key', 'second');
    expect(getSetting('core.key')).toBe('second');
  });

  it('deletes a key', () => {
    setSetting('core.key', 'value');
    deleteSetting('core.key');
    expect(getSetting('core.key')).toBeUndefined();
  });

  // --- Namespace enforcement ---

  it('rejects keys without a namespace prefix', () => {
    expect(() => setSetting('barekey', 'x')).toThrow('no namespace prefix');
    expect(() => getSetting('barekey')).toThrow('no namespace prefix');
    expect(() => deleteSetting('barekey')).toThrow('no namespace prefix');
  });

  it('rejects keys with an unregistered namespace', () => {
    expect(() => setSetting('unknown.key', 'x')).toThrow(
      'namespace "unknown" is not registered'
    );
  });

  it('allows keys after registering a custom namespace', () => {
    registerExtensionNamespace('budget');
    setSetting('budget.monthlyLimit', 2000);
    expect(getSetting<number>('budget.monthlyLimit')).toBe(2000);
  });

  it('registerExtensionNamespace rejects invalid namespaces', () => {
    expect(() => registerExtensionNamespace('a.b')).toThrow('is invalid');
  });

  // --- getSettings(namespace) ---

  it('getSettings returns only keys for the requested namespace', () => {
    setSetting('core.a', 1);
    setSetting('core.b', 2);
    registerExtensionNamespace('budget');
    setSetting('budget.x', 99);

    const coreVals = getSettings('core');
    expect(coreVals).toEqual({ 'core.a': 1, 'core.b': 2 });
    expect(coreVals).not.toHaveProperty('budget.x');
  });

  it('getSettings rejects unregistered namespace', () => {
    expect(() => getSettings('unknown')).toThrow('is not registered');
  });

  it('getSettings returns empty object when namespace has no keys', () => {
    registerExtensionNamespace('empty');
    expect(getSettings('empty')).toEqual({});
  });

  // --- Edge cases ---

  it('rejects undefined value with explicit error', () => {
    expect(() => setSetting('core.key', undefined)).toThrow(
      'Cannot set undefined value'
    );
  });

  it('returns undefined for malformed JSON in DB', () => {
    const db = getDatabase();
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('core.badjson', '{invalid');
    const result = getSetting('core.badjson');
    expect(result).toBeUndefined();
  });

  it('getSettings returns undefined for malformed JSON in DB', () => {
    const db = getDatabase();
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('core.badjson', '{invalid');
    expect(getSettings('core')).toHaveProperty('core.badjson', undefined);
  });

  it('throws if settings are not initialized', () => {
    closeSettings();
    expect(() => getSetting('core.key')).toThrow('Settings not initialized');
  });
});
