/**
 * Phase 4 Task 10.2 — DAO wrapper for the `salary_history_rate_history` table.
 *
 * Implements the effective-dated rate-history pattern from Decision 16:
 * each row covers a half-open time interval `[effective_from, effective_to)`
 * (with `effective_to = NULL` meaning "current / open-ended"). Only one
 * row may have `effective_to = NULL` at any time. The calc engine
 * (`pay-service.ts#calculatePaySlipBreakdown`) looks up the rate row
 * effective at a given `pay_date` via `getRateForDate`.
 *
 * ## API surface
 *
 * Every function takes the per-extension `FinanceApi` (`finance`) as
 * its first argument so the DAO's namespace enforcement (Decision 1) is
 * wired automatically — the accessor already binds `extensionId` at
 * construction time and sends it on every RPC (per Phase 4 Task 7).
 *
 * ## Atomicity caveat
 *
 * `addNewRate` is implemented as update-then-insert because the
 * extension process does not own the SQLite connection (Main does,
 * via better-sqlite3). The two DAO calls are issued sequentially and
 * the Main-side DAO serializes them, but a true single-transaction
 * `BEGIN IMMEDIATE` requires a Main-side `addRateAtomic` DAO method
 * (deferred to Phase 5 per Decision 16 + Self-Review §8). For a
 * single-user desktop app the race window is negligible.
 */

import type { FinanceApi } from 'finance';

/**
 * A rate row from `salary_history_rate_history`. Matches the column
 * set declared in the extension manifest's `tables[]` block (see
 * Decision 16) plus the system-managed `id` and timestamp columns
 * populated by the DAO at insert time.
 *
 * `effective_to` is `null` for the currently-open rate row (the one
 * used by `getCurrentRate`); for historical rows it is a `YYYY-MM-DD`
 * date string.
 */
export interface RateRow {
  readonly id?: number;
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
  readonly created_at?: string;
  readonly updated_at?: string;
}

/**
 * Input payload for inserting / editing a rate row. The DAO strips
 * `id`, `created_at`, and `updated_at` before forwarding to the
 * insert Zod schema (those columns are system-managed).
 */
export type RateRowInput = Omit<RateRow, 'id' | 'created_at' | 'updated_at'>;

const TABLE = 'salary_history_rate_history' as const;

/**
 * Find the rate row whose `[effective_from, effective_to)` window
 * contains `payDate`. Returns `null` if no such row exists (e.g. a
 * back-dated payslip pre-dates the earliest rate row, or no rate row
 * has been seeded yet).
 *
 * Implementation: fetch all rows and filter client-side. For a small
 * rate-history table (typically <20 rows) this is faster than
 * computing `MAX(effective_from) WHERE effective_from <= :date` and
 * avoids a raw-SQL escape hatch on the extension side.
 */
export async function getRateForDate(
  finance: FinanceApi,
  payDate: string,
): Promise<RateRow | null> {
  const rows = (await finance.db.table(TABLE).find({})) as unknown as RateRow[];
  for (const row of rows) {
    if (row.effective_from > payDate) continue;
    if (row.effective_to !== null && row.effective_to <= payDate) continue;
    return row;
  }
  return null;
}

/**
 * Return the currently-open rate row (`effective_to IS NULL`), or
 * `null` if the rate history is empty.
 */
export async function getCurrentRate(finance: FinanceApi): Promise<RateRow | null> {
  const row = await finance.db.table(TABLE).findOne({ effective_to: null });
  return (row as unknown as RateRow | null) ?? null;
}

/**
 * Return all rate rows ordered `effective_from DESC` (newest first)
 * — the natural display order for the rate-history view.
 */
export async function listAllRates(finance: FinanceApi): Promise<RateRow[]> {
  const rows = (await finance.db.table(TABLE).find({})) as unknown as RateRow[];
  return rows.slice().sort((a, b) =>
    a.effective_from < b.effective_from ? 1 : a.effective_from > b.effective_from ? -1 : 0,
  );
}

/**
 * Insert a new rate row and close the previous current row.
 *
 * Two-step implementation (see "Atomicity caveat" in the file header):
 *
 *   1. UPDATE previous current row → set `effective_to = rate.effective_from`
 *   2. INSERT the new row (with `effective_to = null` to mark it current)
 *
 * Both calls go through the DAO and succeed/fail independently. If
 * the UPDATE fails (e.g. no current row exists), the INSERT still
 * proceeds — first-call bootstrap case. If the INSERT fails after a
 * successful UPDATE, the previous row is left closed with no
 * replacement; the caller should treat this as a hard error and
 * surface it to the user.
 *
 * @param finance Per-extension `FinanceApi`.
 * @param rate    The new rate row. `effective_from` is required;
 *                `effective_to` is forced to `null` (the row is the
 *                new current row, regardless of what the caller
 *                passed). All other fields pass through unchanged.
 */
export async function addNewRate(finance: FinanceApi, rate: RateRowInput): Promise<void> {
  const previous = await getCurrentRate(finance);
  if (previous) {
    await finance.db.table(TABLE).update(
      { id: previous.id },
      { effective_to: rate.effective_from },
    );
  }
  const newRow: RateRowInput = { ...rate, effective_to: null };
  await finance.db.table(TABLE).insert(newRow as Record<string, unknown>);
}

/**
 * Edit the current rate row in place (no `effective_from` / `effective_to`
 * change). Used for amending rates without creating a new historical
 * row — typically only allowed before any payslip has been created
 * against the current rate.
 *
 * Returns the number of rows affected (0 if no current row exists,
 * 1 on success). Throws if the DAO rejects the patch (Zod validation
 * or column mismatch).
 */
export async function editCurrentRate(
  finance: FinanceApi,
  patch: Partial<RateRowInput>,
): Promise<number> {
  const current = await getCurrentRate(finance);
  if (!current || current.id === undefined) return 0;
  return finance.db.table(TABLE).update(
    { id: current.id },
    patch as Record<string, unknown>,
  );
}
