/**
 * Phase 5 Fix 2 — activate-and-open orchestration for the `extensions:activate-view`
 * IPC handler.
 *
 * `activateView` historically only loaded the extension's Host module. Once the
 * module is already active (`ext.moduleUrl` set — e.g. salary-history now activates
 * `onStartup`), the Host early-returns `true` and an activity-bar click became a
 * no-op: the view's panel was never mounted. Opening the view's panel here, through
 * the same `requestMount`/dedup path as `extension:request-mount`, makes an
 * activity-bar click both activate AND open (re-showing the panel if it exists).
 *
 * Phase 5 Fix 3 — `openCommand` contract. Views whose data is Host-computed
 * (e.g. dashboard aggregates shipped as mountData) render empty when the panel
 * is mounted without mountData, because the panel's own `services.invoke` is a
 * no-op. Such views declare an `openCommand`; when provided, it is executed in
 * the Host (real service bindings → fresh mountData) instead of mounting a
 * data-less panel. `openView` remains the fallback when no openCommand exists
 * or the command reports not-executed.
 */

export interface ViewActivationDeps {
  /** Activate the extension's Host module. Resolves `true` even when already active. */
  activate: (extensionId: string, reason: string) => Promise<boolean>;
  /** Open (mount or re-show) the view's panel. */
  openView: (extensionId: string, viewId: string) => void;
  /**
   * Execute the view's `openCommand` in the Host. Resolves `true` when the
   * command was executed (found and ran); `false` when not (missing command).
   * When provided AND the command executes, `openView` is skipped.
   */
  runOpenCommand?: (extensionId: string, commandId: string) => Promise<boolean>;
}

export async function activateAndOpenView(
  deps: ViewActivationDeps,
  extensionId: string,
  viewId: string,
  openCommandId?: string
): Promise<boolean> {
  const activated = await deps.activate(extensionId, `onView:${viewId}`);
  if (activated) {
    if (openCommandId && deps.runOpenCommand) {
      const executed = await deps.runOpenCommand(extensionId, openCommandId);
      if (!executed) {
        deps.openView(extensionId, viewId);
      }
    } else {
      deps.openView(extensionId, viewId);
    }
  }
  return activated;
}
