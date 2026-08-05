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

  // ─────────────────────────────────────────────────────────────────────
  // Test Unit 6 (Disabling an Extension Removes Its Contributions)
  // Hot-disable contract coverage — [Review fix §5.3] contract items 2/3:
  //   - `views()` / `commands()` re-filter via `isEnabled()` on every call
  //     so disabling an extension excludes it from the next IPC list()
  //     call without requiring cache invalidation.
  //   - `extensions:activate-view` IPC handler gates on
  //     `views().find(...)` and returns `{ activated: false, reason:
  //     'view not found' }` for a disabled extension — even if the
  //     Activity Bar has a stale button.
  // ─────────────────────────────────────────────────────────────────────

  it('views() excludes disabled extensions (hot-disable contract item 2)', () => {
    registry.upsert(manifest({ id: 'a' }));
    registry.upsert(manifest({ id: 'b' }));
    expect(registry.views().map((v) => v.extensionId)).toEqual(['a', 'b']);
    registry.setEnabled('b', false);
    expect(registry.views().map((v) => v.extensionId)).toEqual(['a']);
    registry.setEnabled('b', true);
    expect(registry.views().map((v) => v.extensionId)).toEqual(['a', 'b']);
  });

  it('commands() excludes disabled extensions (hot-disable contract item 2)', () => {
    registry.upsert(manifest({ id: 'a' }));
    registry.upsert(manifest({ id: 'b' }));
    expect(registry.commands().map((c) => c.extensionId)).toEqual(['a', 'b']);
    registry.setEnabled('b', false);
    expect(registry.commands().map((c) => c.extensionId)).toEqual(['a']);
    registry.setEnabled('b', true);
    expect(registry.commands().map((c) => c.extensionId)).toEqual(['a', 'b']);
  });

  it('views() returns { extensionId, view } shape with manifest view fields', () => {
    registry.upsert(manifest());
    const [entry] = registry.views();
    expect(entry).toBeDefined();
    expect(entry!.extensionId).toBe('salary-history');
    expect(entry!.view).toMatchObject({
      id: 'salary-history',
      name: 'Salary',
      icon: 'P'
    });
  });

  it('commands() returns { extensionId, command } shape with manifest command fields', () => {
    registry.upsert(manifest());
    const [entry] = registry.commands();
    expect(entry).toBeDefined();
    expect(entry!.extensionId).toBe('salary-history');
    expect(entry!.command).toMatchObject({
      id: 'salary.show-pay-history',
      title: 'View: Pay History'
    });
  });

  it('views().find(...) gates activate-view for disabled extensions (contract item 3)', () => {
    // The Main IPC handler `extensions:activate-view` calls
    // `extensionRegistry.views().find((v) => v.view.id === viewId)` and
    // returns `{ activated: false, reason: 'view not found' }` if find
    // returns undefined. This test pins the registry half of that
    // contract — the IPC handler side is exercised by Test Unit 3's
    // round-trip.
    registry.upsert(manifest());
    expect(registry.views().find((v) => v.view.id === 'salary-history')).toBeDefined();
    registry.setEnabled('salary-history', false);
    expect(registry.views().find((v) => v.view.id === 'salary-history')).toBeUndefined();
  });

  it('commands().find(...) gates command lookup for disabled extensions', () => {
    registry.upsert(manifest());
    expect(registry.commands().find((c) => c.command.id === 'salary.show-pay-history')).toBeDefined();
    registry.setEnabled('salary-history', false);
    expect(registry.commands().find((c) => c.command.id === 'salary.show-pay-history')).toBeUndefined();
  });

  it('get(id) returns the cached manifest for an enabled extension', () => {
    registry.upsert(manifest({ displayName: 'Salary History v1' }));
    const m = registry.get('salary-history');
    expect(m).toBeDefined();
    expect(m!.displayName).toBe('Salary History v1');
  });

  it('get(id) returns undefined for an unknown extension id', () => {
    expect(registry.get('does-not-exist')).toBeUndefined();
  });

  it('get(id) still returns the cached manifest when extension is disabled (hot-disable contract item 6)', () => {
    // Test Unit 6 step 7: the Host retains the extension's in-memory
    // activation after disable, so `extensions:executeCommand` still
    // succeeds. The registry does not unload the cached manifest — the
    // Host's `finance.commands.execute` lookup operates on its own
    // command registry, not the ExtensionRegistry's `commands()` output.
    // This test pins that contract: `get(id)` returns the manifest
    // regardless of `isEnabled()` state, because the manifest is
    // metadata the Host already loaded.
    registry.upsert(manifest());
    registry.setEnabled('salary-history', false);
    expect(registry.get('salary-history')).toBeDefined();
    expect(registry.isEnabled('salary-history')).toBe(false);
  });

  it('configuration() returns config items from enabled extensions', () => {
    const withConfig = manifest({
      contributions: {
        commands: [{ id: 'salary.show-pay-history', title: 'View: Pay History' }],
        configuration: [
          { key: 'salary-history.paygToleranceDollars', type: 'number', label: 'PAYG Tolerance', default: 5 }
        ]
      }
    });
    registry.upsert(withConfig);
    const [entry] = registry.configuration();
    expect(entry).toBeDefined();
    expect(entry!.extensionId).toBe('salary-history');
    expect(entry!.configuration.key).toBe('salary-history.paygToleranceDollars');
    expect(entry!.configuration.type).toBe('number');
  });

  it('configuration() excludes disabled extensions', () => {
    registry.upsert(manifest({
      contributions: {
        commands: [{ id: 'salary.show-pay-history', title: 'View: Pay History' }],
        configuration: [
          { key: 'salary-history.paygToleranceDollars', type: 'number', label: 'PAYG Tolerance', default: 5 }
        ]
      }
    }));
    registry.setEnabled('salary-history', false);
    expect(registry.configuration()).toHaveLength(0);
  });

  it('configuration() returns empty array for extensions with no configuration', () => {
    registry.upsert(manifest());
    expect(registry.configuration()).toHaveLength(0);
  });
});
