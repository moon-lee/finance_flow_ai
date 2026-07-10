/**
 * Shared Financial Data — platform-owned table declarations.
 *
 * Per the Phase 4 architecture (Decision 1 of
 * `docs/superpowers/plans/2026-07-04-phase4-shared-financial-data-salary-history.md`),
 * the platform distinguishes two kinds of table:
 *
 *   1. **Extension-owned** — namespaced `<extensionId>_*`; readable AND writable
 *      by the owning extension only. Examples: `salary_history_pay_slips`,
 *      `salary_history_rate_history`.
 *   2. **Shared Financial Data** — Platform-owned canonical records (see
 *      `project_vision.md:264`). Extensions may **read** them via the DAO
 *      (allowlisted here) but **cannot write** — the DAO enforces this
 *      structurally (Decision 1, enforced in the Task 5 DAO service).
 *
 * Phase 4 ships exactly **one** Shared Financial Data table: `accounts`.
 * It is the first canonical record the Salary History extension needs
 * to attribute payslips to a bank account. A future Accounts Core
 * Extension (Phase 5+) will take over the write surface; the schema
 * defined here remains the source of truth.
 *
 * The schema constants in this file are consumed by:
 *   - Task 2 (`src/shared/dao-schema.ts`) — generates Zod validators.
 *   - Task 5 (`src/main/services/dao-service.ts`) — enforces the read-only
 *     allowlist for shared tables.
 *   - Task 9 (`src/main/main.ts`) — registers `SHARED_TABLE_MANIFESTS` with
 *     the schema registry at boot.
 *   - Task 8 (`src/types/finance.d.ts`) — re-exports `TableManifest` /
 *     `ColumnManifest` from here so extensions can declare their own
 *     tables using the same shapes.
 */

// ---------------------------------------------------------------------------
// Type contracts
// ---------------------------------------------------------------------------

/**
 * The six column types supported by the DAO registry / Zod schema
 * generator (Decision 3). Adding a new type requires a corresponding
 * entry in `buildColumnZodSchema` (Task 2) — the literal union here is
 * the single source of truth that both sides compile against.
 */
export type ColumnType =
  | 'integer'
  | 'real'
  | 'text'
  | 'date'
  | 'datetime'
  | 'boolean';

/**
 * Declarative description of a single column in a table manifest.
 *
 * This is the schema-only view of the column; runtime validation is
 * generated from this by `buildColumnZodSchema` (Task 2). Every property
 * is optional except `name` and `type`; the manifest describes the
 * declared intent, not the runtime reality (defaults, nullability,
 * constraints are all opt-in).
 *
 * The interface is intentionally permissive about which combinations
 * are valid (e.g. `autoIncrement` is meaningless for `text`); the
 * per-type validity is documented on each property below and is
 * enforced by `buildColumnZodSchema` where it matters.
 */
export interface ColumnManifest {
  /**
   * Column name. Must be unique within its parent `TableManifest.columns`.
   * Convention: `snake_case` to match SQLite's case-insensitive identifier
   * handling and the codebase's existing column naming.
   */
  name: string;

  /**
   * Logical storage type. Maps 1:1 to a Zod schema in Task 2:
   *   - `integer` → `z.number().int()`
   *   - `real`    → `z.number()`
   *   - `text`    → `z.string()`
   *   - `date`    → `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`
   *   - `datetime`→ `z.string().datetime()`
   *   - `boolean` → `z.boolean()`
   */
  type: ColumnType;

  /**
   * Whether the column may be `NULL` in SQL terms. Defaults to `true`
   * (SQLite's default) but Core manifests set it explicitly so the
   * Zod schema in Task 2 can call `.nullable()` deterministically.
   *
   * Valid for: all column types.
   */
  nullable?: boolean;

  /**
   * Marks this column as the table's primary key. Exactly one column
   * per table should set this; composite keys are out of scope for
   * Phase 4.
   *
   * Valid for: typically `integer` with `autoIncrement: true`. SQLite
   * accepts primary keys on any type, but the DAO's `update` / `delete`
   * keyed-on-PK pattern assumes a single integer PK.
   */
  primary?: boolean;

  /**
   * Marks this column as `AUTOINCREMENT` (SQLite). The DAO never lets
   * callers write this column explicitly — Task 2's `insert` Zod schema
   * strips PK columns before validation.
   *
   * Valid for: `integer` columns that are also `primary: true`.
   */
  autoIncrement?: boolean;

  /**
   * Default value applied by the DAO client-side (NOT by SQLite — keeps
   * the DAO layer portable). The literal `'now'` is special-cased for
   * `datetime` columns and resolves to the current ISO-8601 timestamp
   * at insert time. Booleans use `true` / `false`; integers and reals
   * use numeric literals; text columns use string literals (e.g. `'AUD'`).
   *
   * Valid for: all column types; type compatibility with `type` is the
   * caller's responsibility (Task 2 does not validate it).
   */
  default?: string | number | boolean;

  /**
   * Minimum value (inclusive). Applied as `.min()` on the Zod schema.
   *
   * Valid for: `integer`, `real`. Ignored for other types by Task 2.
   */
  min?: number;

