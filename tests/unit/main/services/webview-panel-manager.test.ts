import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  WebContentsView: class {
    webContents: { id: number; send: () => void; on: () => void; loadURL: () => void };
    isDestroyed: () => boolean;
    destroy: () => void;
    setVisible: () => void;
    focus: () => void;
    constructor() {
      this.webContents = { id: 42, send: () => {}, on: () => {}, loadURL: () => {} };
      this.isDestroyed = () => false;
      this.destroy = () => {};
      this.setVisible = () => {};
      this.focus = () => {};
    }
  }
}));

import { WebviewPanelManager } from '../../../../src/main/services/webview-panel-manager';

const noopUIHandler = {
  onMountRequested: () => {},
  onFocusRequested: () => {},
  onUiEvent: () => {},
  onSetDirty: () => {},
  onAutoSaveDraft: async () => {}
};

describe('WebviewPanelManager sender-identity (Task 4.1)', () => {
  it('buffers mount requests when mainWindow is not set (onStartup race)', () => {
    const manager = new WebviewPanelManager();
    manager.setUIHandler({ ...noopUIHandler, onMountRequested: () => {} });
    expect(manager.mount('dashboard', 'dashboard-view')).toBeNull();
    expect(manager.mount('salary-history', 'pay-rate-history-view')).toBeNull();
  });

  it('maps a mounted panel to its webContents id so Main can resolve the real extensionId', () => {
    const manager = new WebviewPanelManager();
    manager.setUIHandler(noopUIHandler);
    manager.setMainWindow({
      contentView: {
        addChildView: () => {},
        removeChildView: () => {}
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = manager.mount('salary-history', 'pay-rate-history-view');
    expect(result).not.toBeNull();
    expect(result!.extensionId).toBe('salary-history');
    expect(result!.viewId).toBe('pay-rate-history-view');

    const byId = manager.findPanelByWebContentsId(42);
    expect(byId).not.toBeUndefined();
    expect(byId!.extensionId).toBe('salary-history');
    expect(byId!.panelId).toBe('panel-salary-history-pay-rate-history-view');
  });

  it('returns undefined when the sender is not a known panel (spoofing prevention)', () => {
    const manager = new WebviewPanelManager();
    manager.setUIHandler({ ...noopUIHandler, onMountRequested: () => {} });
    manager.setMainWindow({
      contentView: { addChildView: () => {}, removeChildView: () => {} }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const unknown = manager.findPanelByWebContentsId(9999);
    expect(unknown).toBeUndefined();
  });
});
