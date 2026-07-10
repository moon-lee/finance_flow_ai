/**
 * Runtime validation for table manifests + JSON-safety for query results.
 *
 * Per Decision 3 of
 * `docs/superpowers/plans/2026-07-04-phase4-shared-financial-data-salary-history.md`,
 * the DAO registry generates Zod schemas from the declarative table manifest
 * so every insert / update payload is validated at the boundary before SQL is
 * emitted. This module owns that generator, plus `serializeRow` which strips
 * non-JSON-safe values (Date / BigInt / Buffer / undefined) from query
 * results so they can cross the JSON-RPC boundary into the Extension Host
 * without crashing.
 *
 * The module is consumed by:
 *   - Task 3 (`src/main/services/table-schema-registry.ts`) — calls
 *     `buildTableZodSchema` once per registered table to cache validators.
 *   - Task 5 (`src/main/services/dao-service.ts`) — calls `serializeRow`
 *     on every query result before returning across the IPC boundary.
 *   - Task 9 (`src/main/main.ts`) — boot sequence registers shared-table
 *     schemas with the registry.
 *
 * The single source of truth for the 6 supported column types lives in
 * `src/main/services/shared-data-tables.ts` (`ColumnType` union); this file
 * re-uses that type via `SUPPORTED_COLUMN_TYPES` (kept in sync — both are
 * asserted equal in `tests/unit/shared/dao-schema.test.ts`).
 */

import { z } from 'zod';
import type {
  ColumnManifest,
  ColumnType,
  TableManifest,
} from '../main/services/shared-data-tables';

// ---------------------------------------------------------------------------
// Type contracts
// ---------------------------------------------------------------------------

/**
 * Tuple of every column type the DAO registry / Zod generator supports.
 *
 * MUST stay in sync with the `ColumnType` union in `shared-data-tables.ts`.
 * The `tests/unit/shared/dao-schema.test.ts` "SUPPORTED_COLUMN_TYPES equals
 * the ColumnType union literal" test pins the equality so the two sources
 * cannot silently drift.
 */
export const SUPPORTED_COLUMN_TYPES = [
  'integer',
  'real',
  'text',
  'date',
  'datetime',
  'boolean',
] as const satisfies readonly ColumnType[];

/**
 * Recursive JSON-safe value type — every value that can cross a JSON-RPC
 * boundary without losing data. Phase 4 columns hold primitives (`string`,
 * `number`, `boolean`, `null`) only, but `serializeRow` recurses into nested
 * objects / arrays defensively so future schema additions (or accidental
 * DB writes) cannot crash the IPC layer.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// ---------------------------------------------------------------------------
// Per-column Zod schema generation (Decision 3)
// ---------------------------------------------------------------------------

/**
 * Build a Zod validator for a single column declaration.
 *
 * Modifier order (innermost → outermost): `base` → `min/max` → `nullable` →
 * `default`. This order matters: `.default()` must be the outermost modifier
 * so `undefined` resolves to the default; `.nullable()` must be inside the
 * default so a nullable column with a default accepts `undefined` (→ default)
 * AND `null` AND an explicit value.
 *
 * The `'now'` literal as a `default` is intentionally NOT handled here —
 * the Zod schema treats it as an invalid datetime string and rejects it.
 * The DAO (Task 5) resolves `'now'` to an ISO timestamp before validation.
 * Documented because the contract is non-obvious.
 */
export function buildColumnZodSchema(column: ColumnManifest): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (column.type) {
    case 'integer':
      schema = z.number().int();
      break;
    case 'real':
      schema = z.number();
      break;
    case 'text':
      if (column.enumOptions && column.enumOptions.length > 0) {
        schema = z.enum(column.enumOptions as [string, ...string[]]);
      } else {
        schema = z.string();
      }
      break;
    case 'date':
      schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected ISO date YYYY-MM-DD');
      break;
    case 'datetime':
      schema = z.string().datetime({ message: 'expected ISO-8601 datetime' });
      break;
    case 'boolean':
      schema = z.boolean();
      break;
  }

  // Numeric range constraints. Silently ignored for non-numeric column types
  // by Zod's type system (you can't call `.min()` / `.max()` on a string
  // schema without a TS error), so we narrow on the column type rather than
  // throwing at runtime.
  if (column.type === 'integer' || column.type === 'real') {
    if (column.min !== undefined) {
      schema = (schema as z.ZodNumber).min(column.min);
    }
    if (column.max !== undefined) {
      schema = (schema as z.ZodNumber).max(column.max);
    }
  }

  // Nullable modifier: applied BEFORE `.default()` so that a nullable column
  // with a default accepts `undefined` → default AND `null` AND an explicit
  // value. (Zod's `.default()` swallows `undefined`; without `.nullable()`
  // being applied first, `null` would be rejected by the base schema.)
  if (column.nullable === true) {
    schema = schema.nullable();
  }

  // Default modifier: outermost. Accepts `string | number | boolean` (the
  // valid types per the `ColumnManifest.default` declaration). The `'now'`
  // literal for datetime columns is NOT handled here — see function JSDoc.
  if (column.default !== undefined) {
    schema = schema.default(column.default);
  }

  return schema;
}

// ---------------------------------------------------------------------------
// Per-table Zod schema generation (Decision 3)
// ---------------------------------------------------------------------------

