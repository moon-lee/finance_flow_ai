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

describe('ExtensionIPC UI-mount channel (Task 14)', () => {
  it('invokes the UI handler on a ui-mount request (mount push)', () => {
    const ipc = new ExtensionIPC();
    const calls: Array<{ extId: string; componentTag: string; mountData?: Record<string, unknown> }> = [];
    ipc.setUIHandler((extId, req) => calls.push({ extId, componentTag: req.componentTag, mountData: req.mountData }));
    ipc.handleUiMount({ extensionId: 'salary-history', componentTag: 'payslip-list', mountData: { a: 1 } });
    expect(calls).toHaveLength(1);
    expect(calls[0].extId).toBe('salary-history');
    expect(calls[0].componentTag).toBe('payslip-list');
    expect(calls[0].mountData).toEqual({ a: 1 });
  });

  it('forwards mountData through unchanged (event ack envelope)', () => {
    const ipc = new ExtensionIPC();
    let captured: { extensionId: string; componentTag: string; mountData?: Record<string, unknown> } | null = null;
    ipc.setUIHandler((_extId, req) => {
      captured = req;
    });
    ipc.handleUiMount({ extensionId: 'salary-history', componentTag: 'pay-rate-history-view' });
    expect(captured).not.toBeNull();
    expect(captured!.componentTag).toBe('pay-rate-history-view');
    expect(captured!.extensionId).toBe('salary-history');
    expect(captured!.mountData).toBeUndefined();
  });

  it('does not throw when no UI handler is registered (error path)', () => {
    const ipc = new ExtensionIPC();
    expect(() =>
      ipc.handleUiMount({ extensionId: 'salary-history', componentTag: 'payslip-list' })
    ).not.toThrow();
  });

  it('routes multiple extensions to separate handler calls (multiple extensions)', () => {
    const ipc = new ExtensionIPC();
    const seen: string[] = [];
    ipc.setUIHandler((extId) => seen.push(extId));
    ipc.handleUiMount({ extensionId: 'salary-history', componentTag: 'payslip-list' });
    ipc.handleUiMount({ extensionId: 'budget', componentTag: 'budget-view' });
    expect(seen).toEqual(['salary-history', 'budget']);
  });
});

describe('ExtensionIPC settings namespace enforcement (Task 16)', () => {
  it('rejects a settings key outside the extension namespace', () => {
    const ipc = new ExtensionIPC();
    // `salary-history` must not be able to read/write `tax.financialYearStart`.
    // The namespace guard throws before touching the settings service, so no
    // settings initialisation is required for this assertion.
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
