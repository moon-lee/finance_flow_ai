/**
 * Phase 4 Task 10.1 — DAO wrapper for the `salary_history_pay_slips` table.
 *
 * `salary_history_pay_slips` is the salary-history extension's primary
 * data table. Per Decision 3 + Plan Amendments 2 + 3 + 6 the table
 * has 28 columns at the time of writing (5 core fields + 3 totals + 9
 * per-payslip breakdown columns + 1 personal_leave derived + 4 stored
 * hour-input columns + 1 holiday-leave accrual balance + 1 finance_year
 * + notes + 2 timestamps). The schema is declared in the extension
 * manifest's `tables[]` block; the runtime Zod validator is generated
 * from that manifest by the DAO registry (Task 3).
 *
 * ## Form vs DAO contract
 *
 * The form (Task 11) collects the 3 minimal user inputs (`pay_date`,
 * `gross`, `net`) plus optional hour fields, then asks
 * `PayService.calculatePaySlipBreakdown` to derive the 9 monetary
 * breakdown columns + `payg_withholding` + `superannuation_guarantee`.
 * The form's submit handler packages those into a `PaySlipInput` and
 * passes it here. The DAO does NOT re-derive — the breakdown values
 * are stored verbatim. The xlsx import script (Task 14 follow-up) uses
 * the same DAO with hand-computed breakdown values that preserve the
 * historical rows.
 *
 * ## Validation
 *
 * `createPaySlip` calls `validatePayslipInput` (from
 * `services/pay-service.ts`) before hitting the DAO. The DAO itself
 * also runs the column-level Zod validator (generated from the
 * manifest), so payload shape is double-checked end-to-end.
 */

import type { FinanceApi } from 'finance';
import { validatePayslipInput } from '../services/pay-service.js';

/**
 * A stored payslip row. All 28 columns of the table are present;
 * `id`, `created_at`, and `updated_at` are populated by the DAO at
 * insert time and are `undefined` on a fresh insert.
 */
export interface PaySlip {
  readonly id?: number;
  readonly account_id: number;
  readonly pay_period_start: string;
  readonly pay_period_end: string;
  readonly pay_date: string;
  readonly finance_year: string;
  readonly gross: number;
  readonly net: number;
  readonly currency: string;
  // Per-payslip breakdown columns (Plan Amendments 2 + 6):
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
  // Hour inputs (all 6 persisted; `holiday_hours` and
  // `personal_leave_hours` moved from transient form inputs to stored
  // columns so payslips round-trip on edit — see migration 007):
  readonly regular_hours: number;
  readonly shift_hours: number;
  readonly overtime_1_5_hours: number;
  readonly overtime_2_0_hours: number;
  readonly holiday_hours: number;
  readonly public_holiday_hours: number;
  readonly personal_leave_hours: number;
  // Leave accrual balance:
  readonly holiday_leave_accrual_hours: number;
  readonly notes: string | null;
  readonly created_at?: string;
  readonly updated_at?: string;
}

/**
 * Insert payload for a new payslip. The DAO strips `id` /
 * `created_at` / `updated_at` (system-managed columns) before
 * forwarding the insert RPC.
 */
export type PaySlipInput = Omit<PaySlip, 'id' | 'created_at' | 'updated_at'>;

/**
 * Filters accepted by `listPaySlips`. All fields are optional; the
 * returned rows match all provided filters (logical AND). Empty
 * filters return every payslip for the extension.
 */
export interface ListPaySlipsFilters {
  /** Inclusive lower bound on `pay_date`. ISO-8601 date `YYYY-MM-DD`. */
  readonly from?: string;
  /** Inclusive upper bound on `pay_date`. ISO-8601 date `YYYY-MM-DD`. */
  readonly to?: string;
  readonly accountId?: number;
  /** FY label, e.g. `'2025-26'` (the format stored in the table). */
  readonly financeYear?: string;
}

const TABLE = 'salary_history_pay_slips' as const;

// Internal validation error to distinguish domain validation
// failures from DAO validation failures (the latter raise
// `ValidationFailedError` from the DAO and are intentionally
// surfaced to the caller untouched).
export class PaySlipValidationError extends Error {
  readonly code = -32014;
  readonly errors: readonly string[];
  constructor(errors: readonly string[]) {
    super(`PaySlip validation failed: ${errors.join('; ')}`);
    this.name = 'PaySlipValidationError';
    this.errors = errors;
  }
}

/**
 * List payslips matching the given filters, ordered `pay_date DESC`.
 *
 * Sorting happens client-side after the DAO returns its rows; the
 * DAO's `$or` and operator set (Decision 2) do not expose `ORDER BY`
 * by design. For a typical salary history (<500 rows) this is
 * imperceptible.
 */
export async function listPaySlips(
  finance: FinanceApi,
  filters: ListPaySlipsFilters = {},
): Promise<PaySlip[]> {
  const query: Record<string, unknown> = {};
  if (filters.accountId !== undefined) query.account_id = filters.accountId;
  if (filters.financeYear !== undefined) query.finance_year = filters.financeYear;
  // Date-range filter: the DAO's `$gte` / `$lte` cover it natively.
  const dateRange: Record<string, unknown> = {};
  if (filters.from) dateRange.$gte = filters.from;
  if (filters.to) dateRange.$lte = filters.to;
  if (Object.keys(dateRange).length > 0) query.pay_date = dateRange;

  const rows = (await finance.db.table(TABLE).find(query)) as unknown as PaySlip[];
  return rows.slice().sort((a, b) =>
    a.pay_date < b.pay_date ? 1 : a.pay_date > b.pay_date ? -1 : 0,
  );
}

/**
 * Create a new payslip. Validates the input via `validatePayslipInput`
 * first; throws `PaySlipValidationError` on domain-rule failure
 * (negative gross, net > gross, etc.) and lets DAO-level validation
 * errors (`ValidationFailedError`) propagate untouched.
 *
 * Returns the inserted row including the DAO-populated `id`,
 * `created_at`, and `updated_at`.
 */
export async function createPaySlip(
  finance: FinanceApi,
  input: PaySlipInput,
): Promise<PaySlip> {
  const check = validatePayslipInput(input);
  if (!check.ok) {
    throw new PaySlipValidationError(check.errors);
  }
  const row = (await finance.db.table(TABLE).insert(input as Record<string, unknown>)) as unknown as PaySlip;
  return row;
}

/**
 * Patch an existing payslip by primary key. `validatePayslipInput` is
 * applied to the merged (existing + patch) shape so partial updates
 * that would violate a rule (e.g. setting `net > gross`) are rejected.
 *
 * Returns the number of rows affected (0 if `id` does not exist, 1 on
 * success). Throws `PaySlipValidationError` on domain-rule failure.
 */
export async function updatePaySlip(
  finance: FinanceApi,
  id: number,
  patch: Partial<PaySlipInput>,
): Promise<number> {
  const existing = (await finance.db.table(TABLE).findOne({ id })) as unknown as PaySlip | null;
  if (!existing) return 0;
  const merged: PaySlipInput = { ...existing, ...patch } as PaySlipInput;
  const check = validatePayslipInput(merged);
  if (!check.ok) {
    throw new PaySlipValidationError(check.errors);
  }
  return finance.db.table(TABLE).update({ id }, patch as Record<string, unknown>);
}

/**
 * Delete a payslip by primary key. Returns the number of rows
 * affected (0 if `id` does not exist, 1 on success). No validation —
 * deletes are intentional and not reversible.
 */
export async function deletePaySlip(finance: FinanceApi, id: number): Promise<number> {
  return finance.db.table(TABLE).delete({ id });
}
