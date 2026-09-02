import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('financeShell', {
  aiTerminal: {
    send: (msg: string) => ipcRenderer.invoke('ai-terminal:send', msg),
    onReceive: (cb: (output: string) => void) => ipcRenderer.on('ai-terminal:receive', (_e, o) => cb(o)),
    toggle: () => ipcRenderer.invoke('ai-terminal:toggle'),
    onToggle: (cb: (visible: boolean) => void) => ipcRenderer.on('ai-terminal:toggle', (_e, v) => cb(v)),
    selectDbPath: () => ipcRenderer.invoke('ai-terminal:select-db-path'),
    resetDbPath: () => ipcRenderer.invoke('ai-terminal:reset-db-path'),
  },
});
