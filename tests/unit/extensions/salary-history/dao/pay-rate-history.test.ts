import { describe, it, expect, beforeEach } from 'vitest';
import {
  addNewRate,
  editCurrentRate,
  listAllRates,
  getCurrentRate,
  getRateForDate,
  type RateRow,
} from '../../../../../extensions/salary-history/src/dao/pay-rate-history';
import type { FinanceApi } from 'finance';

// ---------------------------------------------------------------------------
// Stub FinanceApi — shared with pay-rate-service.test.ts structure.
// ---------------------------------------------------------------------------

interface TableState {
  rows: Array<RateRow & { id: number }>;
  nextId: number;
}

function makeFinance(): { finance: FinanceApi; state: TableState } {
  const state: TableState = { rows: [], nextId: 1 };
  const finance: FinanceApi = {
    db: {
      table(_name: string) {
        void _name;
        return {
          async find(query: Record<string, unknown> = {}) {
            return state.rows.filter((row) =>
              Object.entries(query).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v),
            ) as unknown as Record<string, unknown>[];
          },
          async findOne(query: Record<string, unknown> = {}) {
            const rows = await finance.db.table('x').find(query);
            return (rows[0] as unknown as RateRow) ?? null;
          },
          async count() { return state.rows.length; },
          async insert(payload: Record<string, unknown>) {
            const id = state.nextId++;
            const row = { ...(payload as unknown as RateRow), id } as RateRow & { id: number };
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
     services: { register: () => {}, unregister: () => {}, invoke: async () => null },
   };
  return { finance, state };
}

function rateRow(overrides: Record<string, unknown> = {}): RateRow {
  return {
    effective_from: '2025-07-01',
    effective_to: null,
    base_hourly_rate: 35,
    standard_hours_per_week: 38,
    shift_allowance_multiplier: 0.15,
    shift_allowance_hours_per_week: 38,
    overtime_1_5_multiplier: 1.5,
    overtime_2_0_multiplier: 2.0,
    superannuation_rate: 0.12,
    holiday_leave_loading_rate: 0.175,
    accrual_rate_per_week: 2.92,
    notes: null,
    ...overrides,
  };
}

describe('dao/pay-rate-history', () => {
  let env: ReturnType<typeof makeFinance>;

  beforeEach(() => {
    env = makeFinance();
  });

  it('inserts a new rate row when the table is empty', async () => {
    await addNewRate(env.finance, rateRow());
    const all = await listAllRates(env.finance);
    expect(all).toHaveLength(1);
    expect(all[0].effective_to).toBeNull();
    expect(all[0].id).toBeDefined();
  });

  it('addNewRate closes the previous current row and inserts a new one', async () => {
    await addNewRate(env.finance, rateRow({ effective_from: '2025-07-01', base_hourly_rate: 30 }));
    await addNewRate(env.finance, rateRow({ effective_from: '2026-01-01', base_hourly_rate: 35 }));

    const all = await listAllRates(env.finance);
    expect(all).toHaveLength(2);

    const oldRow = all.find((r) => r.effective_from === '2025-07-01');
    expect(oldRow?.effective_to).toBe('2026-01-01');

    const current = await getCurrentRate(env.finance);
    expect(current?.base_hourly_rate).toBe(35);
    expect(current?.effective_to).toBeNull();
  });

  it('addNewRate forces effective_to = null on the inserted row (caller-supplied value is ignored)', async () => {
    await addNewRate(env.finance, rateRow({ effective_to: '2099-12-31' } as Record<string, unknown>));
    const all = await listAllRates(env.finance);
    expect(all[0].effective_to).toBeNull();
  });

  it('editCurrentRate updates the current row in place', async () => {
    await addNewRate(env.finance, rateRow());
    const affected = await editCurrentRate(env.finance, { base_hourly_rate: 40, notes: 'Annual raise' });
    expect(affected).toBe(1);
    const current = await getCurrentRate(env.finance);
    expect(current?.base_hourly_rate).toBe(40);
    expect(current?.notes).toBe('Annual raise');
  });

  it('editCurrentRate returns 0 when no current row exists', async () => {
    const affected = await editCurrentRate(env.finance, { base_hourly_rate: 40 });
    expect(affected).toBe(0);
  });

  it('getRateForDate returns the correct row for any date in the history', async () => {
    await addNewRate(env.finance, rateRow({ effective_from: '2024-01-01', base_hourly_rate: 28 }));
    await addNewRate(env.finance, rateRow({ effective_from: '2025-01-01', base_hourly_rate: 32 }));
    await addNewRate(env.finance, rateRow({ effective_from: '2026-01-01', base_hourly_rate: 35 }));

    expect((await getRateForDate(env.finance, '2023-12-31'))?.base_hourly_rate).toBeUndefined();
    expect((await getRateForDate(env.finance, '2024-06-15'))?.base_hourly_rate).toBe(28);
    expect((await getRateForDate(env.finance, '2025-06-15'))?.base_hourly_rate).toBe(32);
    expect((await getRateForDate(env.finance, '2026-06-15'))?.base_hourly_rate).toBe(35);
  });
});
