/**
 * TableSchemaRegistry — load-time enforcement of Decision 1 boundaries.
 *
 * Per Decision 1 of
 * `docs/superpowers/plans/2026-07-04-phase4-shared-financial-data-salary-history.md`,
 * the platform distinguishes two kinds of table:
 *
 *   1. **Shared Financial Data** — Platform-owned canonical records
 *      enumerated in `SHARED_FINANCIAL_DATA_TABLES`. Extensions may **read**
 *      them via the DAO but **cannot write** (the DAO enforces this
 *      structurally).
 *   2. **Extension-owned** — namespaced `<extensionId>_*`; readable AND
 *      writable by the owning extension only.
 *
 * `TableSchemaRegistry` is the **load-time gate** for these rules. At boot,
 * `main.ts` calls `registerSharedTables(SHARED_TABLE_MANIFESTS)` for the
 * platform-owned tables. At extension activation, `extension-loader.ts`
 * calls `registerExtensionTables(extensionId, manifest.tables)`, which
 * throws if any table violates the prefix rule, collides with an existing
 * registration, or tries to claim a shared-table name.
 *
 * At runtime, the DAO service (Task 5) queries the registry to:
 *   - Look up the insert / update Zod schema for a table (Task 2's
 *     `buildTableZodSchema` is invoked once at registration time and
 *     cached).
 *   - Check ownership (`getOwnerExtension`) to enforce namespace rules.
 *   - Check shared status (`isSharedTable`) to enforce the read-only rule.
 *   - Enumerate columns (`getColumnNames`) for `INSERT INTO ... (cols)`.
 *
 * The registry is a single in-memory store; one instance per process,
 * owned by `main.ts` and passed by reference to the DAO service and the
 * extension loader.
 */

import type { z } from 'zod';
import { buildTableZodSchema } from '../../shared/dao-schema';
import {
  SHARED_FINANCIAL_DATA_TABLES,
  type TableManifest,
} from './shared-data-tables';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/**
 * Internal record for a registered table. Stores the manifest, the
 * resolved owner (extension id or `'shared'`), and the pre-built Zod
 * schemas so the DAO service never has to call `buildTableZodSchema`
 * on the hot path.
 */
interface RegistryEntry {
  manifest: TableManifest;
  owner: string | 'shared';
  insertSchema: z.ZodObject<z.ZodRawShape>;
  updateSchema: z.ZodObject<z.ZodRawShape>;
}

// ---------------------------------------------------------------------------
// TableSchemaRegistry class
// ---------------------------------------------------------------------------

/**
 * In-memory registry of every table the DAO service can operate on.
 *
 * Construction is cheap; the registry is empty until `registerSharedTables`
 * or `registerExtensionTables` is called. The DAO service (Task 5)
 * assumes both have been called by the time it processes requests:
 *
 *   - `main.ts` calls `registerSharedTables(SHARED_TABLE_MANIFESTS)`
 *     during boot, before any extension is loaded.
 *   - `extension-loader.ts` calls `registerExtensionTables(extensionId,
 *     manifest.tables)` when an extension's activation event fires.
 *
 * Schema generation happens eagerly at registration time — `buildTableZodSchema`
 * is invoked once per table and the result is cached. Phase 4 has a
 * handful of tables total; lazy generation would be over-engineering.
 */
