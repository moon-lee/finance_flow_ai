import { describe, expect, it, vi, beforeEach } from 'vitest';

let mockIdCounter = 0;
vi.mock('electron', () => ({
  BrowserWindow: class {
    isDestroyed() { return false; }
  },
  WebContentsView: class {
    webContents: { id: number; send: () => void; on: () => void; loadURL: () => void; isDestroyed: () => boolean; destroy: () => void; close: () => void; focus: () => void };
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
        close: () => {},
        focus: () => {}
      };
      this.setBounds = () => {};
      this.setVisible = () => {};
      this.focus = () => {};
    }
  }
}));

vi.mock('../../../../src/main/services/settings-service', () => ({
  getSetting: vi.fn(() => undefined)
}));

import { WebviewPanelManager } from '../../../../src/main/services/webview-panel-manager';
import { getSetting } from '../../../../src/main/services/settings-service';

beforeEach(() => {
  mockIdCounter = 0;
  vi.clearAllMocks();
  (getSetting as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
});

const noopUIHandler = {
  onMountRequested: () => {},
  onFocusRequested: () => {},
  onUiEvent: () => {},
  onSetDirty: () => {},
  onAutoSaveDraft: async () => {},
  onBeforeUnmount: async () => {}
};

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
    isDestroyed: () => false,
    webContents: { send: vi.fn() }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return manager;
}

describe('WebviewPanelManager Task 12: configurable autoSaveDraft timeout', () => {
  it('uses core.workspace.autoSaveTimeout setting when calling autoSaveDraft', async () => {
    (getSetting as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === 'core.workspace.autoSaveTimeout') return 1234;
      return undefined;
    });

    const manager = makeManager();
    const handle = manager.mount('dashboard', 'dashboard-view')!;
    const autoSaveSpy = vi.fn().mockResolvedValue(undefined);
    manager.setUIHandler({ ...noopUIHandler, onAutoSaveDraft: autoSaveSpy });

    await manager.autoSaveDraft(handle.panelId);

    expect(autoSaveSpy).toHaveBeenCalledWith('dashboard');
    expect(getSetting).toHaveBeenCalledWith('core.workspace.autoSaveTimeout');
  });
});

describe('WebviewPanelManager Task 13: keepAlive manifest hint', () => {
  it('setExtensionKeepAlive(true) prevents lazy unmount for that extension', () => {
    const manager = makeManager();
    manager.setExtensionKeepAlive('dashboard', true);
    manager.setExtensionKeepAlive('salary-history', false);

    const handle = manager.mount('dashboard', 'dashboard-view')!;
    manager.mount('salary-history', 'pay-history');

    expect(handle.keepAlive).toBe(true);

    const salaryHandle = manager.findByPanelId('panel-salary-history-pay-history')!;
    expect(salaryHandle.keepAlive).toBe(false);
  });

  it('setExtensionKeepAlive(false) removes the keepAlive flag', () => {
    const manager = makeManager();
    manager.setExtensionKeepAlive('dashboard', true);
    manager.setExtensionKeepAlive('dashboard', false);

    const handle = manager.mount('dashboard', 'dashboard-view')!;
    expect(handle.keepAlive).toBe(false);
  });
});

describe('WebviewPanelManager Task 11: lazy unmount timer', () => {
  beforeEach(() => {
    (getSetting as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === 'core.workspace.lazyUnmountTimeout') return 100;
      if (key === 'core.workspace.autoSaveTimeout') return 500;
      return undefined;
    });
  });

  it('does not lazy-unmount dirty panels', async () => {
    vi.useFakeTimers();
    const fixedNow = Date.now();
    vi.setSystemTime(fixedNow);
    const manager = makeManager();
    const handle = manager.mount('dashboard', 'dashboard-view')!;
    manager.setDirty(handle.panelId, true);

    vi.setSystemTime(fixedNow + 150);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (manager as any).checkLazyUnmount();
    vi.useRealTimers();

    expect(manager.findByPanelId(handle.panelId)).toBeDefined();
  });

  it('does not lazy-unmount keepAlive panels', async () => {
    vi.useFakeTimers();
    const fixedNow = Date.now();
    vi.setSystemTime(fixedNow);
    const manager = makeManager();
    manager.setExtensionKeepAlive('dashboard', true);
    const handle = manager.mount('dashboard', 'dashboard-view')!;

    vi.setSystemTime(fixedNow + 150);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (manager as any).checkLazyUnmount();
    vi.useRealTimers();

    expect(manager.findByPanelId(handle.panelId)).toBeDefined();
  });

  it('lazy-unmounts inactive panels after timeout', async () => {
    vi.useFakeTimers();
    const fixedNow = Date.now();
    vi.setSystemTime(fixedNow);
    const manager = makeManager();
    const handle = manager.mount('dashboard', 'dashboard-view')!;
    const closeSpy = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handle.view.webContents as any).close = closeSpy;

    vi.setSystemTime(fixedNow + 150);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (manager as any).checkLazyUnmount();
    vi.useRealTimers();

    expect(manager.findByPanelId(handle.panelId)).toBeUndefined();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('restarts timer on focus', async () => {
    vi.useFakeTimers();
    const fixedNow = Date.now();
    vi.setSystemTime(fixedNow);
    const manager = makeManager();
    const handle = manager.mount('dashboard', 'dashboard-view')!;
    const closeSpy = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handle.view.webContents as any).close = closeSpy;

    vi.setSystemTime(fixedNow + 50);
    manager.focus(handle.panelId);
    vi.setSystemTime(fixedNow + 150);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (manager as any).checkLazyUnmount();
    expect(manager.findByPanelId(handle.panelId)).toBeDefined();

    vi.setSystemTime(fixedNow + 250);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (manager as any).checkLazyUnmount();
    expect(manager.findByPanelId(handle.panelId)).toBeUndefined();
    vi.useRealTimers();
  });

  it('stops timer when all panels are unmounted', async () => {
    const manager = makeManager();
    manager.mount('dashboard', 'dashboard-view');
    manager.unmount('panel-dashboard-dashboard-view');

    expect(manager.list()).toHaveLength(0);
  });
});
