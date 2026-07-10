import { describe, it, expect, beforeEach } from 'vitest';
import {
  TableSchemaRegistry,
} from '../../../src/main/services/table-schema-registry';
import {
  SHARED_TABLE_MANIFESTS,
  SHARED_FINANCIAL_DATA_TABLES,
} from '../../../src/main/services/shared-data-tables';
import type {
  TableManifest,
} from '../../../src/main/services/shared-data-tables';

/**
 * Phase 4 Task 3 — TableSchemaRegistry.
 *
 * The registry is the **load-time enforcement** of Decision 1 (Shared
 * Financial Data Boundary — Allowlist + Strict Prefix Enforcement) from
 * `docs/superpowers/plans/2026-07-04-phase4-shared-financial-data-salary-history.md`.
 * At boot, `main.ts` calls `registerSharedTables(SHARED_TABLE_MANIFESTS)` for
 * platform-owned tables; at extension activation the loader calls
 * `registerExtensionTables(extensionId, manifest.tables)` which throws if any
 * table violates the `<extensionId>_*` prefix rule OR collides with an existing
 * registration OR tries to claim a shared-table name.
 *
 * At runtime the DAO service (Task 5) calls `getInsertSchema` / `getUpdateSchema`
 * to validate payloads, `getColumnNames` to enumerate `INSERT` columns,
 * `isSharedTable` / `getOwnerExtension` to enforce namespace + read-only rules.
 *
 * These tests pin the contract Task 5's DAO service and Task 9's boot sequence
 * rely on. If any of these tests fail, downstream Phase 4 work will fail in
 * confusing ways; fix the registry first, do not patch the consumers.
 */
