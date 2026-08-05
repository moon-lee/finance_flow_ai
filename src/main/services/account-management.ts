import type Database from 'better-sqlite3';
import { getDatabase } from './database-service';

export class AccountManagementService {
  private readonly db: Database.Database;

  constructor(db: Database.Database = getDatabase()) {
    this.db = db;
  }

  list() {
    const rows = this.db.prepare('SELECT id, name, institution, is_active, created_at FROM accounts ORDER BY created_at DESC').all() as Array<{
      id: number;
      name: string;
      institution: string | null;
      is_active: 0 | 1;
      created_at: string;
    }>;
    return rows.map((r) => ({ ...r, is_active: Boolean(r.is_active) }));
  }

  create(input: { name: string; institution: string | null }): { id: number } {
    const name = input.name.trim();
    if (name === '') {
      throw new Error('accounts:create requires a non-empty name');
    }
    const info = this.db
      .prepare('INSERT INTO accounts (name, institution, is_active, created_at) VALUES (?, ?, 1, ?)')
      .run(name, input.institution ?? null, new Date().toISOString());
    return { id: Number(info.lastInsertRowid) };
  }

  update(input: { id: number; name: string; institution: string | null; is_active: boolean }): { updated: boolean } {
    if (typeof input.id !== 'number') {
      throw new Error('accounts:update requires an id');
    }
    const name = input.name.trim();
    if (name === '') {
      throw new Error('accounts:update requires a non-empty name');
    }
    const existing = this.db.prepare('SELECT id FROM accounts WHERE id = ?').get(input.id) as { id: number } | undefined;
    if (!existing) {
      throw new Error(`accounts:update: account ${input.id} not found`);
    }
    this.db.prepare('UPDATE accounts SET name = ?, institution = ?, is_active = ? WHERE id = ?')
      .run(name, input.institution ?? null, input.is_active ? 1 : 0, input.id);
    return { updated: true };
  }

  delete(input: { id: number }): { deleted: boolean } {
    if (typeof input.id !== 'number') {
      throw new Error('accounts:delete requires an id');
    }
    const target = this.db.prepare('SELECT id, is_active FROM accounts WHERE id = ?').get(input.id) as { id: number; is_active: 0 | 1 } | undefined;
    if (!target) {
      throw new Error(`accounts:delete: account ${input.id} not found`);
    }
    const activeCount = this.db.prepare('SELECT COUNT(*) AS count FROM accounts WHERE is_active = 1').get() as { count: number };
    if (target.is_active === 1 && activeCount.count <= 1) {
      throw new Error('Cannot delete the last active account');
    }
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(input.id);
    return { deleted: true };
  }

  count(): { count: number } {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM accounts').get() as { count: number };
    return { count: row.count };
  }
}
