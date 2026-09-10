import { describe, it, expect } from 'vitest';
import { validateManifest } from '../../../src/extension-host/manifest-schema';

const validManifest = {
  id: 'salary-history',
  displayName: 'Salary History',
  version: '0.1.0',
  activationEvents: ['onView:salary-history'],
  contributions: {
    views: [{ id: 'salary-history', name: 'Salary', icon: 'P' }],
    commands: [{ id: 'salary.show-pay-history', title: 'View: Pay History' }]
  },
  main: 'src/main.ts'
};

describe('validateManifest', () => {
  it('accepts a minimal valid manifest', () => {
    const result = validateManifest(validManifest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.id).toBe('salary-history');
      expect(result.manifest.contributions.views).toHaveLength(1);
    }
  });

  it('accepts wildcard activation event', () => {
    const result = validateManifest({ ...validManifest, activationEvents: ['*'] });
    expect(result.ok).toBe(true);
  });

  it('rejects missing activationEvents', () => {
    const { activationEvents: _removed, ...rest } = validManifest;
    void _removed;
    const result = validateManifest(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('activationEvents'))).toBe(true);
    }
  });

  it('rejects empty activationEvents array', () => {
    const result = validateManifest({ ...validManifest, activationEvents: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid view id (uppercase)', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: { views: [{ id: 'SalaryHistory', name: 'Salary', icon: 'P' }] }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('view id'))).toBe(true);
  });

  it('rejects unknown manifest keys (strict mode)', () => {
    const result = validateManifest({ ...validManifest, unknownKey: 'surprise' });
    expect(result.ok).toBe(false);
  });

  it('rejects unknown contribution keys (strict mode)', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: { views: [], themes: [{ id: 'neon', label: 'Neon' }] }
    });
    expect(result.ok).toBe(false);
  });

  it('rejects enum type without enumOptions', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: {
        configuration: [{ key: 'salary-history.mode', type: 'enum', label: 'Mode' }]
      }
    });
    expect(result.ok).toBe(false);
  });

  it('accepts enum type with enumOptions', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: {
        configuration: [{
          key: 'salary-history.mode',
          type: 'enum',
          label: 'Mode',
          enumOptions: ['gross', 'net'],
          default: 'gross'
        }]
      }
    });
    expect(result.ok).toBe(true);
  });

  it('rejects semver-less version', () => {
    const result = validateManifest({ ...validManifest, version: 'latest' });
    expect(result.ok).toBe(false);
  });

  it('accepts a valid themeColor', () => {
    const result = validateManifest({ ...validManifest, themeColor: '#4EC9B0' });
    expect(result.ok).toBe(true);
  });

  it('accepts a missing themeColor', () => {
    const result = validateManifest({ ...validManifest });
    expect(result.ok).toBe(true);
  });

  it('rejects malformed themeColor values', () => {
    for (const themeColor of ['red', '#FFF', '#GGGGGG', '123456', '#12345']) {
      const result = validateManifest({ ...validManifest, themeColor });
      expect(result.ok).toBe(false);
    }
  });
});