describe('TableSchemaRegistry', () => {
  let registry: TableSchemaRegistry;

  beforeEach(() => {
    registry = new TableSchemaRegistry();
  });

  // ------------------------------------------------------------------
  // Test 1: register extension tables succeeds
  // ------------------------------------------------------------------
  // The happy path — an extension with a single well-named table registers
  // without error. After registration the table should appear in `listTables`
  // and be owned by the extension id.
  it('registerExtensionTables succeeds for a single well-prefixed table', () => {
    const table: TableManifest = {
      name: 'salary_history_pay_slips',
      columns: [
        { name: 'id', type: 'integer', primary: true, autoIncrement: true },
        { name: 'gross', type: 'real', nullable: false },
      ],
    };

    expect(() =>
      registry.registerExtensionTables('salary-history', [table])
    ).not.toThrow();

    expect(registry.listTables()).toContain('salary_history_pay_slips');
    expect(registry.getOwnerExtension('salary_history_pay_slips')).toBe('salary-history');
  });

  // ------------------------------------------------------------------
  // Test 2: register extension tables throws on duplicate
  // ------------------------------------------------------------------
  // Idempotency check — registering the same table name twice (whether from
  // the same extension or a different one) must throw. The DAO namespace
  // is supposed to be globally unique; the second registration is a
  // programming error.
  it('registerExtensionTables throws when the same table name is registered twice', () => {
    const table: TableManifest = {
      name: 'salary_history_pay_slips',
      columns: [{ name: 'id', type: 'integer', primary: true, autoIncrement: true }],
    };

    registry.registerExtensionTables('salary-history', [table]);

    // Second registration from a *different* extension must also throw — the
    // first registration wins regardless of caller.
    expect(() =>
      registry.registerExtensionTables('tax-extension', [table])
    ).toThrow(/already registered/i);

    // Re-registering the same table from the same extension also throws.
    expect(() =>
      registry.registerExtensionTables('salary-history', [table])
    ).toThrow(/already registered/i);
  });

  // ------------------------------------------------------------------
  // Test 3: register extension tables throws on prefix mismatch
  // ------------------------------------------------------------------
  // Decision 1's structural rule: every extension-owned table must start
  // with `<extensionId>_`. A table whose name does not match the prefix
  // cannot be claimed by the extension.
  it('registerExtensionTables throws when a table name does not match the extension prefix', () => {
    const wrongTable: TableManifest = {
      name: 'budget_items', // no `salary_history_` prefix
      columns: [{ name: 'id', type: 'integer', primary: true, autoIncrement: true }],
    };

    expect(() =>
      registry.registerExtensionTables('salary-history', [wrongTable])
    ).toThrow(/salary_history_|prefix/i);
  });

  // ------------------------------------------------------------------
  // Test 4: register extension tables throws on shared-table claim
  // ------------------------------------------------------------------
  // Per Decision 1, Shared Financial Data is Platform-owned. Even an
  // extension whose id happens to collide with a shared-table name cannot
  // claim it (e.g. extension id `accounts` cannot register a table named
  // `accounts`). This is the second-line defence behind the prefix rule.
  it('registerExtensionTables throws when an extension tries to register a shared-table name', () => {
    // Sanity check: the shared allowlist actually has `accounts` registered.
    expect(SHARED_FINANCIAL_DATA_TABLES).toContain('accounts');

    registry.registerSharedTables(SHARED_TABLE_MANIFESTS);

    const attempt: TableManifest = {
      name: 'accounts',
      columns: [{ name: 'id', type: 'integer', primary: true, autoIncrement: true }],
    };

    expect(() =>
      registry.registerExtensionTables('salary-history', [attempt])
    ).toThrow(/shared table|cannot be registered/i);
  });

  // ------------------------------------------------------------------
  // Test 5: register shared tables succeeds
  // ------------------------------------------------------------------
  // The boot-time path: `main.ts` calls `registerSharedTables(SHARED_TABLE_MANIFESTS)`
  // before any extensions are loaded. The Phase 4 manifest ships `accounts`
  // per Decision 4. After registration the table should be queryable as
  // shared-owned.
  it('registerSharedTables succeeds and the registered tables are owned by "shared"', () => {
    expect(() => registry.registerSharedTables(SHARED_TABLE_MANIFESTS)).not.toThrow();

    for (const name of SHARED_FINANCIAL_DATA_TABLES) {
      expect(registry.isSharedTable(name)).toBe(true);
      expect(registry.getOwnerExtension(name)).toBe('shared');
      expect(registry.listTables()).toContain(name);
    }
  });

  // ------------------------------------------------------------------
  // Test 6: register shared tables throws on duplicate with another table
  // ------------------------------------------------------------------
  // Shared tables must also be unique against any prior registration — both
  // extension-owned and previously-shared. Registering `accounts` twice
  // (shared then shared) throws; registering an extension's table and then
  // trying to register the same name as shared also throws.
  it('registerSharedTables throws when a name is already registered (shared or extension-owned)', () => {
    // First case: shared then shared
    registry.registerSharedTables(SHARED_TABLE_MANIFESTS);
    expect(() =>
      registry.registerSharedTables(SHARED_TABLE_MANIFESTS)
    ).toThrow(/already registered/i);

    // Second case: extension first, then shared collides
    const fresh = new TableSchemaRegistry();
    const extTable: TableManifest = {
      name: 'some_extension_collide',
      columns: [{ name: 'id', type: 'integer', primary: true, autoIncrement: true }],
    };
    fresh.registerExtensionTables('some-extension', [extTable]);

    const collidingShared: TableManifest = {
      name: 'some_extension_collide',
      columns: [{ name: 'id', type: 'integer', primary: true, autoIncrement: true }],
    };

    expect(() => fresh.registerSharedTables([collidingShared])).toThrow(/already registered/i);
  });

  // ------------------------------------------------------------------
  // Test 7: getOwnerExtension returns the extension id
  // ------------------------------------------------------------------
  // Pin the ownership lookup for an extension-owned table.
  it('getOwnerExtension returns the extension id for extension-owned tables', () => {
    const table: TableManifest = {
      name: 'salary_history_rate_history',
      columns: [{ name: 'id', type: 'integer', primary: true, autoIncrement: true }],
    };
    registry.registerExtensionTables('salary-history', [table]);

    expect(registry.getOwnerExtension('salary_history_rate_history')).toBe('salary-history');
  });

  // ------------------------------------------------------------------
  // Test 8: getOwnerExtension returns 'shared' for shared tables
  // ------------------------------------------------------------------
  // Pin the ownership lookup for a platform-owned table.
  it('getOwnerExtension returns "shared" for shared tables', () => {
    registry.registerSharedTables(SHARED_TABLE_MANIFESTS);

    expect(registry.getOwnerExtension('accounts')).toBe('shared');
  });

  // ------------------------------------------------------------------
  // Test 9: getOwnerExtension throws on unknown table
  // ------------------------------------------------------------------
  // The DAO service (Task 5) relies on this throw to refuse to operate
  // on tables that were never registered. A silent default would mask
  // bugs in extension manifests.
  it('getOwnerExtension throws when the table is not registered', () => {
    expect(() => registry.getOwnerExtension('not_a_table')).toThrow(/not registered/i);
  });

  // ------------------------------------------------------------------
  // Test 10: isSharedTable returns true/false correctly
  // ------------------------------------------------------------------
  // Pin both branches: shared tables return true; extension-owned tables
  // (and unknown tables) return false. The DAO (Task 5) uses this method
  // to enforce the read-only allowlist.
  it('isSharedTable returns true for shared tables and false for extension-owned tables', () => {
    registry.registerSharedTables(SHARED_TABLE_MANIFESTS);

    const extTable: TableManifest = {
      name: 'salary_history_pay_slips',
      columns: [{ name: 'id', type: 'integer', primary: true, autoIncrement: true }],
    };
    registry.registerExtensionTables('salary-history', [extTable]);

    expect(registry.isSharedTable('accounts')).toBe(true);
    expect(registry.isSharedTable('salary_history_pay_slips')).toBe(false);
    // Unknown tables are NOT shared — they are simply unknown.
    expect(registry.isSharedTable('not_a_table')).toBe(false);
  });

  // ------------------------------------------------------------------
  // Test 11: getInsertSchema returns a working schema
  // ------------------------------------------------------------------
  // The DAO (Task 5) calls `getInsertSchema(table)` to validate a payload
  // before issuing SQL. Per Decision 3 / Task 2, the insert schema rejects
  // system columns (`id`, `created_at`, `updated_at`) and accepts only
  // user-mutable columns. Here we verify the `accounts` table's insert
  // schema accepts `{ name: 'X' }` (the minimum user-mutable payload).
  it('getInsertSchema returns a working schema that validates user-mutable columns', () => {
    registry.registerSharedTables(SHARED_TABLE_MANIFESTS);

    const insertSchema = registry.getInsertSchema('accounts');
    const parsed = insertSchema.safeParse({ name: 'Everyday Account' });
    expect(parsed.success).toBe(true);

    // And rejects an attempt to write the system-managed `id` column.
    const forgedId = insertSchema.safeParse({ id: 1, name: 'X' });
    expect(forgedId.success).toBe(false);
  });

  // ------------------------------------------------------------------
  // Test 12: getUpdateSchema returns a working partial schema
  // ------------------------------------------------------------------
  // The update schema accepts any subset of user-mutable columns (partial
  // patch) and rejects system columns. An empty object must be accepted —
  // a no-op update is legal.
  it('getUpdateSchema returns a working partial-patch schema that rejects system columns', () => {
    registry.registerSharedTables(SHARED_TABLE_MANIFESTS);

    const updateSchema = registry.getUpdateSchema('accounts');

    // Empty patch is allowed (no fields to change).
    expect(updateSchema.safeParse({}).success).toBe(true);

    // Subset is allowed.
    expect(updateSchema.safeParse({ name: 'Renamed' }).success).toBe(true);

    // System-managed `id` is still rejected.
    expect(updateSchema.safeParse({ id: 1 }).success).toBe(false);

    // System-managed `created_at` is still rejected.
    expect(
      updateSchema.safeParse({ created_at: '2026-01-01T00:00:00Z' }).success
    ).toBe(false);
  });

  // ------------------------------------------------------------------
  // Test 13 (bonus): getColumnNames returns declaration-order list
  // ------------------------------------------------------------------
  // The DAO (Task 5) needs to know the column list to build `INSERT INTO
  // <table> (col1, col2, ...) VALUES (...)` statements. Order matters for
  // SQL — the column list must come back in the order the manifest declared.
  it('getColumnNames returns columns in declaration order', () => {
    registry.registerSharedTables(SHARED_TABLE_MANIFESTS);

    const names = registry.getColumnNames('accounts');
    expect(names).toEqual(['id', 'name', 'institution', 'is_active', 'created_at']);
  });

  // ------------------------------------------------------------------
  // Test 14 (bonus): listTables returns every registered table
  // ------------------------------------------------------------------
  // Diagnostics helper — the boot sequence / debug logging uses this to
  // enumerate the registered set. The order is not guaranteed; we assert
  // membership only.
  it('listTables returns every registered table across both extension and shared registrations', () => {
    const extTable: TableManifest = {
      name: 'salary_history_pay_slips',
      columns: [{ name: 'id', type: 'integer', primary: true, autoIncrement: true }],
    };
    registry.registerExtensionTables('salary-history', [extTable]);
    registry.registerSharedTables(SHARED_TABLE_MANIFESTS);

    const names = registry.listTables();
    expect(names).toContain('accounts');
    expect(names).toContain('salary_history_pay_slips');
    expect(names).toHaveLength(2);
  });

  // ------------------------------------------------------------------
  // Test 15 (bonus): schema lookups for unknown tables throw
  // ------------------------------------------------------------------
  // The DAO (Task 5) calls `getInsertSchema` / `getUpdateSchema` /
  // `getColumnNames` for any table an extension asks about. If the table
  // is not registered, all three methods must throw — silent defaults
  // would let extensions query arbitrary table names.
  it('getInsertSchema / getUpdateSchema / getColumnNames throw for unknown tables', () => {
    expect(() => registry.getInsertSchema('unknown')).toThrow(/not registered/i);
    expect(() => registry.getUpdateSchema('unknown')).toThrow(/not registered/i);
    expect(() => registry.getColumnNames('unknown')).toThrow(/not registered/i);
  });
});
