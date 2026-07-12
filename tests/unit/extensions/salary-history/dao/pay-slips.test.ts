import { describe, it, expect, beforeEach } from 'vitest';
import {
  listPaySlips,
  createPaySlip,
  updatePaySlip,
  deletePaySlip,
  PaySlipValidationError,
  type PaySlip,
  type PaySlipInput,
} from '../../../../../extensions/salary-history/src/dao/pay-slips';
import type { FinanceApi } from '../../../../../src/extension-host/api/index';

// ---------------------------------------------------------------------------
// Stub FinanceApi + table state
// ---------------------------------------------------------------------------

interface TableState {
  rows: Array<PaySlip & { id: number }>;
  nextId: number;
}

function makeFinance(): {
  finance: FinanceApi;
  state: TableState;
} {
  const state: TableState = { rows: [], nextId: 1 };
  const finance: FinanceApi = {
    db: {
      table(_name: string) {
        void _name;
        return {
          async find(query: Record<string, unknown> = {}) {
            // Supports simple { col: value } and { col: { $gte, $lte } } for date range.
            const rows = state.rows.filter((row) =>
              Object.entries(query).every(([k, v]) => {
                const field = (row as unknown as Record<string, unknown>)[k];
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                  const ops = v as Record<string, unknown>;
                  if ('$gte' in ops && typeof field === 'string' && typeof ops.$gte === 'string' && field < ops.$gte) return false;
                  if ('$lte' in ops && typeof field === 'string' && typeof ops.$lte === 'string' && field > ops.$lte) return false;
                  return true;
                }
                return field === v;
              }),
            );
            return rows as unknown as Record<string, unknown>[];
          },
          async findOne(query: Record<string, unknown> = {}) {
            const rows = await finance.db.table('x').find(query);
            return (rows[0] as unknown as PaySlip) ?? null;
          },
          async count() { return state.rows.length; },
          async insert(payload: Record<string, unknown>) {
            const id = state.nextId++;
            const row = { ...(payload as unknown as PaySlip), id } as PaySlip & { id: number };
            state.rows.push(row);
            return row as unknown as Record<string, unknown>;
          },
          async update(where: Record<string, unknown>, payload: Record<string, unknown>) {
            let affected = 0;
            for (const row of state.rows) {
              if (Object.entries(where).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v)) {
                Object.assign(row, payload);
                affected += 1;
              }
            }
            return affected;
          },
          async delete(where: Record<string, unknown>) {
            const before = state.rows.length;
            state.rows = state.rows.filter(
              (row) => !Object.entries(where).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v),
            );
            return before - state.rows.length;
          },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      },
    },
    commands: { registerCommand: () => {}, execute: async () => null },
    ai: { registerTool: () => {} },
  };
  return { finance, state };
}

