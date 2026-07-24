/**
 * Phase 4 Task 14.7 + Task 16 — unit tests for the UI-mount IPC channel
 * pair and the extension-settings namespace guard.
 *
 * These exercise the testable core of the Host→Main→Renderer mount path
 * (`ExtensionIPC.handleUiMount` + `setUIHandler`) and the Task 16 settings
 * namespace enforcement on `ExtensionIPC`, without spinning up the Electron
 * process tree. The full mount (dynamic bundle import + DOM render) is a
 * manual verification step (Test Unit per plan).
 */

import { describe, it, expect } from 'vitest';
import { ExtensionIPC } from '../../../../src/main/services/extension-ipc';

const noopHandler = {
  onMountRequested: () => {},
  onFocusRequested: () => {},
  onUiEvent: () => {},
  onSetDirty: () => {},
  onAutoSaveDraft: async () => {}
};

describe('ExtensionIPC UI-mount channel (Task 14)', () => {
  it('invokes the UI handler on a ui-mount request (mount push)', () => {
    const ipc = new ExtensionIPC();
    const calls: Array<{ extId: string; viewId: string; mountData?: Record<string, unknown> }> = [];
    ipc.setUIHandler({
      ...noopHandler,
      onMountRequested: (extId, viewId, mountData) => calls.push({ extId, viewId, mountData: mountData as Record<string, unknown> })
    });
    ipc.handleUiMount({ extensionId: 'salary-history', viewId: 'payslip-list', mountData: { a: 1 } });
    expect(calls).toHaveLength(1);
    expect(calls[0].extId).toBe('salary-history');
    expect(calls[0].viewId).toBe('payslip-list');
    expect(calls[0].mountData).toEqual({ a: 1 });
  });

  it('forwards mountData through unchanged (event ack envelope)', () => {
    const ipc = new ExtensionIPC();
    let captured: { extensionId: string; viewId: string; mountData?: Record<string, unknown> } | null = null;
    ipc.setUIHandler({
      ...noopHandler,
      onMountRequested: (extId, viewId, mountData) => {
        captured = { extensionId: extId, viewId, mountData: mountData as Record<string, unknown> };
      }
    });
    ipc.handleUiMount({ extensionId: 'salary-history', viewId: 'pay-rate-history-view' });
    expect(captured).not.toBeNull();
    expect(captured!.viewId).toBe('pay-rate-history-view');
    expect(captured!.extensionId).toBe('salary-history');
    expect(captured!.mountData).toBeUndefined();
  });

  it('does not throw when no UI handler is registered (error path)', () => {
    const ipc = new ExtensionIPC();
    expect(() =>
      ipc.handleUiMount({ extensionId: 'salary-history', viewId: 'payslip-list' })
    ).not.toThrow();
  });

  it('routes multiple extensions to separate handler calls (multiple extensions)', () => {
    const ipc = new ExtensionIPC();
    const seen: string[] = [];
    ipc.setUIHandler({
      ...noopHandler,
      onMountRequested: (extId) => seen.push(extId)
    });
    ipc.handleUiMount({ extensionId: 'salary-history', viewId: 'payslip-list' });
    ipc.handleUiMount({ extensionId: 'budget', viewId: 'budget-view' });
    expect(seen).toEqual(['salary-history', 'budget']);
  });
});

describe('ExtensionIPC settings namespace enforcement (Task 16)', () => {
  it('rejects a settings key outside the extension namespace', () => {
    const ipc = new ExtensionIPC();
    expect(() =>
      ipc.handleGetSetting({ extensionId: 'salary-history', key: 'tax.financialYearStart' })
    ).toThrow(/namespace/);
  });

  it('accepts a correctly namespaced key (does not throw the namespace error)', () => {
    const ipc = new ExtensionIPC();
    expect(() =>
      ipc.handleGetSetting({ extensionId: 'salary-history', key: 'salary-history.defaultCurrency' })
    ).not.toThrow(/namespace/);
  });
});
