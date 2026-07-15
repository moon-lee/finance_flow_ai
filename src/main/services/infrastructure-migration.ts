import type { Migration } from './database-service';

export const infrastructureMigration: Migration = {
  name: '001-init-infrastructure',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS extension_registry (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        installed_at TEXT NOT NULL DEFAULT (datetime('now')),
        activated_at TEXT
      )
    `);
  }
};

/**
 * [Review fix §4.2] Phase 3 adds crash diagnostics to the extension registry.
 * `crash_count` powers the auto-disable threshold (AUTO_DISABLE_CRASH_THRESHOLD)
 * and `last_error` surfaces the most recent activation failure to the
 * Extension Manager UI (Phase 8).
 *
 * Uses ALTER TABLE so the migration is safe to apply to databases created by
 * Phase 2's `001-init-infrastructure`. SQLite does not support IF NOT EXISTS
 * on ALTER TABLE ADD COLUMN, so we guard with a PRAGMA table_info check.
 */
export const extensionCrashTrackingMigration: Migration = {
  name: '002-extension-crash-tracking',
  up: (db) => {
    const columns = db.pragma('table_info(extension_registry)') as { name: string }[];
    const hasColumn = (name: string) => columns.some((c) => c.name === name);

    if (!hasColumn('crash_count')) {
      db.exec(`ALTER TABLE extension_registry ADD COLUMN crash_count INTEGER NOT NULL DEFAULT 0`);
    }
    if (!hasColumn('last_error')) {
      db.exec(`ALTER TABLE extension_registry ADD COLUMN last_error TEXT`);
    }
  }
};

/**
 * [Phase 4, Decision 4] Shared Financial Data — `accounts` table.
 * The first Platform-owned canonical record. Extensions may READ accounts
 * via the DAO (allowlisted in SHARED_FINANCIAL_DATA_TABLES) but cannot
 * write — the DAO enforces this structurally.
 */
export const sharedAccountsMigration: Migration = {
  name: '003-shared-accounts',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        institution TEXT,
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }
};

/**
 * [Phase 4, Decision 3 + Amendments 2/3/6] Extension-owned table
 * `salary_history_pay_slips` — one row per payslip. 28 columns total.
 * Per Decision 14 (Calculation Model), gross/net are user inputs and all
 * monetary breakdown columns are derived at insert time from rate row × hours.
 */
export const salaryHistoryPaySlipsMigration: Migration = {
  name: '004-salary-history-pay-slips',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS salary_history_pay_slips (
        id                         INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id                 INTEGER NOT NULL REFERENCES accounts(id),
        pay_period_start           TEXT    NOT NULL,
        pay_period_end             TEXT    NOT NULL,
        pay_date                   TEXT    NOT NULL,
        finance_year               TEXT    NOT NULL,
        gross                      REAL    NOT NULL CHECK (gross >= 0),
        net                        REAL    NOT NULL CHECK (net >= 0),
        currency                   TEXT    NOT NULL DEFAULT 'AUD',
        shift_allowance            REAL    NOT NULL DEFAULT 0 CHECK (shift_allowance >= 0),
        base_hourly                REAL    NOT NULL DEFAULT 0 CHECK (base_hourly >= 0),
        overtime_1_5x              REAL    NOT NULL DEFAULT 0 CHECK (overtime_1_5x >= 0),
        overtime_2_0x              REAL    NOT NULL DEFAULT 0 CHECK (overtime_2_0x >= 0),
        holiday_leave_loading      REAL    NOT NULL DEFAULT 0 CHECK (holiday_leave_loading >= 0),
        holiday_pay                REAL    NOT NULL DEFAULT 0 CHECK (holiday_pay >= 0),
        public_holiday             REAL    NOT NULL DEFAULT 0 CHECK (public_holiday >= 0),
        payg_withholding           REAL    NOT NULL DEFAULT 0 CHECK (payg_withholding >= 0),
        superannuation_guarantee   REAL    NOT NULL DEFAULT 0 CHECK (superannuation_guarantee >= 0),
        personal_leave             REAL    NOT NULL DEFAULT 0 CHECK (personal_leave >= 0),
        holiday_leave_accrual_hours REAL   NOT NULL DEFAULT 0 CHECK (holiday_leave_accrual_hours >= 0),
        regular_hours              REAL    NOT NULL DEFAULT 0 CHECK (regular_hours >= 0),
        shift_hours                REAL    NOT NULL DEFAULT 0 CHECK (shift_hours >= 0),
        overtime_1_5_hours         REAL    NOT NULL DEFAULT 0 CHECK (overtime_1_5_hours >= 0),
        overtime_2_0_hours         REAL    NOT NULL DEFAULT 0 CHECK (overtime_2_0_hours >= 0),
        public_holiday_hours       REAL    NOT NULL DEFAULT 0 CHECK (public_holiday_hours >= 0),
        notes                      TEXT,
        created_at                 TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at                 TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_salary_history_pay_slips_pay_date
        ON salary_history_pay_slips (pay_date DESC)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_salary_history_pay_slips_account_id
        ON salary_history_pay_slips (account_id)
    `);
  }
};

