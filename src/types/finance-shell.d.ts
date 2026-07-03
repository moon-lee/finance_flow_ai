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
}

export interface FinanceShellApi {
  getVersion: () => Promise<string>;
  settings: SettingsApi;
  extensions: ExtensionsApi;
}

declare global {
  interface Window {
    financeShell: FinanceShellApi;
  }
}
