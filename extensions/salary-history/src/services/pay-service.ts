/**
 * Phase 4 Task 10.3 — Domain logic for the salary-history extension.
 *
 * Decision 5 makes `PayService` an **internal Phase 4 helper** scoped
 * to this extension's source tree. It is NOT exposed via
 * `finance.services.*` (that cross-extension contract is Phase 5 work
 * — see Decision 5's Phase 5 design note: the API will be designed
 * from the consumer side, not derived from PayService's surface).
 *
 * ## Calculation model (Decision 14)
 *
 * The form collects 3 minimal user inputs (`pay_date`, `gross`, `net`)
 * plus optional hour fields. `calculatePaySlipBreakdown` derives the
 * 9 monetary breakdown columns + `payg_withholding` +
 * `superannuation_guarantee` + `personal_leave` from those inputs × the
 * rate row effective at `pay_date`. The form is minimal; the
 * calculation is rich.
 *
 * ## Validation
 *
 * `validatePayslipInput` is a pure function (no DAO calls) so the form
 * can call it on every keystroke for inline feedback. Foreign-key
 * checks (`account_id` exists in the `accounts` shared table) are
 * deferred to the DAO — the DAO's Zod-validated insert will surface a
 * `ValidationFailedError` if the FK is bad. The form is expected to
 * pre-populate the `account` dropdown from a `finance.db.table('accounts').find({is_active: true})`
 * call (Task 11.1), so the bad-FK case is rare in practice.
 */

import type { PaySlipInput, PaySlip } from '../dao/pay-slips.js';
import type { RateRow } from '../dao/pay-rate-history.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Transient per-payslip hour inputs (passed to the calculation engine
 * but NOT all persisted — see Plan Amendment 6: `holiday_hours` and
 * `personal_leave_hours` are transient form inputs only; the other 5
 * are stored in their own columns on `salary_history_pay_slips`).
 */
export interface PaySlipHours {
  readonly regular_hours: number;
  readonly shift_hours: number;
  readonly overtime_1_5_hours: number;
  readonly overtime_2_0_hours: number;
  readonly holiday_hours: number;
  readonly public_holiday_hours: number;
  readonly personal_leave_hours: number;
}

/**
 * Output of `calculatePaySlipBreakdown` — the 9 monetary breakdown
 * columns + `payg_withholding` + `superannuation_guarantee` +
 * `personal_leave`. These are the values the form passes to
 * `createPaySlip` (along with the user-entered totals and dates).
 */
export interface PaySlipBreakdown {
  readonly base_hourly: number;
  readonly shift_allowance: number;
  readonly overtime_1_5x: number;
  readonly overtime_2_0x: number;
  readonly holiday_pay: number;
  readonly holiday_leave_loading: number;
  readonly public_holiday: number;
  readonly personal_leave: number;
  readonly payg_withholding: number;
  readonly superannuation_guarantee: number;
}

/**
 * Settings the breakdown calculation reads. Only one key today
 * (`paygToleranceDollars`); the type is left extensible for future
 * per-payslip calculation knobs without breaking existing call sites.
 */
export interface PayServiceSettings {
  readonly paygToleranceDollars?: number;
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly string[] };

/** YTD aggregate row returned by `aggregateYearToDate`. */
export interface YtdAggregate {
  readonly gross: number;
  readonly net: number;
  readonly payg: number;
  readonly superannuation_guarantee: number;
  readonly count: number;
  // Earnings-breakdown components (summed per payslip, all >= 0):
  readonly shift_allowance: number;
  readonly overtime_1_5x: number;
  readonly overtime_1_5_hours: number;
  readonly overtime_2_0x: number;
  readonly personal_leave: number;
  readonly holiday_leave_loading: number;
  readonly holiday_pay: number;
  readonly public_holiday: number;
}

