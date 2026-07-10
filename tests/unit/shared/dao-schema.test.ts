import { describe, it, expect } from 'vitest';
import {
  buildColumnZodSchema,
  buildTableZodSchema,
  serializeRow,
  SUPPORTED_COLUMN_TYPES,
} from '../../../src/shared/dao-schema';
import type {
  ColumnManifest,
  TableManifest,
} from '../../../src/main/services/shared-data-tables';

/**
 * Phase 4 Task 2 — Zod schema generation from `TableManifest`.
 *
 * Per Decision 3 of
 * `docs/superpowers/plans/2026-07-04-phase4-shared-financial-data-salary-history.md`,
 * the DAO registry generates Zod schemas from the declarative table manifest
 * so every insert / update payload is validated at the boundary before SQL is
 * emitted. This module also owns `serializeRow`, which strips non-JSON-safe
 * values (Date / BigInt / Buffer / undefined) from query results so they can
 * cross the JSON-RPC boundary into the Extension Host without crashing.
 *
 * These tests pin the contract Task 5's DAO service and Task 9's boot sequence
 * rely on. If any of these tests fail, downstream Phase 4 work will fail in
 * confusing ways; fix the schema generator first, do not patch the consumers.
 */
describe('dao-schema', () => {
  // ------------------------------------------------------------------
  // Test 1: `buildColumnZodSchema` covers all 6 column types
  // ------------------------------------------------------------------
  // Pin the type-to-Zod mapping from Decision 3's table:
  //   integer  -> z.number().int()
  //   real     -> z.number()
  //   text     -> z.string()
  //   date     -> z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  //   datetime -> z.string().datetime()
  //   boolean  -> z.boolean()
  it('buildColumnZodSchema maps every ColumnType to the correct base Zod schema', () => {
    const cases: Array<{
      column: ColumnManifest;
      goodValue: unknown;
      badValue: unknown;
      label: string;
    }> = [
      { column: { name: 'n', type: 'integer' }, goodValue: 42, badValue: 1.5, label: 'integer' },
      { column: { name: 'n', type: 'real' }, goodValue: 3.14, badValue: '3.14', label: 'real' },
      { column: { name: 'n', type: 'text' }, goodValue: 'hello', badValue: 7, label: 'text' },
      { column: { name: 'n', type: 'date' }, goodValue: '2026-07-10', badValue: '2026-7-10', label: 'date (strict YYYY-MM-DD)' },
      { column: { name: 'n', type: 'datetime' }, goodValue: '2026-07-10T10:00:00Z', badValue: '2026-07-10', label: 'datetime (ISO-8601)' },
      { column: { name: 'n', type: 'boolean' }, goodValue: true, badValue: 1, label: 'boolean' },
    ];

    for (const { column, goodValue, badValue, label } of cases) {
      const schema = buildColumnZodSchema(column);
      const ok = schema.safeParse(goodValue);
      const bad = schema.safeParse(badValue);
      expect(ok.success, `${label}: expected ${JSON.stringify(goodValue)} to parse successfully, got ${JSON.stringify(ok)}`).toBe(true);
      expect(bad.success, `${label}: expected ${JSON.stringify(badValue)} to be rejected, got ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  // ------------------------------------------------------------------
  // Test 2: Nullable variant
  // ------------------------------------------------------------------
  // `nullable: true` adds `.nullable()` to the base schema (modifier order
  // from the task spec: base -> min/max -> nullable -> default).
  it('nullable: true adds .nullable(); nullable: false (or omitted) rejects null', () => {
    const nullableColumn: ColumnManifest = { name: 'note', type: 'text', nullable: true };
    const nonNullableColumn: ColumnManifest = { name: 'note', type: 'text', nullable: false };

    const nullableSchema = buildColumnZodSchema(nullableColumn);
    const nonNullableSchema = buildColumnZodSchema(nonNullableColumn);

    expect(nullableSchema.safeParse(null).success).toBe(true);
    expect(nullableSchema.safeParse('hi').success).toBe(true);
    expect(nonNullableSchema.safeParse(null).success).toBe(false);
    expect(nonNullableSchema.safeParse('hi').success).toBe(true);
  });

  // ------------------------------------------------------------------
  // Test 3: min / max on integer
  // ------------------------------------------------------------------
  // `.min(N)` / `.max(N)` are applied to integer columns per Decision 3.
  it('applies min / max constraints to integer columns', () => {
    const column: ColumnManifest = { name: 'age', type: 'integer', min: 0, max: 120 };
    const schema = buildColumnZodSchema(column);

    expect(schema.safeParse(0).success).toBe(true);     // boundary inclusive
    expect(schema.safeParse(120).success).toBe(true);   // boundary inclusive
    expect(schema.safeParse(60).success).toBe(true);    // inside range
    expect(schema.safeParse(-1).success).toBe(false);   // below min
    expect(schema.safeParse(121).success).toBe(false);  // above max
  });

  // ------------------------------------------------------------------
  // Test 4: min / max on real
  // ------------------------------------------------------------------
  // `.min(N)` / `.max(N)` also apply to real columns (different base type
  // than integer — must not regress).
  it('applies min / max constraints to real columns', () => {
    const column: ColumnManifest = { name: 'rate', type: 'real', min: 0, max: 1.5 };
    const schema = buildColumnZodSchema(column);

    expect(schema.safeParse(0).success).toBe(true);
    expect(schema.safeParse(1.5).success).toBe(true);
    expect(schema.safeParse(0.75).success).toBe(true);
    expect(schema.safeParse(-0.01).success).toBe(false);
    expect(schema.safeParse(1.51).success).toBe(false);
  });

  // ------------------------------------------------------------------
  // Test 5: Default values applied
  // ------------------------------------------------------------------
  // Per the task spec, `.default(value)` is the outermost modifier so
  // `undefined` parses to the default while explicit values (including
  // `null` if `.nullable()` was applied first) pass through.
  it('default value is applied when input is undefined', () => {
    const column: ColumnManifest = { name: 'count', type: 'integer', default: 5 };
    const schema = buildColumnZodSchema(column);

    expect(schema.safeParse(undefined).success).toBe(true);
    expect(schema.safeParse(undefined).data).toBe(5);
    expect(schema.safeParse(42).success).toBe(true);
    expect(schema.safeParse(42).data).toBe(42);
  });

  // ------------------------------------------------------------------
  // Test 6: insert schema rejects system columns
  // ------------------------------------------------------------------
  // `id` / `created_at` / `updated_at` are auto-generated by the DAO and
  // must NOT be writable through the insert schema. We use a synthetic
  // manifest so we can exercise all three system columns in one schema.
  it('buildTableZodSchema insert rejects system columns (id / created_at / updated_at)', () => {
    const table: TableManifest = {
      name: 'synthetic',
      columns: [
        { name: 'id', type: 'integer', primary: true, autoIncrement: true },
        { name: 'name', type: 'text', nullable: false },
        { name: 'created_at', type: 'datetime', nullable: false, default: 'now' },
        { name: 'updated_at', type: 'datetime', nullable: false, default: 'now' },
      ],
    };
    const { insert } = buildTableZodSchema(table);

    // Reject any payload that includes id
    expect(insert.safeParse({ id: 1, name: 'foo' }).success).toBe(false);
    // Reject created_at
    expect(insert.safeParse({ name: 'foo', created_at: '2026-01-01T00:00:00Z' }).success).toBe(false);
    // Reject updated_at
    expect(insert.safeParse({ name: 'foo', updated_at: '2026-01-01T00:00:00Z' }).success).toBe(false);
    // Accept user-mutable columns only
    expect(insert.safeParse({ name: 'foo' }).success).toBe(true);
    // Reject missing required columns
    expect(insert.safeParse({}).success).toBe(false);
  });

  // ------------------------------------------------------------------
  // Test 7: update schema accepts partial
  // ------------------------------------------------------------------
  // Updates are patches — every user-mutable column must be `.optional()`
  // so callers can supply just the fields they want to change.
  it('buildTableZodSchema update accepts partial subsets', () => {
    const table: TableManifest = {
      name: 'synthetic',
      columns: [
        { name: 'id', type: 'integer', primary: true, autoIncrement: true },
        { name: 'name', type: 'text', nullable: false },
        { name: 'count', type: 'integer', nullable: false, default: 0 },
        { name: 'created_at', type: 'datetime', nullable: false, default: 'now' },
        { name: 'updated_at', type: 'datetime', nullable: false, default: 'now' },
      ],
    };
    const { update } = buildTableZodSchema(table);

    expect(update.safeParse({}).success).toBe(true);          // empty patch is OK
    expect(update.safeParse({ name: 'new' }).success).toBe(true);  // single field
    expect(update.safeParse({ name: 'new', count: 5 }).success).toBe(true);  // multi-field
  });

  // ------------------------------------------------------------------
  // Test 8: update schema rejects system columns
  // ------------------------------------------------------------------
  // The same system-column exclusion applies to updates — extensions cannot
  // tamper with `updated_at` directly (the DAO writes it on every change).
  it('buildTableZodSchema update rejects system columns (id / created_at / updated_at)', () => {
    const table: TableManifest = {
      name: 'synthetic',
      columns: [
        { name: 'id', type: 'integer', primary: true, autoIncrement: true },
        { name: 'name', type: 'text', nullable: false },
        { name: 'created_at', type: 'datetime', nullable: false, default: 'now' },
        { name: 'updated_at', type: 'datetime', nullable: false, default: 'now' },
      ],
    };
    const { update } = buildTableZodSchema(table);

    expect(update.safeParse({ updated_at: '2026-01-01T00:00:00Z' }).success).toBe(false);
    expect(update.safeParse({ id: 99 }).success).toBe(false);
    expect(update.safeParse({ created_at: '2026-01-01T00:00:00Z' }).success).toBe(false);
  });

  // ------------------------------------------------------------------
  // Test 9: serializeRow converts Date to ISO-8601
  // ------------------------------------------------------------------
  // better-sqlite3 returns TEXT for date / datetime columns, so Dates
  // shouldn't appear in normal query results — but be defensive: if a
  // Date instance slips through (e.g. a custom migration that returns
  // one), serialize it as an ISO-8601 string so the JSON-RPC layer can
  // carry it.
  it('serializeRow converts Date values to ISO-8601 strings', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const result = serializeRow({ created_at: date, name: 'foo' });

    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z');
    expect(typeof result.created_at).toBe('string');
    expect(result.name).toBe('foo');
  });

  // ------------------------------------------------------------------
  // Test 10: serializeRow rejects BigInt / Buffer / undefined
  // ------------------------------------------------------------------
  // Cross-process JSON-RPC cannot carry BigInt (loses precision) or
  // Buffer (not serialisable), and `undefined` is a programmer error —
  // a DB row should never contain undefined values. Each must throw
  // with a clear error message identifying the offending value.
  it('serializeRow throws on BigInt, Buffer, and undefined values', () => {
    expect(() => serializeRow({ value: BigInt(10) })).toThrow(/BigInt/);
    expect(() => serializeRow({ value: Buffer.from('hi') })).toThrow(/Buffer/);
    expect(() => serializeRow({ value: undefined })).toThrow(/undefined/);
  });

  // ------------------------------------------------------------------
  // Bonus test: nested objects and arrays in serializeRow
  // ------------------------------------------------------------------
  // Phase 4 doesn't store nested structures, but serializeRow is the
  // generic JSON-safety layer — it must handle them so future columns
  // (or accidental DB writes) don't crash the IPC boundary.
  it('serializeRow recursively serialises nested objects and arrays', () => {
    const date = new Date('2026-06-15T12:30:00.000Z');
    const input = {
      id: 1,
      tags: ['a', 'b', 'c'],
      meta: {
        created_at: date,
        version: 2,
      },
    };
    const result = serializeRow(input);

    expect(result.tags).toEqual(['a', 'b', 'c']);
    expect(result.meta).toEqual({
      created_at: '2026-06-15T12:30:00.000Z',
      version: 2,
    });
  });

  // ------------------------------------------------------------------
  // Bonus test: enumOptions on text columns produces z.enum
  // ------------------------------------------------------------------
  // Per the task spec, `enumOptions: readonly string[]` switches the
  // text column from `z.string()` to `z.enum([...])`.
  it('enumOptions on a text column produces a z.enum schema', () => {
    const column: ColumnManifest = {
      name: 'currency',
      type: 'text',
      enumOptions: ['AUD', 'USD', 'EUR'],
    };
    const schema = buildColumnZodSchema(column);

    expect(schema.safeParse('AUD').success).toBe(true);
    expect(schema.safeParse('USD').success).toBe(true);
    expect(schema.safeParse('JPY').success).toBe(false);
  });

  // ------------------------------------------------------------------
  // Bonus test: SUPPORTED_COLUMN_TYPES export
  // ------------------------------------------------------------------
  // The constant must exactly match the ColumnType union so the schema
  // registry can validate manifest inputs against it.
  it('SUPPORTED_COLUMN_TYPES equals the ColumnType union literal', () => {
    expect(SUPPORTED_COLUMN_TYPES).toEqual([
      'integer',
      'real',
      'text',
      'date',
      'datetime',
      'boolean',
    ]);
  });
});
