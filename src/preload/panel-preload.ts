import { contextBridge, ipcRenderer } from 'electron';

const listeners: { [channel: string]: Set<(payload: unknown) => void> } = {};

ipcRenderer.on('panel:init', (_event, payload: unknown) => {
  for (const fn of listeners['panel:init'] ?? []) {
    try { fn(payload); } catch { /* ignore listener errors */ }
  }
});

ipcRenderer.on('panel:allowlist-denied', (_event, payload: { kind: string; extensionId: string; eventName: string; reason: string }) => {
  console.warn(`[panel] allowlist denied (${payload.kind}): ${payload.reason}`);
});

const panelApi = {
  extensions: {
    list: (): Promise<{
      views: Array<{ extensionId: string; view: { id: string; name: string; icon: string } }>;
      commands: Array<{ extensionId: string; command: { id: string; title: string; keybinding?: string } }>;
    }> => ipcRenderer.invoke('extensions:list'),
    executeCommand: (commandId: string, ...args: unknown[]): Promise<{ executed: boolean; reason?: string }> =>
      ipcRenderer.invoke('extensions:execute-command', commandId, ...args),
    uiEvent: (extensionId: string, eventName: string, detail: unknown): void => {
      ipcRenderer.send('extensions:ui-event', extensionId, eventName, detail);
    }
  },
  settings: {
    get: async (key: string): Promise<unknown> => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke('settings:set', key, value)
  },
  onPanelInit(callback: (payload: unknown) => void): () => void {
    listeners['panel:init'].add(callback);
    return () => { listeners['panel:init'].delete(callback); };
  }
};

contextBridge.exposeInMainWorld('financeShell', panelApi);