export interface ReconciliationResult {
  /** Sum of earnings breakdown minus `gross` (signed). */
  readonly difference: number;
  /** `|difference| <= tolerance`. */
  readonly withinTolerance: boolean;
  /** Human-readable warning when `!withinTolerance`. */
  readonly warning?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Accept both `YYYY-YY` (legacy) and `YYYY-YYYY` (current) finance-year labels.
const FY_LABEL_RE = /^\d{4}-\d{2}(?:\d{2})?$/;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function parseIsoDate(s: string): number | null {
  if (typeof s !== 'string' || !ISO_DATE_RE.test(s)) return null;
  // `Date.parse` interprets 'YYYY-MM-DD' as UTC midnight; for
  // day-level comparisons this is sufficient.
  const t = Date.parse(s + 'T00:00:00Z');
  return Number.isNaN(t) ? null : t;
}

/** Compute the FY label (e.g. `'2025-26'`) containing `payDate`. */
export function computeFinanceYear(payDate: string, financialYearStart: string): string | null {
  const ts = parseIsoDate(payDate);
  if (ts === null) return null;
  const [mm, dd] = financialYearStart.split('-');
  if (!mm || !dd || mm.length !== 2 || dd.length !== 2) return null;

  // Build the two candidate FY-start dates around `payDate`.
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  const fyStartThisYear = Date.parse(`${year}-${mm}-${dd}T00:00:00Z`);
  const fyStartLastYear = Date.parse(`${year - 1}-${mm}-${dd}T00:00:00Z`);

  let fyStartYear: number;
  if (ts >= fyStartThisYear) {
    fyStartYear = year;
  } else if (ts >= fyStartLastYear) {
    fyStartYear = year - 1;
  } else {
    return null; // `payDate` is before any plausible FY start
  }

  const fyEndYear = fyStartYear + 1;
  return `${fyStartYear}-${fyEndYear}`;
}

/** Normalize a finance-year label to `YYYY-YYYY` (expands legacy `YYYY-YY`). */
export function normalizeFinanceYear(fy: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(fy.trim());
  if (!m) return fy;
  const start = Number(m[1]);
  const end2 = Number(m[2]);
  const century = Math.floor(start / 100);
  return `${start}-${century * 100 + end2}`;
}

// ---------------------------------------------------------------------------
// validatePayslipInput
// ---------------------------------------------------------------------------

/**
 * Validate a `PaySlipInput` payload against the Decision 14 rule set.
 *
 * Rules:
 *   1. `gross ≥ 0`, finite.
 *   2. `0 ≤ net ≤ gross`, finite.
 *   3. `pay_period_start ≤ pay_period_end ≤ pay_date`, all valid
 *      `YYYY-MM-DD` strings.
 *   4. `account_id > 0`, integer.
 *   5. `finance_year` matches `YYYY-YY` or `YYYY-YYYY` pattern.
 *   6. All 9 breakdown monetary columns + `payg_withholding` +
 *      `superannuation_guarantee` + `personal_leave` are finite
 *      numbers ≥ 0.
 *   7. All 5 stored hour columns are finite numbers ≥ 0.
 *   8. `holiday_leave_accrual_hours` is finite, ≥ 0.
 *   9. `currency` is a 3-letter uppercase string.
 *
 * Returns `{ ok: true }` or `{ ok: false, errors }`. All errors are
 * collected (the form displays them all at once).
 */
export function validatePayslipInput(input: PaySlipInput): ValidationResult {
  const errors: string[] = [];

  // 1. gross
  if (!isFiniteNumber(input.gross)) {
    errors.push('gross must be a finite number');
  } else if (input.gross < 0) {
    errors.push('gross must be ≥ 0');
  }

  // 2. net
  if (!isFiniteNumber(input.net)) {
    errors.push('net must be a finite number');
  } else {
    if (input.net < 0) errors.push('net must be ≥ 0');
    if (isFiniteNumber(input.gross) && input.net > input.gross) {
      errors.push('net cannot exceed gross');
    }
  }

  // 3. dates
  const pps = parseIsoDate(input.pay_period_start);
  const ppe = parseIsoDate(input.pay_period_end);
  const pd = parseIsoDate(input.pay_date);
  if (pps === null) errors.push('pay_period_start must be a valid YYYY-MM-DD date');
  if (ppe === null) errors.push('pay_period_end must be a valid YYYY-MM-DD date');
  if (pd === null) errors.push('pay_date must be a valid YYYY-MM-DD date');
  if (pps !== null && ppe !== null && pps > ppe) {
    errors.push('pay_period_start must be on or before pay_period_end');
  }
  if (ppe !== null && pd !== null && ppe > pd) {
    errors.push('pay_period_end must be on or before pay_date');
  }

  // 4. account_id
  if (
    !Number.isInteger(input.account_id) ||
    (input.account_id as number) <= 0
  ) {
    errors.push('account_id must be a positive integer');
  }

  // 5. finance_year
  if (typeof input.finance_year !== 'string' || !FY_LABEL_RE.test(input.finance_year)) {
    errors.push('finance_year must match YYYY-YY or YYYY-YYYY pattern');
  }

  // 6. breakdown monetary columns
  const monetaryFields: (keyof PaySlipInput)[] = [
    'shift_allowance',
    'base_hourly',
    'overtime_1_5x',
    'overtime_2_0x',
    'holiday_leave_loading',
    'holiday_pay',
    'public_holiday',
    'payg_withholding',
    'superannuation_guarantee',
    'personal_leave',
  ];
  for (const field of monetaryFields) {
    const v = input[field];
    if (!isFiniteNumber(v)) {
      errors.push(`${field} must be a finite number`);
    } else if ((v as number) < 0) {
      errors.push(`${field} must be ≥ 0`);
    }
  }

  // 7. stored hour columns
  const hourFields: (keyof PaySlipInput)[] = [
    'regular_hours',
    'shift_hours',
    'overtime_1_5_hours',
    'overtime_2_0_hours',
    'public_holiday_hours',
  ];
  for (const field of hourFields) {
    const v = input[field];
    if (!isFiniteNumber(v)) {
      errors.push(`${field} must be a finite number`);
    } else if ((v as number) < 0) {
      errors.push(`${field} must be ≥ 0`);
    }
  }

  // 8. leave balance
  if (!isFiniteNumber(input.holiday_leave_accrual_hours)) {
    errors.push('holiday_leave_accrual_hours must be a finite number');
  } else if (input.holiday_leave_accrual_hours < 0) {
    errors.push('holiday_leave_accrual_hours must be ≥ 0');
  }

  // 9. currency
  if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) {
    errors.push('currency must be a 3-letter uppercase ISO 4217 code');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// validateFinanceYear
// ---------------------------------------------------------------------------

/**
 * Confirm that `financeYear` matches what the FY-start rule produces
 * for `payDate`. Used by the form's "if the user manually changed the
 * FY dropdown away from the auto-computed value, show an amber
 * callout" UX (Decision 14 + Review Finding 9).
 *
  * `financialYearStart` is an `MM-DD` string from the
  * `core.financialYear.start` setting (default `'07-01'`).
 *
 * Returns `{ ok: true }` on match, `{ ok: false, errors }` with a
 * human-readable expected value otherwise. An invalid `payDate` is
 * also reported as an error.
 */
export function validateFinanceYear(
  payDate: string,
  financeYear: string,
  financialYearStart: string,
): ValidationResult {
  const expected = computeFinanceYear(payDate, financialYearStart);
  if (expected === null) {
    return {
      ok: false,
      errors: [`Cannot compute finance year for payDate "${payDate}" with start "${financialYearStart}"`],
    };
  }
  if (financeYear !== expected) {
    return {
      ok: false,
      errors: [`financeYear "${financeYear}" does not match expected "${expected}" for payDate "${payDate}"`],
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// calculatePaySlipBreakdown
// ---------------------------------------------------------------------------

/**
 * Build the default hour set from a rate row when the form passes
 * `null` (the "this week was normal" case). Defaults come from the
 * rate row's `standard_hours_per_week` (regular hours) and
 * `shift_allowance_hours_per_week` (shift hours; per Plan Amendment 6).
 * All other hours default to 0.
 */
function defaultHoursFromRate(rateRow: RateRow): PaySlipHours {
  return {
    regular_hours: rateRow.standard_hours_per_week,
    shift_hours: rateRow.shift_allowance_hours_per_week,
    overtime_1_5_hours: 0,
    overtime_2_0_hours: 0,
    holiday_hours: 0,
    public_holiday_hours: 0,
    personal_leave_hours: 0,
  };
}

/**
 * Derive all monetary breakdown fields from the user's totals + hours
 * × the rate row effective at `payDate`. See Decision 14 for the
 * formulas.
 *
 * Public-holiday disambiguation (Review Finding 4): if
 * `public_holiday_hours > 0`, the public-holiday premium replaces the
 * ordinary `holiday_pay` / `holiday_leave_loading` for those hours —
 * we zero them out so the breakdown doesn't double-count.
 *
 * @param payDate  Used for documentation only (the rate row was
 *                 already selected by the caller via `getRateForDate`).
 *                 We keep it in the signature so future per-date
 *                 formulas (e.g. weekend loading) have a hook.
 * @param gross    The payslip's gross pay.
 * @param net      The payslip's net pay.
 * @param hours    Transient hour inputs; `null` means "use defaults
 *                 from the rate row" (the "this week was normal" case).
 * @param rateRow  The rate row to derive from.
 * @param _settings Currently unused; reserved for future per-payslip
 *                 knobs (e.g. user-configurable SG override).
 */
export function calculatePaySlipBreakdown(
  payDate: string,
  gross: number,
  net: number,
  hours: PaySlipHours | null,
  rateRow: RateRow,
  _settings: PayServiceSettings = {},
): PaySlipBreakdown {
  const h = hours ?? defaultHoursFromRate(rateRow);
  const base = rateRow.base_hourly_rate;

  // Public-holiday disambiguation (Review Finding 4). If the user
  // worked public holidays, those hours get the `public_holiday`
  // premium INSTEAD of the ordinary `holiday_pay` /
  // `holiday_leave_loading` (which would otherwise double-count).
  const isPublicHoliday = h.public_holiday_hours > 0;
  const effectiveHolidayHours = isPublicHoliday ? 0 : h.holiday_hours;
  const overtime1_5x = h.overtime_1_5_hours * base * rateRow.overtime_1_5_multiplier;
  const overtime2_0x = h.overtime_2_0_hours * base * rateRow.overtime_2_0_multiplier;
  const holidayLeaveLoading = effectiveHolidayHours * base * rateRow.holiday_leave_loading_rate;

  return {
    base_hourly: h.regular_hours * base,
    shift_allowance: h.shift_hours * base * rateRow.shift_allowance_multiplier,
    overtime_1_5x: overtime1_5x,
    overtime_2_0x: overtime2_0x,
    holiday_pay: effectiveHolidayHours * base,
    holiday_leave_loading: holidayLeaveLoading,
    public_holiday: h.public_holiday_hours * base,
    personal_leave: h.personal_leave_hours * base,
    payg_withholding: Math.max(0, gross - net),
    superannuation_guarantee: (gross - (overtime1_5x + overtime2_0x + holidayLeaveLoading)) * rateRow.superannuation_rate,
  };
}

// ---------------------------------------------------------------------------
// calculateNetFromGross
// ---------------------------------------------------------------------------

/**
 * Phase 6 stub. Phase 6 will replace this with a proper
 * pre-tax-deduction → net-pay calculation that respects HELP debt,
 * salary sacrifice, and other non-wage deductions. Phase 4 returns
 * `gross * (1 - taxRate)` as a placeholder so call sites compile.
 */
export function calculateNetFromGross(gross: number, taxRate: number): number {
  if (!isFiniteNumber(gross) || !isFiniteNumber(taxRate)) return 0;
  return gross * (1 - taxRate);
}

// ---------------------------------------------------------------------------
// aggregateYearToDate
// ---------------------------------------------------------------------------

/**
 * Sum gross / net / PAYG / super across all payslips whose `pay_date`
 * falls inside the financial year containing `referenceDate`.
 *
 * The FY label is computed from `referenceDate` +
 * `financialYearStart`. Payslips are matched by `finance_year` string
 * (not by re-computing from `pay_date`) so historical FYs are stable
 * even if the FY-start rule changes between releases.
 */
export function aggregateYearToDate(
  payslips: readonly PaySlip[],
  financialYearStart: string,
  referenceDate: string = new Date().toISOString().slice(0, 10),
  financialYear?: string,
): YtdAggregate {
  const fyLabel = financialYear && financialYear.trim() ? financialYear : computeFinanceYear(referenceDate, financialYearStart);
  const zero: YtdAggregate = {
    gross: 0,
    net: 0,
    payg: 0,
    superannuation_guarantee: 0,
    count: 0,
    shift_allowance: 0,
    overtime_1_5x: 0,
    overtime_1_5_hours: 0,
    overtime_2_0x: 0,
    personal_leave: 0,
    holiday_leave_loading: 0,
    holiday_pay: 0,
    public_holiday: 0,
  };
  if (fyLabel === null) return zero;
  let gross = 0;
  let net = 0;
  let payg = 0;
  let sg = 0;
  let count = 0;
  let shift_allowance = 0;
  let overtime_1_5x = 0;
  let overtime_1_5_hours = 0;
  let overtime_2_0x = 0;
  let personal_leave = 0;
  let holiday_leave_loading = 0;
  let holiday_pay = 0;
  let public_holiday = 0;
  for (const p of payslips) {
    // Normalize both sides so legacy `YYYY-YY` rows still match the current
    // `YYYY-YYYY` label.
    if (normalizeFinanceYear(p.finance_year) !== normalizeFinanceYear(fyLabel)) continue;
    gross += p.gross;
    net += p.net;
    payg += p.payg_withholding;
    sg += p.superannuation_guarantee;
    shift_allowance += p.shift_allowance;
    overtime_1_5x += p.overtime_1_5x;
    overtime_1_5_hours += p.overtime_1_5_hours;
    overtime_2_0x += p.overtime_2_0x;
    personal_leave += p.personal_leave;
    holiday_leave_loading += p.holiday_leave_loading;
    holiday_pay += p.holiday_pay;
    public_holiday += p.public_holiday;
    count += 1;
  }
  return {
    gross,
    net,
    payg,
    superannuation_guarantee: sg,
    count,
    shift_allowance,
    overtime_1_5x,
    overtime_1_5_hours,
    overtime_2_0x,
    personal_leave,
    holiday_leave_loading,
    holiday_pay,
    public_holiday,
  };
}

// ---------------------------------------------------------------------------
// reconcilePaySlip
// ---------------------------------------------------------------------------

/**
 * Compare the sum of the breakdown earnings columns against the user's
 * entered `gross`. Returns the signed difference and a tolerance
 * verdict; if the difference exceeds `tolerance`, the result carries a
 * `warning` string suitable for inline rendering.
 *
 * "Earnings" here = `base_hourly + shift_allowance + overtime_1_5x +
 * overtime_2_0x + holiday_pay + holiday_leave_loading + public_holiday
 * + personal_leave`. PAYG and SG are NOT earnings — they are derived
 * downstream of gross.
 */
export function reconcilePaySlip(
  breakdown: PaySlipBreakdown,
  gross: number,
  tolerance: number,
): ReconciliationResult {
  const earnings =
    breakdown.base_hourly +
    breakdown.shift_allowance +
    breakdown.overtime_1_5x +
    breakdown.overtime_2_0x +
    breakdown.holiday_pay +
    breakdown.holiday_leave_loading +
    breakdown.public_holiday +
    breakdown.personal_leave;
  const difference = earnings - gross;
  const withinTolerance = Math.abs(difference) <= tolerance;
  const warning = withinTolerance
    ? undefined
    : `Earnings (${earnings.toFixed(2)}) differ from gross (${gross.toFixed(2)}) by ${difference.toFixed(2)} (tolerance $${tolerance.toFixed(2)})`;
  return { difference, withinTolerance, warning };
}

// ---------------------------------------------------------------------------
// calculateHolidayLeaveAccrual
// ---------------------------------------------------------------------------

/**
 * Compute the new cumulative holiday-leave balance after a pay period.
 * Per Decision 14 + Plan Amendment 5:
 *
 *     new_balance = prev_balance − holiday_hours_taken + accrual_rate_per_week
 *
 * `personal_leave_hours` is intentionally NOT a parameter — personal
 * leave is a separate entitlement under Australian payroll (Fair Work
 * Act 2009) and is paid via the derived `personal_leave` monetary
 * column, but does not reduce the annual/holiday leave balance.
 *
 * Result is rounded to 2 decimal places.
 */
export function calculateHolidayLeaveAccrual(
  prevBalance: number,
  holidayHours: number,
  accrualRatePerWeek: number,
): number {
  if (
    !isFiniteNumber(prevBalance) ||
    !isFiniteNumber(holidayHours) ||
    !isFiniteNumber(accrualRatePerWeek)
  ) {
    return 0;
  }
  const raw = prevBalance - holidayHours + accrualRatePerWeek;
  return Math.round(raw * 100) / 100;
}
