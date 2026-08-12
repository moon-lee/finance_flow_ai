/**
 * Phase 5 Task 9 — Dashboard aggregator service.
 *
 * Reads Shared Financial Data (`accounts`) plus salary-history domain
 * service calls and combines them into the 4 Dashboard card payloads.
 *
 * Each card gracefully degrades: if its data source is missing or empty,
 * the card receives `null`/empty values and the UI shows a "—" or
 * "install Salary History to see this card" placeholder.
 *
 * This service is pure — it has no side effects, no settings writes,
 * and no DOM interaction. It returns plain JSON-safe objects (no
 * `Date` instances; ISO strings only).
 */

import type { FinanceApi } from 'finance';

// ---------------------------------------------------------------------------
// Card payloads
// ---------------------------------------------------------------------------

export interface NetWorthCard {
  totalBalance: number | null;
  totalNetPayLast12Months: number | null;
  currency: string | null;
}

export interface YtdSalaryCard {
  summary: {
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
  } | null;
  currentRate: {
    base_hourly_rate: number;
    standard_hours_per_week: number;
    shift_allowance_multiplier: number;
    effective_from: string;
  } | null;
  financialYearStart: string;
}

export interface LastPayslipCard {
  id: number | null;
  pay_date: string | null;
  gross: number | null;
  net: number | null;
  currency: string | null;
  account_id: number | null;
}

export interface AccountsSummaryCard {
  count: number;
  accounts: Array<{ id: number; name: string; institution: string | null }>;
  totalBalance: number | null;
}

export interface DashboardData {
  netWorth: NetWorthCard;
  ytdSalary: YtdSalaryCard;
  lastPayslip: LastPayslipCard;
  accountsSummary: AccountsSummaryCard;
}

export interface DashboardSettings {
  financialYearStart: string;
  financialYearCurrent?: string;
  cardOrder: string[];
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

export async function buildAggregator(
  finance: FinanceApi,
  settings: DashboardSettings
): Promise<DashboardData> {
  const [accountsRow, lastPayslipRow, ytdSummaryRaw, currentRateRaw] = await Promise.all([
    finance.db.table('accounts').find({}),
    finance.services?.invoke<unknown>('pay', 'getLastPayslip'),
    finance.services?.invoke<unknown>('pay', 'getYearToDateSummary', [settings.financialYearStart, undefined, settings.financialYearCurrent]),
    finance.services?.invoke<unknown>('pay', 'getCurrentRate'),
  ]);

  const accounts = (accountsRow as Array<Record<string, unknown>>) ?? [];
  const lastPayslip = lastPayslipRow as Record<string, unknown> | null;
  const ytdSummary = ytdSummaryRaw as Record<string, unknown> | null;
  const currentRate = currentRateRaw as Record<string, unknown> | null;

  const totalBalance = accounts.reduce((sum, a) => {
    const bal = Number(a.balance ?? a.current_balance ?? 0);
    return sum + (Number.isFinite(bal) ? bal : 0);
  }, 0);

  let totalNetPayLast12Months: number | null = null;
  if (lastPayslip && typeof lastPayslip.net === 'number') {
    totalNetPayLast12Months = lastPayslip.net;
  }

  return {
    netWorth: {
      totalBalance: totalBalance || null,
      totalNetPayLast12Months,
      currency: lastPayslip ? String(lastPayslip.currency ?? 'AUD') : 'AUD'
    },
    ytdSalary: {
      summary: ytdSummary ? {
        gross: Number(ytdSummary.gross ?? 0),
        net: Number(ytdSummary.net ?? 0),
        payg: Number(ytdSummary.payg ?? 0),
        superannuation_guarantee: Number(ytdSummary.superannuation_guarantee ?? 0),
        count: Number(ytdSummary.count ?? 0),
        shift_allowance: Number(ytdSummary.shift_allowance ?? 0),
        overtime_1_5x: Number(ytdSummary.overtime_1_5x ?? 0),
        overtime_2_0x: Number(ytdSummary.overtime_2_0x ?? 0),
        personal_leave: Number(ytdSummary.personal_leave ?? 0),
        holiday_leave_loading: Number(ytdSummary.holiday_leave_loading ?? 0),
        holiday_pay: Number(ytdSummary.holiday_pay ?? 0),
        public_holiday: Number(ytdSummary.public_holiday ?? 0),
      } : null,
      currentRate: currentRate ? {
        base_hourly_rate: Number(currentRate.base_hourly_rate ?? 0),
        standard_hours_per_week: Number(currentRate.standard_hours_per_week ?? 0),
        shift_allowance_multiplier: Number(currentRate.shift_allowance_multiplier ?? 0),
        effective_from: String(currentRate.effective_from ?? ''),
      } : null,
      financialYearStart: settings.financialYearStart
    },
    lastPayslip: {
      id: lastPayslip && typeof lastPayslip.id === 'number' ? lastPayslip.id : null,
      pay_date: lastPayslip ? String(lastPayslip.pay_date ?? '') : null,
      gross: lastPayslip && typeof lastPayslip.gross === 'number' ? lastPayslip.gross : null,
      net: lastPayslip && typeof lastPayslip.net === 'number' ? lastPayslip.net : null,
      currency: lastPayslip ? String(lastPayslip.currency ?? 'AUD') : 'AUD',
      account_id: lastPayslip && typeof lastPayslip.account_id === 'number' ? lastPayslip.account_id : null,
    },
    accountsSummary: {
      count: accounts.length,
      accounts: accounts.map(a => ({
        id: Number(a.id),
        name: String(a.name ?? ''),
        institution: a.institution === undefined || a.institution === null ? null : String(a.institution)
      })),
      totalBalance: totalBalance || null
    }
  };
}
