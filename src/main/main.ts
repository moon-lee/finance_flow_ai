import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mainDir = fileURLToPath(new URL('.', import.meta.url));
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;

function resolvePreloadPath(): string {
  return join(mainDir, '../preload/preload.cjs');
}

function resolveRendererIndex(): string {
  return join(mainDir, '../renderer/index.html');
}

export async function createWindow(): Promise<BrowserWindow> {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#1e1e1e',
    title: 'Finance Flow AI',
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (rendererDevUrl) {
    await mainWindow.loadURL(rendererDevUrl);
  } else {
    await mainWindow.loadFile(resolveRendererIndex());
  }

  return mainWindow;
}

ipcMain.handle('shell:get-version', () => app.getVersion());

app.whenReady().then(() => {
  void createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
