// [Review fix §3.2] Import the canonical manifest contribution shapes from
// `finance.d.ts` instead of redeclaring them here. A shape change in the
// canonical type now propagates automatically; the previous redeclaration
// was a latent drift bug if the types ever diverged.
import type { ManifestViewContribution, ManifestCommandContribution, ManifestNavigationContribution } from './finance';

export type { ManifestNavigationContribution } from './finance';

export interface EventsApi {
  on: (topic: string, callback: (payload: unknown) => void) => () => void;
  emit: (topic: string, payload: unknown) => Promise<void>;
}

export interface BackupApi {
  export: () => Promise<{ success: boolean; path?: string; error?: string }>;
  import: () => Promise<{ success: boolean; error?: string }>;
  exportEncrypted: (password: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  importEncrypted: (password: string) => Promise<{ success: boolean; error?: string }>;
  getLastBackupTime: () => Promise<string | null>;
}

export interface ShortcutsApi {
  list: () => Promise<Array<{ commandId: string; extensionId: string; accelerator: string }>>;
  update: (extensionId: string, commandId: string, accelerator: string) => Promise<Array<{ commandId: string; extensionId: string; accelerator: string }>>;
  reset: (extensionId?: string) => Promise<Array<{ commandId: string; extensionId: string; accelerator: string }>>;
}

export interface SettingsApi {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
}

export interface ManagedExtension {
  id: string;
  displayName: string;
  version: string;
  description?: string;
  enabled: boolean;
  source: 'built-in' | 'user';
  dependencies?: string[];
}

export interface ExtensionsApi {
  list: () => Promise<{
    views: Array<{ extensionId: string; view: ManifestViewContribution }>;
    commands: Array<{ extensionId: string; command: ManifestCommandContribution }>;
    navigation: Array<{ extensionId: string; navigation: ManifestNavigationContribution }>;
    configuration: Array<{ extensionId: string; configuration: ManifestConfigurationContribution }>;
  }>;
  activateView: (viewId: string) => Promise<{ activated: boolean; reason?: string }>;
  executeCommand: (commandId: string, ...args: unknown[]) => Promise<{ executed: boolean; reason?: string; result?: unknown }>;
  managerList: () => Promise<ManagedExtension[]>;
  pickFolder: () => Promise<string | null>;
  pickZip: () => Promise<string | null>;
  install: (source: string) => Promise<{ ok: boolean; reason?: string }>;
  uninstall: (id: string) => Promise<{ ok: boolean; reason?: string }>;
  deleteData: (id: string) => Promise<{ ok: boolean; reason?: string }>;
  setEnabled: (id: string, enabled: boolean) => Promise<{ ok: boolean }>;
  onHostLog: (callback: (entry: HostLogEntry) => void) => () => void;
  onHostStatus: (callback: (status: HostStatus) => void) => () => void;
  onUiMount: (
    callback: (
      payload: {
        extensionId: string;
        componentTag: string;
        mountData?: Record<string, unknown>;
        bundleUrl?: string;
      }
    ) => void
  ) => () => void;
  readTable: (params: unknown) => Promise<unknown>;
  writeTable: (params: unknown) => Promise<unknown>;
  uiEvent: (extensionId: string, eventName: string, detail: unknown) => void;
  onUiEventFromPanel: (callback: (payload: { extensionId: string; eventName: string; detail: unknown }) => void) => () => void;
  onShortcut: (callback: (payload: { accelerator: string; commandId: string; extensionId: string }) => void) => () => void;
}

export interface PanelApi {
  focus: (panelId: string) => void;
  show: (panelId: string) => void;
  hideForOverlay: () => void;
  restoreAfterOverlay: () => void;
  getActive: () => Promise<string | null>;
  list: () => Promise<Array<{ panelId: string; extensionId: string; viewId: string }>>;
  resize: (panelId: string, bounds: { x: number; y: number; width: number; height: number }) => void;
  unmount: (panelId: string) => void;
  unmountAll: () => void;
  onMounted: (callback: (panelId: string) => void) => () => void;
  onUnmounted: (callback: (panelId: string, viewId: string) => void) => () => void;
  onRequestBounds: (callback: (panelId: string) => void) => () => void;
  broadcastTheme: (theme: string) => void;
}

export interface LogEntry {
  level: string;
  message: string;
  context?: string;
  error?: string;
  timestamp: number;
}

/** [Fix] One log entry forwarded from the Extension Host. See
 *  `src/main/services/extension-ipc.ts#HostLogEntry` for the producer side. */
export interface HostLogEntry {
  level: 'log' | 'error' | 'warn';
  args: string[];
}

/**
 * [Fix] Lifecycle status of the Extension Host. Mirrors the producer shape
 * in `src/main/services/extension-ipc.ts#HostStatus`. The renderer uses the
 * `status` discriminant to pick a severity-appropriate `console.*` method.
 */
export type HostStatus =
  | { status: 'starting' }
  | { status: 'ready' }
  | { status: 'crashed'; exitCode: number | null }
  | { status: 'restarting' }
  | { status: 'restart-failed'; error: string };

export interface AccountsApi {
  create: (input: { name: string; institution: string | null }) => Promise<{ id: number }>;
  count: () => Promise<{ count: number }>;
  list: () => Promise<Array<{ id: number; name: string; institution: string | null; is_active: boolean; created_at: string }>>;
  update: (input: { id: number; name: string; institution: string | null; is_active: boolean }) => Promise<{ updated: boolean }>;
  delete: (input: { id: number }) => Promise<{ deleted: boolean }>;
}

export interface FinanceShellApi {
  getVersion: () => Promise<string>;
  settings: SettingsApi;
  extensions: ExtensionsApi;
  events: EventsApi;
  accounts: AccountsApi;
  shortcuts: ShortcutsApi;
  backup: BackupApi;
  panel: PanelApi;
  restartApp: () => Promise<void>;
}

/**
 * Phase 5 Task 3 — subset of `FinanceShellApi` exposed inside WebviewPanels.
 *
 * Panels run the extension's bundled UI code, which accesses `finance.db`,
 * `finance.services`, etc. via the extension host (not via this bridge).
 * The panel preload only exposes the shell-surface APIs the rendered UI
 * needs to interact with the host shell: listing extensions, executing
 * commands, sending UI events, and reading/writing settings.
 */
export interface PanelFinanceShellApi {
  settings: SettingsApi;
  extensions: {
    list: () => Promise<{
      views: Array<{ extensionId: string; view: { id: string; name: string; icon: string } }>;
      commands: Array<{ extensionId: string; command: { id: string; title: string; keybinding?: string } }>;
      navigation: Array<{ extensionId: string; navigation: { id: string; label: string; command: string; group?: string } }>;
    }>;
    executeCommand: (commandId: string, ...args: unknown[]) => Promise<{ executed: boolean; reason?: string }>;
    uiEvent: (extensionId: string, eventName: string, detail: unknown) => void;
    readTable: (params: unknown) => Promise<unknown>;
    writeTable: (params: unknown) => Promise<unknown>;
    setDirty: (extensionId: string, dirty: boolean) => void;
     autoSaveDraft: (extensionId: string) => Promise<void>;
  };
  accounts: AccountsApi;
  theme: {
    get: () => Promise<string>;
    onChange: (callback: (theme: string) => void) => () => void;
    broadcastTheme: (theme: string) => void;
  };
  onPanelInit: (callback: (payload: unknown) => void) => () => void;
  onNavigate: (callback: (payload: unknown) => void) => () => void;
  onMountUpdate: (callback: (payload: unknown) => void) => () => void;
}

declare global {
  interface Window {
    financeShell: FinanceShellApi;
  }
}
