import type Database from 'better-sqlite3';
import { getDatabase } from './database-service';
import type { FinanceExtensionManifest } from '../../types/finance';

/** [Review fix §4.2] After this many recorded crashes, the extension is auto-disabled. */
export const AUTO_DISABLE_CRASH_THRESHOLD = 3;

interface RegistryRow {
  id: string;
  name: string;
  version: string;
  enabled: 0 | 1;
  installed_at: string;
  activated_at: string | null;
  /** [Review fix §4.2] Number of consecutive activation failures since last successful activation. */
  crash_count: number;
  /** [Review fix §4.2] Most recent activation error message; null if none. */
  last_error: string | null;
}

export class ExtensionRegistry {
  private readonly db: Database.Database;
  private readonly byId = new Map<string, { manifest: FinanceExtensionManifest; activatedAt: string | null }>();

  /**
   * @param db  The SQLite database to use. In production, omit this argument
   *            and the Phase 2 singleton (`getDatabase()`) is used. In tests,
   *            pass `getTestDatabase()` so each suite runs against an isolated
   *            in-memory database with the full migration history applied.
   *            *(per [Review fix §5.1] — DI seam for per-suite test isolation.)*
   */
  constructor(db: Database.Database = getDatabase()) {
    this.db = db;
  }

  /**
   * Insert or update the row for `manifest` and cache it in memory. Idempotent —
   * safe to call on every app startup with the same discovery result.
   *
   * **Schema note ([Review fix §4.2]):** The `extension_registry` table must
   * have `crash_count INTEGER NOT NULL DEFAULT 0` and `last_error TEXT` columns.
   * Phase 2's `001-init-infrastructure` migration created the table without
   * these columns; Phase 3 ships a new migration `002-extension-crash-tracking`
   * that adds them via `ALTER TABLE`.
   */
  upsert(manifest: FinanceExtensionManifest): void {
    const stmt = this.db.prepare(`
      INSERT INTO extension_registry (id, name, version, enabled, crash_count, last_error)
      VALUES (@id, @name, @version, 1, 0, NULL)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        version = excluded.version,
        enabled = 1
    `);
    stmt.run({ id: manifest.id, name: manifest.displayName, version: manifest.version });
    if (!this.byId.has(manifest.id)) {
      const row = this.db.prepare('SELECT activated_at FROM extension_registry WHERE id = ?')
        .get(manifest.id) as Pick<RegistryRow, 'activated_at'> | undefined;
      this.byId.set(manifest.id, { manifest, activatedAt: row?.activated_at ?? null });
    } else {
      // Refresh the cached manifest (handles version bumps on restart).
      const entry = this.byId.get(manifest.id)!;
      this.byId.set(manifest.id, { ...entry, manifest });
    }
  }

  markActivated(extensionId: string, at: string = new Date().toISOString()): void {
    this.db.prepare('UPDATE extension_registry SET activated_at = ? WHERE id = ?')
      .run(at, extensionId);
    const entry = this.byId.get(extensionId);
    if (entry) entry.activatedAt = at;
  }

  /**
   * [Review fix §4.2] Record a crash for `extensionId`. Increments `crash_count`,
   * persists `last_error`, and auto-disables the extension if the threshold is
   * reached. Returns the new crash count and whether the extension was auto-disabled.
   *
   * The activation view IPC handler (Task 10) calls this on every caught
   * activation failure. The threshold (`AUTO_DISABLE_CRASH_THRESHOLD`) prevents
   * a repeatedly crashing extension from blocking the renderer with a tight
   * error loop; after `crash_count >= 3` the extension is treated as disabled
   * by `list()` / `views()` / `commands()` and the renderer stops surfacing it.
   */
  recordCrash(extensionId: string, errorMessage: string): { crashCount: number; autoDisabled: boolean } {
    const row = this.db.prepare(
      'SELECT crash_count, enabled FROM extension_registry WHERE id = ?'
    ).get(extensionId) as Pick<RegistryRow, 'crash_count' | 'enabled'> | undefined;

    if (!row) {
      // Extension not in registry yet (e.g., crashing during initial discovery).
      // This is unusual but harmless — log and bail.
      console.warn(`[registry] recordCrash called for unknown extension "${extensionId}"`);
      return { crashCount: 0, autoDisabled: false };
    }

    const newCount = row.crash_count + 1;
    const shouldDisable = newCount >= AUTO_DISABLE_CRASH_THRESHOLD;

    this.db.prepare(`
      UPDATE extension_registry
      SET crash_count = ?, last_error = ?, enabled = CASE WHEN ? THEN 0 ELSE enabled END
      WHERE id = ?
    `).run(newCount, errorMessage, shouldDisable ? 1 : 0, extensionId);

    if (shouldDisable) {
      console.error(
        `[registry] extension "${extensionId}" auto-disabled after ${newCount} crashes ` +
        `(threshold: ${AUTO_DISABLE_CRASH_THRESHOLD}). Last error: ${errorMessage}`
      );
    } else {
      console.warn(`[registry] extension "${extensionId}" crash #${newCount}: ${errorMessage}`);
    }

    return { crashCount: newCount, autoDisabled: shouldDisable };
  }

