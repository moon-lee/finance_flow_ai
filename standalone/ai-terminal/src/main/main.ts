import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { AiTerminalService } from './services/ai-terminal-service.js';
import { AiOpencodeService } from './services/ai-opencode-service.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const aiTerminalService = new AiTerminalService();
const fallbackDb = join(app.getPath('appData'), 'Finance Flow AI Dev', 'finance.db');
const aiOpencodeService = new AiOpencodeService(fallbackDb, {}, 'opencode/big-pickle');
let terminalVisible = true;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const devUrl = 'http://localhost:5173';
  // try dev server, fallback to built file
  mainWindow.loadURL(devUrl).catch(() => {
    mainWindow?.loadFile(join(__dirname, '../../dist/renderer/index.html'));
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  const userDb = aiTerminalService.getDbPath();
  if (userDb) aiOpencodeService.setDbPath(userDb);
  console.log(`[ai-terminal] DB path: ${aiOpencodeService.getDbPath()} (fallback: ${fallbackDb}, user: ${userDb || '(none)'})`);
  console.log(`[ai-terminal] Model: opencode/big-pickle`);
  console.log(`[ai-terminal] System prompt: ${aiOpencodeService.getSystemPrompt().slice(0,120)}...`);

  ipcMain.handle('ai-terminal:send', async (_e, prompt: string) => {
    console.log(`[ai-terminal] IPC ai-terminal:send "${prompt.slice(0,60)}"`);
    try {
      const out = await aiOpencodeService.query(prompt);
      console.log(`[ai-terminal] IPC send ok ${out.length} chars`);
      return { ok: true, output: out };
    } catch (err) {
      console.log(`[ai-terminal] IPC send error ${String(err)}`);
      return { ok: false, output: String(err) };
    }
  });
  ipcMain.handle('ai-terminal:toggle', () => {
    terminalVisible = !terminalVisible;
    aiTerminalService.setVisible(terminalVisible);
    mainWindow?.webContents.send('ai-terminal:toggle', terminalVisible);
    return terminalVisible;
  });
  ipcMain.handle('ai-terminal:select-db-path', async () => {
    const p = await aiOpencodeService.selectDbPath();
    if (p && p !== fallbackDb) aiTerminalService.setDbPath(p);
    return p;
  });
  ipcMain.handle('ai-terminal:reset-db-path', async () => {
    aiTerminalService.setDbPath('');
    aiOpencodeService.setDbPath(fallbackDb);
    return fallbackDb;
  });

  const menu = Menu.buildFromTemplate([
    {
      label: 'View',
      submenu: [
        { label: 'Toggle AI-Terminal', accelerator: 'CmdOrCtrl+J', click: () => { terminalVisible = !terminalVisible; aiTerminalService.setVisible(terminalVisible); mainWindow?.webContents.send('ai-terminal:toggle', terminalVisible); } },
        { label: 'Select Database File…', click: async () => { const p = await aiOpencodeService.selectDbPath(); if (p) aiTerminalService.setDbPath(p); } },
        { label: 'Reset Database File', click: async () => { aiTerminalService.setDbPath(''); aiOpencodeService.setDbPath(fallbackDb); } },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
  createWindow();
  // auto-warm opencode so first question is instant (like most software)
  void (async () => {
    const ok = await aiOpencodeService.isInstalled();
    if (!ok) console.log('[ai-terminal] opencode not installed — run npm install -g opencode-ai');
    else { console.log('[ai-terminal] warming opencode serve…'); await aiOpencodeService.serve(); console.log('[ai-terminal] opencode ready'); }
  })();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', async () => { await aiOpencodeService.stop(); });
