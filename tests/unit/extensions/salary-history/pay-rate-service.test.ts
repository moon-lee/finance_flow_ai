import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateRateRow,
  getRateForDate,
  getCurrentRate,
  listAllRates,
  buildDefaultRateRow,
  type RateRow,
} from '../../../../extensions/salary-history/src/services/pay-rate-service';
import type { FinanceApi } from 'finance';

// ---------------------------------------------------------------------------
// Stub FinanceApi for DAO wrapper tests
// ---------------------------------------------------------------------------

/**
 * Records the last call and returns programmable responses per method.
 * The extension DAO wrappers only use `find`, `findOne`, `insert`,
 * `update`, and `delete` — everything else is left as `() => { throw }`
 * so accidental misuse surfaces as a test failure.
 */
interface TableState {
  rows: RateRow[];
  nextId: number;
}

function makeFinance(initialRows: RateRow[] = []): {
  finance: FinanceApi;
  state: TableState;
  calls: Array<{ op: string; args: unknown }>;
} {
  const state: TableState = {
    rows: initialRows.map((r) => ({ ...r })),
    nextId: 1,
  };
  const calls: Array<{ op: string; args: unknown }> = [];

  const finance: FinanceApi = {
    db: {
      table(_name: string) {
        void _name;
        return {
          async find(query: Record<string, unknown> = {}) {
            calls.push({ op: 'find', args: { query } });
            const q = query as Record<string, unknown>;
            // Support { effective_to: null } shorthand (DAO $eq).
            return state.rows.filter((row) =>
              Object.entries(q).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v),
            ) as unknown as Record<string, unknown>[];
          },
          async findOne(query: Record<string, unknown> = {}) {
            calls.push({ op: 'findOne', args: { query } });
            const found = await finance.db.table('x').find(query);
            return (found[0] as unknown as RateRow) ?? null;
          },
          async count() {
            throw new Error('count not used in these tests');
          },
          async insert(payload: Record<string, unknown>) {
            calls.push({ op: 'insert', args: payload });
            const id = state.nextId++;
            const row: RateRow = { ...(payload as unknown as RateRow), id } as RateRow;
            state.rows.push(row);
            return row as unknown as Record<string, unknown>;
          },
          async update(where: Record<string, unknown>, payload: Record<string, unknown>) {
            calls.push({ op: 'update', args: { where, payload } });
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
            calls.push({ op: 'delete', args: { where } });
            const before = state.rows.length;
            state.rows = state.rows.filter(
              (row) => !Object.entries(where).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v),
            );
            return before - state.rows.length;
          },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any; // type-cast: the stub is structurally compatible but uses domain types for convenience
      },
    },
    commands: {
      registerCommand: () => {},
      execute: async () => null,
    },
    ai: { registerTool: () => {} },
  };

  return { finance, state, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pay-rate-service', () => {
  describe('validateRateRow', () => {
    it('passes for a fully-valid rate row', () => {
      const r = validateRateRow(buildDefaultRateRow('2025-07-01'));
      expect(r.ok).toBe(true);
    });

    it('flags effective_from >= effective_to when both set', () => {
      const r = validateRateRow({
        effective_from: '2025-12-31',
        effective_to: '2025-12-31',
        base_hourly_rate: 0,
        standard_hours_per_week: 0,
        shift_allowance_multiplier: 0,
        shift_allowance_hours_per_week: 0,
        overtime_1_5_multiplier: 0,
        overtime_2_0_multiplier: 0,
        superannuation_rate: 0,
        holiday_leave_loading_rate: 0,
        accrual_rate_per_week: 0,
        starting_holiday_leave_balance: 0,
        notes: null,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/effective_from must be earlier/);
    });

    it('allows effective_to = null (open-ended current row)', () => {
      const r = validateRateRow({ ...buildDefaultRateRow('2025-07-01'), effective_to: null });
      expect(r.ok).toBe(true);
    });

    it('flags negative numeric fields', () => {
      const r = validateRateRow({ ...buildDefaultRateRow('2025-07-01'), base_hourly_rate: -1 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/base_hourly_rate must be ≥ 0/);
    });

    it('flags superannuation_rate > 1', () => {
      const r = validateRateRow({ ...buildDefaultRateRow('2025-07-01'), superannuation_rate: 1.5 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/superannuation_rate must be ≤ 1/);
    });

    it('flags notes > 1000 chars', () => {
      const r = validateRateRow({ ...buildDefaultRateRow('2025-07-01'), notes: 'x'.repeat(1001) });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/notes must be ≤ 1000 characters/);
    });

    it('accumulates multiple errors at once', () => {
      const r = validateRateRow({
        effective_from: '2025-12-31',
        effective_to: '2025-01-01', // wrong order
        base_hourly_rate: -1, // negative
        superannuation_rate: 2, // > 1
        standard_hours_per_week: 38,
        shift_allowance_multiplier: 0.15,
        shift_allowance_hours_per_week: 38,
        overtime_1_5_multiplier: 1.5,
        overtime_2_0_multiplier: 2.0,
        holiday_leave_loading_rate: 0.175,
        accrual_rate_per_week: 2.92,
        starting_holiday_leave_balance: 0,
        notes: null,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('buildDefaultRateRow', () => {
    it('sets all required fields with the documented defaults', () => {
      const r = buildDefaultRateRow('2025-07-01');
      expect(r.effective_from).toBe('2025-07-01');
      expect(r.effective_to).toBeNull();
      expect(r.standard_hours_per_week).toBe(38);
      expect(r.superannuation_rate).toBe(0.12);
      expect(r.holiday_leave_loading_rate).toBe(0.175);
      expect(r.accrual_rate_per_week).toBe(2.92);
      expect(r.starting_holiday_leave_balance).toBe(0);
    });
  });

  describe('DAO helpers (against stubbed FinanceApi)', () => {
    let env: ReturnType<typeof makeFinance>;

    beforeEach(() => {
      env = makeFinance();
    });

    it('getCurrentRate returns null when no current row exists', async () => {
      expect(await getCurrentRate(env.finance)).toBeNull();
    });

    it('getCurrentRate returns the row with effective_to === null', async () => {
      await env.finance.db.table('x').insert({
        effective_from: '2024-01-01', effective_to: '2025-01-01', base_hourly_rate: 30, standard_hours_per_week: 38,
        shift_allowance_multiplier: 0.15, shift_allowance_hours_per_week: 38,
        overtime_1_5_multiplier: 1.5, overtime_2_0_multiplier: 2.0,
        superannuation_rate: 0.12, holiday_leave_loading_rate: 0.175,
        accrual_rate_per_week: 2.92, starting_holiday_leave_balance: 0, notes: null,
      } as Record<string, unknown>);
      await env.finance.db.table('x').insert({
        effective_from: '2025-01-01', effective_to: null, base_hourly_rate: 35, standard_hours_per_week: 38,
        shift_allowance_multiplier: 0.15, shift_allowance_hours_per_week: 38,
        overtime_1_5_multiplier: 1.5, overtime_2_0_multiplier: 2.0,
        superannuation_rate: 0.12, holiday_leave_loading_rate: 0.175,
        accrual_rate_per_week: 2.92, starting_holiday_leave_balance: 0, notes: null,
      } as Record<string, unknown>);
      const current = await getCurrentRate(env.finance);
      expect(current?.base_hourly_rate).toBe(35);
    });

    it('getRateForDate returns the row covering the given date', async () => {
      await env.finance.db.table('x').insert({
        effective_from: '2024-01-01', effective_to: '2025-01-01', base_hourly_rate: 30, standard_hours_per_week: 38,
        shift_allowance_multiplier: 0.15, shift_allowance_hours_per_week: 38,
        overtime_1_5_multiplier: 1.5, overtime_2_0_multiplier: 2.0,
        superannuation_rate: 0.12, holiday_leave_loading_rate: 0.175,
        accrual_rate_per_week: 2.92, starting_holiday_leave_balance: 0, notes: null,
      } as Record<string, unknown>);
      await env.finance.db.table('x').insert({
        effective_from: '2025-01-01', effective_to: null, base_hourly_rate: 35, standard_hours_per_week: 38,
        shift_allowance_multiplier: 0.15, shift_allowance_hours_per_week: 38,
        overtime_1_5_multiplier: 1.5, overtime_2_0_multiplier: 2.0,
        superannuation_rate: 0.12, holiday_leave_loading_rate: 0.175,
        accrual_rate_per_week: 2.92, starting_holiday_leave_balance: 0, notes: null,
      } as Record<string, unknown>);
      const r1 = await getRateForDate(env.finance, '2024-06-15');
      expect(r1?.base_hourly_rate).toBe(30);
      const r2 = await getRateForDate(env.finance, '2025-06-15');
      expect(r2?.base_hourly_rate).toBe(35);
    });

    it('getRateForDate returns null for a date before the earliest row', async () => {
      await env.finance.db.table('x').insert({
        effective_from: '2025-01-01', effective_to: null, base_hourly_rate: 35, standard_hours_per_week: 38,
        shift_allowance_multiplier: 0.15, shift_allowance_hours_per_week: 38,
        overtime_1_5_multiplier: 1.5, overtime_2_0_multiplier: 2.0,
        superannuation_rate: 0.12, holiday_leave_loading_rate: 0.175,
        accrual_rate_per_week: 2.92, starting_holiday_leave_balance: 0, notes: null,
      } as Record<string, unknown>);
      expect(await getRateForDate(env.finance, '2024-01-01')).toBeNull();
    });

    it('listAllRates orders rows effective_from DESC (newest first)', async () => {
      for (const date of ['2024-01-01', '2025-01-01', '2023-01-01']) {
        await env.finance.db.table('x').insert({
          effective_from: date, effective_to: null, base_hourly_rate: 30, standard_hours_per_week: 38,
          shift_allowance_multiplier: 0.15, shift_allowance_hours_per_week: 38,
          overtime_1_5_multiplier: 1.5, overtime_2_0_multiplier: 2.0,
          superannuation_rate: 0.12, holiday_leave_loading_rate: 0.175,
          accrual_rate_per_week: 2.92, starting_holiday_leave_balance: 0, notes: null,
        } as Record<string, unknown>);
      }
      const all = await listAllRates(env.finance);
      expect(all.map((r) => r.effective_from)).toEqual(['2025-01-01', '2024-01-01', '2023-01-01']);
    });

    it('addNewRate closes the previous current row and inserts a new one (effective_to = null)', async () => {
      await env.finance.db.table('x').insert({
        effective_from: '2025-01-01', effective_to: null, base_hourly_rate: 30, standard_hours_per_week: 38,
        shift_allowance_multiplier: 0.15, shift_allowance_hours_per_week: 38,
        overtime_1_5_multiplier: 1.5, overtime_2_0_multiplier: 2.0,
        superannuation_rate: 0.12, holiday_leave_loading_rate: 0.175,
        accrual_rate_per_week: 2.92, starting_holiday_leave_balance: 0, notes: null,
      } as Record<string, unknown>);
      // addNewRate on a DAO with a current row should:
      // (a) close the previous current row by setting effective_to to the new row's effective_from
      // (b) insert a new row with effective_to = null
      await import('../../../../extensions/salary-history/src/dao/pay-rate-history').then(async (m) => {
        await m.addNewRate(env.finance, {
          effective_from: '2026-01-01',
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
          starting_holiday_leave_balance: 0,
          notes: null,
        });
      });
      const current = await getCurrentRate(env.finance);
      expect(current?.base_hourly_rate).toBe(35);
      const all = await listAllRates(env.finance);
      const old = all.find((r) => r.effective_from === '2025-01-01');
      expect(old?.effective_to).toBe('2026-01-01');
    });

    it('addNewRate on an empty history inserts a single row with effective_to = null', async () => {
      await import('../../../../extensions/salary-history/src/dao/pay-rate-history').then(async (m) => {
        await m.addNewRate(env.finance, {
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
          starting_holiday_leave_balance: 0,
          notes: null,
        });
      });
      const all = await listAllRates(env.finance);
      expect(all).toHaveLength(1);
      expect(all[0].effective_to).toBeNull();
    });
  });
});