/**
 * Build paired Zod object schemas (insert + update) for a single table.
 *
 * The insert schema enforces "user-mutable columns only" — it omits the
 * system-managed columns (`id`, `created_at`, `updated_at`) so callers cannot
 * forge primary keys or timestamps. The DAO fills those in at write time.
 *
 * The update schema is the partial-patch shape: every user-mutable column is
 * `.optional()` so callers can supply just the fields they want to change.
 * System-managed columns are still omitted.
 *
 * A column is treated as system-managed if EITHER:
 *   - `column.primary === true` (e.g. `id`)
 *   - `column.name === 'created_at'`
 *   - `column.name === 'updated_at'`
 *
 * This name-based detection is a Phase 4 simplification; a `system: true`
 * flag on `ColumnManifest` would be more robust, but matches the plan's
 * intent for the first release.
 */
export function buildTableZodSchema(table: TableManifest): {
  insert: z.ZodObject<z.ZodRawShape>;
  update: z.ZodObject<z.ZodRawShape>;
} {
  const insertShape: z.ZodRawShape = {};
  const updateShape: z.ZodRawShape = {};

  for (const column of table.columns) {
    if (isSystemManagedColumn(column)) continue;

    const columnSchema = buildColumnZodSchema(column);
    insertShape[column.name] = columnSchema;
    updateShape[column.name] = columnSchema.optional();
  }

  // `.strict()` rejects unknown keys — this is what enforces the
  // system-column exclusion. Without it, Zod's default "strip" mode
  // silently drops `id` / `created_at` / `updated_at`, and the
  // "reject system columns" tests in `tests/unit/shared/dao-schema.test.ts`
  // would fail because the schemas would accept payloads that contain
  // system columns.
  return {
    insert: z.object(insertShape).strict(),
    update: z.object(updateShape).strict(),
  };
}

/**
 * Internal: determine whether a column is system-managed (auto-generated
 * by the DAO and not writable through the insert / update schema).
 *
 * Detection rules: `primary: true` (e.g. `id`) OR exact-name match against
 * `created_at` / `updated_at`. Phase 4 uses this name-based heuristic; see
 * `buildTableZodSchema` JSDoc for the trade-off note.
 */
function isSystemManagedColumn(column: ColumnManifest): boolean {
  if (column.primary === true) return true;
  if (column.name === 'created_at') return true;
  if (column.name === 'updated_at') return true;
  return false;
}

// ---------------------------------------------------------------------------
// JSON-safety for query results (Decision 3, Decision 5)
// ---------------------------------------------------------------------------

/**
 * Convert a SQLite query row (or any plain object) to a JSON-safe value
 * suitable for crossing the JSON-RPC boundary into the Extension Host.
 *
 * Behaviour:
 *   - `Date` → ISO-8601 string (defensive; better-sqlite3 normally returns
 *     TEXT for `date` / `datetime` columns, but custom code paths or future
 *     schema additions could introduce Date instances).
 *   - `BigInt` → throws (JSON.stringify loses precision; we never want this
 *     in a DB row).
 *   - `Buffer` → throws (Phase 4 does not store BLOBs).
 *   - `undefined` → throws (programmer error; a DB row should never contain
 *     `undefined`).
 *   - Nested arrays → recurse element-by-element.
 *   - Nested objects → recurse value-by-value.
 *   - Primitives (`string` / `number` / `boolean` / `null`) → pass through.
 *   - Input must be a plain object (not `null`, not an array, not a
 *     primitive) — anything else throws.
 *
 * **Boolean convention:** SQLite has no native BOOLEAN type. The accounts
 * `is_active` column stores 0 / 1 as INTEGER; better-sqlite3 returns them
 * as `number`. This function passes them through unchanged. Extension code
 * should interpret via `Boolean(value)` or `value === 1` (documented in the
 * Decision 4 schema comments and in `extensions/salary-history/`'s DAO
 * wrappers).
 *
 * Throws on programmer error (BigInt / Buffer / undefined / non-object
 * input). Callers (Task 5's DAO) wrap these as typed errors before
 * returning across the IPC boundary.
 */
export function serializeRow(row: unknown): Record<string, JsonValue> {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`serializeRow: expected a plain object, got ${describe(row)}`);
  }

  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    result[key] = serializeValue(value, `row.${key}`);
  }
  return result;
}

/**
 * Internal: recursively serialize a single value. Throws on BigInt /
 * Buffer / undefined / non-JSON-safe inputs; recurses into nested objects
 * and arrays.
 *
 * @param value The value to serialize.
 * @param path  Debug path (e.g. `'row.tags[2].created_at'`) included in
 *              error messages so the offender is easy to locate.
 */
function serializeValue(value: unknown, path: string): JsonValue {
  if (value === null) return null;
  if (value === undefined) {
    throw new Error(`serializeRow: unexpected undefined at ${path}`);
  }

  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') {
    return value as JsonValue;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'bigint') {
    throw new Error(`serializeRow: BigInt at ${path} is not JSON-safe`);
  }

  if (Buffer.isBuffer(value)) {
    throw new Error(`serializeRow: Buffer at ${path} is not JSON-safe`);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => serializeValue(item, `${path}[${index}]`));
  }

  if (t === 'object') {
    const result: { [key: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = serializeValue(v, `${path}.${k}`);
    }
    return result;
  }

  throw new Error(`serializeRow: unsupported value of type ${t} at ${path}`);
}

/**
 * Internal: human-readable description of a value for error messages.
 * Avoids `[object Object]` / `[object Array]` noise.
 */
function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
