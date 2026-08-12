/**
 * Phase 4 Task 10.6 — ATO weekly tax brackets for PAYG validation.
 *
 * Source of truth: the user's own `CALCULATE_TAX_WITHHELD_26_27` worksheet
 * (`docs/Tax Brackets_2025_2026.xlsx`, sheet "Tax withheld", header row
 * "With Tax Free Threshold"). Decision 14 wraps that table as a Phase 4
 * hardcoded constant — adding a new FY requires appending a new
 * `BRACKETS_<fy>` constant and teaching `getBracketsForYear` about it.
 *
 * ## Format
 *
 * Each bracket covers weekly earnings `E` in `[thresholdFrom, thresholdTo)`.
 * The ATO weekly tax-withheld formula for the bracket containing `E` is:
 *
 *     tax = a * E - b
 *
 * (NOT `a * (E - thresholdFrom) + b` — the ATO "tax withheld" tables are
 * precomputed cumulative tables, not incremental marginal rates.) The
 * `a`/`b` coefficients are chosen so the formula is continuous across
 * bracket boundaries; the worksheet cell `B11` ("3653 & over", a=0.47,
 * b=650.6154) follows the same formula.
 *
 * ## Conventions
 *
 * - `thresholdTo: null` represents `Infinity` (the top "and over" bracket).
 * - All numeric values are plain JS numbers; the worksheet values are
 *   stored to 4 decimal places at most. We preserve the full precision
 *   available so the formula doesn't drift at bracket boundaries.
 * - The first bracket's `thresholdFrom` is 0 (no lower bound; everyone
 *   starts in bracket 0).
 *
 * Phase 4 only ships FY 2026-2027 brackets (per Decision 14). When ATO
 * releases FY 2027-2028, append a new `BRACKETS_2027_28` constant and
 * extend `getBracketsForYear` — no other code changes required.
 */

export interface Bracket {
  /** Lower bound (inclusive) of weekly earnings covered by this bracket. */
  readonly thresholdFrom: number;
  /**
   * Upper bound (exclusive) of weekly earnings covered by this bracket.
   * `null` means "no upper bound" — this bracket covers all earnings at
   * or above `thresholdFrom` (ATO's "X & over" final bracket).
   */
  readonly thresholdTo: number | null;
  /** Coefficient `a` in the formula `tax = a * E - b`. */
  readonly a: number;
  /** Coefficient `b` in the formula `tax = a * E - b`. */
  readonly b: number;
}

/**
 * ATO weekly tax-withheld brackets for FY 2026-2027 (the user's
 * `CALCULATE_TAX_WITHHELD_26_27` reference table). 9 brackets covering
 * `E >= 0`; the top bracket is open-ended.
 */
export const BRACKETS_2026_27: readonly Bracket[] = [
  { thresholdFrom: 0,    thresholdTo: 361,  a: 0,     b: 0 },
  { thresholdFrom: 361,  thresholdTo: 500,  a: 0.16,  b: 57.8462 },
  { thresholdFrom: 500,  thresholdTo: 625,  a: 0.26,  b: 107.8462 },
  { thresholdFrom: 625,  thresholdTo: 721,  a: 0.18,  b: 57.8462 },
  { thresholdFrom: 721,  thresholdTo: 865,  a: 0.189, b: 64.3365 },
  { thresholdFrom: 865,  thresholdTo: 1282, a: 0.3227, b: 180.0385 },
  { thresholdFrom: 1282, thresholdTo: 2596, a: 0.32,  b: 176.5769 },
  { thresholdFrom: 2596, thresholdTo: 3653, a: 0.39,  b: 358.3077 },
  { thresholdFrom: 3653, thresholdTo: null, a: 0.47,  b: 650.6154 },
] as const;

/**
 * Registry of bracket tables by financial-year label. The keys are the
 * string forms ATO uses (`"YYYY-YYYY"`, starting year first — so FY 2026-27
 * means the year starting 1 July 2026). Extension code reads
 * `settings.get('core.financialYear.current')` to pick a key.
 *
 * Adding a new FY: append a new entry here AND a new `BRACKETS_<fy>`
 * constant. The tuple-typing keeps both sides in sync at compile time.
 */
const BRACKETS_BY_YEAR: ReadonlyMap<string, readonly Bracket[]> = new Map([
  ['2026-2027', BRACKETS_2026_27],
]);

/**
 * Return the bracket table for the requested financial year.
 *
 * @param year ATO financial-year label, e.g. `'2026-2027'`.
 * @returns The bracket table for that year (9 brackets for FY 2026-27).
 * @throws Error if `year` is not a known FY. The error is caught and
 *         surfaced as a non-blocking amber callout by `payg-calc.ts#validatePayg`
 *         (the `[ Validate PAYG ]` button displays
 *         "Bracket data unavailable for FY <year>" instead of throwing
 *         — see Decision 14 rationale + Review Finding 17).
 */
export function getBracketsForYear(year: string): readonly Bracket[] {
  const brackets = BRACKETS_BY_YEAR.get(year);
  if (!brackets) {
    throw new Error(`Bracket data unavailable for FY ${year}`);
  }
  return brackets;
}

/**
 * The set of financial years for which bracket data is currently
 * available. Extension code uses this to validate user-entered
 * `paygTaxYear` settings before invoking `getBracketsForYear`.
 */
export function getSupportedYears(): readonly string[] {
  return Array.from(BRACKETS_BY_YEAR.keys());
}
