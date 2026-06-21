import { app, BrowserWindow, ipcMain, screen, dialog } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase, registerMigration, closeDatabase } from './services/database-service';
import { infrastructureMigration } from './services/infrastructure-migration';
import { initializeSettings, closeSettings, getSetting, setSetting } from './services/settings-service';

const mainDir = fileURLToPath(new URL('.', import.meta.url));
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;

let mainWindow: BrowserWindow | null = null;
let windowStateSaveTimer: ReturnType<typeof setTimeout> | null = null;
let dbClosed = false;

function resolvePreloadPath(): string {
  return join(mainDir, '../preload/preload.cjs');
}

function resolveRendererIndex(): string {
  return join(mainDir, '../renderer/index.html');
}

function resolveDatabasePath(): string {
  // Phase 2 keeps the database in Electron's default app data folder.
  // Future custom DB path support should read a tiny bootstrap config
  // here before SQLite opens; do not store the DB path only inside
  // the DB itself, because startup would not know which DB to open.
  return join(app.getPath('userData'), 'finance.db');
}

function clearWindowStateSaveTimer(): void {
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer);
    windowStateSaveTimer = null;
  }
}

function saveWindowState(): void {
  if (!mainWindow || dbClosed) return;
  const maximized = mainWindow.isMaximized();
  setSetting('core.window.maximized', maximized);
  if (!maximized) {
    const bounds = mainWindow.getBounds();
    setSetting('core.window.x', bounds.x);
    setSetting('core.window.y', bounds.y);
    setSetting('core.window.width', bounds.width);
    setSetting('core.window.height', bounds.height);
  }
}

function debouncedSaveWindowState(): void {
  if (dbClosed) return;
  clearWindowStateSaveTimer();
  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = null;
    saveWindowState();
  }, 500);
}

function resolveInitialBounds(): { width: number; height: number; x?: number; y?: number } {
  const width = getSetting<number>('core.window.width') ?? 1280;
  const height = getSetting<number>('core.window.height') ?? 820;
  const x = getSetting<number>('core.window.x');
  const y = getSetting<number>('core.window.y');

  // If no saved position, let Electron centre the window.
  if (x === undefined || y === undefined) {
    return { width, height };
  }

  // Validate that the saved rect intersects at least one currently
  // connected display work area. Otherwise the window would open
  // off-screen (e.g. saved on a monitor that is no longer attached).
  const intersects = screen.getAllDisplays().some(display => {
    const wa = display.workArea;
    return !(
      x + width <= wa.x ||
      x >= wa.x + wa.width ||
      y + height <= wa.y ||
      y >= wa.y + wa.height
    );
  });

  return intersects ? { width, height, x, y } : { width, height };
}

export async function createWindow(): Promise<BrowserWindow> {
  const bounds = resolveInitialBounds();
  const savedMaximized = getSetting<boolean>('core.window.maximized') ?? false;
  const theme = getSetting<string>('core.theme') ?? 'dark';
  const backgroundColor = theme === 'light' ? '#f8fafc' : '#1e1e1e';

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    ...(bounds.x !== undefined ? { x: bounds.x } : {}),
    ...(bounds.y !== undefined ? { y: bounds.y } : {}),
    minWidth: 960,
    minHeight: 640,
    backgroundColor: backgroundColor,
    title: 'Finance Flow AI',
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (savedMaximized) {
    mainWindow.maximize();
  }

  mainWindow.on('resize', debouncedSaveWindowState);
  mainWindow.on('move', debouncedSaveWindowState);
  mainWindow.on('close', () => {
    saveWindowState();
    clearWindowStateSaveTimer();
  });

  if (rendererDevUrl) {
    await mainWindow.loadURL(rendererDevUrl);
  } else {
    await mainWindow.loadFile(resolveRendererIndex());
  }

  return mainWindow;
}

function registerIpcHandlers(): void {
  ipcMain.handle('shell:get-version', () => app.getVersion());

  // Settings IPC handlers log service errors before returning them to
  // the renderer. `get` collapses to `undefined` because the renderer
  // treats it as "missing"; `set` rethrows so persistence failures are
  // visible to callers and tests.
  ipcMain.handle('settings:get', (_event, key: string) => {
    try {
      return getSetting(key);
    } catch (err) {
      console.error(`settings:get failed for key "${key}":`, err);
      return undefined;
    }
  });

  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    try {
      setSetting(key, value);
    } catch (err) {
      console.error(`settings:set failed for key "${key}":`, err);
      throw err;
    }
  });

}

function shutdownPersistence(): void {
  dbClosed = true;
  clearWindowStateSaveTimer();
  closeSettings();
  closeDatabase();
}

registerMigration(infrastructureMigration);
registerIpcHandlers();

app.whenReady().then(() => {
  try {
    const dbPath = resolveDatabasePath();
    initializeDatabase(dbPath);
    initializeSettings();
    void createWindow();
  } catch (err) {
    console.error('Fatal error during app initialization:', err);
    dialog.showErrorBox(
      'Startup Error',
      `Finance Flow AI encountered a fatal error during startup:\n\n${err instanceof Error ? err.message : String(err)}\n\nPlease check the logs and try again.`
    );
    app.quit();
  }

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

app.on('will-quit', shutdownPersistence);