function validInput(overrides: Record<string, unknown> = {}): PaySlipInput {
  return {
    account_id: 1,
    pay_period_start: '2026-01-05',
    pay_period_end: '2026-01-11',
    pay_date: '2026-01-15',
    finance_year: '2025-26',
    gross: 2000,
    net: 1500,
    currency: 'AUD',
    shift_allowance: 0,
    base_hourly: 0,
    overtime_1_5x: 0,
    overtime_2_0x: 0,
    holiday_leave_loading: 0,
    holiday_pay: 0,
    public_holiday: 0,
    payg_withholding: 500,
    superannuation_guarantee: 240,
    personal_leave: 0,
    regular_hours: 38,
    shift_hours: 38,
    overtime_1_5_hours: 0,
    overtime_2_0_hours: 0,
    public_holiday_hours: 0,
    holiday_leave_accrual_hours: 40,
    notes: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dao/pay-slips', () => {
  let env: ReturnType<typeof makeFinance>;

  beforeEach(() => {
    env = makeFinance();
  });

  describe('listPaySlips', () => {
    beforeEach(async () => {
      await env.finance.db.table('x').insert(validInput({ pay_date: '2025-08-15', finance_year: '2025-26' }) as Record<string, unknown>);
      await env.finance.db.table('x').insert(validInput({ pay_date: '2025-09-15', finance_year: '2025-26' }) as Record<string, unknown>);
      await env.finance.db.table('x').insert(validInput({ pay_date: '2025-10-15', finance_year: '2025-26', account_id: 2 }) as Record<string, unknown>);
      await env.finance.db.table('x').insert(validInput({ pay_date: '2024-08-15', finance_year: '2024-25' }) as Record<string, unknown>);
    });

    it('returns all rows when no filters are supplied, ordered pay_date DESC', async () => {
      const rows = await listPaySlips(env.finance);
      expect(rows).toHaveLength(4);
      expect(rows[0].pay_date).toBe('2025-10-15');
      expect(rows[3].pay_date).toBe('2024-08-15');
    });

    it('filters by account_id', async () => {
      const rows = await listPaySlips(env.finance, { accountId: 1 });
      expect(rows.every((r) => r.account_id === 1)).toBe(true);
      expect(rows).toHaveLength(3);
    });

    it('filters by financeYear', async () => {
      const rows = await listPaySlips(env.finance, { financeYear: '2024-25' });
      expect(rows).toHaveLength(1);
      expect(rows[0].pay_date).toBe('2024-08-15');
    });

    it('filters by from/to date range (inclusive)', async () => {
      const rows = await listPaySlips(env.finance, { from: '2025-09-01', to: '2025-09-30' });
      expect(rows).toHaveLength(1);
      expect(rows[0].pay_date).toBe('2025-09-15');
    });

    it('combines multiple filters with AND', async () => {
      const rows = await listPaySlips(env.finance, { accountId: 1, financeYear: '2025-26' });
      expect(rows).toHaveLength(2);
    });

    it('returns empty array when no rows match', async () => {
      const rows = await listPaySlips(env.finance, { accountId: 999 });
      expect(rows).toEqual([]);
    });
  });

  describe('createPaySlip', () => {
    it('inserts a valid row and returns the inserted row (with id populated)', async () => {
      const input = validInput();
      const row = await createPaySlip(env.finance, input);
      expect(row.id).toBe(1);
      expect(row.gross).toBe(2000);
      const all = await listPaySlips(env.finance);
      expect(all).toHaveLength(1);
    });

    it('throws PaySlipValidationError on invalid input (negative gross)', async () => {
      await expect(createPaySlip(env.finance, validInput({ gross: -1 }))).rejects.toBeInstanceOf(PaySlipValidationError);
    });

    it('throws PaySlipValidationError on net > gross', async () => {
      await expect(createPaySlip(env.finance, validInput({ net: 2500 }))).rejects.toBeInstanceOf(PaySlipValidationError);
    });

    it('does not insert when validation fails', async () => {
      try { await createPaySlip(env.finance, validInput({ gross: -1 })); } catch { /* expected */ }
      const all = await listPaySlips(env.finance);
      expect(all).toHaveLength(0);
    });
  });

  describe('updatePaySlip', () => {
    beforeEach(async () => {
      await createPaySlip(env.finance, validInput());
    });

    it('updates an existing row and returns affected=1', async () => {
      const affected = await updatePaySlip(env.finance, 1, { gross: 2100 });
      expect(affected).toBe(1);
      const all = await listPaySlips(env.finance);
      expect(all[0].gross).toBe(2100);
    });

    it('returns 0 when id does not exist', async () => {
      const affected = await updatePaySlip(env.finance, 999, { gross: 1 });
      expect(affected).toBe(0);
    });

    it('throws PaySlipValidationError when the merged shape would violate a rule', async () => {
      // Existing: gross=2000, net=1500. Patch: net=3000 → merged violates net ≤ gross.
      await expect(updatePaySlip(env.finance, 1, { net: 3000 })).rejects.toBeInstanceOf(PaySlipValidationError);
    });

    it('does not mutate the row when validation fails', async () => {
      try { await updatePaySlip(env.finance, 1, { net: 3000 }); } catch { /* expected */ }
      const all = await listPaySlips(env.finance);
      expect(all[0].net).toBe(1500);
    });
  });

  describe('deletePaySlip', () => {
    beforeEach(async () => {
      await createPaySlip(env.finance, validInput());
    });

    it('deletes the row by id and returns affected=1', async () => {
      const affected = await deletePaySlip(env.finance, 1);
      expect(affected).toBe(1);
      const all = await listPaySlips(env.finance);
      expect(all).toHaveLength(0);
    });

    it('returns 0 when id does not exist', async () => {
      const affected = await deletePaySlip(env.finance, 999);
      expect(affected).toBe(0);
    });
  });
});
