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

import { describe, it, expect, vi } from 'vitest';
import { ExtensionIPC } from '../../../../src/main/services/extension-ipc';
import { DomainServiceRegistry } from '../../../../src/main/services/domain-service-registry';

const noopHandler = {
  onMountRequested: () => {},
  onFocusRequested: () => {},
  onUiEvent: () => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onSetDirty: (_extensionId: string, _dirty: boolean) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onAutoSaveDraft: async (_extensionId: string) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onBeforeUnmount: async (_extensionId: string) => {}
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
      ipc.handleGetSetting({ extensionId: 'salary-history', key: 'core.defaultCurrency' })
    ).not.toThrow(/namespace/);
  });
});

describe('ExtensionIPC domain-service responses', () => {
  it('awaits domain service results before posting them back to the Host', async () => {
    const ipc = new ExtensionIPC();
    const postMessage = vi.fn();
    const registry = new DomainServiceRegistry();
    registry.register('pay', 'salary-history', {
      getCurrentRate: vi.fn().mockResolvedValue({ effective_from: '2026-07-01' })
    });

    ipc.setDomainServiceRegistry(registry);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ipc as any).process = { postMessage };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ipc as any).dispatchHostRequest({
      jsonrpc: '2.0',
      id: 7,
      method: 'domain.service.invoke',
      params: {
        callerExtensionId: 'dashboard',
        serviceName: 'pay',
        method: 'getCurrentRate',
        params: {}
      }
    });

    expect(postMessage).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 7,
      result: { effective_from: '2026-07-01' }
    });
  });
});