/**
 * [Phase 4, Decision 16 + Amendments 3/5/6] Extension-owned table
 * `salary_history_rate_history` — effective-dated pay rate rows. 16 columns.
 * Only one row has effective_to IS NULL at any time (the current rate).
 */
export const salaryHistoryRateHistoryMigration: Migration = {
  name: '005-salary-history-rate-history',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS salary_history_rate_history (
        id                              INTEGER PRIMARY KEY AUTOINCREMENT,
        effective_from                  TEXT    NOT NULL,
        effective_to                    TEXT,
        base_hourly_rate                REAL    NOT NULL CHECK (base_hourly_rate >= 0),
        standard_hours_per_week         REAL    NOT NULL DEFAULT 38 CHECK (standard_hours_per_week >= 0),
        shift_allowance_multiplier      REAL    NOT NULL DEFAULT 0.15 CHECK (shift_allowance_multiplier >= 0),
        shift_allowance_hours_per_week  REAL    NOT NULL DEFAULT 38 CHECK (shift_allowance_hours_per_week >= 0),
        overtime_1_5_multiplier         REAL    NOT NULL DEFAULT 1.5 CHECK (overtime_1_5_multiplier >= 0),
        overtime_2_0_multiplier         REAL    NOT NULL DEFAULT 2.0 CHECK (overtime_2_0_multiplier >= 0),
        superannuation_rate             REAL    NOT NULL DEFAULT 0.12 CHECK (superannuation_rate >= 0 AND superannuation_rate <= 1),
        holiday_leave_loading_rate      REAL    NOT NULL DEFAULT 0.175 CHECK (holiday_leave_loading_rate >= 0),
        accrual_rate_per_week           REAL    NOT NULL DEFAULT 2.92 CHECK (accrual_rate_per_week >= 0),
        starting_holiday_leave_balance  REAL    NOT NULL DEFAULT 0 CHECK (starting_holiday_leave_balance >= 0),
        notes                           TEXT,
        created_at                      TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at                      TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_salary_history_rate_history_effective_from
        ON salary_history_rate_history (effective_from DESC)
    `);
  }
};

/**
 * `salary_history_rate_history` — enforce **at most one current rate row**
 * (`effective_to IS NULL`). The primary key is `id`, so without this guard
 * two rows can both have `effective_to IS NULL`, which breaks the
 * "exactly one current rate" invariant the rate engine (`getRateForDate`)
 * relies on.
 *
 * Implementation: a partial UNIQUE index over a constant expression `(1)`
 * filtered by `WHERE effective_to IS NULL`. Because every row matching the
 * filter indexes the same constant value, the unique constraint permits at
 * most one such row — SQLite's standard idiom for "at most one row where
 * <condition>". Any INSERT/UPDATE that would produce a second current row
 * fails with `UNIQUE constraint failed`.
 *
 * Defensive cleanup: if legacy data already has >1 current row, close all
 * but the most-recent (`effective_from` DESC) before creating the index, so
 * `CREATE UNIQUE INDEX` does not fail on existing duplicate rows.
 */
export const salaryHistoryRateHistorySingleCurrentMigration: Migration = {
  name: '006-salary-history-rate-history-single-current',
  up: (db) => {
    db.exec(`
      UPDATE salary_history_rate_history
        SET effective_to = (
          SELECT effective_from FROM salary_history_rate_history
          WHERE effective_to IS NULL
          ORDER BY effective_from DESC LIMIT 1
        )
        WHERE effective_to IS NULL
          AND id != (
            SELECT id FROM salary_history_rate_history
            WHERE effective_to IS NULL
            ORDER BY effective_from DESC LIMIT 1
          )
    `);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_history_rate_history_single_current
        ON salary_history_rate_history ((1)) WHERE effective_to IS NULL
    `);
  }
};
