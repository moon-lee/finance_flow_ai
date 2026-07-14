import { app, BrowserWindow, ipcMain, screen, dialog } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase, registerMigration, closeDatabase, getDatabase } from './services/database-service';
import { infrastructureMigration, extensionCrashTrackingMigration } from './services/infrastructure-migration';
import { initializeSettings, closeSettings, getSetting, setSetting } from './services/settings-service';
import { discoverExtensions } from './services/extension-loader';
import { ExtensionRegistry } from './services/extension-registry';
import { ExtensionIPC } from './services/extension-ipc';
import { RPC_METHOD } from '../shared/json-rpc-methods';
import { TableSchemaRegistry } from './services/table-schema-registry';
import { DAOService } from './services/dao-service';
import { SHARED_TABLE_MANIFESTS } from './services/shared-data-tables';

const mainDir = fileURLToPath(new URL('.', import.meta.url));
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;

// Force the app name before any path lookup. Without this,
// unpackaged dev launches (`electron dist/main/main.js`) report
// `app.getName() === 'Electron'` and `app.getPath('userData')` then
// resolves to `%APPDATA%/Electron/` instead of the production
// path `%APPDATA%/Finance Flow AI/`. `productName` in package.json
// is only honoured for packaged builds; for unpackaged dev we must
// override explicitly. Pairing `productName` (for production) with
// `app.setName(...)` (for dev) keeps userData identical in both
// modes so the Phase 2 plan's expected path matches reality.
app.setName('Finance Flow AI');

let mainWindow: BrowserWindow | null = null;
let windowStateSaveTimer: ReturnType<typeof setTimeout> | null = null;
let dbClosed = false;
let extensionRegistry: ExtensionRegistry | null = null;
let extensionIPC: ExtensionIPC | null = null;
let tableSchemaRegistry: TableSchemaRegistry | null = null;
let daoService: DAOService | null = null;

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

