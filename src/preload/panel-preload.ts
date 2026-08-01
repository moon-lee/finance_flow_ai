import { contextBridge, ipcRenderer } from 'electron';

const listeners: { [channel: string]: Set<(payload: unknown) => void> } = {
  'panel:init': new Set(),
  'panel:navigate': new Set(),
  'panel:mount-update': new Set(),
};
const cachedPayloads: { [channel: string]: unknown } = {};

ipcRenderer.on('panel:init', (_event, payload: unknown) => {
  cachedPayloads['panel:init'] = payload;
  for (const fn of listeners['panel:init'] ?? []) {
    try { fn(payload); } catch { /* ignore listener errors */ }
  }
  listeners['panel:init'].clear();
});

ipcRenderer.on('panel:navigate', (_event, payload: unknown) => {
  for (const fn of listeners['panel:navigate'] ?? []) {
    try { fn(payload); } catch { /* ignore listener errors */ }
  }
});

ipcRenderer.on('panel:mount-update', (_event, payload: unknown) => {
  for (const fn of listeners['panel:mount-update'] ?? []) {
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
    },
    readTable: (params: unknown): Promise<unknown> => ipcRenderer.invoke('extensions:read-table', params),
    writeTable: (params: unknown): Promise<unknown> => ipcRenderer.invoke('extensions:write-table', params),
  },
  accounts: {
    create: (input: { name: string; institution: string | null }): Promise<{ id: number }> =>
      ipcRenderer.invoke('accounts:create', input),
    count: (): Promise<{ count: number }> => ipcRenderer.invoke('accounts:count'),
  },
  settings: {
    get: async (key: string): Promise<unknown> => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke('settings:set', key, value)
  },
  onPanelInit(callback: (payload: unknown) => void): () => void {
    const cached = cachedPayloads['panel:init'];
    if (cached !== undefined) {
      try { callback(cached); } catch { /* ignore */ }
      return () => {};
    }
    listeners['panel:init'].add(callback);
    return () => { listeners['panel:init'].delete(callback); };
  },
  onNavigate(callback: (payload: unknown) => void): () => void {
    listeners['panel:navigate'].add(callback);
    return () => { listeners['panel:navigate'].delete(callback); };
  },
  onMountUpdate(callback: (payload: unknown) => void): () => void {
    listeners['panel:mount-update'].add(callback);
    return () => { listeners['panel:mount-update'].delete(callback); };
  }
};

contextBridge.exposeInMainWorld('financeShell', panelApi);
