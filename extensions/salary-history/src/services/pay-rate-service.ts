/**
 * Phase 4 Task 10.4 — Validation + thin facade over the rate-history DAO.
 *
 * Decision 16 places rate validation in a `validateRateRow` helper so
 * the rate-row form (Task 11.5) and the seeder (Task 12.1 step 2) can
 * share the same rule set without duplicating logic. The validator is
 * intentionally pure (no DAO calls) so unit tests can exercise every
 * rule without a database.
 *
 * The temporal-lookup helpers (`getRateForDate`, `getCurrentRate`,
 * `listAllRates`) are re-exported from the DAO module for
 * discoverability — extension code imports them from
 * `services/pay-rate-service.ts` and the DAO module is an internal
 * implementation detail.
 */

import {
  getRateForDate as _getRateForDate,
  getCurrentRate as _getCurrentRate,
  listAllRates as _listAllRates,
  type RateRow,
  type RateRowInput,
} from '../dao/pay-rate-history.js';
import type { FinanceApi } from 'finance';

export type { RateRow, RateRowInput };

/** Maximum allowed length of the free-text `notes` field. */
const NOTES_MAX_LENGTH = 1000;

/** All numeric rate columns (excluding `id`, timestamps, and free-text `notes`). */
const NUMERIC_FIELDS = [
  'base_hourly_rate',
  'standard_hours_per_week',
  'shift_allowance_multiplier',
  'shift_allowance_hours_per_week',
  'overtime_1_5_multiplier',
  'overtime_2_0_multiplier',
  'superannuation_rate',
  'holiday_leave_loading_rate',
  'accrual_rate_per_week',
] as const;

export type RateValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Validate a rate-row insert/update payload against the Decision 16
 * rule set:
 *
 *   1. `effective_from < effective_to` if both are set (open-ended
 *      current rows have `effective_to = null` and skip this check).
 *   2. Every numeric field is a finite number ≥ 0 (manifest declares
 *      `min: 0` on each).
 *   3. `superannuation_rate ≤ 1` — SG above 100% is non-sensical.
 *   4. `notes` is a string of length ≤ 1000 chars.
 *
 * Returns `{ ok: true }` on success or `{ ok: false, errors: [...] }`
 * with every failed rule. Callers should display all errors at once
 * rather than stopping at the first.
 */
export function validateRateRow(input: Partial<RateRowInput>): RateValidationResult {
  const errors: string[] = [];

  // 1. Date ordering
  if (
    input.effective_from !== undefined &&
    input.effective_to !== undefined &&
    input.effective_to !== null
  ) {
    if (input.effective_from >= input.effective_to) {
      errors.push('effective_from must be earlier than effective_to');
    }
  }

  // 2. Numeric fields ≥ 0
  for (const field of NUMERIC_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${field} must be a finite number`);
      continue;
    }
    if (value < 0) {
      errors.push(`${field} must be ≥ 0`);
    }
  }

  // 3. SG sanity cap
  const sg = input.superannuation_rate;
  if (sg !== undefined && typeof sg === 'number' && sg > 1) {
    errors.push('superannuation_rate must be ≤ 1 (100%)');
  }

  // 4. Notes length
  if (input.notes !== undefined && input.notes !== null) {
    if (typeof input.notes !== 'string') {
      errors.push('notes must be a string');
    } else if (input.notes.length > NOTES_MAX_LENGTH) {
      errors.push(`notes must be ≤ ${NOTES_MAX_LENGTH} characters`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

// Re-export the DAO helpers so extension callers have a single import.
export const getRateForDate = _getRateForDate;
export const getCurrentRate = _getCurrentRate;
export const listAllRates = _listAllRates;

/**
 * Default rate row inserted on first activation when the rate history
 * is empty (Task 12.1 step 2). Values mirror the manifest defaults
 * except `effective_from` which has no sensible default — callers
 * MUST supply it (typically the user's first payslip date or "today").
 */
export function buildDefaultRateRow(effectiveFrom: string): RateRowInput {
  return {
    effective_from: effectiveFrom,
    effective_to: null,
    base_hourly_rate: 0,
    standard_hours_per_week: 38,
    shift_allowance_multiplier: 0.15,
    shift_allowance_hours_per_week: 38,
    overtime_1_5_multiplier: 1.5,
    overtime_2_0_multiplier: 2.0,
    superannuation_rate: 0.12,
    holiday_leave_loading_rate: 0.175,
    accrual_rate_per_week: 2.92,
    notes: null,
  };
}
