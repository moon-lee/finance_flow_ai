/**
 * DAOService — runtime enforcement of Decision 1 (Shared Financial Data
 * Boundary) and Decision 2 (DAO API Shape).
 *
 * Per `docs/superpowers/plans/2026-07-04-phase4-shared-financial-data-salary-history.md`:
 *   - **Decision 1**: Extensions may only access tables whose names match
 *     `<extensionId>_*` OR are on the Shared Financial Data allowlist.
 *     Shared tables are read-only for extensions.
 *   - **Decision 2**: The DAO exposes typed accessors (find/findOne/insert/
 *     update/delete/count) — no raw SQL, all payloads Zod-validated.
 *   - **Decision 6**: Errors are typed (`TableAccessDenied`,
 *     `SharedTableReadOnly`, `TableNotFound`) so the JSON-RPC layer can
 *     map them to the correct error codes.
 *
 * The DAOService runs in the Main process and owns the SQLite connection.
 * Extensions reach it via JSON-RPC through the Extension Host (Task 6),
 * which calls `find` / `insert` / etc. on their behalf.
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { TableSchemaRegistry } from './table-schema-registry';

// ---------------------------------------------------------------------------
// Error classes (Decision 6)
// ---------------------------------------------------------------------------

/** Thrown when an extension tries to access a table it doesn't own
 *  (and that isn't on the Shared Financial Data allowlist). Maps to
 *  JSON-RPC error code -32011. */
export class TableAccessDeniedError extends Error {
  readonly code = -32011;
  constructor(callerExtensionId: string, table: string) {
    super(
      `DAOService: extension '${callerExtensionId}' cannot access table '${table}'`
    );
    this.name = 'TableAccessDeniedError';
  }
}

/** Thrown when an extension tries to write to a Shared Financial Data
 *  table. Maps to JSON-RPC error code -32013. */
export class SharedTableReadOnlyError extends Error {
  readonly code = -32013;
  constructor(callerExtensionId: string, table: string) {
    super(
      `DAOService: shared table '${table}' is read-only for extension '${callerExtensionId}'`
    );
    this.name = 'SharedTableReadOnlyError';
  }
}

/** Thrown when a table name isn't registered in the schema registry.
 *  Maps to JSON-RPC error code -32010. */
export class TableNotFoundError extends Error {
  readonly code = -32010;
  constructor(table: string) {
    super(`DAOService: table '${table}' is not registered`);
    this.name = 'TableNotFoundError';
  }
}

/** Thrown when a Zod-validated payload fails schema validation.
 *  Maps to JSON-RPC error code -32012. */
export class ValidationFailedError extends Error {
  readonly code = -32012;
  constructor(table: string, issues: string) {
    super(`DAOService: validation failed for table '${table}': ${issues}`);
    this.name = 'ValidationFailedError';
  }
}

// ---------------------------------------------------------------------------
// Query operator types
// ---------------------------------------------------------------------------

/** Single condition: either a direct value (equality) or an operator map. */
export type QueryCondition =
  | string
  | number
  | boolean
  | null
  | { [op: string]: QueryValue };

/** Top-level query object passed to `find` / `count` / `update` / `delete`.
 *  Kept as a permissive `Record<string, unknown>` because queries are
 *  validated at runtime by `compileQuery`; this lets extension code (which
 *  may be JavaScript) and tests supply arbitrary literal shapes without
 *  fighting TypeScript's structural typing for recursive index signatures. */
export type QueryObject = Record<string, unknown>;

export type QueryValue =
  | string
  | number
  | boolean
  | null
  | readonly (string | number | boolean | null)[]
  | QueryObject;

// ---------------------------------------------------------------------------
/**
 * Coerce a JS value into one better-sqlite3 can bind.
 *
 * better-sqlite3 rejects booleans (`true`/`false`); SQLite stores booleans as
 * integers (1/0). Callers naturally write `is_active: true`, so we coerce
 * booleans to integers here centrally rather than forcing every caller to
 * remember the quirk.
 */
function coerceParam(value: unknown): unknown {
  if (value === true) return 1;
  if (value === false) return 0;
  return value;
}

