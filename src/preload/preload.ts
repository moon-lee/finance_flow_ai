import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { HostLogEntry, HostStatus } from '../types/finance-shell';

const shellApi = {
    getVersion: async (): Promise<string> => ipcRenderer.invoke('shell:get-version') as Promise<string>,
  settings: {
    get: async (key: string): Promise<unknown> => ipcRenderer.invoke('settings:get', key),
    set: async (key: string, value: unknown): Promise<void> => { await ipcRenderer.invoke('settings:set', key, value); }
  },
  accounts: {
    create: async (input: { name: string; institution: string | null }): Promise<{ id: number }> =>
      ipcRenderer.invoke('accounts:create', input) as Promise<{ id: number }>,
    count: async (): Promise<{ count: number }> =>
      ipcRenderer.invoke('accounts:count') as Promise<{ count: number }>,
    list: async (): Promise<Array<{ id: number; name: string; institution: string | null; is_active: boolean; created_at: string }>> =>
      ipcRenderer.invoke('accounts:list') as Promise<Array<{ id: number; name: string; institution: string | null; is_active: boolean; created_at: string }>>,
    update: async (input: { id: number; name: string; institution: string | null; is_active: boolean }): Promise<{ updated: boolean }> =>
      ipcRenderer.invoke('accounts:update', input) as Promise<{ updated: boolean }>,
    delete: async (input: { id: number }): Promise<{ deleted: boolean }> =>
      ipcRenderer.invoke('accounts:delete', input) as Promise<{ deleted: boolean }>,
  },
  shortcuts: {
    list: (): Promise<Array<{ commandId: string; extensionId: string; accelerator: string }>> =>
      ipcRenderer.invoke('shortcuts:list'),
    update: (extensionId: string, commandId: string, accelerator: string): Promise<Array<{ commandId: string; extensionId: string; accelerator: string }>> =>
      ipcRenderer.invoke('shortcuts:update', extensionId, commandId, accelerator),
    reset: (extensionId?: string): Promise<Array<{ commandId: string; extensionId: string; accelerator: string }>> =>
      ipcRenderer.invoke('shortcuts:reset', extensionId),
  },
  extensions: {
    list: async (): Promise<{
      views: Array<{ extensionId: string; view: { id: string; name: string; icon: string } }>;
      commands: Array<{ extensionId: string; command: { id: string; title: string; keybinding?: string } }>;
      navigation: Array<{ extensionId: string; navigation: { id: string; label: string; command: string; group?: string; icon?: string } }>;
      configuration: Array<{ extensionId: string; configuration: { key: string; type: string; label: string; default?: unknown; enumOptions?: string[] } }>;
    }> => ipcRenderer.invoke('extensions:list'),
    activateView: async (viewId: string): Promise<{ activated: boolean; reason?: string }> =>
      ipcRenderer.invoke('extensions:activate-view', viewId),
    executeCommand: async (commandId: string, ...args: unknown[]): Promise<{ executed: boolean; reason?: string; result?: unknown }> =>
      ipcRenderer.invoke('extensions:execute-command', commandId, ...args) as Promise<{ executed: boolean; reason?: string; result?: unknown }>,
    onHostLog: (callback: (entry: HostLogEntry) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, entry: HostLogEntry): void => callback(entry);
      ipcRenderer.on('extensions:host-log', listener);
      return () => { ipcRenderer.off('extensions:host-log', listener); };
    },
    onHostStatus: (callback: (status: HostStatus) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, status: HostStatus): void => callback(status);
      ipcRenderer.on('extensions:host-status', listener);
      return () => { ipcRenderer.off('extensions:host-status', listener); };
    },
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
    readTable: (params: unknown): Promise<unknown> => ipcRenderer.invoke('extensions:read-table', params),
    writeTable: (params: unknown): Promise<unknown> => ipcRenderer.invoke('extensions:write-table', params),
    uiEvent: (extensionId: string, eventName: string, detail: unknown): void => {
      ipcRenderer.send('extensions:ui-event', extensionId, eventName, detail);
    },
    onUiEventFromPanel: (callback: (payload: { extensionId: string; eventName: string; detail: unknown }) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: { extensionId: string; eventName: string; detail: unknown }): void => callback(payload);
      ipcRenderer.on('extensions:ui-event-from-panel', listener);
      return () => { ipcRenderer.off('extensions:ui-event-from-panel', listener); };
    },
    onShortcut: (callback: (payload: { accelerator: string; commandId: string; extensionId: string }) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: { accelerator: string; commandId: string; extensionId: string }): void => callback(payload);
      ipcRenderer.on('shell:shortcut', listener);
      return () => { ipcRenderer.off('shell:shortcut', listener); };
    },
  },
  events: {
    on: (topic: string, callback: (payload: unknown) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: { topic: string; payload: unknown }): void => callback(payload.payload);
      ipcRenderer.on('shell:event', listener);
      void ipcRenderer.invoke('event:subscribe', topic);
      return () => { ipcRenderer.off('shell:event', listener); };
    },
    emit: (topic: string, payload: unknown): Promise<void> =>
      ipcRenderer.invoke('event:publish', { topic, payload })
  },
  panel: {
    focus: (panelId: string): void => { ipcRenderer.send('panel:focus', panelId); },
    show: (panelId: string): void => { ipcRenderer.send('panel:show', panelId); },
    hideForOverlay: (): void => { ipcRenderer.send('panel:hide-overlay'); },
    restoreAfterOverlay: (): void => { ipcRenderer.send('panel:restore-overlay'); },
    getActive: (): Promise<string | null> => ipcRenderer.invoke('panel:active'),
    list: (): Promise<Array<{ panelId: string; extensionId: string; viewId: string }>> => ipcRenderer.invoke('panel:list'),
    resize: (panelId: string, bounds: { x: number; y: number; width: number; height: number }): void => {
      ipcRenderer.send('panel:resize', panelId, bounds);
    },
    unmount: (panelId: string): void => {
      ipcRenderer.send('panel:unmount', panelId);
    },
    unmountAll: (): void => {
      ipcRenderer.send('panel:unmount-all');
    },
    broadcastTheme: (theme: string): void => {
      ipcRenderer.send('theme:broadcast', theme);
    },
    onMounted: (callback: (panelId: string) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, panelId: string): void => {
        callback(panelId);
      };
      ipcRenderer.on('panel:mounted', listener);
      return () => { ipcRenderer.off('panel:mounted', listener); };
    },
    onUnmounted: (callback: (panelId: string, viewId: string) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, panelId: string, viewId: string): void => {
        callback(panelId, viewId);
      };
      ipcRenderer.on('panel:unmounted', listener);
      return () => { ipcRenderer.off('panel:unmounted', listener); };
    },
    onRequestBounds: (callback: (panelId: string) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, panelId: string): void => {
        callback(panelId);
      };
      ipcRenderer.on('workspace:request-bounds', listener);
      return () => { ipcRenderer.off('workspace:request-bounds', listener); };
    },
  },
  backup: {
    export: async (): Promise<{ success: boolean; path?: string; error?: string }> => ipcRenderer.invoke('backup:export'),
    import: async (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('backup:import'),
    exportEncrypted: async (password: string): Promise<{ success: boolean; path?: string; error?: string }> => ipcRenderer.invoke('backup:export-encrypted', password),
    importEncrypted: async (password: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('backup:import-encrypted', password),
    getLastBackupTime: async (): Promise<string | null> => ipcRenderer.invoke('backup:get-last-time'),
  },
};

contextBridge.exposeInMainWorld('financeShell', shellApi);
