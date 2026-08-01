import { describe, expect, it, vi, beforeEach } from 'vitest';

let mockIdCounter = 0;
vi.mock('electron', () => ({
  BrowserWindow: class {},
  WebContentsView: class {
    webContents: { id: number; send: () => void; on: () => void; loadURL: () => void; isDestroyed: () => boolean; destroy: () => void; close: () => void };
    setBounds: () => void;
    setVisible: () => void;
    focus: () => void;
    constructor() {
      mockIdCounter++;
      this.webContents = { 
        id: mockIdCounter, 
        send: () => {}, 
        on: () => {}, 
        loadURL: () => {}, 
        isDestroyed: () => false, 
        destroy: () => {},
        close: () => {}
      };
      this.setBounds = () => {};
      this.setVisible = () => {};
      this.focus = () => {};
    }
  }
}));

import { WebviewPanelManager } from '../../../../src/main/services/webview-panel-manager';

beforeEach(() => {
  mockIdCounter = 0;
});

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
        removeChildView: () => {},
        getBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
        setVisible: () => {}
      },
      getContentBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
      webContents: { send: vi.fn() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = manager.mount('salary-history', 'pay-rate-history-view');
    expect(result).not.toBeNull();
    expect(result!.extensionId).toBe('salary-history');
    expect(result!.viewId).toBe('pay-rate-history-view');

    const byId = manager.findPanelByWebContentsId(1);
    expect(byId).not.toBeUndefined();
    expect(byId!.extensionId).toBe('salary-history');
    expect(byId!.panelId).toBe('panel-salary-history-pay-rate-history-view');
  });

  it('returns undefined when the sender is not a known panel (spoofing prevention)', () => {
    const manager = new WebviewPanelManager();
    manager.setUIHandler({ ...noopUIHandler, onMountRequested: () => {} });
    manager.setMainWindow({
      contentView: { 
        addChildView: () => {}, 
        removeChildView: () => {},
        getBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
        setVisible: () => {}
      },
      getContentBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
      webContents: { send: vi.fn() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const unknown = manager.findPanelByWebContentsId(9999);
    expect(unknown).toBeUndefined();
  });
});

describe('WebviewPanelManager lifecycle (Phase 5 additional tests)', () => {
  function makeManager() {
    const manager = new WebviewPanelManager();
    manager.setUIHandler(noopUIHandler);
    manager.setMainWindow({
      contentView: {
        addChildView: () => {},
        removeChildView: () => {},
        getBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
        setVisible: () => {}
      },
      getContentBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
      webContents: { send: vi.fn() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return manager;
  }

  it('mount() creates a panel handle', () => {
    const manager = makeManager();
    const handle = manager.mount('dashboard', 'dashboard-view');

    expect(handle).not.toBeNull();
    expect(handle!.panelId).toBe('panel-dashboard-dashboard-view');
    expect(handle!.extensionId).toBe('dashboard');
    expect(handle!.viewId).toBe('dashboard-view');
    expect(handle!.view).toBeDefined();
  });

  it('unmount() removes the handle', () => {
    const manager = makeManager();
    manager.mount('dashboard', 'dashboard-view');
    manager.unmount('panel-dashboard-dashboard-view');

    const panels = manager.list();
    expect(panels).toHaveLength(0);
    expect(manager.findByPanelId('panel-dashboard-dashboard-view')).toBeUndefined();
  });

  it('focus() calls webContents.focus()', () => {
    const focusSpy = vi.fn();
    // Override the mock to track focus calls
    const manager = new WebviewPanelManager();
    manager.setUIHandler(noopUIHandler);
    manager.setMainWindow({
      contentView: { 
        addChildView: () => {}, 
        removeChildView: () => {},
        getBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
        setVisible: () => {}
      },
      getContentBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
      webContents: { send: vi.fn() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const handle = manager.mount('dashboard', 'dashboard-view');
    if (handle) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handle.view.webContents as any).focus = focusSpy;
      manager.focus('panel-dashboard-dashboard-view');
      expect(focusSpy).toHaveBeenCalled();
    }
  });

  it('list() returns all open panels', () => {
    const manager = makeManager();
    manager.mount('dashboard', 'dashboard-view');
    manager.mount('salary-history', 'pay-history');

    const panels = manager.list();
    expect(panels).toHaveLength(2);
    const ids = panels.map(p => p.panelId);
    expect(ids).toContain('panel-dashboard-dashboard-view');
    expect(ids).toContain('panel-salary-history-pay-history');
  });

  it('destroyAll() destroys all panels', async () => {
    const destroySpy = vi.fn();
    const manager = new WebviewPanelManager();
    manager.setUIHandler(noopUIHandler);
    manager.setMainWindow({
      contentView: { 
        addChildView: () => {}, 
        removeChildView: () => {},
        getBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
        setVisible: () => {}
      },
      getContentBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
      webContents: { send: vi.fn() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    manager.mount('dashboard', 'dashboard-view');
    manager.mount('salary-history', 'pay-history');

    // Patch the close method on the views' webContents
    for (const panel of manager.list()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (panel.view.webContents as any).close = destroySpy;
    }

    await manager.destroyAll();

    expect(manager.list()).toHaveLength(0);
    expect(destroySpy).toHaveBeenCalledTimes(2);
  });
});

describe('WebviewPanelManager overlay coordination', () => {
  function makeManager() {
    const manager = new WebviewPanelManager();
    manager.setUIHandler(noopUIHandler);
    manager.setMainWindow({
      contentView: {
        addChildView: () => {},
        removeChildView: () => {},
        getBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
        setVisible: () => {}
      },
      getContentBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
      webContents: { send: vi.fn() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return manager;
  }

  it('hidePanelsForOverlay() hides every panel; restorePanels() re-shows the active panel', () => {
    const manager = makeManager();
    const setVisibleSpy = vi.fn();
    manager.mount('dashboard', 'dashboard-view');
    manager.mount('salary-history', 'pay-history');
    const handle = manager.findByPanelId('panel-dashboard-dashboard-view')!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handle.view as any).setVisible = setVisibleSpy;

    manager.showPanel('panel-dashboard-dashboard-view');
    setVisibleSpy.mockClear();

    manager.hidePanelsForOverlay();
    expect(setVisibleSpy).toHaveBeenCalledWith(false);

    manager.restorePanels();
    expect(setVisibleSpy).toHaveBeenCalledWith(true);
    expect(manager.getActivePanelId()).toBe('panel-dashboard-dashboard-view');
  });

  it('resize() does not re-show a panel while the overlay is active', () => {
    const manager = makeManager();
    const setVisibleSpy = vi.fn();
    manager.mount('dashboard', 'dashboard-view');
    const handle = manager.findByPanelId('panel-dashboard-dashboard-view')!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handle.view as any).setVisible = setVisibleSpy;

    manager.showPanel('panel-dashboard-dashboard-view');
    manager.hidePanelsForOverlay();
    setVisibleSpy.mockClear();

    manager.resize('panel-dashboard-dashboard-view', { x: 0, y: 0, width: 800, height: 600 });

    expect(setVisibleSpy).not.toHaveBeenCalledWith(true);

    manager.restorePanels();
    expect(setVisibleSpy).toHaveBeenCalledWith(true);
  });

  it('hidePanelsForOverlay() / restorePanels() are no-ops with no panels', () => {
    const manager = makeManager();
    expect(() => manager.hidePanelsForOverlay()).not.toThrow();
    expect(() => manager.restorePanels()).not.toThrow();
    expect(manager.getActivePanelId()).toBeNull();
  });
});