// compileQuery — pure function that turns a QueryObject into SQL + params
// ---------------------------------------------------------------------------

/**
 * Translate a JS query object into a parameterised SQL WHERE clause.
 *
 * Returns the fragment without the `WHERE` keyword, e.g.
 * `"account_id = ? AND gross >= ?"` plus the matching params array.
 *
 * All user values are bound as `?` parameters — never concatenated —
 * which prevents SQL injection. The fragment can be safely inserted
 * into any SELECT/UPDATE/DELETE statement.
 *
 * @throws Error on unknown operators or malformed `$or` payloads.
 */
export function compileQuery(query: QueryObject): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const fragments: string[] = [];

  for (const [key, value] of Object.entries(query)) {
    if (key === '$or') {
      if (!Array.isArray(value)) {
        throw new Error(`compileQuery: $or must be an array of QueryObjects`);
      }
      const orParts = value.map((sub) => {
        if (sub === null || typeof sub !== 'object' || Array.isArray(sub)) {
          throw new Error(`compileQuery: $or elements must be QueryObjects`);
        }
        const compiled = compileQuery(sub as QueryObject);
        params.push(...compiled.params);
        return `(${compiled.sql})`;
      });
      fragments.push(orParts.join(' OR '));
      continue;
    }

    // Column condition
    const safeKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)
      ? key
      : (() => {
          throw new Error(`compileQuery: invalid column name '${key}'`);
        })();

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Operator map: { $gte: 5000 }
      for (const [op, opValue] of Object.entries(value)) {
        const fragment = compileOperator(safeKey, op, opValue, params);
        fragments.push(fragment);
      }
    } else {
      // Direct value: equality
      fragments.push(`${safeKey} = ?`);
      params.push(value);
    }
  }

  return {
    sql: fragments.length === 0 ? '1 = 1' : fragments.join(' AND '),
    params: params.map(coerceParam),
  };
}

/**
 * Translate a single operator (e.g. `$gte`, `$in`) into an SQL fragment.
 * Appends parameter values to `params`.
 */
function compileOperator(
  column: string,
  op: string,
  value: unknown,
  params: unknown[]
): string {
  switch (op) {
    case '$eq':
      params.push(value);
      return `${column} = ?`;
    case '$ne':
      params.push(value);
      return `${column} != ?`;
    case '$gt':
      params.push(value);
      return `${column} > ?`;
    case '$gte':
      params.push(value);
      return `${column} >= ?`;
    case '$lt':
      params.push(value);
      return `${column} < ?`;
    case '$lte':
      params.push(value);
      return `${column} <= ?`;
    case '$like':
      params.push(value);
      return `${column} LIKE ?`;
    case '$nlike':
      params.push(value);
      return `${column} NOT LIKE ?`;
    case '$in': {
      if (!Array.isArray(value)) {
        throw new Error(`compileQuery: $in requires an array value`);
      }
      if (value.length === 0) {
        return '0 = 1'; // empty IN is always false
      }
      const placeholders = value.map(() => '?').join(', ');
      params.push(...value);
      return `${column} IN (${placeholders})`;
    }
    case '$nin': {
      if (!Array.isArray(value)) {
        throw new Error(`compileQuery: $nin requires an array value`);
      }
      if (value.length === 0) {
        return '1 = 1'; // empty NOT IN is always true
      }
      const placeholders = value.map(() => '?').join(', ');
      params.push(...value);
      return `${column} NOT IN (${placeholders})`;
    }
    case '$isNull':
      return value === true ? `${column} IS NULL` : `${column} IS NOT NULL`;
    case '$notNull':
      return value === true ? `${column} IS NOT NULL` : `${column} IS NULL`;
    default:
      throw new Error(`compileQuery: unknown operator '${op}'`);
  }
}

// ---------------------------------------------------------------------------
// DAOService
// ---------------------------------------------------------------------------

/** Options for `find`. */
export interface FindOptions {
  limit?: number;
  offset?: number;
  /** Order-by clause. Column names only (validated against schema). */
  orderBy?: { column: string; direction: 'ASC' | 'DESC' };
  /** Phase 5 Task 6 — join another table. Only INNER JOIN is supported. */
  join?: {
    table: string;
    on: string;
    alias?: string;
    columns?: string[];
  };
}

