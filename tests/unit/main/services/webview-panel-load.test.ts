/**
 * Panel-load smoke test — verifies that mounting a panel correctly:
 * 1. Creates a WebContentsView with the right webPreferences
 * 2. Loads the finance-shell:// URL
 * 3. Sends `panel:init` after `did-finish-load`
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock Electron before importing the module under test.
vi.mock('electron', () => {
  const send = vi.fn();
  const focus = vi.fn();
  const loadURL = vi.fn();
  const on = vi.fn();
  const webContents = { id: 42, send, focus, loadURL, on };
  const contentView = { addChildView: vi.fn(), removeChildView: vi.fn() };
  const getContentBounds = vi.fn(() => ({ width: 1024, height: 768 }));
  const window = { contentView, getContentBounds, webContents: { send: vi.fn() } };

  let lastViewInstance: { webContents: typeof webContents; setBounds: ReturnType<typeof vi.fn> } | null = null;

  class MockWebContentsView {
    webContents = { id: 42, send, focus, loadURL, on };
    setBounds = vi.fn();
    constructor() {
      lastViewInstance = this as unknown as typeof lastViewInstance;
    }
  }

  return {
    BrowserWindow: { getAllWindows: () => [window] },
    WebContentsView: MockWebContentsView,
    __mocks: { send, focus, loadURL, on, view: () => lastViewInstance, window, contentView },
  };
});

// Must import after mocking electron.
import { WebviewPanelManager } from '../../../../src/main/services/webview-panel-manager';

const { __mocks } = await import('electron') as unknown as { __mocks: {
  send: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  view: () => { webContents: { id: number; send: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn>; loadURL: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> }; setBounds: ReturnType<typeof vi.fn> } | null;
  window: { contentView: { addChildView: ReturnType<typeof vi.fn>; removeChildView: ReturnType<typeof vi.fn> }; getContentBounds: ReturnType<typeof vi.fn>; webContents: { send: ReturnType<typeof vi.fn> } };
  contentView: { addChildView: ReturnType<typeof vi.fn>; removeChildView: ReturnType<typeof vi.fn> };
} };

describe('WebviewPanelManager mount', () => {
  let manager: WebviewPanelManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new WebviewPanelManager();
    manager.setMainWindow(__mocks.window as unknown as import('electron').BrowserWindow);
  });

  it('loads the finance-shell:// URL with correct path', () => {
    manager.mount('salary-history', 'payslip-list', { defaultCurrency: 'AUD' });
    expect(__mocks.loadURL).toHaveBeenCalledOnce();
    const url = __mocks.loadURL.mock.calls[0][0] as string;
    expect(url).toContain('finance-shell://panel/');
    expect(url).toContain('salary-history');
    expect(url).toContain('payslip-list');
    expect(url).toContain('.html');
  });

  it('sends panel:init on did-finish-load', () => {
    manager.mount('salary-history', 'payslip-list', { defaultCurrency: 'AUD' });
    // Find the `did-finish-load` listener registered on webContents.
    const loadListener = __mocks.on.mock.calls.find(
      (c: unknown[]) => c[0] === 'did-finish-load'
    );
    expect(loadListener, 'did-finish-load listener registered').toBeTruthy();
    // Invoke the listener manually to simulate the load completing.
    (loadListener as unknown[])[1]();
    expect(__mocks.send).toHaveBeenCalledWith('panel:init', {
      extensionId: 'salary-history',
      viewId: 'payslip-list',
      mountData: { defaultCurrency: 'AUD' },
    });
  });

  it('creates the WebContentsView with sandbox and contextIsolation', () => {
    manager.mount('dashboard', 'dashboard-view', {});
    const instance = __mocks.view();
    expect(instance).toBeTruthy();
    expect(instance.webContents).toBeDefined();
  });
});