// Phase 4 Task 8.4 — `tables[]` block validation (Decision 3).
//
// These tests pin the contract that the manifest schema validates the
// shape of an extension's `tables[]` declarations. The schema is
// intentionally permissive about table NAMES at this layer — the
// registry enforces the `<extensionId>_*` namespace prefix at
// registration time, and ownership semantics belong to the registry.
// What the manifest schema DOES enforce:
//   - `tables[].name` is a SQL-safe identifier (lowercase snake_case).
//   - `tables[].columns` has at least one entry.
//   - Each column's `type` is one of the 6 supported `ColumnType`s.
//   - Each column's `default` (when present) is type-compatible.
//   - Each column's `name` follows the same SQL-safe convention.
//
// The 5 tests below cover one positive and four negative cases per
// the plan's verification line.
describe('validateManifest (tables[] — Phase 4 Task 8)', () => {
  const validTableManifest = {
    name: 'salary_history_pay_slips',
    columns: [
      { name: 'id', type: 'integer', primary: true, autoIncrement: true },
      { name: 'account_id', type: 'integer', nullable: false },
      { name: 'pay_date', type: 'date', nullable: false },
      { name: 'gross', type: 'real', nullable: false, default: 0, min: 0 },
      { name: 'net', type: 'real', nullable: false, default: 0, min: 0 },
      { name: 'is_active', type: 'boolean', nullable: false, default: true },
      { name: 'created_at', type: 'datetime', nullable: false, default: 'now' }
    ]
  };

  it('accepts a valid manifest with a tables[] block', () => {
    const result = validateManifest({
      ...validManifest,
      tables: [validTableManifest]
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.tables).toHaveLength(1);
      expect(result.manifest.tables?.[0].name).toBe('salary_history_pay_slips');
      expect(result.manifest.tables?.[0].columns).toHaveLength(7);
    }
  });

  it('rejects a table with no columns (missing required columns)', () => {
    const result = validateManifest({
      ...validManifest,
      tables: [{ name: 'empty_table', columns: [] }]
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('columns'))).toBe(true);
    }
  });

  it('rejects a column with an unsupported type', () => {
    const result = validateManifest({
      ...validManifest,
      tables: [{
        name: 'bad_type_table',
        columns: [{ name: 'blob_col', type: 'blob' }]
      }]
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Zod reports invalid_enum_value at the offending path.
      expect(result.errors.some((e) => /type|blob/i.test(e))).toBe(true);
    }
  });

  it('rejects a default value that does not match the column type', () => {
    // boolean column with a string default is the canonical typo —
    // the defaultMatchesType refinement must catch it.
    const result = validateManifest({
      ...validManifest,
      tables: [{
        name: 'bad_default_table',
        columns: [
          { name: 'id', type: 'integer', primary: true },
          { name: 'is_active', type: 'boolean', default: 'true' }
        ]
      }]
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /default.*type|type.*default/i.test(e))).toBe(true);
    }
  });

  // ---- Phase 5 Task 1.2–1.3: navigation, allowedCommands, allowedUiEvents refinements ----

  it('accepts onStartup activation event', () => {
    const result = validateManifest({
      ...validManifest,
      activationEvents: ['onStartup']
    });
    expect(result.ok).toBe(true);
  });

  it('accepts valid navigation contribution', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: {
        navigation: [
          { id: 'monthly-budget', label: 'Monthly Budget', command: 'budget.open' },
          { id: 'categories', label: 'Categories', command: 'budget.categories' }
        ]
      }
    });
    expect(result.ok).toBe(true);
  });

  it('rejects duplicate navigation ids', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: {
        navigation: [
          { id: 'monthly-budget', label: 'Monthly Budget', command: 'budget.open' },
          { id: 'monthly-budget', label: 'Duplicate', command: 'budget.dup' }
        ]
      }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /navigation/.test(e) && /unique/.test(e))).toBe(true);
    }
  });

  it('rejects allowedCommands referencing a command not in commands[]', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: {
        commands: [{ id: 'budget.open', title: 'Open Budget' }],
        allowedCommands: ['budget.open', 'budget.missing']
      }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /allowedCommands/.test(e))).toBe(true);
    }
  });

  it('rejects duplicate allowedUiEvents entries', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: {
        allowedUiEvents: ['budget-updated', 'budget-updated']
      }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /allowedUiEvents/.test(e) && /duplicate/.test(e))).toBe(true);
    }
  });

  // ---- Phase 5 Fix 3 — views[].openCommand contract ----

  it('accepts a view with openCommand referencing a declared command', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: {
        views: [{ id: 'dashboard-view', name: 'Dashboard', icon: 'D', openCommand: 'dashboard.refresh' }],
        commands: [{ id: 'dashboard.refresh', title: 'Refresh Dashboard' }]
      }
    });
    expect(result.ok).toBe(true);
  });

  it('rejects openCommand referencing a command not in commands[]', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: {
        views: [{ id: 'dashboard-view', name: 'Dashboard', icon: 'D', openCommand: 'dashboard.missing' }],
        commands: [{ id: 'dashboard.refresh', title: 'Refresh Dashboard' }]
      }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /openCommand/.test(e))).toBe(true);
    }
  });

  it('rejects an openCommand with an invalid command id format', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: {
        views: [{ id: 'dashboard-view', name: 'Dashboard', icon: 'D', openCommand: 'Dashboard.Refresh' }],
        commands: [{ id: 'dashboard.refresh', title: 'Refresh Dashboard' }]
      }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /openCommand/.test(e) && /command id/.test(e))).toBe(true);
    }
  });

  it('rejects an invalid table name (must be lowercase snake_case)', () => {
    // The plan calls this "no prefix match"; the schema's interpretation
    // is the SQL-identifier safety check (lowercase letter start,
    // lowercase alphanumeric + underscore thereafter). Namespace prefix
    // matching against the extension id is the registry's job, not the
    // manifest schema's. The schema rejects `SalaryHistoryPaySlips`
    // because the capital letters violate the snake_case convention
    // (SQLite is case-insensitive about identifiers, but the casing
    // would collide with how every other table in the codebase is named).
    const result = validateManifest({
      ...validManifest,
      tables: [{
        name: 'SalaryHistoryPaySlips',
        columns: [{ name: 'id', type: 'integer', primary: true }]
      }]
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('table name'))).toBe(true);
    }
  });
});

// Settings-validation Task 3 — extension-declared pattern/formatHint/placeholder
// on configuration contributions (spec §5, tests 6-8).
describe('configuration contribution format metadata', () => {
  const baseManifest = {
    id: 'test-ext',
    displayName: 'Test Ext',
    version: '0.1.0',
    activationEvents: ['onStartup'],
    main: 'src/main.ts',
    contributions: {
      configuration: [
        { key: 'test-ext.start', type: 'string', label: 'Start date', pattern: '^\\d{2}-\\d{2}$', formatHint: 'MM-DD', placeholder: '07-01' },
      ],
    },
  };

  it('accepts pattern/formatHint/placeholder on a configuration contribution', () => {
    const result = validateManifest(baseManifest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.contributions.configuration![0]).toMatchObject({
        pattern: '^\\d{2}-\\d{2}$',
        formatHint: 'MM-DD',
        placeholder: '07-01',
      });
    }
  });

  it('rejects a configuration contribution with an invalid pattern regex', () => {
    const result = validateManifest({
      ...baseManifest,
      contributions: {
        configuration: [
          { key: 'test-ext.start', type: 'string', label: 'Start date', pattern: '[' },
        ],
      },
    });
    expect(result.ok).toBe(false);
  });

  it('accepts a configuration contribution without pattern fields (backward compatible)', () => {
    const result = validateManifest({
      ...baseManifest,
      contributions: {
        configuration: [
          { key: 'test-ext.currency', type: 'string', label: 'Currency', default: 'AUD' },
        ],
      },
    });
    expect(result.ok).toBe(true);
  });
});