  /**
   * Maximum value (inclusive). Applied as `.max()` on the Zod schema.
   *
   * Valid for: `integer`, `real`. Ignored for other types by Task 2.
   */
  max?: number;

  /**
   * Hint that the DAO / migration should create an index on this column
   * for query performance. Defaults to `false`.
   *
   * Valid for: any column; typically applied to high-selectivity `text`
   * columns (e.g. lookup codes) or FK columns.
   */
  index?: boolean;

  /**
   * Foreign-key reference in `'<table>.<column>'` form (e.g. `'accounts.id'`).
   * The DAO records the reference for documentation and for Task 5's
   * cross-table validation hooks; Phase 4 does not auto-generate SQL
   * `REFERENCES` clauses from this — migrations are the source of truth
   * for actual FK constraints.
   *
   * Valid for: any column whose target is a known table.
   */
  references?: string;

  /**
   * Allowed string values for enum-like `text` columns. Applied as
   * `z.enum([...])` instead of `z.string()` by Task 2.
   *
   * Valid for: `text` columns only.
   */
  enumOptions?: readonly string[];

  /**
   * Human-readable description of the column's purpose. Surfaced in
   * the extension manifest viewer (Phase 8) and used by reviewers to
   * understand schema choices during code review. Not consumed by
   * Task 2's Zod generation.
   */
  description?: string;
}

/**
 * Declarative description of a single table.
 *
 * The combination of `name` + `columns` is the single source of truth
 * for both schema validation (Task 2) and runtime DAO behaviour (Task 5).
 * Adding a table to `SHARED_TABLE_MANIFESTS` makes it readable by all
 * extensions; adding a table to an extension's `tables[]` manifest block
 * (Decision 3) makes it readable AND writable by that extension only.
 */
export interface TableManifest {
  /**
   * Table name. Conventions:
   *   - Shared Financial Data: short, unprefixed (`accounts`,
   *     `transactions`). Platform-owned.
   *   - Extension-owned: `<extensionId>_<localName>` (e.g.
   *     `salary_history_pay_slips`). Enforced structurally by the
   *     DAO namespace check.
   */
  name: string;

  /**
   * Ordered list of columns. The order is preserved through Zod schema
   * generation so generated validators have stable key ordering.
   */
  columns: readonly ColumnManifest[];
}

// ---------------------------------------------------------------------------
// Shared Financial Data allowlist (Decision 1)
// ---------------------------------------------------------------------------

/**
 * The allowlist of tables that constitute **Shared Financial Data** —
 * Platform-owned canonical records that extensions may **read** via
 * the DAO but **cannot write** (Decision 1).
 *
 * Phase 4 ships exactly one entry: `accounts`. Adding a new table
 * here is a deliberate platform-level decision (the constant is the
 * trade-off cost Decision 1 accepts in exchange for simple, structural
 * enforcement).
 *
 * The tuple is `as const` so the literal type survives — consumers can
 * use `typeof SHARED_FINANCIAL_DATA_TABLES[number]` to derive the
 * allowed table-name union if they need one.
 */
export const SHARED_FINANCIAL_DATA_TABLES = ['accounts'] as const;

/**
 * Convenience union of the table names in `SHARED_FINANCIAL_DATA_TABLES`.
 * Useful in DAO signatures (`table: SharedFinancialDataTable`) so the
 * compiler enforces that callers only ask for allowlisted tables.
 */
export type SharedFinancialDataTable = typeof SHARED_FINANCIAL_DATA_TABLES[number];

// ---------------------------------------------------------------------------
// Shared Financial Data schemas (Decision 4)
// ---------------------------------------------------------------------------

/**
 * Declarative schemas for every table in `SHARED_FINANCIAL_DATA_TABLES`.
 *
 * The accounts schema below is the Phase 4 minimum per Decision 4. The
 * table is created by Core migration `003-shared-accounts` (Task 4);
 * Core's migration runner applies it at startup. Future Core work may
 * extend `accounts` (e.g. add `account_type`, `opening_balance` in
 * Phase 5); the extension here is the single source of truth for the
 * resulting schema, and any future Accounts Core Extension reads from
 * here rather than redeclaring.
 *
 * The shape is consumed by:
 *   - Task 2: `buildColumnZodSchema` generates validators from each column.
 *   - Task 5: The DAO looks up the manifest for a shared table when
 *     validating a read request.
 *   - Task 9: Boot sequence registers each manifest with the schema
 *     registry.
 */
export const SHARED_TABLE_MANIFESTS: readonly TableManifest[] = [
  {
    name: 'accounts',
    columns: [
      {
        name: 'id',
        type: 'integer',
        primary: true,
        autoIncrement: true,
      },
      {
        name: 'name',
        type: 'text',
        nullable: false,
      },
      {
        name: 'institution',
        type: 'text',
        nullable: true,
        description: 'Bank or institution name (e.g. "CBA", "ANZ"). Optional — many users name accounts without an institution.',
      },
      {
        name: 'is_active',
        type: 'boolean',
        nullable: false,
        default: true,
        description: 'Soft-delete flag. Inactive accounts are hidden from new-payslip dropdowns but historical payslips retain their FK reference.',
      },
      {
        name: 'created_at',
        type: 'datetime',
        nullable: false,
        default: 'now',
      },
    ],
  },
] as const;
