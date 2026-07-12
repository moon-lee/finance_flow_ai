/**
 * Phase 4 Task 10.5 — PAYG validation against ATO weekly tax brackets.
 *
 * Decision 14 wraps the user's `CALCULATE_TAX_WITHHELD_26_27` worksheet
 * (stored as `BRACKETS_2026_27` in `payg-brackets.ts`) so the `[ Validate
 * PAYG ]` button can flag discrepancies between the payslip's derived
 * PAYG (`gross - net`, canonical for plain wage earners) and the ATO
 * weekly tax estimate.
 *
 * ## Canonical PAYG relationship
 *
 * For a plain wage earner (no HELP debt, no salary sacrifice, no
 * garnishee), Australian payroll dictates:
 *
 *     payg_withholding = gross - net
 *
 * This is what the form's `Deductions` section displays (derived from
 * `gross` and `net`). The ATO estimate from `calculatePaygWeekly` is
 * an independent reference value used to **validate** that the
 * entered net is consistent with the entered gross. A discrepancy
 * larger than `tolerance` dollars is a reconciliation warning — it
 * usually means the user entered a net that doesn't match the actual
 * ATO withholding for that gross, OR they have non-wage deductions
 * (HELP, salary sacrifice, garnishee) which Phase 5+ will model via a
 * future `other_deductions` column (Decision 14 known limitation).
 *
 * ## Output
 *
 * `validatePayg` returns a `PaygValidationResult` with:
 *   - `derivedPayg`: `gross - net` (what the payslip says was withheld)
 *   - `atoEstimate`: `calculatePaygWeekly(gross, taxYear)` (what ATO says
 *      should have been withheld)
 *   - `difference`: `derivedPayg - atoEstimate` (signed; positive = over-withheld)
 *   - `withinTolerance`: `|difference| <= tolerance`
 *   - `taxYear`: echoed back so callers can render it in the UI
 *   - `bracketError`: present iff the requested FY has no brackets; the
 *      UI renders this as the amber "Bracket data unavailable" callout
 *      (Decision 14 + Review Finding 17 — non-blocking, no throw).
 */

import { getBracketsForYear, type Bracket } from './payg-brackets.js';

/** Result of comparing derived PAYG against the ATO weekly tax estimate. */
export interface PaygValidationResult {
  /** `gross - net` — what the payslip's net implies was withheld. */
  readonly derivedPayg: number;
  /** ATO weekly tax estimate for `gross` against `taxYear` brackets. */
  readonly atoEstimate: number;
  /** `derivedPayg - atoEstimate`. Positive = user-entered net lower than ATO would predict. */
  readonly difference: number;
  /** Tolerance band the user accepts (default $5 from Decision 13). */
  readonly tolerance: number;
  /** `|difference| <= tolerance`. */
  readonly withinTolerance: boolean;
  /** FY the estimate was computed against (echoed for UI rendering). */
  readonly taxYear: string;
  /**
   * Populated iff the requested FY has no bracket data. The UI
   * surfaces this as a non-blocking amber callout per Decision 14.
   */
  readonly bracketError?: string;
}

/**
 * Find the bracket containing `weeklyEarnings` in a bracket table.
 * Returns the bracket whose `[thresholdFrom, thresholdTo)` range
 * contains `weeklyEarnings` (or the open-ended final bracket if `E`
 * exceeds the highest finite threshold).
 */
function findBracket(brackets: readonly Bracket[], weeklyEarnings: number): Bracket | null {
  for (const bracket of brackets) {
    const upper = bracket.thresholdTo ?? Infinity;
    if (weeklyEarnings >= bracket.thresholdFrom && weeklyEarnings < upper) {
      return bracket;
    }
  }
  // Defensive: if `weeklyEarnings < 0` (input validation should have
  // caught this), no bracket matches. Return null rather than throw —
  // the caller renders a clean amber callout.
  return null;
}

/**
 * Compute the ATO weekly tax estimate for `weeklyEarnings` against
 * the supplied bracket table using `tax = a * E - b`. Negative or
 * zero earnings return 0 (no withholding on $0 or refunds).
 *
 * Exported so unit tests can verify the bracket lookup without going
 * through `validatePayg`. Production callers should prefer
 * `validatePayg` (which provides reconciliation context).
 */
export function calculatePaygWeeklyRaw(weeklyEarnings: number, brackets: readonly Bracket[]): number {
  if (weeklyEarnings <= 0) return 0;
  const bracket = findBracket(brackets, weeklyEarnings);
  if (!bracket) return 0;
  const tax = bracket.a * weeklyEarnings - bracket.b;
  // Clamp to >= 0 — the formula can produce a tiny negative for
  // earnings just above the bracket's threshold due to floating-point.
  return Math.max(0, tax);
}

/**
 * Compute the ATO weekly tax estimate for `weeklyEarnings` against
 * the FY `taxYear` brackets. Throws if `taxYear` is unknown — the
 * caller (`validatePayg`) catches this and surfaces it as a
 * non-blocking `bracketError` in the result.
 */
export function calculatePaygWeekly(weeklyEarnings: number, taxYear: string): number {
  const brackets = getBracketsForYear(taxYear);
  return calculatePaygWeeklyRaw(weeklyEarnings, brackets);
}

/**
 * Compare a payslip's derived PAYG against the ATO estimate.
 *
 * @param gross  The payslip's gross pay (per-period dollars, NOT weekly).
 *               If the period is fortnightly the caller should pass
 *               `gross / 2` as `weeklyEarnings` — but in Phase 4 all
 *               payslips are weekly so `gross` is passed directly.
 *               Decision 14 assumes weekly cadence; fortnightly
 *               cadence is Phase 5+ work.
 * @param net    The payslip's net pay.
 * @param taxYear ATO FY label (e.g. `'2026-2027'`).
 * @param toleranceDollars Acceptable difference between derived and
 *               estimated PAYG (default $5 per Decision 13).
 * @returns Reconciliation result with derived/estimated/difference.
 *          Returns `{ withinTolerance: false, bracketError: '...' }`
 *          when `taxYear` has no bracket data — never throws.
 */
export function validatePayg(
  gross: number,
  net: number,
  taxYear: string,
  toleranceDollars: number,
): PaygValidationResult {
  const derivedPayg = Math.max(0, gross - net);
  const tolerance = toleranceDollars;

  let atoEstimate: number;
  let bracketError: string | undefined;
  try {
    atoEstimate = calculatePaygWeekly(gross, taxYear);
  } catch (err) {
    // Unknown FY: surface as non-blocking UI signal (Decision 14 +
    // Review Finding 17). `derivedPayg` and `difference` are still
    // populated so the form can render the rest of the breakdown.
    atoEstimate = NaN;
    bracketError = err instanceof Error ? err.message : String(err);
  }

  const difference = Number.isNaN(atoEstimate) ? NaN : derivedPayg - atoEstimate;
  const withinTolerance =
    Number.isNaN(difference) ? false : Math.abs(difference) <= tolerance;

  return {
    derivedPayg,
    atoEstimate,
    difference,
    tolerance,
    withinTolerance,
    taxYear,
    bracketError,
  };
}
