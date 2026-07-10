import { describe, it, expect } from 'vitest';
import {
  SHARED_FINANCIAL_DATA_TABLES,
  SHARED_TABLE_MANIFESTS
} from '../../../src/main/services/shared-data-tables';

/**
 * Phase 4 Task 1 — Shared Financial Data constant + accounts manifest.
 *
 * These four tests pin the contract that all subsequent Phase 4 tasks rely on:
 *   - Task 2 (buildColumnZodSchema) consumes `SHARED_TABLE_MANIFESTS` to generate
 *     Zod validators.
 *   - Task 5 (DAO service) consumes `SHARED_FINANCIAL_DATA_TABLES` as the read-only
 *     allowlist for shared-data access.
 *   - Task 8 (finance.d.ts re-export) re-exports `TableManifest` / `ColumnManifest`
 *     from this module's types.
 *
 * If any of these tests fail, downstream Phase 4 work will fail in confusing ways;
 * fix the constant or manifest first, do not patch the consumers.
 */
describe('shared-data-tables', () => {
  // ------------------------------------------------------------------
  // 1. Constant value test
  // ------------------------------------------------------------------
  // The allowlist must be exactly `['accounts']` for Phase 4. Adding new
  // shared tables is a deliberate platform-level decision (Decision 1
  // trade-off) and must not happen by accident.
  it('SHARED_FINANCIAL_DATA_TABLES equals [\'accounts\']', () => {
    expect(SHARED_FINANCIAL_DATA_TABLES).toEqual(['accounts']);
  });

  // ------------------------------------------------------------------
  // 2. Accounts present in manifests
  // ------------------------------------------------------------------
  // `SHARED_TABLE_MANIFESTS` must declare the schema for every table
  // listed in `SHARED_FINANCIAL_DATA_TABLES`; otherwise Task 2 has
  // nothing to generate a Zod schema from and the DAO cannot validate
  // reads.
  it('SHARED_TABLE_MANIFESTS contains an entry for "accounts"', () => {
    const accountEntries = SHARED_TABLE_MANIFESTS.filter(t => t.name === 'accounts');
    expect(accountEntries).toHaveLength(1);
  });

  // ------------------------------------------------------------------
  // 3. Required columns present with correct types
  // ------------------------------------------------------------------
  // Pin the minimum schema that the accounts table must satisfy per
  // Decision 4. If any of these columns or types drift, Phase 4's
  // accounts-seed modal and salary-history account dropdown will break.
  it('accounts manifest has required columns with correct types', () => {
    const accounts = SHARED_TABLE_MANIFESTS.find(t => t.name === 'accounts');
    expect(accounts).toBeDefined();
    if (!accounts) return; // type narrowing for the rest of the test

    const cols = accounts.columns;

    const idCol = cols.find(c => c.name === 'id');
    expect(idCol).toBeDefined();
    expect(idCol?.type).toBe('integer');
    expect(idCol?.primary).toBe(true);
    expect(idCol?.autoIncrement).toBe(true);

    const nameCol = cols.find(c => c.name === 'name');
    expect(nameCol).toBeDefined();
    expect(nameCol?.type).toBe('text');
    expect(nameCol?.nullable).toBe(false);

    const isActiveCol = cols.find(c => c.name === 'is_active');
    expect(isActiveCol).toBeDefined();
    expect(isActiveCol?.type).toBe('boolean');
    expect(isActiveCol?.nullable).toBe(false);
    expect(isActiveCol?.default).toBe(true);

    const createdAtCol = cols.find(c => c.name === 'created_at');
    expect(createdAtCol).toBeDefined();
    expect(createdAtCol?.type).toBe('datetime');
    expect(createdAtCol?.nullable).toBe(false);

    // At least one column must be marked primary — guards against an
    // accidentally-typeless schema that would defeat the DAO's PK
    // assumptions (UPDATE/DELETE keyed on id).
    const hasPrimary = cols.some(c => c.primary === true);
    expect(hasPrimary).toBe(true);
  });

  // ------------------------------------------------------------------
  // 3b. `institution` column is optional + nullable
  // ------------------------------------------------------------------
  // Documents the schema's one truly optional column. Not strictly
  // required by the plan's minimum-4-tests contract, but pinning it
  // here surfaces accidental schema changes during future Phase 5+
  // extensions of the accounts table.
  it('accounts.institution is text and nullable', () => {
    const accounts = SHARED_TABLE_MANIFESTS.find(t => t.name === 'accounts');
    expect(accounts).toBeDefined();
    if (!accounts) return;

    const institutionCol = accounts.columns.find(c => c.name === 'institution');
    expect(institutionCol).toBeDefined();
    expect(institutionCol?.type).toBe('text');
    expect(institutionCol?.nullable).toBe(true);
  });

  // ------------------------------------------------------------------
  // 4. No extension prefix on shared tables
  // ------------------------------------------------------------------
  // Shared Financial Data is Platform-owned (project_vision.md:264).
  // It must NOT be namespaced under any extension id — doing so would
  // (a) violate the platform-ownership principle and (b) break the DAO
  // namespace check (Decision 1) which would reject extensions trying
  // to read `salary_history_accounts` even though they legitimately
  // own the `salary_history_*` prefix.
  it('accounts table name does not start with any extension id prefix', () => {
    const accounts = SHARED_TABLE_MANIFESTS.find(t => t.name === 'accounts');
    expect(accounts).toBeDefined();
    if (!accounts) return;

    // Common extension ids in Phase 4 and nearby phases — the table
    // name must not begin with any of these (with or without an
    // underscore separator).
    const knownExtensionIds = [
      'salary_history',
      'salary-history',
      'tax',
      'budget',
      'dashboard',
      'cash_flow',
      'cash-flow',
    ];

    for (const extId of knownExtensionIds) {
      expect(accounts.name.startsWith(extId)).toBe(false);
      expect(accounts.name.startsWith(`${extId}_`)).toBe(false);
    }
  });
});
