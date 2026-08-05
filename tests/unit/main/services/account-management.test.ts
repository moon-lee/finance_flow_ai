import { describe, expect, it, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { getTestDatabase } from '../../../../src/main/services/database-service';
import { AccountManagementService } from '../../../../src/main/services/account-management';

function getDb(): Database.Database {
  return getTestDatabase();
}

describe('AccountManagementService', () => {
  const db = getDb();
  const service = new AccountManagementService(db);

  afterEach(() => {
    db.prepare('DELETE FROM accounts').run();
  });

  it('list returns all accounts sorted by created_at DESC', () => {
    db.prepare("INSERT INTO accounts (name, institution, is_active, created_at) VALUES (?, ?, 1, ?)").run('A', 'Bank A', '2026-01-01T00:00:00.000Z');
    db.prepare("INSERT INTO accounts (name, institution, is_active, created_at) VALUES (?, ?, 1, ?)").run('B', 'Bank B', '2026-02-01T00:00:00.000Z');
    const rows = service.list();
    expect(rows.length).toBe(2);
    expect(rows[0].name).toBe('B');
    expect(rows[1].name).toBe('A');
  });

  it('create inserts a new account and returns { id }', () => {
    const result = service.create({ name: 'Primary', institution: 'CBA' });
    expect(result.id).toBeGreaterThan(0);
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.id) as Record<string, unknown>;
    expect(row.name).toBe('Primary');
    expect(row.institution).toBe('CBA');
    expect(row.is_active).toBe(1);
  });

  it('create rejects empty name', () => {
    expect(() => service.create({ name: '  ', institution: null })).toThrow('non-empty name');
  });

  it('update modifies name, institution, and is_active', () => {
    const { id } = service.create({ name: 'Primary', institution: 'CBA' });
    service.update({ id, name: 'Updated', institution: 'NAB', is_active: false });
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.name).toBe('Updated');
    expect(row.institution).toBe('NAB');
    expect(row.is_active).toBe(0);
  });

  it('update rejects empty name', () => {
    const { id } = service.create({ name: 'Primary', institution: 'CBA' });
    expect(() => service.update({ id, name: '', institution: 'NAB', is_active: true })).toThrow('non-empty name');
  });

  it('delete removes the account', () => {
    const { id } = service.create({ name: 'Primary', institution: 'CBA' });
    service.delete({ id });
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    expect(row).toBeUndefined();
  });

  it('delete blocks deleting the last active account', () => {
    const { id } = service.create({ name: 'Primary', institution: 'CBA' });
    expect(() => service.delete({ id })).toThrow('last active account');
  });

  it('count returns the correct count after create/delete', () => {
    let count = service.count();
    expect(count.count).toBe(0);
    const { id: id1 } = service.create({ name: 'A', institution: null });
    service.update({ id: id1, name: 'A', institution: null, is_active: false });
    service.create({ name: 'B', institution: null });
    count = service.count();
    expect(count.count).toBe(2);
    service.delete({ id: id1 });
    count = service.count();
    expect(count.count).toBe(1);
  });
});