/**
 * The DAO service that extensions reach via JSON-RPC. Enforces namespace
 * isolation, shared-table read-only, and Zod-based payload validation.
 *
 * Construction: pass the SQLite database handle and the schema registry.
 * The registry must have both shared tables and any extension tables
 * registered before the DAO is called.
 */
export class DAOService {
  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly registry: TableSchemaRegistry
  ) {}

  /**
   * Find rows matching a query. Returns plain serialisable objects
   * (Date → ISO-8601, no BigInt/Buffer) so the result can cross the
   * JSON-RPC boundary.
   *
   * @param callerExtensionId The extension making the call.
   * @param table             The table name.
   * @param query             The query object (see Decision 2).
   * @param options           Optional limit/offset/orderBy.
   */
  find<T = Record<string, unknown>>(
    callerExtensionId: string,
    table: string,
    query: QueryObject = {},
    options: FindOptions = {}
  ): T[] {
    this.assertReadable(callerExtensionId, table);
    const { sql: whereSql, params } = compileQuery(query);

    let selectColumns = '*';
    let fromSql = table;
    const finalParams = [...params];

    if (options.join) {
      const joinTable = options.join.table;
      const joinOn = options.join.on;
      const joinAlias = options.join.alias;
      const joinColumns = options.join.columns ?? ['*'];
      this.assertReadable(callerExtensionId, joinTable);
      const tableAlias = `${table} AS t1`;
      const joinAliasStr = joinAlias ? ` AS ${joinAlias}` : '';
      fromSql = `${tableAlias} INNER JOIN ${joinTable}${joinAliasStr} ON ${joinOn}`;
      if (joinColumns.includes('*')) {
        selectColumns = 't1.*';
      } else {
        selectColumns = joinColumns
          .map((col) => {
            if (col.startsWith(`${table}.`) || col.startsWith('t1.')) return col;
            if (joinAlias && col.startsWith(`${joinAlias}.`)) return col;
            return `t1.${col}`;
          })
          .join(', ');
      }
    }

    let sql = `SELECT ${selectColumns} FROM ${fromSql} WHERE ${whereSql}`;

    if (options.orderBy) {
      if (options.orderBy.column.includes('.')) {
        sql += ` ORDER BY ${options.orderBy.column} ${options.orderBy.direction}`;
      } else {
        this.assertValidColumn(table, options.orderBy.column);
        sql += ` ORDER BY ${options.orderBy.column} ${options.orderBy.direction}`;
      }
    } else {
      sql += ' ORDER BY id DESC';
    }

    if (options.limit !== undefined) {
      sql += ' LIMIT ?';
      finalParams.push(options.limit);
    }
    if (options.offset !== undefined) {
      sql += ' OFFSET ?';
      finalParams.push(options.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...finalParams) as Record<string, unknown>[];
    return rows.map((row) => this.serializeRow(row)) as T[];
  }

  /** Find a single row or null. Convenience wrapper around `find` with limit 1. */
  findOne<T = Record<string, unknown>>(
    callerExtensionId: string,
    table: string,
    query: QueryObject = {}
  ): T | null {
    const results = this.find<T>(callerExtensionId, table, query, { limit: 1 });
    return results.length === 0 ? null : (results[0] as T);
  }

  /** Count rows matching a query. */
  count(callerExtensionId: string, table: string, query: QueryObject = {}): number {
    this.assertReadable(callerExtensionId, table);
    const { sql: whereSql, params } = compileQuery(query);
    const stmt = this.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${whereSql}`);
    const result = stmt.get(...params) as { n: number };
    return result.n;
  }

  /**
   * Insert a row. Validates the payload against the table's insert
   * schema, then runs the INSERT and returns the inserted row with
   * generated `id` / `created_at` / `updated_at` populated.
   *
   * Resolves `'now'` defaults to the current ISO-8601 timestamp before
   * SQL execution (the Zod schema would otherwise reject them).
   */
  insert<T = Record<string, unknown>>(
    callerExtensionId: string,
    table: string,
    payload: Record<string, unknown>
  ): T {
    this.assertWritable(callerExtensionId, table);

    const insertSchema = this.registry.getInsertSchema(table);
    const parsed = insertSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ValidationFailedError(table, parsed.error.message);
    }

    const resolved = this.resolveDefaults(parsed.data as Record<string, unknown>);
    const columns = Object.keys(resolved);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map((c) => coerceParam(resolved[c]));

    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...values);

    return this.findOne<T>(callerExtensionId, table, { id: result.lastInsertRowid as number }) as T;
  }

  /**
   * Update rows matching `where` with the given patch. Validates the
   * patch against the table's update schema, auto-stamps `updated_at`,
   * returns the number of affected rows.
   */
  update(
    callerExtensionId: string,
    table: string,
    where: QueryObject,
    payload: Record<string, unknown>
  ): number {
    this.assertWritable(callerExtensionId, table);

    const updateSchema = this.registry.getUpdateSchema(table);
    const parsed = updateSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ValidationFailedError(table, parsed.error.message);
    }

    const resolved = this.resolveDefaults(parsed.data as Record<string, unknown>);
    const patchColumns = Object.keys(resolved);
    if (patchColumns.length === 0) {
      // Empty patch → no-op update, but still return the count
      return this.count(callerExtensionId, table, where);
    }

    // Auto-stamp updated_at if the table has it
    if (this.columnExists(table, 'updated_at')) {
      resolved['updated_at'] = new Date().toISOString();
      patchColumns.push('updated_at');
    }

    const setClause = patchColumns.map((c) => `${c} = ?`).join(', ');
    const { sql: whereSql, params: whereParams } = compileQuery(where);
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereSql}`;
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...patchColumns.map((c) => coerceParam(resolved[c])), ...whereParams);
    return result.changes;
  }

  /**
   * Delete rows matching `where`. Returns the number of affected rows.
   */
  delete(callerExtensionId: string, table: string, where: QueryObject): number {
    this.assertWritable(callerExtensionId, table);
    const { sql: whereSql, params } = compileQuery(where);
    const stmt = this.db.prepare(`DELETE FROM ${table} WHERE ${whereSql}`);
    const result = stmt.run(...params);
    return result.changes;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Throw if the caller can't read this table. */
  private assertReadable(callerExtensionId: string, table: string): void {
    if (!this.registry.listTables().includes(table)) {
      throw new TableNotFoundError(table);
    }
    const owner = this.registry.getOwnerExtension(table);
    const isShared = this.registry.isSharedTable(table);
    if (!isShared && owner !== callerExtensionId) {
      throw new TableAccessDeniedError(callerExtensionId, table);
    }
  }

  /** Throw if the caller can't write this table. */
  private assertWritable(callerExtensionId: string, table: string): void {
    this.assertReadable(callerExtensionId, table);
    if (this.registry.isSharedTable(table)) {
      throw new SharedTableReadOnlyError(callerExtensionId, table);
    }
  }

  /** Validate a column name against the table's manifest (for orderBy). */
  private assertValidColumn(table: string, column: string): void {
    const names = this.registry.getColumnNames(table);
    if (!names.includes(column)) {
      throw new Error(`DAOService: column '${column}' does not exist in table '${table}'`);
    }
  }

  /** Check whether a column exists on a table. */
  private columnExists(table: string, column: string): boolean {
    return this.registry.getColumnNames(table).includes(column);
  }

  /** Resolve `'now'` defaults to current ISO-8601 timestamp.
   *  Applied only to `created_at` / `updated_at` columns so callers can
   *  leave them out without Zod rejecting the literal `'now'`. */
  private resolveDefaults(data: Record<string, unknown>): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === 'now' && (key === 'created_at' || key === 'updated_at')) {
        resolved[key] = new Date().toISOString();
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  /** JSON-safe row serialisation for cross-process transport.
   *  Converts `Date` objects to ISO-8601 strings; everything else passes
   *  through (SQLite already stores numbers/booleans in serialisable form). */
  private serializeRow(row: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      result[key] = this.serializeValue(value);
    }
    return result;
  }

  /** Serialize a single value for JSON-RPC transport. */
  private serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    return value;
  }
}