export class TableSchemaRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  /**
   * Register tables owned by a specific extension. Throws on:
   *   - **Duplicate**: a table with the same name was already registered
   *     (whether by an extension or as a shared table). The first
   *     registration wins regardless of caller.
   *   - **Prefix mismatch**: the table name does not start with
   *     `<extensionId>_`. Per Decision 1 this is structural — extensions
   *     cannot claim tables outside their namespace.
   *   - **Shared-table claim**: the table name is in
   *     `SHARED_FINANCIAL_DATA_TABLES`. Shared tables are platform-owned;
   *     an extension cannot register one even if its id happens to
   *     collide (e.g. an extension id of `accounts` cannot register a
   *     table named `accounts`).
   *
   * @param extensionId The id of the registering extension (e.g. `'salary-history'`).
   * @param tables      The `tables[]` block from the extension's manifest.
   * @throws Error on any of the three violations above.
   */
  registerExtensionTables(extensionId: string, tables: readonly TableManifest[]): void {
    // Extension ids follow the npm convention and use hyphens
    // (e.g. 'salary-history'). Table namespaces follow the SQL convention
    // and use underscores (e.g. 'salary_history_pay_slips'). Convert
    // hyphens to underscores so the prefix check matches the SQL form.
    const requiredPrefix = `${extensionId.replace(/-/g, '_')}_`;

    for (const table of tables) {
      // Check order matters: the shared-table claim must be tested BEFORE
      // the duplicate check. If `accounts` is already registered as a
      // shared table, an extension attempting to register it again would
      // hit the duplicate check first and throw "already registered" —
      // hiding the real reason. The shared-table check fires first so
      // the error clearly states that the table is platform-owned.
      if (SHARED_FINANCIAL_DATA_TABLES.includes(table.name as typeof SHARED_FINANCIAL_DATA_TABLES[number])) {
        throw new Error(
          `TableSchemaRegistry: table '${table.name}' is a shared table and cannot be registered by extension '${extensionId}'`
        );
      }

      if (this.entries.has(table.name)) {
        throw new Error(
          `TableSchemaRegistry: table '${table.name}' is already registered`
        );
      }

      if (!table.name.startsWith(requiredPrefix)) {
        throw new Error(
          `TableSchemaRegistry: table '${table.name}' does not match the required prefix '${requiredPrefix}'`
        );
      }

      const { insert, update } = buildTableZodSchema(table);
      this.entries.set(table.name, {
        manifest: table,
        owner: extensionId,
        insertSchema: insert,
        updateSchema: update,
      });
    }
  }

  /**
   * Register platform-owned Shared Financial Data tables. Throws if any
   * table name is already registered (whether as shared or extension-owned).
   *
   * Called once during boot by `main.ts` with `SHARED_TABLE_MANIFESTS`.
   * The extension loader does NOT call this method.
   *
   * @param manifests The shared-table manifests from `SHARED_TABLE_MANIFESTS`.
   * @throws Error on any duplicate registration.
   */
  registerSharedTables(manifests: readonly TableManifest[]): void {
    for (const table of manifests) {
      if (this.entries.has(table.name)) {
        throw new Error(
          `TableSchemaRegistry: table '${table.name}' is already registered`
        );
      }

      const { insert, update } = buildTableZodSchema(table);
      this.entries.set(table.name, {
        manifest: table,
        owner: 'shared',
        insertSchema: insert,
        updateSchema: update,
      });
    }
  }

  /**
   * Get the insert Zod schema for a table.
   *
   * The schema rejects system-managed columns (`id`, `created_at`,
   * `updated_at`) and validates user-mutable columns per the manifest's
   * type / nullable / min / max / enumOptions declarations. Built once
   * at registration time and cached; this method is a fast lookup.
   *
   * @param table The table name.
   * @returns The Zod object schema for `INSERT` payloads.
   * @throws Error if the table is not registered.
   */
  getInsertSchema(table: string): z.ZodObject<z.ZodRawShape> {
    const entry = this.requireEntry(table);
    return entry.insertSchema;
  }

  /**
   * Get the update Zod schema for a table (partial-patch shape).
   *
   * Every user-mutable column is `.optional()` so callers can supply
   * just the fields they want to change. Empty patches (`{}`) are
   * accepted as a legal no-op update.
   *
   * @param table The table name.
   * @returns The Zod object schema for `UPDATE` payloads.
   * @throws Error if the table is not registered.
   */
  getUpdateSchema(table: string): z.ZodObject<z.ZodRawShape> {
    const entry = this.requireEntry(table);
    return entry.updateSchema;
  }

  /**
   * Get the column names for a table in declaration order.
   *
   * Order matters: the DAO service uses this list to build
   * `INSERT INTO <table> (col1, col2, ...) VALUES (...)` statements,
   * and the column order must match the order the manifest declared
   * so the SQL parameter binding is unambiguous.
   *
   * @param table The table name.
   * @returns The column names in manifest-declaration order.
   * @throws Error if the table is not registered.
   */
  getColumnNames(table: string): readonly string[] {
    const entry = this.requireEntry(table);
    return entry.manifest.columns.map(c => c.name);
  }

  /**
   * Check whether a table is in the Shared Financial Data allowlist.
   *
   * Returns `false` for both extension-owned tables and unknown tables.
   * The DAO service uses this to enforce the read-only rule: shared
   * tables may be `.find`'d but never `.insert` / `.update` / `.delete`'d.
   *
   * @param table The table name.
   * @returns `true` if the table is registered as shared.
   */
  isSharedTable(table: string): boolean {
    const entry = this.entries.get(table);
    return entry?.owner === 'shared';
  }

  /**
   * Get the owner of a registered table.
   *
   * @param table The table name.
   * @returns The extension id for extension-owned tables, or `'shared'`
   *          for platform-owned tables.
   * @throws Error if the table is not registered.
   */
  getOwnerExtension(table: string): string | 'shared' {
    return this.requireEntry(table).owner;
  }

  /**
   * List every registered table name.
   *
   * Order is not guaranteed (insertion order in the underlying Map).
   * Used by boot diagnostics and by the Extension Manager UI (Phase 8)
   * to enumerate the registered set.
   *
   * @returns Array of registered table names.
   */
  listTables(): readonly string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Internal: look up a registered table entry or throw a clear error.
   * Every public getter routes through here so the error message is
   * consistent across `getInsertSchema` / `getUpdateSchema` /
   * `getColumnNames` / `getOwnerExtension`.
   */
  private requireEntry(table: string): RegistryEntry {
    const entry = this.entries.get(table);
    if (!entry) {
      throw new Error(`TableSchemaRegistry: table '${table}' is not registered`);
    }
    return entry;
  }
}
