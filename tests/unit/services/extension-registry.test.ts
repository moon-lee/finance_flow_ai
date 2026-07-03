import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestDatabase } from '../../../src/main/services/database-service';
import { ExtensionRegistry, AUTO_DISABLE_CRASH_THRESHOLD } from '../../../src/main/services/extension-registry';
import type { FinanceExtensionManifest } from '../../../src/types/finance';

const manifest = (overrides: Partial<FinanceExtensionManifest> = {}): FinanceExtensionManifest => ({
  id: 'salary-history',
  displayName: 'Salary History',
  version: '0.1.0',
  activationEvents: ['onView:salary-history'],
  contributions: {
    views: [{ id: 'salary-history', name: 'Salary', icon: 'P' }],
    commands: [{ id: 'salary.show-pay-history', title: 'View: Pay History' }]
  },
  main: 'src/main.ts',
  ...overrides
});

describe('ExtensionRegistry', () => {
  let registry: ExtensionRegistry;
  let db: ReturnType<typeof getTestDatabase>;

  beforeEach(() => {
    db = getTestDatabase();
    registry = new ExtensionRegistry(db);
  });

  afterEach(() => {
    db.close();
  });

  it('upsert inserts a new extension', () => {
    registry.upsert(manifest());
    const row = db.prepare('SELECT id, name, version, enabled FROM extension_registry WHERE id = ?')
      .get('salary-history') as { id: string; name: string; version: string; enabled: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.name).toBe('Salary History');
    expect(row!.version).toBe('0.1.0');
    expect(row!.enabled).toBe(1);
  });

  it('upsert updates an existing extension', () => {
    registry.upsert(manifest({ version: '0.1.0' }));
    registry.upsert(manifest({ version: '0.2.0', displayName: 'Salary History v2' }));
    const row = db.prepare('SELECT version, name FROM extension_registry WHERE id = ?')
      .get('salary-history') as { version: string; name: string };
    expect(row.version).toBe('0.2.0');
    expect(row.name).toBe('Salary History v2');
  });

  it('list() excludes disabled extensions', () => {
    registry.upsert(manifest({ id: 'a' }));
    registry.upsert(manifest({ id: 'b' }));
    registry.setEnabled('b', false);
    const ids = registry.list().map((m) => m.id);
    expect(ids).toContain('a');
    expect(ids).not.toContain('b');
  });

  it('markActivated persists timestamp and updates cache', () => {
    registry.upsert(manifest());
    registry.markActivated('salary-history', '2026-07-03T10:00:00Z');
    const row = db.prepare('SELECT activated_at FROM extension_registry WHERE id = ?')
      .get('salary-history') as { activated_at: string };
    expect(row.activated_at).toBe('2026-07-03T10:00:00Z');
  });

  it('setEnabled toggles the enabled flag', () => {
    registry.upsert(manifest());
    expect(registry.isEnabled('salary-history')).toBe(true);
    registry.setEnabled('salary-history', false);
    expect(registry.isEnabled('salary-history')).toBe(false);
    registry.setEnabled('salary-history', true);
    expect(registry.isEnabled('salary-history')).toBe(true);
  });

  it('recordCrash increments and persists count and error', () => {
    registry.upsert(manifest());
    const r1 = registry.recordCrash('salary-history', 'boom-1');
    expect(r1.crashCount).toBe(1);
    expect(r1.autoDisabled).toBe(false);
    const r2 = registry.recordCrash('salary-history', 'boom-2');
    expect(r2.crashCount).toBe(2);
    expect(r2.autoDisabled).toBe(false);
    const row = db.prepare('SELECT crash_count, last_error, enabled FROM extension_registry WHERE id = ?')
      .get('salary-history') as { crash_count: number; last_error: string; enabled: number };
    expect(row.crash_count).toBe(2);
    expect(row.last_error).toBe('boom-2');
    expect(row.enabled).toBe(1);
  });

  it('recordCrash auto-disables at AUTO_DISABLE_CRASH_THRESHOLD', () => {
    registry.upsert(manifest());
    for (let i = 0; i < AUTO_DISABLE_CRASH_THRESHOLD - 1; i++) {
      registry.recordCrash('salary-history', `err-${i}`);
    }
    expect(registry.isEnabled('salary-history')).toBe(true);
    const final = registry.recordCrash('salary-history', 'final');
    expect(final.crashCount).toBe(AUTO_DISABLE_CRASH_THRESHOLD);
    expect(final.autoDisabled).toBe(true);
    expect(registry.isEnabled('salary-history')).toBe(false);
  });

  it('clearCrashes resets count and last_error', () => {
    registry.upsert(manifest());
    registry.recordCrash('salary-history', 'boom');
    registry.recordCrash('salary-history', 'boom2');
    registry.clearCrashes('salary-history');
    const row = db.prepare('SELECT crash_count, last_error FROM extension_registry WHERE id = ?')
      .get('salary-history') as { crash_count: number; last_error: string | null };
    expect(row.crash_count).toBe(0);
    expect(row.last_error).toBeNull();
  });
});