function resolveExtensionsRoot(): string {
  // Phase 3: extensions live inside the repo at the project root, e.g.
  // `D:\finance_flow_ai\extensions\`. mainDir is `dist/main/` (the directory
  // of the running bundled main.js), so '..' x2 brings us up to the project
  // root. Using `app.getAppPath()` here would resolve to `dist/main/extensions`
  // because Electron's getAppPath() returns the directory of the running
  // entry point in unpackaged mode. Phase 8 will add a user-data root.
  return join(mainDir, '..', '..', 'extensions');
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

  ipcMain.handle('extensions:list', () => {
    if (!extensionRegistry) return { views: [], commands: [] };
    return {
      views: extensionRegistry.views(),
      commands: extensionRegistry.commands()
    };
  });

  // [Follow-up §3.9] Main-side activate-view try/catch error handling
  // [Review fix §4.2] Calls `extensionRegistry.recordCrash()` on activation failure
  // so the registry can auto-disable persistently-crashing extensions after
  // `AUTO_DISABLE_CRASH_THRESHOLD` crashes. The auto-disable status is forwarded
  // to the renderer via `extensions:host-status` so the status bar can surface it.
  // [Review fix §5.3] Hot-disable contract: `views().find(...)` re-filters by
  // `isEnabled()` per call, so a stale Activity Bar button click on a disabled
  // extension returns `{ activated: false, reason: 'view not found' }` here
  // before any IPC traffic to the Host. The Host is therefore unreachable
  // for disabled extensions even with a stale renderer cache.
  ipcMain.handle('extensions:activate-view', async (_event, viewId: string) => {
    if (!extensionIPC || !extensionRegistry) return { activated: false, reason: 'host not running' };

    // Find the extension that owns this view BEFORE the try block so the catch
    // handler has the extension id available for recordCrash(). The find()
    // call invokes views() which re-filters by isEnabled() — a disabled
    // extension's view does not appear here.
    const owning = extensionRegistry.views().find((v) => v.view.id === viewId);
    if (!owning) return { activated: false, reason: 'view not found' };
    const owningExtensionId = owning.extensionId;

    try {
      const result = await extensionIPC.request<{ activated: boolean }>('extension.activate', {
        extensionId: owningExtensionId,
        reason: `onView:${viewId}`
      });
      if (result.activated) {
        extensionRegistry.markActivated(owningExtensionId);
        extensionRegistry.clearCrashes(owningExtensionId);
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`extensions:activate-view failed for "${viewId}":`, message);

      // Record the crash so the registry can auto-disable after threshold.
      const { crashCount, autoDisabled } = extensionRegistry.recordCrash(owningExtensionId, message);

      // If auto-disable kicked in, push a host-status notification so the
      // renderer can update its UI. The ExtensionIPC owns the status listener
      // pipeline; we reuse it for this extension-scoped status.
      if (autoDisabled && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('extensions:host-status', {
          status: 'extension-auto-disabled',
          extensionId: owningExtensionId,
          crashCount
        });
      }

      return { activated: false, reason: message, crashCount, autoDisabled };
    }
  });

  // [Review fix §2.3] Phase 3 stub: prove the IPC channel exists end-to-end by
  // forwarding extension command execution to the Host. The Host handler is a
  // thin wrapper around the existing `finance.commands.execute` stub. Phase 5
  // will swap the stub for real execution; the Main-side handler is unchanged.
  ipcMain.handle(
    'extensions:execute-command',
    async (_event, commandId: string, ...args: unknown[]) => {
      if (!extensionIPC) return { executed: false, reason: 'host not running' };
      try {
        const result = await extensionIPC.request<{ executed: boolean; result: unknown }>(
          'extension.executeCommand',
          { commandId, args }
        );
        return result;
      } catch (err) {
        return { executed: false, reason: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // Phase 4 Task 14 — renderer-side DB proxy. The mounted extension UI
  // (running in the Renderer) reads/writes its tables through these
  // channels; Main forwards each call to the Host (which relays to the
  // DAO service), reusing the exact envelope the extension's own code uses.
  ipcMain.handle('extensions:read-table', async (_event, params) => {
    if (!extensionIPC) return null;
    return extensionIPC.request(RPC_METHOD.ExtensionReadTable, params);
  });
  ipcMain.handle('extensions:write-table', async (_event, params) => {
    if (!extensionIPC) return null;
    return extensionIPC.request(RPC_METHOD.ExtensionWriteTable, params);
  });

  // Phase 4 Task 14 (Decision 12) — renderer pushes a component event back
  // to the Host via a notification (no response expected).
  ipcMain.on('extensions:ui-event', (_event, extensionId: string, eventName: string, detail: unknown) => {
    if (!extensionIPC) return;
    extensionIPC.notify(RPC_METHOD.ExtensionUiEvent, { extensionId, eventName, detail });
  });
}

function shutdownPersistence(): void {
  dbClosed = true;
  clearWindowStateSaveTimer();
  void extensionIPC?.stop().catch((err) => console.error('Extension IPC shutdown failed:', err));
  extensionIPC = null;
  daoService = null;
  tableSchemaRegistry = null;
  closeSettings();
  closeDatabase();
}

registerMigration(infrastructureMigration);
registerMigration(extensionCrashTrackingMigration);

// SINGLE POINT OF REGISTRATION. Do not invoke registerIpcHandlers() anywhere
// else in this file or in any module imported during bootstrap. Duplicate
// registration throws ERR_DLOPEN_FAILED-style errors from ipcMain.handle.
// The plan's body accidentally included a second call inside app.whenReady();
// this comment marks the single legitimate call site. See [Review fix §HOST-5].
registerIpcHandlers();

app.whenReady().then(() => {
  try {
    const dbPath = resolveDatabasePath();
    // [Review fix §3.5] Log the resolved database path so Test Unit 6 (and
    // any future manual debugging) knows where the SQLite file lives without
    // guessing platform-specific %APPDATA%/XDG_CONFIG_HOME paths.
    console.log(`[main] database path: ${dbPath}`);
    initializeDatabase(dbPath);
    initializeSettings();

    // Boot extensions BEFORE the window so the renderer can fetch contributions on first paint.
    // Phase 4 Task 9.2 — instantiate the schema registry and DAO service
    // before extension discovery so the loader can register extension
    // tables as soon as each manifest passes validation.
    tableSchemaRegistry = new TableSchemaRegistry();
    tableSchemaRegistry.registerSharedTables(SHARED_TABLE_MANIFESTS);

    // The DAO service needs a live SQLite handle. `initializeDatabase` has
    // already opened (or created) the DB above; `getDatabase()` returns the
    // module-level handle. The DAO and registry are passed to ExtensionIPC
    // below so Host-side `extension.readTable` / `extension.writeTable`
    // requests can be dispatched against real tables.
    daoService = new DAOService(getDatabase(), tableSchemaRegistry);

    extensionRegistry = new ExtensionRegistry();
    const discovery = discoverExtensions(resolveExtensionsRoot(), {
      tableSchemaRegistry
    });
    for (const { manifest } of discovery.extensions) {
      extensionRegistry.upsert(manifest);
    }
    for (const skipped of discovery.skipped) {
      // [Fix] Use console.log (stdout) instead of console.warn (stderr) so
      // the skip message is visible in all terminal configurations,
      // including Windows PowerShell where stderr may not be shown by
      // default. Manual testing of Test Unit 7 surfaced the warning
      // being emitted but not visible.
      console.log(`[extensions] skipped "${skipped.directory}": ${skipped.reason}`);
    }

    extensionIPC = new ExtensionIPC();

    // Phase 4 Task 9.3 — wire the DAO service into ExtensionIPC so the
    // Host's `extension.readTable` / `extension.writeTable` RPCs are
    // handled by the DAO service rather than returning a "not wired"
    // error. This MUST happen before `extensionIPC.start()` so the
    // message handlers are ready when the Host sends its first request.
    extensionIPC.setDAOService(daoService);

    // Phase 4 Task 14.1 — forward extension UI-mount requests to the
    // Renderer so it can dynamically import the bundle and mount the
    // element. The Host has no DOM, so this Main→Renderer hop is the
    // only way to realise a UI mount.
    extensionIPC.setUIHandler((extensionId, mountRequest) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('extensions:ui-mount', mountRequest);
      }
    });

    extensionIPC.start(extensionRegistry.list()).catch((err) => {
      // [Review fix §2.2] Replace fire-and-forget `void` with an explicit
      // .catch() so startup failures (missing bundle, sandbox restrictions,
      // handshake timeout) are logged cleanly instead of becoming unhandled
      // promise rejections. The renderer still boots; it just sees an empty
      // contribution list until the host recovers (see §2.1 crash recovery).
      console.error('[extensions] Extension Host failed to start:', err);
    });

    // Forward host lifecycle events to the renderer so the status bar can
    // surface crash / restart / unavailable state. See Test Unit 5.
    extensionIPC.onHostStatus((status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('extensions:host-status', status);
      }
    });

    // [Fix] Mirror Host stdout (and extension console.log calls) into the
    // Renderer DevTools console. See Test Unit 4's expectation that the
    // extension's handler output is visible in DevTools. The renderer
    // subscribes via `financeShell.extensions.onHostLog()` exposed in
    // `src/preload/preload.ts`.
    extensionIPC.onHostLog((entry) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('extensions:host-log', entry);
      }
    });

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
