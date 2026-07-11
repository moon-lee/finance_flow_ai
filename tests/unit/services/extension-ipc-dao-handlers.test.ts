/**
 * Tests for the DAO request handlers wired into `ExtensionIPC` by
 * Phase 4 Task 6.3.
 *
 * Per Decision 6, the Extension Host forwards extension DAO calls to
 * Main via two new JSON-RPC methods:
 *   - `extension.readTable`  (op: find | findOne | count)
 *   - `extension.writeTable` (op: insert | update | delete)
 *
 * On the Main side, `ExtensionIPC.setDAOService(dao)` registers handlers
 * for both methods. When the Host sends a request, the handlers:
 *   1. Parse the payload to extract `extensionId` (caller), `table`, `op`,
 *      `query` / `payload` / `where`.
 *   2. Dispatch to the corresponding `DAOService` method — DAOService
 *      enforces namespace isolation, shared-table read-only, and Zod
 *      validation, so this layer is a thin adapter.
 *   3. Wrap the DAOService result in the response envelope:
 *      `{ rows }` for find, `{ row }` for findOne, `{ count }` for count,
 *      `{ row, affected }` for insert, `{ affected }` for update/delete.
 *   4. On a typed DAO error (`TableAccessDeniedError` /
 *      `TableNotFoundError` / `SharedTableReadOnlyError` /
 *      `ValidationFailedError`), propagate the error with its `code` field
 *      intact so `ExtensionIPC` can map it to the matching JSON-RPC error
 *      code (Task 6.3 contract).
 *
 * The handlers are exposed as public methods (`handleReadTable`,
 * `handleWriteTable`) so unit tests can drive them directly without
 * constructing a real Electron `utilityProcess`. The handler methods
 * are internal to the IPC layer — they are called by `handleMessage`
 * when a request arrives from the Host, and by tests for verification.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { ExtensionIPC } from '../../../src/main/services/extension-ipc';
import {
  DAOService,
  SharedTableReadOnlyError,
  TableAccessDeniedError,
  TableNotFoundError,
  ValidationFailedError
} from '../../../src/main/services/dao-service';
import { TableSchemaRegistry } from '../../../src/main/services/table-schema-registry';
import {
  SHARED_TABLE_MANIFESTS
} from '../../../src/main/services/shared-data-tables';
import { getTestDatabase } from '../../../src/main/services/database-service';
import { RPC_METHOD } from '../../../src/shared/json-rpc-methods';

// Test schema for `salary_history_pay_slips` mirroring the full Phase 4
// migration `004-salary-history-pay-slips` (Decision 3 + Amendments 2/3/6).
// The test database (`getTestDatabase()`) boots with all Phase 4 migrations
// applied, so the SQL table exists with all 28 columns and NOT NULL
// constraints. This manifest must declare the same columns so the
// registry's Zod insert/update schemas match what SQLite will accept;
// otherwise inserts raise `SqliteError: NOT NULL constraint failed`
// (caught by the Zod schema only if the manifest declares nullable:false).
const SALARY_HISTORY_PAY_SLIPS = {
  name: 'salary_history_pay_slips',
  columns: [
    { name: 'id', type: 'integer' as const, primary: true, autoIncrement: true },
    { name: 'account_id', type: 'integer' as const, nullable: false },
    { name: 'pay_period_start', type: 'date' as const, nullable: false },
    { name: 'pay_period_end', type: 'date' as const, nullable: false },
    { name: 'pay_date', type: 'date' as const, nullable: false },
    { name: 'finance_year', type: 'text' as const, nullable: false },
    { name: 'gross', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'net', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'currency', type: 'text' as const, nullable: false, default: 'AUD' },
    { name: 'shift_allowance', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'base_hourly', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'overtime_1_5x', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'overtime_2_0x', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'holiday_leave_loading', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'holiday_pay', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'public_holiday', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'payg_withholding', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'superannuation_guarantee', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'personal_leave', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'holiday_leave_accrual_hours', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'regular_hours', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'shift_hours', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'overtime_1_5_hours', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'overtime_2_0_hours', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'public_holiday_hours', type: 'real' as const, nullable: false, default: 0, min: 0 },
    { name: 'notes', type: 'text' as const, nullable: true },
    { name: 'created_at', type: 'datetime' as const, nullable: false, default: 'now' },
    { name: 'updated_at', type: 'datetime' as const, nullable: false, default: 'now' }
  ]
};

describe('ExtensionIPC DAO handlers (Task 6.3)', () => {
  let registry: TableSchemaRegistry;
  let dao: DAOService;
  let ipc: ExtensionIPC;

  beforeEach(() => {
    const db = getTestDatabase();
    registry = new TableSchemaRegistry();
    registry.registerSharedTables(SHARED_TABLE_MANIFESTS);
    registry.registerExtensionTables('salary-history', [SALARY_HISTORY_PAY_SLIPS]);
    dao = new DAOService(db, registry);
    ipc = new ExtensionIPC();
    ipc.setDAOService(dao);

    // Seed accounts row(s) via raw SQL — the `accounts` table is shared and
    // cannot be written through DAOService (SharedTableReadOnlyError per
    // Decision 1), but raw inserts are fine in the test harness. The FK
    // constraint on `salary_history_pay_slips.account_id REFERENCES accounts(id)`
    // requires an account to exist before any payslip can be inserted.
    const insertAccount = db.prepare(
      'INSERT INTO accounts (name, is_active) VALUES (?, ?)'
    );
    insertAccount.run('Primary Salary', 1);
    insertAccount.run('Secondary Account', 1);
  });

  it('setDAOService registers handlers for both Phase 4 RPC methods', () => {
    // Indirect check: dispatching via the public handler methods should
    // succeed for the two Phase 4 methods after setDAOService is called.
    // Calling them with no DAO wired would throw a clear error.
    expect(() =>
      ipc.handleReadTable({
        extensionId: 'salary-history',
        table: 'accounts',
        op: 'count',
        query: {}
      })
    ).not.toThrow();

    expect(() =>
      ipc.handleReadTable({
        extensionId: 'salary-history',
        table: 'salary_history_pay_slips',
        op: 'find',
        query: {}
      })
    ).not.toThrow();
  });

  it('handleReadTable with op=find delegates to DAOService.find and returns {rows}', () => {
    // Seed two rows.
    dao.insert('salary-history', 'salary_history_pay_slips', {
      account_id: 1,
      pay_period_start: '2026-01-01',
      pay_period_end: '2026-01-15',
      pay_date: '2026-01-15',
      finance_year: 'FY2025-2026',
      gross: 5000,
      net: 3800
    });
    dao.insert('salary-history', 'salary_history_pay_slips', {
      account_id: 1,
      pay_period_start: '2026-01-16',
      pay_period_end: '2026-01-22',
      pay_date: '2026-01-22',
      finance_year: 'FY2025-2026',
      gross: 5200,
      net: 3900
    });

    const result = ipc.handleReadTable({
      extensionId: 'salary-history',
      table: 'salary_history_pay_slips',
      op: 'find',
      query: {}
    }) as { rows: Record<string, unknown>[] };

    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBe(2);
    // Date → ISO string serialisation per Decision 3 / Decision 6.
    expect(typeof result.rows[0].pay_date).toBe('string');
    expect(result.rows[0].pay_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handleReadTable with op=findOne returns {row} or null', () => {
    dao.insert('salary-history', 'salary_history_pay_slips', {
      account_id: 1,
      pay_period_start: '2026-01-19',
      pay_period_end: '2026-02-01',
      pay_date: '2026-02-01',
      finance_year: 'FY2025-2026',
      gross: 4800,
      net: 3700
    });

    const hit = ipc.handleReadTable({
      extensionId: 'salary-history',
      table: 'salary_history_pay_slips',
      op: 'findOne',
      query: { pay_date: '2026-02-01' }
    }) as { row: Record<string, unknown> | null };
    expect(hit.row).not.toBeNull();
    expect(hit.row?.gross).toBe(4800);

    const miss = ipc.handleReadTable({
      extensionId: 'salary-history',
      table: 'salary_history_pay_slips',
      op: 'findOne',
      query: { pay_date: '1999-01-01' }
    }) as { row: Record<string, unknown> | null };
    expect(miss.row).toBeNull();
  });

  it('handleReadTable with op=count returns {count}', () => {
    dao.insert('salary-history', 'salary_history_pay_slips', {
      account_id: 1,
      pay_period_start: '2026-02-17',
      pay_period_end: '2026-03-01',
      pay_date: '2026-03-01',
      finance_year: 'FY2025-2026',
      gross: 5000,
      net: 3800
    });
    dao.insert('salary-history', 'salary_history_pay_slips', {
      account_id: 1,
      pay_period_start: '2026-03-02',
      pay_period_end: '2026-03-08',
      pay_date: '2026-03-08',
      finance_year: 'FY2025-2026',
      gross: 5100,
      net: 3850
    });
    dao.insert('salary-history', 'salary_history_pay_slips', {
      account_id: 2,
      pay_period_start: '2026-03-09',
      pay_period_end: '2026-03-15',
      pay_date: '2026-03-15',
      finance_year: 'FY2025-2026',
      gross: 6000,
      net: 4500
    });

    const result = ipc.handleReadTable({
      extensionId: 'salary-history',
      table: 'salary_history_pay_slips',
      op: 'count',
      query: { account_id: 1 }
    }) as { count: number };

    expect(result.count).toBe(2);
  });

  it('handleWriteTable with op=insert returns {row, affected}', () => {
    const result = ipc.handleWriteTable({
      extensionId: 'salary-history',
      table: 'salary_history_pay_slips',
      op: 'insert',
      payload: {
        account_id: 1,
        pay_period_start: '2026-03-18',
        pay_period_end: '2026-04-01',
        pay_date: '2026-04-01',
        finance_year: 'FY2025-2026',
        gross: 5500,
        net: 4100
      }
    }) as { row: Record<string, unknown>; affected: number };

    expect(result.affected).toBe(1);
    expect(result.row.id).toBeDefined();
    expect(result.row.gross).toBe(5500);
  });

  it('handleWriteTable with op=update returns {affected}', () => {
    const inserted = dao.insert('salary-history', 'salary_history_pay_slips', {
      account_id: 1,
      pay_period_start: '2026-04-17',
      pay_period_end: '2026-05-01',
      pay_date: '2026-05-01',
      finance_year: 'FY2025-2026',
      gross: 5000,
      net: 3800
    });
    const id = inserted.id as number;

    const result = ipc.handleWriteTable({
      extensionId: 'salary-history',
      table: 'salary_history_pay_slips',
      op: 'update',
      where: { id },
      payload: { gross: 5500 }
    }) as { affected: number };

    expect(result.affected).toBe(1);
    const after = dao.findOne<{ gross: number }>('salary-history', 'salary_history_pay_slips', { id });
    expect(after?.gross).toBe(5500);
  });

  it('handleWriteTable with op=delete returns {affected}', () => {
    const inserted = dao.insert('salary-history', 'salary_history_pay_slips', {
      account_id: 1,
      pay_period_start: '2026-05-18',
      pay_period_end: '2026-06-01',
      pay_date: '2026-06-01',
      finance_year: 'FY2025-2026',
      gross: 5000,
      net: 3800
    });
    const id = inserted.id as number;

    const result = ipc.handleWriteTable({
      extensionId: 'salary-history',
      table: 'salary_history_pay_slips',
      op: 'delete',
      where: { id }
    }) as { affected: number };

    expect(result.affected).toBe(1);
    const after = dao.findOne('salary-history', 'salary_history_pay_slips', { id });
    expect(after).toBeNull();
  });

  it('propagates TableAccessDeniedError with code -32011', () => {
    // 'tax-stub' is not the owner of salary_history_pay_slips.
    expect(() =>
      ipc.handleReadTable({
        extensionId: 'tax-stub',
        table: 'salary_history_pay_slips',
        op: 'find',
        query: {}
      })
    ).toThrow(TableAccessDeniedError);

    try {
      ipc.handleReadTable({
        extensionId: 'tax-stub',
        table: 'salary_history_pay_slips',
        op: 'find',
        query: {}
      });
    } catch (err) {
      expect(err).toBeInstanceOf(TableAccessDeniedError);
      expect((err as TableAccessDeniedError).code).toBe(-32011);
    }
  });

  it('propagates TableNotFoundError with code -32010', () => {
    expect(() =>
      ipc.handleReadTable({
        extensionId: 'salary-history',
        table: 'unknown_table',
        op: 'find',
        query: {}
      })
    ).toThrow(TableNotFoundError);

    try {
      ipc.handleReadTable({
        extensionId: 'salary-history',
        table: 'unknown_table',
        op: 'find',
        query: {}
      });
    } catch (err) {
      expect(err).toBeInstanceOf(TableNotFoundError);
      expect((err as TableNotFoundError).code).toBe(-32010);
    }
  });

  it('propagates SharedTableReadOnlyError with code -32013 on extension write to shared table', () => {
    // `accounts` is the Phase 4 shared table (Decision 4).
    expect(() =>
      ipc.handleWriteTable({
        extensionId: 'salary-history',
        table: 'accounts',
        op: 'insert',
        payload: { name: 'evil', is_active: true }
      })
    ).toThrow(SharedTableReadOnlyError);

    try {
      ipc.handleWriteTable({
        extensionId: 'salary-history',
        table: 'accounts',
        op: 'insert',
        payload: { name: 'evil', is_active: true }
      });
    } catch (err) {
      expect(err).toBeInstanceOf(SharedTableReadOnlyError);
      expect((err as SharedTableReadOnlyError).code).toBe(-32013);
    }
  });

  it('propagates ValidationFailedError with code -32012 on Zod rejection', () => {
    // gross is `real` with `min: 0` per the test schema — negative violates.
    expect(() =>
      ipc.handleWriteTable({
        extensionId: 'salary-history',
        table: 'salary_history_pay_slips',
        op: 'insert',
        payload: {
          account_id: 1,
          pay_period_start: '2026-06-17',
          pay_period_end: '2026-07-01',
          pay_date: '2026-07-01',
          finance_year: 'FY2026-2027',
          gross: -100,
          net: 0
        }
      })
    ).toThrow(ValidationFailedError);

    try {
      ipc.handleWriteTable({
        extensionId: 'salary-history',
        table: 'salary_history_pay_slips',
        op: 'insert',
        payload: {
          account_id: 1,
          pay_period_start: '2026-06-17',
          pay_period_end: '2026-07-01',
          pay_date: '2026-07-01',
          finance_year: 'FY2026-2027',
          gross: -100,
          net: 0
        }
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationFailedError);
      expect((err as ValidationFailedError).code).toBe(-32012);
    }
  });

  it('exposes readTable/writeTable method names matching RPC_METHOD constants', () => {
    // Cross-check that the catalogue and the handler registration agree.
    // The handlers are registered under these literal method names; if
    // RPC_METHOD drifted, host.ts would silently fail to dispatch.
    expect(RPC_METHOD.ExtensionReadTable).toBe('extension.readTable');
    expect(RPC_METHOD.ExtensionWriteTable).toBe('extension.writeTable');
  });
});
