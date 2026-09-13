/**
 * Phase 5 Task 9 — Dashboard aggregator service.
 *
 * Reads salary-history (`pay`) + todo-list + mortgage domain services and combines
 * them into the 3 Dashboard card payloads (pay-summary, todo-summary, mortgage-summary).
 *
 * Each card gracefully degrades: if its data source is missing or empty,
 * the card receives `null` values and the UI shows an
 * "install Salary History / Todo List to see this card" placeholder.
 *
 * This service is pure — it has no side effects, no settings writes,
 * and no DOM interaction. It returns plain JSON-safe objects (no
 * `Date` instances; ISO strings only).
 */

import type { FinanceApi } from 'finance';

// ---------------------------------------------------------------------------
// Card payloads
// ---------------------------------------------------------------------------

export interface YtdSalaryCard {
  summary: {
    gross: number;
    net: number;
    payg: number;
    count: number;
  } | null;
  financialYearStart: string;
}

export interface TodoSummaryCard {
  total: number | null;
  active: number | null;
  done: number | null;
}

export interface MortgageCard {
  entry_date: string | null;
  loan_balance: number;
  offset_balance: number;
  net_loan: number;
}

export interface DashboardData {
  ytdSalary: YtdSalaryCard;
  todos: TodoSummaryCard;
  mortgage: MortgageCard | null;
  estimatedYtd?: {
    gross: number;
    net: number;
    payg: number;
  };
}

export interface DashboardSettings {
  financialYearStart: string;
  financialYearCurrent: string;
  cardOrder: string[];
  financeYearFilter: number;
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

export async function buildAggregator(
  finance: FinanceApi,
  settings: DashboardSettings
): Promise<DashboardData> {
  const [ytdSummaryRaw, payslipStats, todoCountsRaw, mortgageSummaryRaw] = await Promise.all([
    finance.services?.invoke<unknown>('pay', 'getYearToDateSummary', [settings.financialYearStart, undefined, settings.financialYearCurrent]),
    finance.services?.invoke<unknown>('pay', 'getPayslipStats'),
    finance.services?.invoke<unknown>('todo-list', 'counts'),
    finance.services?.invoke<unknown>('mortgage', 'summary'),
  ]);

  const ytdSummary = ytdSummaryRaw as Record<string, unknown> | null;
  const stats = payslipStats as { avgGross: number; avgNet: number; avgPayg: number } | null;
  const todoCounts = todoCountsRaw as { total?: unknown; active?: unknown; done?: unknown } | null;

  return {
    ytdSalary: {
      summary: ytdSummary ? {
        gross: Number(ytdSummary.gross ?? 0),
        net: Number(ytdSummary.net ?? 0),
        payg: Number(ytdSummary.payg ?? 0),
        count: Number(ytdSummary.count ?? 0),
      } : null,
      financialYearStart: settings.financialYearStart
    },
    todos: todoCounts ? {
      total: Number(todoCounts.total ?? 0),
      active: Number(todoCounts.active ?? 0),
      done: Number(todoCounts.done ?? 0),
    } : { total: null, active: null, done: null },
    mortgage: (() => {
      const m = mortgageSummaryRaw as Record<string, unknown> | null;
      if (!m) return null;
      const entry = m.entry_date;
      return {
        entry_date: typeof entry === 'string' ? entry : null,
        loan_balance: Number(m.loan_balance ?? 0),
        offset_balance: Number(m.offset_balance ?? 0),
        net_loan: Number(m.net_loan ?? 0),
      };
    })(),
    // Full-year projection: historical per-payslip avg × 52 (weekly pay)
    // Only when FY has data (count>0); empty/post FY with 0 payslips shows no
    // estimated (avoids showing 52×avg for future FY with no history).
    ...(stats && ytdSummary && typeof (ytdSummary as Record<string, unknown>).count === 'number' && Number((ytdSummary as Record<string, unknown>).count) > 0 ? {
      estimatedYtd: {
        gross: stats.avgGross * 52,
        net: stats.avgNet * 52,
        payg: stats.avgPayg * 52,
      }
    } : {})
  };
}
