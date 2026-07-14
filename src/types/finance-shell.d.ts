// [Review fix §3.2] Import the canonical manifest contribution shapes from
// `finance.d.ts` instead of redeclaring them here. A shape change in the
// canonical type now propagates automatically; the previous redeclaration
// was a latent drift bug if the types ever diverged.
import type { ManifestViewContribution, ManifestCommandContribution } from './finance';

export interface SettingsApi {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
}

export interface ExtensionsApi {
  list: () => Promise<{
    views: Array<{ extensionId: string; view: ManifestViewContribution }>;
    commands: Array<{ extensionId: string; command: ManifestCommandContribution }>;
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
}

export interface FinanceShellApi {
  getVersion: () => Promise<string>;
  settings: SettingsApi;
  extensions: ExtensionsApi;
  accounts: AccountsApi;
}

declare global {
  interface Window {
    financeShell: FinanceShellApi;
  }
}
