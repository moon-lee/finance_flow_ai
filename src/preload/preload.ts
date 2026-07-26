import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { HostLogEntry, HostStatus } from '../types/finance-shell';

const shellApi = {
    getVersion: async (): Promise<string> => ipcRenderer.invoke('shell:get-version') as Promise<string>,
  settings: {
    get: async (key: string): Promise<unknown> => ipcRenderer.invoke('settings:get', key),
    set: async (key: string, value: unknown): Promise<void> => { await ipcRenderer.invoke('settings:set', key, value); }
  },
  // Core-owned account creation (the `accounts` table is read-only for
  // extensions per Decision 4). The first-run seed modal calls this instead
  // of `finance.db.table('accounts').insert(...)`.
  accounts: {
    create: async (input: { name: string; institution: string | null }): Promise<{ id: number }> =>
      ipcRenderer.invoke('accounts:create', input) as Promise<{ id: number }>
  },
  extensions: {
    list: async (): Promise<{
      views: Array<{ extensionId: string; view: { id: string; name: string; icon: string } }>;
      commands: Array<{ extensionId: string; command: { id: string; title: string; keybinding?: string } }>;
      navigation: Array<{ extensionId: string; navigation: { id: string; label: string; command: string; group?: string } }>;
    }> => ipcRenderer.invoke('extensions:list'),
    activateView: async (viewId: string): Promise<{ activated: boolean; reason?: string }> =>
      ipcRenderer.invoke('extensions:activate-view', viewId),
    // [Review fix §4.6] Phase 3: wire the execute-command IPC channel end-to-end
    // so the round-trip is observable. Phase 5 will add a per-extension command
    // allowlist on the Main side; see Self-Review §7 Security deferral note.
    executeCommand: async (commandId: string, ...args: unknown[]): Promise<{ executed: boolean; reason?: string; result?: unknown }> =>
      ipcRenderer.invoke('extensions:execute-command', commandId, ...args) as Promise<{ executed: boolean; reason?: string; result?: unknown }>,
    // [Fix] Subscribe to Host log entries forwarded by Main. Returns an
    // unsubscribe function. The bridge only forwards `level` and `args`
    // (sanitised strings on the Host side) so the renderer receives a
    // structured payload it can `console[level](...)` directly.
    onHostLog: (callback: (entry: HostLogEntry) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, entry: HostLogEntry): void => callback(entry);
      ipcRenderer.on('extensions:host-log', listener);
      return () => { ipcRenderer.off('extensions:host-log', listener); };
    },
    // [Fix] Subscribe to Extension Host lifecycle status changes forwarded by
    // Main (Test Unit 5 step 6 expectation: renderer observes 'crashed' status
    // after killing the Host). Returns an unsubscribe function.
    onHostStatus: (callback: (status: HostStatus) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, status: HostStatus): void => callback(status);
      ipcRenderer.on('extensions:host-status', listener);
      return () => { ipcRenderer.off('extensions:host-status', listener); };
    },
    // Phase 4 Task 14 — subscribe to UI-mount requests forwarded by Main
    // (which received them from the Extension Host). The callback receives
    // `{ extensionId, componentTag, mountData, bundleUrl }`; the renderer
    // dynamically imports the extension bundle (at `bundleUrl`) and mounts
    // the named element. Returns an unsubscribe function.
    onUiMount: (
      callback: (
        payload: {
          extensionId: string;
          componentTag: string;
          mountData?: Record<string, unknown>;
          bundleUrl?: string;
        }
      ) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        payload: {
          extensionId: string;
          componentTag: string;
          mountData?: Record<string, unknown>;
          bundleUrl?: string;
        }
      ): void => callback(payload);
      ipcRenderer.on('extensions:ui-mount', listener);
      return () => { ipcRenderer.off('extensions:ui-mount', listener); };
    },
    // Phase 4 Task 14 — renderer-side DB proxy. Mounted extension elements
    // read/write their extension-owned tables through these channels, which
    // delegate to the same DAO service the Host uses.
    readTable: (params: unknown): Promise<unknown> => ipcRenderer.invoke('extensions:read-table', params),
    writeTable: (params: unknown): Promise<unknown> => ipcRenderer.invoke('extensions:write-table', params),
    // Phase 4 Task 14 (Decision 12) — send a component-emitted CustomEvent
    // name + detail back to the Host so the extension can react.
    uiEvent: (extensionId: string, eventName: string, detail: unknown): void => {
      ipcRenderer.send('extensions:ui-event', extensionId, eventName, detail);
    },
    // Phase 5 Task 4 - subscribe to ui-events that come back from panels
    // via Main.
    onUiEventFromPanel: (callback: (payload: { extensionId: string; eventName: string; detail: unknown }) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: { extensionId: string; eventName: string; detail: unknown }): void => callback(payload);
      ipcRenderer.on('extensions:ui-event-from-panel', listener);
      return () => { ipcRenderer.off('extensions:ui-event-from-panel', listener); };
    },
  },
  // Phase 5 Task 12 — workspace panel controls (top-level, not nested under extensions).
  panel: {
    focus: (panelId: string): void => { console.log('[preload] panel.focus', panelId); ipcRenderer.send('panel:focus', panelId); },
    show: (panelId: string): void => { console.log('[preload] panel.show', panelId); ipcRenderer.send('panel:show', panelId); },
    getActive: (): Promise<string | null> => ipcRenderer.invoke('panel:active'),
    resize: (panelId: string, bounds: { x: number; y: number; width: number; height: number }): void => {
      console.log('[preload] panel.resize', { panelId, bounds });
      ipcRenderer.send('panel:resize', panelId, bounds);
    },
    unmount: (panelId: string): void => {
      console.log('[preload] panel.unmount', panelId);
      ipcRenderer.send('panel:unmount', panelId);
    },
    onMounted: (callback: (panelId: string) => void): (() => void) => {
      console.log('[preload] panel.onMounted subscriber registered');
      const listener = (_event: IpcRendererEvent, panelId: string): void => {
        console.log('[preload] panel.onMounted fired', panelId);
        callback(panelId);
      };
      ipcRenderer.on('panel:mounted', listener);
      return () => { ipcRenderer.off('panel:mounted', listener); };
    },
    onRequestBounds: (callback: (panelId: string) => void): (() => void) => {
      console.log('[preload] panel.onRequestBounds subscriber registered');
      const listener = (_event: IpcRendererEvent, panelId: string): void => {
        console.log('[preload] panel.onRequestBounds fired', panelId);
        callback(panelId);
      };
      ipcRenderer.on('workspace:request-bounds', listener);
      return () => { ipcRenderer.off('workspace:request-bounds', listener); };
    }
  }
};

contextBridge.exposeInMainWorld('financeShell', shellApi);
