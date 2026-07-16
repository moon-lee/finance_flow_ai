import { describe, it, expect, beforeEach } from 'vitest';
import type BetterSqlite3 from 'better-sqlite3';
import {
  DAOService,
  compileQuery,
  type QueryObject,
  TableAccessDeniedError,
  SharedTableReadOnlyError,
  TableNotFoundError,
  ValidationFailedError,
} from '../../../src/main/services/dao-service';
import { getTestDatabase } from '../../../src/main/services/database-service';
import { TableSchemaRegistry } from '../../../src/main/services/table-schema-registry';
import { SHARED_TABLE_MANIFESTS, type TableManifest } from '../../../src/main/services/shared-data-tables';

/**
 * Minimal salary_history_pay_slips manifest for DAO unit tests.
 * Matches the columns used by the 004 migration; enough to exercise
 * namespace enforcement, shared-table read-only rules, and all query
 * operators without importing the migration file itself.
 */
const paySlipsManifest: TableManifest = {
  name: 'salary_history_pay_slips',
  columns: [
    { name: 'id', type: 'integer', primary: true, autoIncrement: true },
    { name: 'account_id', type: 'integer', nullable: false },
    { name: 'pay_period_start', type: 'text', nullable: false },
    { name: 'pay_period_end', type: 'text', nullable: false },
    { name: 'pay_date', type: 'text', nullable: false },
    { name: 'finance_year', type: 'text', nullable: false },
    { name: 'gross', type: 'real', nullable: false, min: 0 },
    { name: 'net', type: 'real', nullable: false, min: 0 },
    { name: 'currency', type: 'text', nullable: false, default: 'AUD' },
    { name: 'shift_allowance', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'base_hourly', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'overtime_1_5x', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'overtime_2_0x', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'holiday_leave_loading', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'holiday_pay', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'public_holiday', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'payg_withholding', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'superannuation_guarantee', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'personal_leave', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'holiday_leave_accrual_hours', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'regular_hours', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'shift_hours', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'overtime_1_5_hours', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'overtime_2_0_hours', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'holiday_hours', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'public_holiday_hours', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'personal_leave_hours', type: 'real', nullable: false, default: 0, min: 0 },
    { name: 'notes', type: 'text', nullable: true },
    { name: 'created_at', type: 'datetime', default: 'now' },
    { name: 'updated_at', type: 'datetime', default: 'now' },
  ],
};

const accountsManifest = SHARED_TABLE_MANIFESTS.find((m) => m.name === 'accounts')!;

function setup(): { db: BetterSqlite3.Database; registry: TableSchemaRegistry; dao: DAOService } {
  const db = getTestDatabase();
  const registry = new TableSchemaRegistry();
  registry.registerSharedTables([accountsManifest]);
  registry.registerExtensionTables('salary-history', [paySlipsManifest]);
  // Seed account rows directly via the DB handle because the DAO enforces
  // shared-table read-only for extensions (Decision 1). The payslip FK needs
  // matching accounts rows for inserts to succeed.
  db.prepare(`INSERT INTO accounts (id, name) VALUES (?, ?)`).run(1, 'Test Account');
  db.prepare(`INSERT INTO accounts (id, name) VALUES (?, ?)`).run(2, 'Second Account');
  const dao = new DAOService(db, registry);
  return { db, registry, dao };
}

function basePaySlip(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    account_id: 1,
    pay_period_start: '2026-01-01',
    pay_period_end: '2026-01-14',
    pay_date: '2026-01-15',
    finance_year: '2025-26',
    gross: 5000,
    net: 4000,
    notes: null,
    ...overrides,
  };
}

describe('compileQuery', () => {
  it('returns 1=1 for an empty query', () => {
    const { sql, params } = compileQuery({});
    expect(sql).toBe('1 = 1');
    expect(params).toEqual([]);
  });

  it('compiles a simple equality condition', () => {
    const { sql, params } = compileQuery({ account_id: 1 });
    expect(sql).toBe('account_id = ?');
    expect(params).toEqual([1]);
  });

  it('compiles comparison operators', () => {
    const { sql, params } = compileQuery({ gross: { $gte: 5000 } });
    expect(sql).toBe('gross >= ?');
    expect(params).toEqual([5000]);
  });

  it('compiles $in with placeholders', () => {
    const { sql, params } = compileQuery({ id: { $in: [1, 2, 3] } });
    expect(sql).toBe('id IN (?, ?, ?)');
    expect(params).toEqual([1, 2, 3]);
  });

  it('compiles $like with parameterised value', () => {
    const { sql, params } = compileQuery({ notes: { $like: '%bonus%' } });
    expect(sql).toBe('notes LIKE ?');
    expect(params).toEqual(['%bonus%']);
  });

  it('throws on an unknown operator', () => {
    expect(() => compileQuery({ gross: { $unknown: 1 } })).toThrow('unknown operator');
  });

  it('compiles top-level $or', () => {
    const { sql, params } = compileQuery({ $or: [{ account_id: 1 }, { account_id: 2 }] } as QueryObject);
    expect(sql).toBe('(account_id = ?) OR (account_id = ?)');
    expect(params).toEqual([1, 2]);
  });

  it('combines $or with AND conditions', () => {
    const { sql, params } = compileQuery({
      gross: { $gte: 1000 },
      $or: [{ account_id: 1 }, { account_id: 2 }],
    } as QueryObject);
    expect(sql).toBe('gross >= ? AND (account_id = ?) OR (account_id = ?)');
    expect(params).toEqual([1000, 1, 2]);
  });

  it('throws on invalid column names', () => {
    expect(() => compileQuery({ '1nvalid': 'x' })).toThrow('invalid column name');
  });
});

