/**
 * Phase 5 Task 8 — public cross-extension adapter for `finance.services.pay.*`.
 *
 * Decision 5 mandates that the public surface is designed from the
 * consumer side (what the Dashboard extension needs), not derived from
 * PayService's internal shape. This adapter exposes exactly the three
 * methods the Dashboard calls:
 *
 *   - `getYearToDateSummary(financialYearStart, asOfDate?)`
 *   - `getLastPayslip()`
 *   - `getCurrentRate()`
 *
 * Each method delegates to the extension's internal PayService /
 * DAO wrappers and returns JSON-safe values (no `Date` objects — ISO
 * strings only). Any thrown error is caught and returned as `null` so
 * the caller degrades gracefully.
 *
 * The adapter is registered in `activate()` via
 * `finance.services.register('pay', adapter)` and unregistered in
 * `deactivate()` via `finance.services.unregister('pay')`.
 */

import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
import { aggregateYearToDate } from '../services/pay-service.js';
import { listPaySlips } from '../dao/pay-slips.js';
import { getCurrentRate } from '../dao/pay-rate-history.js';

const logger = new ExtensionLogger('salary-history');

// ---------------------------------------------------------------------------
// Public types (what callers see via `finance.services.invoke('pay', ...)`)
// ---------------------------------------------------------------------------

export interface YtdSummary {
  gross: number;
  net: number;
  payg: number;
  superannuation_guarantee: number;
  count: number;
  shift_allowance: number;
  overtime_1_5x: number;
  overtime_2_0x: number;
  personal_leave: number;
  holiday_leave_loading: number;
  holiday_pay: number;
  public_holiday: number;
}

export interface PublicPaySlip {
  readonly id: number;
  readonly account_id: number;
  readonly pay_period_start: string;
  readonly pay_period_end: string;
  readonly pay_date: string;
  readonly finance_year: string;
  readonly gross: number;
  readonly net: number;
  readonly currency: string;
  readonly shift_allowance: number;
  readonly base_hourly: number;
  readonly overtime_1_5x: number;
  readonly overtime_2_0x: number;
  readonly holiday_leave_loading: number;
  readonly holiday_pay: number;
  readonly public_holiday: number;
  readonly payg_withholding: number;
  readonly superannuation_guarantee: number;
  readonly personal_leave: number;
  readonly regular_hours: number;
  readonly shift_hours: number;
  readonly overtime_1_5_hours: number;
  readonly overtime_2_0_hours: number;
  readonly holiday_hours: number;
  readonly public_holiday_hours: number;
  readonly personal_leave_hours: number;
  readonly holiday_leave_accrual_hours: number;
  readonly notes: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PublicRateRow {
  readonly id: number;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly base_hourly_rate: number;
  readonly standard_hours_per_week: number;
  readonly shift_allowance_multiplier: number;
  readonly shift_allowance_hours_per_week: number;
  readonly overtime_1_5_multiplier: number;
  readonly overtime_2_0_multiplier: number;
  readonly superannuation_rate: number;
  readonly holiday_leave_loading_rate: number;
  readonly accrual_rate_per_week: number;
  readonly notes: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PublicPayService {
  getYearToDateSummary(financialYearStart: string, asOfDate?: string, financialYear?: string): Promise<YtdSummary | null>;
  getLastPayslip(): Promise<PublicPaySlip | null>;
  getCurrentRate(): Promise<PublicRateRow | null>;
  getPayslipStats(): Promise<{ avgGross: number; avgNet: number; avgPayg: number; totalCount: number } | null>;
  getLatestNet(): Promise<{ net: number; pay_date: string } | null>;
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

export function createPublicPayAdapter(finance: FinanceApi): PublicPayService {
  return {
    async getYearToDateSummary(financialYearStart: string, asOfDate?: string, financialYear?: string): Promise<YtdSummary | null> {
      try {
        const payslips = (await listPaySlips(finance, {})) as unknown as PublicPaySlip[];
        const aggregate = aggregateYearToDate(payslips, financialYearStart, asOfDate, financialYear);
        return aggregate;
      } catch (err) {
        logger.error('getYearToDateSummary failed:', err);
        return null;
      }
    },

    async getLastPayslip(): Promise<PublicPaySlip | null> {
      try {
        const payslips = (await listPaySlips(finance, {})) as unknown as PublicPaySlip[];
        payslips.sort((a, b) => b.pay_date.localeCompare(a.pay_date));
        return payslips[0] ?? null;
      } catch (err) {
        logger.error('getLastPayslip failed:', err);
        return null;
      }
    },

    async getCurrentRate(): Promise<PublicRateRow | null> {
      try {
        return (await getCurrentRate(finance)) as unknown as PublicRateRow;
      } catch (err) {
        logger.error('getCurrentRate failed:', err);
        return null;
      }
    },

    async getPayslipStats(): Promise<{ avgGross: number; avgNet: number; avgPayg: number; totalCount: number } | null> {
      try {
        const payslips = (await listPaySlips(finance, {})) as unknown as PublicPaySlip[];
        if (!payslips.length) return null;
        const sum = payslips.reduce(
          (acc, p) => {
            acc.gross += Number(p.gross ?? 0);
            acc.net += Number(p.net ?? 0);
            acc.payg += Number(p.payg_withholding ?? 0);
            return acc;
          },
          { gross: 0, net: 0, payg: 0 }
        );
        return {
          avgGross: sum.gross / payslips.length,
          avgNet: sum.net / payslips.length,
          avgPayg: sum.payg / payslips.length,
          totalCount: payslips.length,
        };
      } catch (err) {
        logger.error('getPayslipStats failed:', err);
        return null;
      }
    },

    async getLatestNet(): Promise<{ net: number; pay_date: string } | null> {
      try {
        const payslips = (await listPaySlips(finance, {})) as unknown as PublicPaySlip[];
        if (!payslips.length) return null;
        payslips.sort((a, b) => b.pay_date.localeCompare(a.pay_date));
        const latest = payslips[0];
        const net = Number(latest.net ?? NaN);
        if (!Number.isFinite(net)) return null;
        return { net: Math.round(net * 100) / 100, pay_date: latest.pay_date };
      } catch (err) {
        logger.error('getLatestNet failed:', err);
        return null;
      }
    }
  };
}
