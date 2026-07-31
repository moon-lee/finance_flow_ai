/**
 * Phase 5 Fix 2 — unit tests for the activate-and-open orchestration.
 *
 * `activateView` historically only loaded the extension's Host module. Once
 * the module is already active (`ext.moduleUrl` set — e.g. salary-history now
 * activates `onStartup`), the Host early-returns `true` and an activity-bar
 * click became a no-op: the view's panel was never mounted. The fix opens the
 * view's panel after a successful activation, reusing the same requestMount /
 * dedup path as `extension:request-mount`.
 */

import { describe, it, expect, vi } from 'vitest';
import { activateAndOpenView, type ViewActivationDeps } from '../../../../src/main/services/view-activation';

describe('activateAndOpenView (Phase 5 Fix 2 — activate + open)', () => {
  it('opens the view panel when activation succeeds', async () => {
    const openView = vi.fn();
    const activate = vi.fn().mockResolvedValue(true);
    const deps: ViewActivationDeps = { activate, openView };

    const activated = await activateAndOpenView(deps, 'salary-history', 'payslip-list');

    expect(activated).toBe(true);
    expect(activate).toHaveBeenCalledWith('salary-history', 'onView:payslip-list');
    expect(openView).toHaveBeenCalledWith('salary-history', 'payslip-list');
  });

  it('opens the view panel even when the extension was already active', async () => {
    // The Host returns `true` without loading the bundle when `ext.moduleUrl`
    // is set — the already-active case that made the old contract a no-op.
    const openView = vi.fn();
    const activate = vi.fn().mockResolvedValue(true);
    const deps: ViewActivationDeps = { activate, openView };

    await activateAndOpenView(deps, 'salary-history', 'payslip-list');

    expect(openView).toHaveBeenCalledTimes(1);
  });

  it('does not open the view panel when activation fails', async () => {
    const openView = vi.fn();
    const activate = vi.fn().mockResolvedValue(false);
    const deps: ViewActivationDeps = { activate, openView };

    const activated = await activateAndOpenView(deps, 'salary-history', 'payslip-list');

    expect(activated).toBe(false);
    expect(openView).not.toHaveBeenCalled();
  });

  it('propagates activation errors so the caller can record the crash', async () => {
    const openView = vi.fn();
    const activate = vi.fn().mockRejectedValue(new Error('host crashed'));
    const deps: ViewActivationDeps = { activate, openView };

    await expect(activateAndOpenView(deps, 'salary-history', 'payslip-list')).rejects.toThrow(
      'host crashed'
    );
    expect(openView).not.toHaveBeenCalled();
  });

  // ---- Phase 5 Fix 3 — openCommand contract (Host-computed view data) ----
  //
  // The dashboard's data is computed in the Host (real `pay` services) and
  // shipped to the panel as mountData; the panel's own services are noops, so
  // a mount without mountData renders empty. Views that depend on Host-computed
  // data declare an `openCommand`; the activate-view path executes it in the
  // Host (fresh data) instead of mounting a data-less panel via requestMount.

  it('executes the view openCommand instead of mounting directly when provided', async () => {
    const openView = vi.fn();
    const activate = vi.fn().mockResolvedValue(true);
    const runOpenCommand = vi.fn().mockResolvedValue(true);
    const deps: ViewActivationDeps = { activate, openView, runOpenCommand };

    const activated = await activateAndOpenView(
      deps,
      'dashboard',
      'dashboard-view',
      'dashboard.refresh'
    );

    expect(activated).toBe(true);
    expect(runOpenCommand).toHaveBeenCalledWith('dashboard', 'dashboard.refresh');
    expect(openView).not.toHaveBeenCalled();
  });

  it('falls back to opening the view when the openCommand reports not-executed', async () => {
    const openView = vi.fn();
    const activate = vi.fn().mockResolvedValue(true);
    const runOpenCommand = vi.fn().mockResolvedValue(false);
    const deps: ViewActivationDeps = { activate, openView, runOpenCommand };

    await activateAndOpenView(deps, 'dashboard', 'dashboard-view', 'dashboard.refresh');

    expect(runOpenCommand).toHaveBeenCalledTimes(1);
    expect(openView).toHaveBeenCalledWith('dashboard', 'dashboard-view');
  });

  it('does not run the openCommand when activation fails', async () => {
    const openView = vi.fn();
    const activate = vi.fn().mockResolvedValue(false);
    const runOpenCommand = vi.fn();
    const deps: ViewActivationDeps = { activate, openView, runOpenCommand };

    const activated = await activateAndOpenView(
      deps,
      'dashboard',
      'dashboard-view',
      'dashboard.refresh'
    );

    expect(activated).toBe(false);
    expect(runOpenCommand).not.toHaveBeenCalled();
    expect(openView).not.toHaveBeenCalled();
  });
});