describe('DAOService namespace enforcement', () => {
  it('throws TableNotFoundError for unknown tables', () => {
    const { dao } = setup();
    expect(() => dao.find('salary-history', 'unknown_table', {} as QueryObject)).toThrow(TableNotFoundError);
  });

  it('allows owner extension to read its own table', () => {
    const { dao } = setup();
    expect(dao.find('salary-history', 'salary_history_pay_slips', {} as QueryObject)).toEqual([]);
  });

  it('throws TableAccessDeniedError when another extension reads an extension table', () => {
    const { dao } = setup();
    expect(() =>
      dao.find('some-other-ext', 'salary_history_pay_slips', {} as QueryObject)
    ).toThrow(TableAccessDeniedError);
  });

  it('allows any extension to read shared accounts table', () => {
    const { dao } = setup();
    // The test just verifies that read access is permitted — the rows are
    // the seeded accounts. The DAO itself enforces shared-table read-only
    // for writes; reads are always allowed for any registered extension.
    const rows = dao.find('salary-history', 'accounts', {} as QueryObject);
    expect(rows).toHaveLength(2);
  });

  it('throws SharedTableReadOnlyError when an extension writes to shared accounts', () => {
    const { dao } = setup();
    expect(() =>
      dao.insert('salary-history', 'accounts', { name: 'Bank' })
    ).toThrow(SharedTableReadOnlyError);
  });
});

describe('DAOService CRUD operations', () => {
  let dao: DAOService;

  beforeEach(() => {
    ({ dao } = setup());
  });

  it('insert returns the inserted row with a generated id', () => {
    const row = dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip());
    expect(row.account_id).toBe(1);
    expect(row.gross).toBe(5000);
    expect(typeof row.id).toBe('number');
  });

  it('find returns matching rows with equality', () => {
    dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip({ account_id: 1 }));
    dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip({ account_id: 2 }));
    const rows = dao.find('salary-history', 'salary_history_pay_slips', { account_id: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].account_id).toBe(1);
  });

  it('findOne returns null when no row matches', () => {
    const row = dao.findOne('salary-history', 'salary_history_pay_slips', { account_id: 99 });
    expect(row).toBeNull();
  });

  it('count returns the number of matching rows', () => {
    dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip());
    dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip());
    expect(dao.count('salary-history', 'salary_history_pay_slips', {} as QueryObject)).toBe(2);
  });

  it('update modifies matching rows and returns affected count', () => {
    const inserted = dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip());
    const changes = dao.update(
      'salary-history',
      'salary_history_pay_slips',
      { id: inserted.id },
      { gross: 5200 }
    );
    expect(changes).toBe(1);
    const updated = dao.findOne('salary-history', 'salary_history_pay_slips', { id: inserted.id });
    expect(updated?.gross).toBe(5200);
  });

  it('delete removes matching rows and returns affected count', () => {
    const inserted = dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip());
    const changes = dao.delete('salary-history', 'salary_history_pay_slips', { id: inserted.id });
    expect(changes).toBe(1);
    expect(dao.findOne('salary-history', 'salary_history_pay_slips', { id: inserted.id })).toBeNull();
  });

  it('insert validates required fields through the Zod schema', () => {
    expect(() =>
      dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip({ gross: -5000 }))
    ).toThrow(ValidationFailedError);
  });

  it('find supports $gte comparison', () => {
    dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip({ gross: 5000 }));
    dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip({ gross: 6000 }));
    const rows = dao.find('salary-history', 'salary_history_pay_slips', {
      gross: { $gte: 5500 },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].gross).toBe(6000);
  });

  it('find supports $like', () => {
    dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip({ notes: 'Year-end bonus' }));
    dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip({ notes: 'Regular pay' }));
    const rows = dao.find('salary-history', 'salary_history_pay_slips', {
      notes: { $like: '%bonus%' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].notes).toBe('Year-end bonus');
  });

  it('find supports $or', () => {
    dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip({ account_id: 1 }));
    dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip({ account_id: 2 }));
    const rows = dao.find('salary-history', 'salary_history_pay_slips', {
      $or: [{ account_id: 1 }, { account_id: 2 }],
    } as QueryObject);
    expect(rows).toHaveLength(2);
  });

  it('find applies limit and offset', () => {
    dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip({ gross: 1000 }));
    dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip({ gross: 2000 }));
    dao.insert('salary-history', 'salary_history_pay_slips', basePaySlip({ gross: 3000 }));
    const rows = dao.find('salary-history', 'salary_history_pay_slips', {} as QueryObject, { limit: 2, offset: 1 });
    expect(rows).toHaveLength(2);
  });
});
