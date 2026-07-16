import { describe, it, expect } from 'vitest';
import {
  validatePayslipInput,
  validateFinanceYear,
  calculatePaySlipBreakdown,
  calculateNetFromGross,
  aggregateYearToDate,
  reconcilePaySlip,
  calculateHolidayLeaveAccrual,
  computeFinanceYear,
} from '../../../../extensions/salary-history/src/services/pay-service';
import type { PaySlip } from '../../../../extensions/salary-history/src/dao/pay-slips';
import type { RateRow } from '../../../../extensions/salary-history/src/dao/pay-rate-history';

/** Valid payslip baseline; tests override specific fields to exercise rule paths. */
function validPaySlip(overrides: Record<string, unknown> = {}): PaySlip {
  return {
    account_id: 1,
    pay_period_start: '2026-01-05',
    pay_period_end: '2026-01-11',
    pay_date: '2026-01-15',
    finance_year: '2025-26',
    gross: 2000,
    net: 1500,
    currency: 'AUD',
    shift_allowance: 100,
    base_hourly: 1500,
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
  } as PaySlip;
}

function validRateRow(overrides: Record<string, unknown> = {}): RateRow {
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
  } as RateRow;
}

describe('pay-service', () => {
  describe('validatePayslipInput', () => {
    it('returns ok for a fully-valid payslip', () => {
      expect(validatePayslipInput(validPaySlip())).toEqual({ ok: true });
    });

    it('flags negative gross', () => {
      const r = validatePayslipInput(validPaySlip({ gross: -1 }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/gross must be ≥ 0/);
    });

    it('flags net exceeding gross', () => {
      const r = validatePayslipInput(validPaySlip({ net: 2500 }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/net cannot exceed gross/);
    });

    it('flags negative net', () => {
      const r = validatePayslipInput(validPaySlip({ net: -1 }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/net must be ≥ 0/);
    });

    it('flags pay_period_start after pay_period_end', () => {
      const r = validatePayslipInput(
        validPaySlip({ pay_period_start: '2026-01-20', pay_period_end: '2026-01-10' }),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/pay_period_start must be on or before pay_period_end/);
    });

    it('flags pay_period_end after pay_date', () => {
      const r = validatePayslipInput(
        validPaySlip({ pay_period_end: '2026-02-01', pay_date: '2026-01-25' }),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/pay_period_end must be on or before pay_date/);
    });

    it('flags malformed dates', () => {
      const r = validatePayslipInput(validPaySlip({ pay_date: 'not-a-date' }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/pay_date must be a valid YYYY-MM-DD/);
    });

    it('flags non-positive account_id', () => {
      const r = validatePayslipInput(validPaySlip({ account_id: 0 }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/account_id must be a positive integer/);
    });

    it('flags malformed finance_year', () => {
      const r = validatePayslipInput(validPaySlip({ finance_year: '2025/26' }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/finance_year must match YYYY-YY/);
    });

    it('flags non-ISO currency', () => {
      const r = validatePayslipInput(validPaySlip({ currency: 'aud' }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/currency must be a 3-letter uppercase/);
    });

    it('flags negative breakdown monetary columns', () => {
      const r = validatePayslipInput(validPaySlip({ overtime_1_5x: -1 }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/overtime_1_5x must be ≥ 0/);
    });

    it('flags negative leave-accrual balance', () => {
      const r = validatePayslipInput(validPaySlip({ holiday_leave_accrual_hours: -1 }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/holiday_leave_accrual_hours must be ≥ 0/);
    });
  });

  describe('computeFinanceYear + validateFinanceYear', () => {
    it('returns "2025-2026" for a date in the second half of 2025 with FY-start 07-01', () => {
      expect(computeFinanceYear('2025-08-15', '07-01')).toBe('2025-2026');
    });

    it('returns "2025-2026" for a date in the first half of 2026 with FY-start 07-01', () => {
      expect(computeFinanceYear('2026-01-15', '07-01')).toBe('2025-2026');
    });

    it('wraps to "2026-2027" for a date in the second half of 2026', () => {
      expect(computeFinanceYear('2026-08-15', '07-01')).toBe('2026-2027');
    });

    it('returns null for an invalid payDate', () => {
      expect(computeFinanceYear('garbage', '07-01')).toBeNull();
    });

    it('validateFinanceYear passes when labels match', () => {
      expect(validateFinanceYear('2026-01-15', '2025-2026', '07-01')).toEqual({ ok: true });
    });

    it('validateFinanceYear fails when labels do not match', () => {
      const r = validateFinanceYear('2026-01-15', '2026-2027', '07-01');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/financeYear "2026-2027" does not match expected "2025-2026"/);
    });
  });

  describe('calculatePaySlipBreakdown', () => {
    it('derives all fields from defaults when hours=null (regular week)', () => {
      const rate = validRateRow();
      const b = calculatePaySlipBreakdown('2026-01-15', 2000, 1500, null, rate);
      // base_hourly = 38 * 35 = 1330
      expect(b.base_hourly).toBeCloseTo(1330, 2);
      // shift_allowance = 38 * 35 * 0.15 = 199.5
      expect(b.shift_allowance).toBeCloseTo(199.5, 2);
      // payg_withholding = max(0, 2000 - 1500) = 500
      expect(b.payg_withholding).toBe(500);
      // superannuation_guarantee = 2000 * 0.12 = 240
      expect(b.superannuation_guarantee).toBeCloseTo(240, 2);
      // personal_leave = 0 (default)
      expect(b.personal_leave).toBe(0);
      // overtime/holiday fields all 0
      expect(b.overtime_1_5x).toBe(0);
      expect(b.holiday_pay).toBe(0);
    });

    it('applies overtime multipliers when overtime hours supplied', () => {
      const rate = validRateRow();
      const hours = {
        regular_hours: 38,
        shift_hours: 38,
        overtime_1_5_hours: 4,
        overtime_2_0_hours: 2,
        holiday_hours: 0,
        public_holiday_hours: 0,
        personal_leave_hours: 0,
      };
      const b = calculatePaySlipBreakdown('2026-01-15', 3000, 2200, hours, rate);
      expect(b.overtime_1_5x).toBeCloseTo(4 * 35 * 1.5, 2);
      expect(b.overtime_2_0x).toBeCloseTo(2 * 35 * 2.0, 2);
    });

    it('applies holiday-leave loading (17.5% of base) when holiday_hours supplied', () => {
      const rate = validRateRow();
      const hours = {
        regular_hours: 38,
        shift_hours: 38,
        overtime_1_5_hours: 0,
        overtime_2_0_hours: 0,
        holiday_hours: 8,
        public_holiday_hours: 0,
        personal_leave_hours: 0,
      };
      const b = calculatePaySlipBreakdown('2026-01-15', 2500, 1900, hours, rate);
      expect(b.holiday_pay).toBeCloseTo(8 * 35, 2);
      expect(b.holiday_leave_loading).toBeCloseTo(8 * 35 * 0.175, 2);
    });

    it('zeroes holiday_pay + holiday_leave_loading when public_holiday_hours > 0 (Review Finding 4 disambiguation)', () => {
      const rate = validRateRow();
      const hours = {
        regular_hours: 38,
        shift_hours: 38,
        overtime_1_5_hours: 0,
        overtime_2_0_hours: 0,
        holiday_hours: 8,
        public_holiday_hours: 8,
        personal_leave_hours: 0,
      };
      const b = calculatePaySlipBreakdown('2026-01-15', 2500, 1900, hours, rate);
      expect(b.holiday_pay).toBe(0);
      expect(b.holiday_leave_loading).toBe(0);
      expect(b.public_holiday).toBeCloseTo(8 * 35, 2);
    });

    it('derives personal_leave from personal_leave_hours (Plan Amendment 6)', () => {
      const rate = validRateRow();
      const hours = {
        regular_hours: 38,
        shift_hours: 38,
        overtime_1_5_hours: 0,
        overtime_2_0_hours: 0,
        holiday_hours: 0,
        public_holiday_hours: 0,
        personal_leave_hours: 16,
      };
      const b = calculatePaySlipBreakdown('2026-01-15', 2000, 1500, hours, rate);
      expect(b.personal_leave).toBeCloseTo(16 * 35, 2);
    });
  });

  describe('calculateNetFromGross', () => {
    it('returns gross * (1 - taxRate) for valid inputs', () => {
      expect(calculateNetFromGross(2000, 0.25)).toBe(1500);
    });
    it('returns 0 for invalid inputs', () => {
      expect(calculateNetFromGross(NaN, 0.25)).toBe(0);
      expect(calculateNetFromGross(2000, NaN)).toBe(0);
    });
  });

  describe('aggregateYearToDate', () => {
    it('returns zero aggregate for empty payslips', () => {
      expect(aggregateYearToDate([], '07-01', '2026-01-15')).toEqual({
        gross: 0, net: 0, payg: 0, superannuation_guarantee: 0, count: 0,
        shift_allowance: 0, overtime_1_5x: 0, overtime_2_0x: 0,
        personal_leave: 0, holiday_leave_loading: 0, holiday_pay: 0, public_holiday: 0,
      });
    });

    it('sums gross/net/payg/sg and earnings components for the FY of referenceDate', () => {
      const inFY = validPaySlip({
        finance_year: '2025-26', gross: 2000, net: 1500, payg_withholding: 500,
        superannuation_guarantee: 240, shift_allowance: 100, overtime_1_5x: 50,
        overtime_2_0x: 20, personal_leave: 10, holiday_leave_loading: 5,
        holiday_pay: 8, public_holiday: 3,
      });
      const otherFY = validPaySlip({ finance_year: '2024-25', gross: 9999 });
      const agg = aggregateYearToDate([inFY, inFY, otherFY], '07-01', '2026-01-15');
      expect(agg.gross).toBe(4000);
      expect(agg.net).toBe(3000);
      expect(agg.payg).toBe(1000);
      expect(agg.superannuation_guarantee).toBe(480);
      expect(agg.count).toBe(2);
      expect(agg.shift_allowance).toBe(200);
      expect(agg.overtime_1_5x).toBe(100);
      expect(agg.overtime_2_0x).toBe(40);
      expect(agg.personal_leave).toBe(20);
      expect(agg.holiday_leave_loading).toBe(10);
      expect(agg.holiday_pay).toBe(16);
      expect(agg.public_holiday).toBe(6);
    });

    it('returns zero aggregate when referenceDate cannot determine a FY', () => {
      expect(aggregateYearToDate([validPaySlip()], '07-01', 'garbage')).toEqual({
        gross: 0, net: 0, payg: 0, superannuation_guarantee: 0, count: 0,
        shift_allowance: 0, overtime_1_5x: 0, overtime_2_0x: 0,
        personal_leave: 0, holiday_leave_loading: 0, holiday_pay: 0, public_holiday: 0,
      });
    });
  });

  describe('reconcilePaySlip', () => {
    it('flags withinTolerance when earnings sum equals gross', () => {
      const breakdown = calculatePaySlipBreakdown('2026-01-15', 1529.5, 1100, null, validRateRow());
      const r = reconcilePaySlip(breakdown, 1529.5, 5);
      expect(r.withinTolerance).toBe(true);
      expect(r.warning).toBeUndefined();
    });

    it('flags outside tolerance when earnings differ by more than tolerance', () => {
      const breakdown = calculatePaySlipBreakdown('2026-01-15', 2000, 1500, null, validRateRow());
      const r = reconcilePaySlip(breakdown, 1000, 5);
      expect(r.withinTolerance).toBe(false);
      expect(r.warning).toMatch(/differ from gross/);
    });
  });

  describe('calculateHolidayLeaveAccrual', () => {
    it('applies the balance formula and rounds to 2 decimal places', () => {
      // 100 - 8 + 2.92 = 94.92
      expect(calculateHolidayLeaveAccrual(100, 8, 2.92)).toBe(94.92);
    });

    it('rounds 94.925 to 94.93 (half-up)', () => {
      // 100 - 8 + 2.925 = 94.925 → 94.93 (Math.round rounds half-up for positive)
      expect(calculateHolidayLeaveAccrual(100, 8, 2.925)).toBe(94.93);
    });

    it('returns 0 for invalid inputs', () => {
      expect(calculateHolidayLeaveAccrual(NaN, 0, 0)).toBe(0);
      expect(calculateHolidayLeaveAccrual(0, NaN, 0)).toBe(0);
      expect(calculateHolidayLeaveAccrual(0, 0, NaN)).toBe(0);
    });
  });
});