  /**
   * [Review fix §4.2] Reset crash count and last_error on successful activation.
   * A single success erases the previous failure history so a flaky extension
   * that recovers doesn't stay on the brink of auto-disable.
   */
  clearCrashes(extensionId: string): void {
    this.db.prepare(
      'UPDATE extension_registry SET crash_count = 0, last_error = NULL WHERE id = ?'
    ).run(extensionId);
  }

  isEnabled(extensionId: string): boolean {
    const row = this.db.prepare('SELECT enabled FROM extension_registry WHERE id = ?')
      .get(extensionId) as Pick<RegistryRow, 'enabled'> | undefined;
    return row?.enabled === 1;
  }

  /**
   * Toggle the enabled flag for `extensionId`. Writes through to the
   * `extension_registry.enabled` column only; does NOT mutate the in-memory
   * `byId` cache (the cached manifest stays — only the `enabled` read
   * changes). See `list()` for the per-call re-filter behaviour.
   *
   * **Hot-disable contract (per [Review fix §5.3]):** This is the canonical
   * "disable" call. The behavioural contract for downstream callers:
   *
   *   1. **`ExtensionRegistry.list()` / `views()` / `commands()` — re-filter
   *      on every call.** Each call invokes `isEnabled()` per entry (a DB
   *      read), so disabled extensions are excluded immediately. No cache
   *      invalidation is required.
   *   2. **`extensions:list` IPC handler** — same: returns the fresh
   *      `views()` + `commands()` per call, so disabled extensions disappear
   *      from the next `financeShell.extensions.list()` invocation. Renderer
   *      must re-fetch to see the change.
   *   3. **`extensions:activate-view` IPC handler** — finds the owning
   *      extension via `views().find(...)`, which re-filters via `isEnabled()`.
   *      Disabled extensions are NOT activatable, even if the renderer has a
   *      stale Activity Bar cache. The handler returns
   *      `{ activated: false, reason: 'view not found' }` for disabled views.
   *   4. **`ExtensionIPC.request()` — does NOT check `isEnabled()` itself.**
   *      The IPC transport is a generic RPC pipe; per-extension enable/disable
   *      is the registry's concern, enforced at the IPC-handler level (item 3)
   *      not at the transport level. `host.shutdown` is the only IPC-level
   *      termination.
   *   5. **Activity Bar cache (renderer)** — NOT refreshed. The Activity Bar
   *      renders once on `DOMContentLoaded` from the contributions list. After
   *      `setEnabled(false)`, the stale button remains visible until the user
   *      reloads. Clicks on the stale button flow through `activateView()`,
   *      which then returns `view not found` (item 3) — the user sees a
   *      graceful failure rather than a crash.
   *   6. **Host in-memory activation** — NOT cleared. The Extension Host
   *      keeps the extension's `activate()` result loaded until `host.shutdown`
   *      or process exit. Phase 5 ships an `extension.deactivate` notification
   *      protocol that lets Main tell the Host to unload an active extension
   *      without restarting.
   *
   * Phase 3's interim behaviour: disable takes effect for new IPC calls
   * (items 1–4) immediately, but the renderer UI cache (item 5) and the Host
   * in-memory state (item 6) lag until next startup. The Phase 8 Extension
   * Manager UI is the consumer that drives the end-to-end disable flow.
   */
  setEnabled(extensionId: string, enabled: boolean): void {
    this.db.prepare('UPDATE extension_registry SET enabled = ? WHERE id = ?')
      .run(enabled ? 1 : 0, extensionId);
  }

  /**
   * **Hot-disable contract (per [Review fix §5.3]):** Re-filters on every
   * call — each entry's `isEnabled()` is a fresh DB read, so disabling an
   * extension via `setEnabled(false)` excludes it from the next `list()`
   * call without requiring cache invalidation. Same contract applies to
   * `views()` and `commands()`.
   */
  list(): FinanceExtensionManifest[] {
    return Array.from(this.byId.values())
      .filter((entry) => this.isEnabled(entry.manifest.id))
      .map((entry) => entry.manifest);
  }

  /** Aggregate all enabled extensions' views, in declaration order. */
  views(): Array<{ extensionId: string; view: NonNullable<FinanceExtensionManifest['contributions']['views']>[number] }> {
    const out: Array<{ extensionId: string; view: NonNullable<FinanceExtensionManifest['contributions']['views']>[number] }> = [];
    for (const { manifest } of this.byId.values()) {
      if (!this.isEnabled(manifest.id)) continue;
      for (const view of manifest.contributions.views ?? []) {
        out.push({ extensionId: manifest.id, view });
      }
    }
    return out;
  }

  /** Aggregate all enabled extensions' commands. */
  commands(): Array<{ extensionId: string; command: NonNullable<FinanceExtensionManifest['contributions']['commands']>[number] }> {
    const out: Array<{ extensionId: string; command: NonNullable<FinanceExtensionManifest['contributions']['commands']>[number] }> = [];
    for (const { manifest } of this.byId.values()) {
      if (!this.isEnabled(manifest.id)) continue;
      for (const command of manifest.contributions.commands ?? []) {
        out.push({ extensionId: manifest.id, command });
      }
    }
    return out;
  }

  get(extensionId: string): FinanceExtensionManifest | undefined {
    return this.byId.get(extensionId)?.manifest;
  }
}
