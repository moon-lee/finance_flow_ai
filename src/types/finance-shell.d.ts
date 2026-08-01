// [Review fix §3.2] Import the canonical manifest contribution shapes from
// `finance.d.ts` instead of redeclaring them here. A shape change in the
// canonical type now propagates automatically; the previous redeclaration
// was a latent drift bug if the types ever diverged.
import type { ManifestViewContribution, ManifestCommandContribution, ManifestNavigationContribution } from './finance';

export type { ManifestNavigationContribution } from './finance';

export interface SettingsApi {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
}

export interface ExtensionsApi {
  list: () => Promise<{
    views: Array<{ extensionId: string; view: ManifestViewContribution }>;
    commands: Array<{ extensionId: string; command: ManifestCommandContribution }>;
    navigation: Array<{ extensionId: string; navigation: ManifestNavigationContribution }>;
  }>;
  activateView: (viewId: string) => Promise<{ activated: boolean; reason?: string }>;
  // [Review fix §4.6] Wires the renderer to call extension commands through the
  // Main IPC channel. Returns `{ executed: boolean; reason?: string; result?: unknown }`
  // mirroring the Main-side handler's response shape.
  executeCommand: (commandId: string, ...args: unknown[]) => Promise<{ executed: boolean; reason?: string; result?: unknown }>;
  // [Fix] Subscribe to Host log entries (forwarded from `extension-ipc.ts`
  // via the `extensions:host-log` IPC channel). Used to mirror Host stdout
  // (including extension `console.log` calls) into the Renderer DevTools
  // console so Test Unit 4's expected log output is visible to manual testers.
  // Returns an unsubscribe function.
  onHostLog: (callback: (entry: HostLogEntry) => void) => () => void;
  // [Fix] Subscribe to Extension Host lifecycle status changes (forwarded
  // from `extension-ipc.ts` via the `extensions:host-status` IPC channel).
  // Used to surface crash / restart / ready events in the Renderer DevTools
  // console (Test Unit 5 step 6 expectation) and is the integration point
  // for the Phase 4+ status-bar UI. Returns an unsubscribe function.
  onHostStatus: (callback: (status: HostStatus) => void) => () => void;
  // Phase 4 Task 14 — subscribe to UI-mount requests. The callback receives
  // `{ extensionId, componentTag, mountData, bundleUrl }`; the renderer mounts
  // the named custom element (after dynamically importing the extension
  // bundle at `bundleUrl`).
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
  // Phase 4 Task 14 — renderer-side DB proxy (delegates to the DAO service in
  // Main, the same one the Host uses).
  readTable: (params: unknown) => Promise<unknown>;
  writeTable: (params: unknown) => Promise<unknown>;
  // Phase 4 Task 14 (Decision 12) — push a component-emitted event back to
  // the Extension Host.
  uiEvent: (extensionId: string, eventName: string, detail: unknown) => void;
  // Phase 5 Task 4 — subscribe to ui-events forwarded from panels through Main.
  onUiEventFromPanel: (callback: (payload: { extensionId: string; eventName: string; detail: unknown }) => void) => () => void;
  // Phase 5 Task 12 — workspace panel controls (focus + resize).
  panel: {
    focus: (panelId: string) => void;
    show: (panelId: string) => void;
    hideForOverlay: () => void;
    restoreAfterOverlay: () => void;
    getActive: () => Promise<string | null>;
    list: () => Promise<Array<{ panelId: string; extensionId: string; viewId: string }>>;
    resize: (panelId: string, bounds: { x: number; y: number; width: number; height: number }) => void;
    unmount: (panelId: string) => void;
    unmountAll: () => void;
  };
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
  /** Core-owned account creation (the `accounts` table is read-only for
   * extensions per Decision 4, so the first-run seed modal routes its write
   * here rather than through `finance.db`). Returns the new row id. */
  create: (input: { name: string; institution: string | null }) => Promise<{ id: number }>;
  /** Core-owned account count — no Extension IPC required. */
  count: () => Promise<{ count: number }>;
}

export interface FinanceShellApi {
  getVersion: () => Promise<string>;
  settings: SettingsApi;
  extensions: ExtensionsApi;
  accounts: AccountsApi;
  panel: {
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
    onRequestBounds: (callback: (panelId: string) => void) => () => void;
  };
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
  };
  accounts: AccountsApi;
  onPanelInit: (callback: (payload: unknown) => void) => () => void;
  onNavigate: (callback: (payload: unknown) => void) => () => void;
  onMountUpdate: (callback: (payload: unknown) => void) => () => void;
}

declare global {
  interface Window {
    financeShell: FinanceShellApi;
  }
}
