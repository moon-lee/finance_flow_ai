import { contextBridge, ipcRenderer } from 'electron';

const shellApi = {
  getVersion: async (): Promise<string> => ipcRenderer.invoke('shell:get-version') as Promise<string>,
  settings: {
    get: async (key: string): Promise<unknown> => ipcRenderer.invoke('settings:get', key),
    set: async (key: string, value: unknown): Promise<void> => { await ipcRenderer.invoke('settings:set', key, value); }
  },
  extensions: {
    list: async (): Promise<{
      views: Array<{ extensionId: string; view: { id: string; name: string; icon: string } }>;
      commands: Array<{ extensionId: string; command: { id: string; title: string; keybinding?: string } }>;
    }> => ipcRenderer.invoke('extensions:list'),
    activateView: async (viewId: string): Promise<{ activated: boolean; reason?: string }> =>
      ipcRenderer.invoke('extensions:activate-view', viewId),
    // [Review fix §4.6] Phase 3: wire the execute-command IPC channel end-to-end
    // so the round-trip is observable. Phase 5 will add a per-extension command
    // allowlist on the Main side; see Self-Review §7 Security deferral note.
    executeCommand: async (commandId: string, ...args: unknown[]): Promise<{ executed: boolean; reason?: string; result?: unknown }> =>
      ipcRenderer.invoke('extensions:execute-command', commandId, ...args) as Promise<{ executed: boolean; reason?: string; result?: unknown }>
  }
};

contextBridge.exposeInMainWorld('financeShell', shellApi);
