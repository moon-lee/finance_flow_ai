import { app, BrowserWindow, ipcMain, protocol, screen, dialog } from "electron";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  initializeDatabase,
  registerAllMigrations,
  closeDatabase,
  getDatabase,
} from "./services/database-service";
import { AccountManagementService } from "./services/account-management";
import {
  initializeSettings,
  closeSettings,
  getSetting,
  setSetting,
  registerExtensionNamespace,
  registerSettingDefault,
} from "./services/settings-service";
import { discoverExtensions } from "./services/extension-loader";
import { discoverExtensionsInRoots } from "./services/extension-catalog";
import { ExtensionRegistry } from "./services/extension-registry";
import { ExtensionIPC } from "./services/extension-ipc";
import { ExtensionInstaller } from "./services/extension-installer";
import { RPC_METHOD } from "../shared/json-rpc-methods";
import { TableSchemaRegistry } from "./services/table-schema-registry";
import { DAOService } from "./services/dao-service";
import { SHARED_TABLE_MANIFESTS } from "./services/shared-data-tables";
import { CommandAllowlist } from "./services/command-allowlist";
import { UiEventAllowlist } from "./services/ui-event-allowlist";
import { DomainServiceRegistry } from "./services/domain-service-registry";
import { registerPanelProtocol } from "./services/panel-protocol";
import { WebviewPanelManager } from "./services/webview-panel-manager";
import { activateAndOpenView } from "./services/view-activation";
import { ShortcutRegistry, toAccelerator } from "./services/shortcut-registry";
import { EventBus } from "./services/event-bus";
import { createLogger } from "./services/logger";
import { LogFileService } from "./services/log-file-service";
import { resolveRuntimeProfile } from "./runtime-profile";
import { installApplicationMenu } from "./services/app-menu";
import {
  exportDatabase,
  importDatabase,
  exportEncrypted,
  importEncrypted,
  getDatabasePath,
  getLastBackupTime,
  setLastBackupTime,
} from "./services/backup-service";

const mainDir = fileURLToPath(new URL(".", import.meta.url));
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;
const runtimeProfile = resolveRuntimeProfile({
  isPackaged: app.isPackaged,
  executablePath: process.execPath,
  resourcesPath: process.resourcesPath,
  sourceExtensionsPath: join(mainDir, "..", "..", "extensions"),
});

// Must run before the first `app.getPath('userData')` call so development
// cannot open the product database. See ADR-0007.
app.setName(runtimeProfile.appName);
if (runtimeProfile.userDataPath) {
  app.setPath("userData", runtimeProfile.userDataPath);
}

let mainWindow: BrowserWindow | null = null;
let windowStateSaveTimer: ReturnType<typeof setTimeout> | null = null;
let dbClosed = false;
let extensionRegistry: ExtensionRegistry | null = null;
let extensionIPC: ExtensionIPC | null = null;
let tableSchemaRegistry: TableSchemaRegistry | null = null;
let userExtensionsRoot: string = "";
let extensionInstaller: ExtensionInstaller | null = null;
let daoService: DAOService | null = null;
let commandAllowlist: CommandAllowlist | null = null;
let uiEventAllowlist: UiEventAllowlist | null = null;
let domainServiceRegistry: DomainServiceRegistry | null = null;
let webviewPanelManager: WebviewPanelManager | null = null;
let accountService: AccountManagementService | null = null;
let shortcutRegistry: ShortcutRegistry | null = null;
let eventBus: EventBus | null = null;
let logFileService: LogFileService | null = null;

eventBus = new EventBus();
const logger = createLogger(eventBus, 'info');

function resolvePreloadPath(): string {
  return join(mainDir, "../preload/preload.cjs");
}

function resolveRendererIndex(): string {
  return join(mainDir, "../renderer/index.html");
}

function resolveAppIconPath(): string | undefined {
  // Dev: <repo>/assets/icon.png (mainDir = dist/main). Packaged: resources/assets/icon.png
  // via electron-builder extraResources. Undefined = Electron default (never throws).
  const devIcon = join(mainDir, "../../assets/icon.png");
  if (existsSync(devIcon)) return devIcon;
  const prodIcon = join(process.resourcesPath, "assets/icon.png");
  if (existsSync(prodIcon)) return prodIcon;
  return undefined;
}

function resolveDatabasePath(): string {
  // Phase 2 keeps the database in Electron's default app data folder.
  // Future custom DB path support should read a tiny bootstrap config
  // here before SQLite opens; do not store the DB path only inside
  // the DB itself, because startup would not know which DB to open.
  return join(app.getPath("userData"), "finance.db");
}

function resolveExtensionsRoot(): string {
  return runtimeProfile.extensionsPath;
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
  setSetting("core.window.maximized", maximized);
  if (!maximized) {
    const bounds = mainWindow.getBounds();
    setSetting("core.window.x", bounds.x);
    setSetting("core.window.y", bounds.y);
    setSetting("core.window.width", bounds.width);
    setSetting("core.window.height", bounds.height);
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

function resolveInitialBounds(): {
  width: number;
  height: number;
  x?: number;
  y?: number;
} {
  const width = getSetting<number>("core.window.width") ?? 1280;
  const height = getSetting<number>("core.window.height") ?? 820;
  const x = getSetting<number>("core.window.x");
  const y = getSetting<number>("core.window.y");

  // If no saved position, let Electron centre the window.
  if (x === undefined || y === undefined) {
    return { width, height };
  }

  // Validate that the saved rect intersects at least one currently
  // connected display work area. Otherwise the window would open
  // off-screen (e.g. saved on a monitor that is no longer attached).
  const intersects = screen.getAllDisplays().some((display) => {
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
  const savedMaximized = getSetting<boolean>("core.window.maximized") ?? false;
  const theme = getSetting<string>("core.theme") ?? "dark";
  const backgroundColor = theme === "light" ? "#f8fafc" : "#1e1e1e";

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    ...(bounds.x !== undefined ? { x: bounds.x } : {}),
    ...(bounds.y !== undefined ? { y: bounds.y } : {}),
    minWidth: 960,
    minHeight: 640,
    backgroundColor: backgroundColor,
    title: "Finance Flow AI",
    focusable: true,
    ...(resolveAppIconPath() ? { icon: resolveAppIconPath() } : {}),
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (savedMaximized) {
    mainWindow.maximize();
  }

  mainWindow.on("resize", () => {
    debouncedSaveWindowState();
    webviewPanelManager?.resizeActivePanel();
  });
  mainWindow.on("move", debouncedSaveWindowState);
  mainWindow.on("close", () => {
    saveWindowState();
    clearWindowStateSaveTimer();
  });

  if (rendererDevUrl) {
    await mainWindow.loadURL(rendererDevUrl);
  } else {
    await mainWindow.loadFile(resolveRendererIndex());
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const accelerator = toAccelerator(input);
    const entry = shortcutRegistry?.getCommandForAccelerator(accelerator);
    if (entry && mainWindow && !mainWindow.isDestroyed()) {
      event.preventDefault();
      mainWindow.webContents.send('shell:shortcut', {
        accelerator,
        commandId: entry.commandId,
        extensionId: entry.extensionId,
      });
    }
  });

  return mainWindow;
}

function registerIpcHandlers(): void {
  ipcMain.handle("shell:get-version", () => {
    return app.getVersion();
  });

  // Settings IPC handlers log service errors before returning them to
  // the renderer. `get` collapses to `undefined` because the renderer
  // treats it as "missing"; `set` rethrows so persistence failures are
  // visible to callers and tests.
  ipcMain.handle("settings:get", (_event, key: string) => {
    try {
      return getSetting(key);
    } catch (err) {
      logger.error(`settings:get failed for key "${key}":`, err);
      return undefined;
    }
  });

  ipcMain.handle("settings:set", (_event, key: string, value: unknown) => {

    try {
      setSetting(key, value);
      if (eventBus) {
        eventBus.publish('settings.changed', { key });
      }
      if (key === 'core.logLevel' && typeof value === 'string'
        && (value === 'debug' || value === 'info' || value === 'warn' || value === 'error')) {
        logger.setMinLevel(value);
        if (eventBus) {
          eventBus.publish('log.level-changed', { level: value }, null);
        }
        extensionIPC?.notify('host.set-log-level', { level: value });
      }
      const separator = key.indexOf('.');
      if (separator > 0 && key.endsWith('.themeColor')) {
        webviewPanelManager?.refreshThemeColor(key.slice(0, separator));
      }
    } catch (err) {
      logger.error(`settings:set failed for key "${key}":`, err);
      throw err;
    }
  });

  ipcMain.handle("extensions:list", () => {
    if (!extensionRegistry) return { views: [], commands: [], navigation: [], configuration: [], themeColors: {} };
    return {
      views: extensionRegistry.views(),
      commands: extensionRegistry.commands(),
      navigation: extensionRegistry.navigation(),
      configuration: extensionRegistry.configuration(),
      themeColors: Object.fromEntries(
        extensionRegistry.getAllManifests().map((manifest) => [manifest.id, manifest.themeColor ?? null]),
      ),
    };
  });

  ipcMain.handle("extensions:manager-list", () => {
    if (!extensionRegistry) return [];
    return extensionRegistry.getAllManifests().map((m) => ({
      id: m.id,
      displayName: m.displayName,
      version: m.version,
      description: m.description,
      enabled: extensionRegistry!.isEnabled(m.id),
      source: extensionRegistry!.builtinIds.has(m.id) ? 'built-in' as const : 'user' as const,
      dependencies: m.dependencies,
    }));
  });
  ipcMain.handle("extensions:pick-folder", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return canceled ? null : filePaths[0];
  });
  ipcMain.handle("extensions:pick-zip", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Zip', extensions: ['zip'] }] });
    return canceled ? null : filePaths[0];
  });
  ipcMain.handle("extensions:install", async (_e, source: string) => {
    if (!extensionInstaller) return { ok: false, reason: 'installer not ready' };
    return extensionInstaller.installFromSource(source);
  });
  ipcMain.handle("extensions:uninstall", (_e, id: string) => {
    if (!extensionInstaller) return { ok: false, reason: 'installer not ready' };
    const err = extensionInstaller.uninstall(id);
    if (!err && webviewPanelManager) {
      const panel = webviewPanelManager.findByExtensionId(id);
      if (panel) webviewPanelManager.unmount(panel.panelId);
    }
    if (!err && mainWindow) mainWindow.webContents.send('extensions:changed');
    return err ? { ok: false, reason: err.reason } : { ok: true };
  });
  ipcMain.handle("extensions:delete-data", (_e, id: string) => {
    if (!extensionInstaller) return { ok: false, reason: 'installer not ready' };
    const err = extensionInstaller.deleteData(id);
    return err ? { ok: false, reason: err.reason } : { ok: true };
  });
  ipcMain.handle("extensions:set-enabled", (_e, id: string, enabled: boolean) => {
    if (!extensionRegistry) return { ok: false };
    extensionRegistry.setEnabled(id, enabled);
    if (!enabled && webviewPanelManager) {
      const panel = webviewPanelManager.findByExtensionId(id);
      if (panel) webviewPanelManager.unmount(panel.panelId);
    }
    return { ok: true };
  });
  ipcMain.handle("app:restart", async () => {
    logger.log('[main] app:restart requested');
    if (mainWindow) mainWindow.webContents.send('app:restarting');
    // Graceful Host shutdown first: stop() sets shuttingDown so the
    // Host's exit(0) is not misreported as "exited unexpectedly (code 0)"
    // by handleExit. Falls back to immediate relaunch on failure.
    try {
      await extensionIPC?.stop();
    } catch (err) {
      logger.warn('[main] app:restart host stop failed, relaunching anyway:', err as Error);
    }
    app.relaunch();
    app.exit(0);
    return { ok: true };
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
  ipcMain.handle("extensions:activate-view", async (_event, viewId: string) => {
    if (!extensionIPC || !extensionRegistry || !webviewPanelManager)
      return { activated: false, reason: "host not running" };

    // Narrowed aliases for use inside the nested deps closures below.
    const activeIPC = extensionIPC;
    const activePanelManager = webviewPanelManager;

    // Find the extension that owns this view BEFORE the try block so the catch
    // handler has the extension id available for recordCrash(). The find()
    // call invokes views() which re-filters by isEnabled() — a disabled
    // extension's view does not appear here.
    const owning = extensionRegistry.views().find((v) => v.view.id === viewId);
    if (!owning) return { activated: false, reason: "view not found" };
    const owningExtensionId = owning.extensionId;

    try {
      // [Fix 2] Activate AND open. `activateView` alone was a no-op once the
      // extension was already active (Host early-returns `true` when
      // `ext.moduleUrl` is set), so an activity-bar click on an already-active
      // extension never mounted the view's panel. `activateAndOpenView` opens
      // the panel via the same requestMount/dedup path as `extension:request-mount`.
      // [Fix 3] When the view declares an `openCommand`, it is executed in the
      // Host instead — views whose data is Host-computed (dashboard aggregates)
      // re-run their computation and mount WITH fresh mountData, instead of
      // mounting a data-less panel that renders empty.
      const openCommandId = owning.view.openCommand;
      const activated = await activateAndOpenView(
        {
          activate: async (extensionId, reason) => {
            const res = await activeIPC.request<{ activated: boolean }>(
              "extension.activate",
              { extensionId, reason },
            );
            return res.activated;
          },
          openView: (extensionId, viewId) => {
            activePanelManager.requestMount(extensionId, viewId);
          },
          runOpenCommand: async (extensionId, commandId) => {
            const res = await activeIPC.request<{ executed: boolean }>(
              "extension.executeCommand",
              { commandId, args: [] },
            );
            return res.executed;
          },
        },
        owningExtensionId,
        viewId,
        openCommandId,
      );
      if (activated) {
        extensionRegistry.markActivated(owningExtensionId);
        extensionRegistry.clearCrashes(owningExtensionId);
      }
      return { activated };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        `extensions:activate-view failed for "${viewId}":`,
        message,
      );

      // Record the crash so the registry can auto-disable after threshold.
      const { crashCount, autoDisabled } = extensionRegistry.recordCrash(
        owningExtensionId,
        message,
      );

      // If auto-disable kicked in, push a host-status notification so the
      // renderer can update its UI. The ExtensionIPC owns the status listener
      // pipeline; we reuse it for this extension-scoped status.
      if (autoDisabled && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("extensions:host-status", {
          status: "extension-auto-disabled",
          extensionId: owningExtensionId,
          crashCount,
        });
      }

      return { activated: false, reason: message, crashCount, autoDisabled };
    }
  });

  // [Review fix §2.3] Phase 3 stub: prove the IPC channel exists end-to-end by
  // forwarding extension command execution to the Host. The Host handler is a
  // thin wrapper around the existing `finance.commands.execute` stub. Phase 5
  // will swap the stub for real execution; the Main-side handler is unchanged.
  // Phase 5 Task 13 adds a per-extension command allowlist gate.
  ipcMain.handle(
    "extensions:execute-command",
    async (_event, commandId: string, ...args: unknown[]) => {
      if (!extensionIPC || !extensionRegistry)
        return { executed: false, reason: "host not running" };

      // Find the owning extension for the command.
      const owning = extensionRegistry
        .commands()
        .find((c) => c.command.id === commandId);
      if (!owning) return { executed: false, reason: "command not found" };

      // Phase 5 Task 13 â€” gate on the owning extension's allowlist.
      if (
        commandAllowlist &&
        !commandAllowlist.isAllowed(owning.extensionId, commandId)
      ) {
        return {
          executed: false,
          reason: "command not allowed for this extension",
        };
      }

      try {
        const result = await extensionIPC.request<{
          executed: boolean;
          result: unknown;
        }>("extension.executeCommand", { commandId, args });
        return result;
      } catch (err) {
        return {
          executed: false,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  // Phase 4 Task 14 — renderer-side DB proxy. The mounted extension UI
  // (running in the Renderer) reads/writes its tables through these
  // channels; Main forwards each call to the Host (which relays to the
  // DAO service), reusing the exact envelope the extension's own code uses.
  ipcMain.handle("extensions:read-table", async (_event, params) => {
    if (!extensionIPC) return null;
    return extensionIPC.request(RPC_METHOD.ExtensionReadTable, params);
  });
  ipcMain.handle("extensions:write-table", async (_event, params) => {
    if (!extensionIPC) return null;
    return extensionIPC.request(RPC_METHOD.ExtensionWriteTable, params);
  });

  // Phase 4 Task 14 (Decision 12) — renderer pushes a component event back
  // to the Host via a notification (no response expected).
  // Phase 5 Task 4.1 — delegate to WebviewPanelManager.forwardUiEvent which
  // performs sender-identity verification via findPanelByWebContentsId and
  // forwards to Host + renderer in parallel.
  ipcMain.on(
    "extensions:ui-event",
    (
      _event,
      payloadExtensionId: string,
      eventName: string,
      detail: unknown,
    ) => {
      if (!extensionIPC) return;
      const senderId = _event.sender.id;
      const panel = webviewPanelManager?.findPanelByWebContentsId(senderId);
      if (!panel && mainWindow && senderId !== mainWindow.webContents.id) {
        logger.warn(
          `[extensions] dropped ui-event from unknown sender ${senderId}`,
        );
        return;
      }
      const resolvedExtensionId = panel?.extensionId ?? payloadExtensionId;
      if (
        uiEventAllowlist &&
        !uiEventAllowlist.isAllowed(resolvedExtensionId, eventName)
      ) {
        const msg = `[extensions] dropped ui-event "${eventName}" from "${resolvedExtensionId}" — not in allowlist`;
        logger.warn(msg);
        _event.sender.send("panel:allowlist-denied", {
          kind: "ui-event",
          extensionId: resolvedExtensionId,
          eventName,
          reason: msg,
        });
        return;
      }
      logger.info(
        `[extensions] ui-event "${eventName}" from "${resolvedExtensionId}"`,
        detail,
      );
      const forwarded = webviewPanelManager?.forwardUiEvent(
        senderId,
        eventName,
        detail,
      );
      if (!forwarded) {
        extensionIPC.notify(RPC_METHOD.ExtensionUiEvent, {
          extensionId: resolvedExtensionId,
          eventName,
          detail,
        });
      }
    },
  );

  // Phase 5 Task 4.5 — extension:request-mount IPC. Extensions (or the Host on
  // their behalf) can request a WebContentsView mount for a view. Main validates
  // the extension is enabled and mounts via WebviewPanelManager.
  ipcMain.handle(
    "extension:request-mount",
    async (_event, extensionId: string, viewId: string, mountData?: object) => {
      if (!extensionRegistry || !webviewPanelManager) {
        return { mounted: false, reason: "host not running" };
      }
      if (!extensionRegistry.isEnabled(extensionId)) {
        return { mounted: false, reason: "extension not enabled" };
      }
      // Allow extensions to mount their own views without requiring
      // the view to be registered in the activity bar. This lets a
      // single-extension create multiple internal panels (e.g.
      // pay-rate-history-view) without adding extra activity bar icons.
      const handle = webviewPanelManager.requestMount(
        extensionId,
        viewId,
        mountData,
      );
      if (!handle) {
        return { mounted: false, reason: "main window not ready" };
      }
      return { mounted: true, panelId: handle.panelId };
    },
  );

  ipcMain.handle("panel:list", () => {
    if (!webviewPanelManager) return [];
    return webviewPanelManager
      .list()
      .map((h) => ({
        panelId: h.panelId,
        extensionId: h.extensionId,
        viewId: h.viewId,
      }));
  });

  ipcMain.handle("panel:focus", (_event, panelId: string) => {
    webviewPanelManager?.focus(panelId);
  });

  ipcMain.on("panel:show", (_event, panelId: string) => {
    webviewPanelManager?.showPanel(panelId);
  });

  ipcMain.on("panel:hide-overlay", () => {
    webviewPanelManager?.hidePanelsForOverlay();
  });

  ipcMain.on("panel:restore-overlay", () => {
    webviewPanelManager?.restorePanels();
  });

  ipcMain.handle("panel:active", () => {
    return webviewPanelManager?.getActivePanelId() ?? null;
  });

  ipcMain.on("panel:mounted", (_event, panelId: string) => {
    logger.log('[main] panel:mounted:', panelId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("panel:mounted", panelId);
    }
  });

  ipcMain.on("panel:unmounted", (_event, panelId: string, viewId: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("panel:unmounted", panelId, viewId);
    }
  });

  ipcMain.on(
    "panel:resize",
    (
      _event,
      panelId: string,
      bounds: { x: number; y: number; width: number; height: number },
    ) => {
      webviewPanelManager?.resize(panelId, bounds);
    },
  );

  ipcMain.on("panel:unmount", (_event, panelId: string) => {
    webviewPanelManager?.unmount(panelId);
  });

  ipcMain.on("panel:unmount-all", () => {
    webviewPanelManager?.unmountAll();
  });

  ipcMain.on("panel:set-dirty", (_event, extensionId: string, dirty: boolean) => {
    const panel = webviewPanelManager?.findByExtensionId(extensionId);
    const panelId = panel?.panelId;
    if (panelId) {
      webviewPanelManager?.setDirty(panelId, dirty);
    } else {
      logger.warn(`[panels] panel:set-dirty: no panel found for extension ${extensionId}`);
    }
  });

  ipcMain.handle("panel:auto-save-draft", async (_event, extensionId: string) => {
    const panel = webviewPanelManager?.findByExtensionId(extensionId);
    if (!panel) {
      logger.warn(`[panels] panel:auto-save-draft: no panel found for extension ${extensionId}`);
      return;
    }
    try {
      await webviewPanelManager!.autoSaveDraft(panel.panelId);
    } catch (err) {
      logger.error(`[panels] panel:auto-save-draft failed for ${panel.panelId}:`, err);
    }
  });

  // Phase 4 Task 17 (Test Unit 1) — Core-owned account creation. The `accounts`
  // table is Platform-owned and read-only for extensions (Decision 4), so the
  // first-run seed modal routes its write through this Core path rather than
  // the extension's own `finance.db`. The DAO service is bypassed deliberately
  // (it would reject the write as SharedTableReadOnly); this is a trusted,
  // input-validated Core insert.
  ipcMain.handle("accounts:create", (_event, input: { name: string; institution: string | null }) => {
    const result = accountService!.create(input);
    void notifyOpenDashboardAfterAccountChange();
    return result;
  });

  // Core-owned account count — used by the renderer's first-run seed check.
  // Runs directly against the SQLite DB, no Extension IPC required.
  ipcMain.handle("accounts:count", () => {
    return accountService!.count();
  });

  ipcMain.handle("accounts:list", () => {
    return accountService!.list();
  });

  ipcMain.handle("accounts:update", (_event, input: { id: number; name: string; institution: string | null; is_active: boolean }) => {
    const result = accountService!.update(input);
    void notifyOpenDashboardAfterAccountChange();
    return result;
  });

  ipcMain.handle("accounts:delete", (_event, input: { id: number }) => {
    const result = accountService!.delete(input);
    void notifyOpenDashboardAfterAccountChange();
    return result;
  });

  // Phase 7 Task 4 — shortcut customization IPC.
  ipcMain.handle("shortcuts:list", () => {
    return shortcutRegistry?.list() ?? [];
  });

  ipcMain.handle("shortcuts:update", (_event, extensionId: string, commandId: string, accelerator: string) => {
    if (!shortcutRegistry) return;
    shortcutRegistry.update(extensionId, commandId, accelerator);
    return shortcutRegistry.list();
  });

  ipcMain.handle("shortcuts:reset", (_event, extensionId?: string) => {
    if (!shortcutRegistry) return;
    shortcutRegistry.reset(extensionId);
    shortcutRegistry.build(extensionRegistry ? extensionRegistry.getAllManifests() : []);
    return shortcutRegistry.list();
  });

  // Phase 7 Task 8 — global event bus IPC.
  ipcMain.handle("event:subscribe", (_event, topic: string) => {
    if (!eventBus) return;
    eventBus.subscribe(topic, (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("shell:event", { topic, payload });
      }
    }, 'renderer');
  });

  ipcMain.handle("event:publish", async (_event, { topic, payload }: { topic: string; payload: unknown }) => {
    if (!eventBus) return;
    const exclude = topic.startsWith('log.') ? null : 'renderer' as const;
    eventBus.publish(topic, payload, exclude);
    if (extensionIPC) {
      extensionIPC.notify(RPC_METHOD.EventPublish, { topic, payload });
    }
  });

  ipcMain.on("theme:broadcast", (_event, theme: string) => {
    webviewPanelManager?.broadcastTheme(theme);
  });

  ipcMain.handle("backup:export", async () => {
    if (!mainWindow) return { success: false };
    const dbPath = getDatabasePath(app.getPath('userData'));
    const defaultName = `finance-backup-${new Date().toISOString().slice(0,10)}.db`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Database',
      defaultPath: defaultName,
      filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
    });
    if (result.canceled || !result.filePath) return { success: false };
    try {
      exportDatabase(dbPath, result.filePath);
      setLastBackupTime(new Date().toISOString());
      return { success: true, path: result.filePath };
    } catch (err) {
      logger.error('[backup] export failed:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Export failed' };
    }
  });

  ipcMain.handle("backup:import", async () => {
    if (!mainWindow) return { success: false };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Database',
      filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { success: false };
    const sourcePath = result.filePaths[0];
    try {
      const dbPath = getDatabasePath(app.getPath('userData'));
      importDatabase(dbPath, sourcePath);
      setLastBackupTime(new Date().toISOString());

      const freshDb = getDatabase();
      daoService?.setDatabase(freshDb);
      accountService?.setDatabase(freshDb);
      extensionRegistry?.setDatabase(freshDb);
      extensionIPC?.setDAOService(daoService!);

      return { success: true };
    } catch (err) {
      logger.error('[backup] import failed:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Import failed' };
    }
  });

  ipcMain.handle("backup:export-encrypted", async (_event, password: string) => {
    if (!mainWindow) return { success: false };
    if (!password) return { success: false, error: 'Password required' };
    const dbPath = getDatabasePath(app.getPath('userData'));
    const defaultName = `finance-backup-${new Date().toISOString().slice(0,10)}.enc.db`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Encrypted Database',
      defaultPath: defaultName,
      filters: [{ name: 'Encrypted Backup', extensions: ['enc.db'] }],
    });
    if (result.canceled || !result.filePath) return { success: false };
    try {
      exportEncrypted(dbPath, result.filePath, password);
      setLastBackupTime(new Date().toISOString());
      return { success: true, path: result.filePath };
    } catch (err) {
      logger.error('[backup] encrypted export failed:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Encrypted export failed' };
    }
  });

  ipcMain.handle("backup:import-encrypted", async (_event, password: string) => {
    if (!mainWindow) return { success: false };
    if (!password) return { success: false, error: 'Password required' };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Encrypted Database',
      filters: [{ name: 'Encrypted Backup', extensions: ['enc.db'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { success: false };
    const sourcePath = result.filePaths[0];
    try {
      const dbPath = getDatabasePath(app.getPath('userData'));
      importEncrypted(dbPath, sourcePath, password);
      setLastBackupTime(new Date().toISOString());

      const freshDb = getDatabase();
      daoService?.setDatabase(freshDb);
      accountService?.setDatabase(freshDb);
      extensionRegistry?.setDatabase(freshDb);
      extensionIPC?.setDAOService(daoService!);

      return { success: true };
    } catch (err) {
      logger.error('[backup] encrypted import failed:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Encrypted import failed' };
    }
  });

  ipcMain.handle("backup:get-last-time", () => {
    return getLastBackupTime();
  });
}

/**
 * Keep an open Dashboard in sync with the Core-owned `accounts` table. Firing
 * the dashboard's own `dashboard.refresh` command re-runs the aggregator in the
 * Host (with real service bindings) and pushes fresh `mountData` to the open
 * panel via `panel:mount-update`.
 *
 * Guard: only fire while the `dashboard-view` panel is currently mounted.
 * `dashboard.refresh` ends in `requestMount`, which would *create* the panel if
 * it were absent, popping a closed Dashboard open uninvited. A closed Dashboard
 * already rebuilds on reopen via its `openCommand` (view-activation.ts).
 */
function notifyOpenDashboardAfterAccountChange(): void {
  if (!extensionIPC || !webviewPanelManager) return;
  if (webviewPanelManager.isOverlayActive()) return;
  const dashboardMounted = webviewPanelManager
    .list()
    .some((h) => h.extensionId === "dashboard" && h.viewId === "dashboard-view");
  if (!dashboardMounted) return;
  void extensionIPC
    .request("extension.executeCommand", {
      commandId: "dashboard.refresh",
      args: [],
    })
    .catch((err) => logger.error("[accounts] dashboard refresh failed:", err));
}

async function shutdownPersistence(): Promise<void> {
  dbClosed = true;
  clearWindowStateSaveTimer();
  await webviewPanelManager
    ?.destroyAll()
    .catch((err) => logger.error("Panel destroy failed:", err));
  void extensionIPC
    ?.stop()
    .catch((err) => logger.error("Extension IPC shutdown failed:", err));
  extensionIPC = null;
  daoService = null;
  tableSchemaRegistry = null;
  webviewPanelManager = null;
  closeSettings();
  closeDatabase();
}

registerAllMigrations();

// Register the finance-shell scheme as privileged before app.whenReady().
// This is required by Electron for custom protocols to support standard
// fetching and the fetch API in renderer processes.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'finance-shell',
    privileges: { 
      standard: true,
      secure: true,
      corsEnabled: true, 
      supportFetchAPI: true 
    },
  },
]);

// SINGLE POINT OF REGISTRATION. Do not invoke registerIpcHandlers() anywhere
// else in this file or in any module imported during bootstrap. Duplicate
// registration throws ERR_DLOPEN_FAILED-style errors from ipcMain.handle.
// The plan's body accidentally included a second call inside app.whenReady();
// this comment marks the single legitimate call site. See [Review fix §HOST-5].
registerIpcHandlers();

app.whenReady().then(async () => {
  try {
    installApplicationMenu();
    userExtensionsRoot = join(app.getPath("userData"), "extensions");
    // Phase 5 Task 2.1 — register the `finance-shell://` custom protocol
    // before any WebContentsView tries to load a panel URL. `protocol.handle`
    // requires the app to be ready (needs the default session).
    registerPanelProtocol(userExtensionsRoot);

    const dbPath = resolveDatabasePath();
    // [Review fix §3.5] Log the resolved database path so Test Unit 6 (and
    // any future manual debugging) knows where the SQLite file lives without
    // guessing platform-specific %APPDATA%/XDG_CONFIG_HOME paths.
    logger.info(`[main] database path: ${dbPath}`);
    initializeDatabase(dbPath);
    initializeSettings();
    registerSettingDefault('core.workspace.autoSaveTimeout', 500);
    registerSettingDefault('core.workspace.lazyUnmountTimeout', 300_000);
    registerSettingDefault('core.logLevel', 'info');
    {
      const bootLevel = getSetting<string>('core.logLevel');
      if (bootLevel === 'debug' || bootLevel === 'info' || bootLevel === 'warn' || bootLevel === 'error') {
        logger.setMinLevel(bootLevel);
      }
    }
    accountService = new AccountManagementService();

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

    userExtensionsRoot = join(app.getPath("userData"), "extensions");
    extensionRegistry = new ExtensionRegistry();
    const discovery = discoverExtensionsInRoots(
      [userExtensionsRoot, resolveExtensionsRoot()],
      { tableSchemaRegistry }
    );
    {
      const builtinOnly = discoverExtensions(resolveExtensionsRoot(), { tableSchemaRegistry });
      extensionRegistry.setBuiltinIds(builtinOnly.extensions.map((e) => e.manifest.id));
    }
    extensionInstaller = new ExtensionInstaller({ db: getDatabase(), userExtensionsRoot, registry: extensionRegistry, tableSchemaRegistry });
    for (const { manifest } of discovery.extensions) {
      extensionRegistry.upsert(manifest);
      // Register the extension's settings namespace so its `finance.settings`
      // reads/writes pass Main's namespace guard. Without this, activation
      // fails with "Settings namespace "<id>" is not registered" the first
      // time the extension reads an extension-scoped setting.
      registerExtensionNamespace(manifest.id);
    }
    for (const skipped of discovery.skipped) {
      // [Fix] Use console.log (stdout) instead of console.warn (stderr) so
      // the skip message is visible in all terminal configurations,
      // including Windows PowerShell where stderr may not be shown by
      // default. Manual testing of Test Unit 7 surfaced the warning
      // being emitted but not visible.
      logger.log(
        `[extensions] skipped "${skipped.directory}": ${skipped.reason}`,
      );
    }

    // Phase 5 Task 13 — per-extension command allowlist. Built from the
    // discovered manifests; the loader auto-fills missing `allowedCommands`
    // from `commands[]` with a console.warn.
    commandAllowlist = new CommandAllowlist();
    commandAllowlist.rebuild(discovery.extensions.map((e) => e.manifest));

    // Phase 5 Task 14 — per-extension ui-event allowlist.
    uiEventAllowlist = new UiEventAllowlist();
    uiEventAllowlist.rebuild(discovery.extensions.map((e) => e.manifest));

    // Phase 7 Task 4 — build shortcut registry from loaded extensions.
    shortcutRegistry = new ShortcutRegistry();
    shortcutRegistry.build(discovery.extensions.map((e) => e.manifest));

    // Phase 7 Task 8 — global event bus.
    // eventBus and logger are initialized at module load time so IPC handlers
    // registered below can use them safely.

    // Log file service — writes structured logs to disk for the log viewer.
    const userDataPath = app.getPath('userData');
    logFileService = new LogFileService(userDataPath);

    // Wire log file service to receive all log entries from the event bus.
    if (eventBus && logFileService) {
      const enqueue = (payload: unknown) => {
        const p = payload as Record<string, unknown>;
        logFileService!.enqueue({
          level: p.level as string,
          message: p.message as string,
          context: p.context as string | undefined,
          error: p.error as string | undefined,
          timestamp: p.timestamp as number,
          file: p.file as string | undefined,
          line: p.line as number | undefined,
        });
      };
      eventBus.subscribe('log.error', enqueue, 'renderer');
      eventBus.subscribe('log.warn', enqueue, 'renderer');
      eventBus.subscribe('log.info', enqueue, 'renderer');
      eventBus.subscribe('log.debug', enqueue, 'renderer');
    }

    // Phase 5 Task 7 — cross-extension domain service registry.
    domainServiceRegistry = new DomainServiceRegistry();

    extensionIPC = new ExtensionIPC({ userExtensionsRoot });

    // Phase 7 Task 8 — wire the event bus into ExtensionIPC so Host
    // `event.subscribe` / `event.publish` requests are routed through the
    // Main-side EventBus.
    extensionIPC.setEventBus(eventBus);

    // Phase 4 Task 9.3 — wire the DAO service into ExtensionIPC so the
    // Host's `extension.readTable` / `extension.writeTable` RPCs are
    // handled by the DAO service rather than returning a "not wired"
    // error. This MUST happen before `extensionIPC.start()` so the
    // message handlers are ready when the Host sends its first request.
    extensionIPC.setDAOService(daoService);

    // Phase 5 Task 7 — wire the domain service registry into ExtensionIPC
    // so `domain.service.invoke` RPCs from the Host are handled by the
    // Core-owned registry.
    extensionIPC.setDomainServiceRegistry(domainServiceRegistry);

    // Panel navigation — Host sends extension.navigatePanel to navigate
    // an already-mounted panel to a different internal view.
    extensionIPC.setPanelNavigateHandler({
      onNavigate: (extensionId, view, mountData) => {
        webviewPanelManager?.navigatePanel(extensionId, view, mountData);
      },
    });

    // Phase 5 Task 2 — wire WebviewPanelManager as the UI mount handler.
    // Replaces the Phase 4 `extensions:ui-mount` → renderer dynamic-import
    // path: Main now creates a WebContentsView per mount request and sends
    // `panel:init` over the panel's own IPC channel.

    // [Fix] Wire the ExtensionIPC UI handler BEFORE starting the Host so
    // onStartup extensions (e.g. dashboard) that call requestMount() during
    // host.initialize have a valid handler. The closures reference the
    // module-level webviewPanelManager variable which will be set by the time
    // any mount request actually arrives (the Host needs time to start, load
    // bundles, and activate extensions).
    extensionIPC.setUIHandler({
      onMountRequested: (extensionId, viewId, mountData) => {
        webviewPanelManager?.mount(extensionId, viewId, mountData);
      },
      onDataPush: (extensionId, viewId, mountData) => {
        webviewPanelManager?.pushMountData(extensionId, viewId, mountData);
      },
      onFocusRequested: (panelId) => {
        webviewPanelManager?.focus(panelId);
      },
      onUiEvent: (webContentsId, eventName, detail) => {
        const panel =
          webviewPanelManager?.findPanelByWebContentsId(webContentsId);
        if (!panel) {
          logger.warn(
            `[panels] ui-event from unknown webContents ${webContentsId} — dropped`,
          );
          return;
        }
        const extensionId = panel.extensionId;
        if (
          uiEventAllowlist &&
          !uiEventAllowlist.isAllowed(extensionId, eventName)
        ) {
          const msg = `[extensions] dropped ui-event "${eventName}" from "${extensionId}" — not in allowlist`;
          logger.warn(msg);
          panel.view.webContents.send("panel:allowlist-denied", {
            kind: "ui-event",
            extensionId,
            eventName,
            reason: msg,
          });
          return;
        }
        extensionIPC?.notify(RPC_METHOD.ExtensionUiEvent, {
          extensionId,
          eventName,
          detail,
        });
        mainWindow?.webContents.send("extensions:ui-event-from-panel", {
          extensionId,
          eventName,
          detail,
        });
      },
      onSetDirty: (extensionId, dirty) => {
        const panel = webviewPanelManager?.findByExtensionId(extensionId);
        const panelId = panel?.panelId;
        if (panelId) {
          webviewPanelManager?.setDirty(panelId, dirty);
        } else {
          logger.warn(`[panels] setDirty: no panel found for extension ${extensionId}`);
        }
      },
      onAutoSaveDraft: async (extensionId) => {
        const panel = webviewPanelManager?.findByExtensionId(extensionId);
        if (!panel) return;
      },
      onBeforeUnmount: async (extensionId) => {
        const panel = webviewPanelManager?.findByExtensionId(extensionId);
        if (!panel) return;
      },
    });

    // [Fix] Create WebviewPanelManager and wire up the UI handler BEFORE
    // starting the Extension Host. The Host activates onStartup extensions
    // (e.g. dashboard) which call requestMount() → extension.ui-mount IPC.
    // If the UI handler is not set when that arrives, handleUiMount drops
    // the mount silently and the panel never gets created. By setting up
    // the handler first, mount requests buffer (no mainWindow yet) and
    // flush automatically when setMainWindow() is called after createWindow().
    webviewPanelManager = new WebviewPanelManager();
    const activeExtensionRegistry = extensionRegistry;
    webviewPanelManager.setManifestProvider((id) => activeExtensionRegistry.get(id));

    // Phase 7 Task 13 — register each extension's keepAlive hint so the
    // lazy-unmount timer can honor it.
    for (const manifest of extensionRegistry.getAllManifests()) {
      webviewPanelManager.setExtensionKeepAlive(manifest.id, manifest.keepAlive ?? false);
    }

    webviewPanelManager.setShortcutHandler((_webContents, accelerator) => {
      const entry = shortcutRegistry?.getCommandForAccelerator(accelerator);
      if (entry && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('shell:shortcut', {
          accelerator,
          commandId: entry.commandId,
          extensionId: entry.extensionId,
        });
      }
    });

    // Phase 7 Task 22 — wire the event bus into WebviewPanelManager so
    // lifecycle events (lazy-unmount, auto-save-failure) can be published
    // to the global event bus for the toast component to consume.
    webviewPanelManager.setEventBus(eventBus);

    webviewPanelManager.setUIHandler({
      onMountRequested: (extensionId, viewId, mountData) => {
        webviewPanelManager?.mount(extensionId, viewId, mountData);
      },
      onDataPush: (extensionId, viewId, mountData) => {
        webviewPanelManager?.pushMountData(extensionId, viewId, mountData);
      },
      onFocusRequested: (panelId) => {
        webviewPanelManager?.focus(panelId);
      },
      onUiEvent: (webContentsId, eventName, detail) => {
        const panel =
          webviewPanelManager?.findPanelByWebContentsId(webContentsId);
        if (!panel) {
          logger.warn(
            `[panels] ui-event from unknown webContents ${webContentsId} — dropped`,
          );
          return;
        }
        const extensionId = panel.extensionId;
        if (
          uiEventAllowlist &&
          !uiEventAllowlist.isAllowed(extensionId, eventName)
        ) {
          const msg = `[extensions] dropped ui-event "${eventName}" from "${extensionId}" — not in allowlist`;
          logger.warn(msg);
          panel.view.webContents.send("panel:allowlist-denied", {
            kind: "ui-event",
            extensionId,
            eventName,
            reason: msg,
          });
          return;
        }
        extensionIPC?.notify(RPC_METHOD.ExtensionUiEvent, {
          extensionId,
          eventName,
          detail,
        });
        mainWindow?.webContents.send("extensions:ui-event-from-panel", {
          extensionId,
          eventName,
          detail,
        });
      },
      onSetDirty: (extensionId, dirty) => {
        const panel = webviewPanelManager?.findByExtensionId(extensionId);
        const panelId = panel?.panelId;
        if (panelId) {
          webviewPanelManager?.setDirty(panelId, dirty);
        } else {
          logger.warn(`[panels] setDirty: no panel found for extension ${extensionId}`);
        }
      },
      onAutoSaveDraft: async (extensionId) => {
        const panel = webviewPanelManager?.findByExtensionId(extensionId);
        if (!panel) {
          return;
        }
      },
      onBeforeUnmount: async (extensionId) => {
        const panel = webviewPanelManager?.findByExtensionId(extensionId);
        if (!panel) return;
        // Phase 5: no timer, so onBeforeUnmount is only called explicitly
        // from destroyAll() / unmount() when we add that wiring later.
      },
    });

    await createWindow();

    if (mainWindow) {
      webviewPanelManager?.setMainWindow(mainWindow);
    }

    // Start the Extension Host AFTER the panel infrastructure is ready.
    // The Host activates onStartup extensions (dashboard) which call
    // requestMount(). The UI handler is already set, so mount requests
    // will either buffer (if mainWindow wasn't ready) or execute directly.
    extensionIPC.start(extensionRegistry.list()).catch((err) => {
      logger.error("[extensions] Extension Host failed to start:", err);
    });

    extensionIPC.onHostStatus((status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("extensions:host-status", status);
      }
      if (eventBus && (status.status === 'crashed' || status.status === 'restart-failed')) {
        eventBus.publish('extension.host-status', status);
      }
    });

    extensionIPC.onExtensionActivated((params) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("extensions:activated", params);
      }
      if (eventBus) {
        eventBus.publish('extension.activated', params);
      }
    });

    extensionIPC.onHostLog((entry) => {
      if (eventBus) {
        const raw = entry as unknown as Record<string, unknown>;
        const level = (raw.level === 'log' ? 'info' : raw.level) as 'debug' | 'info' | 'warn' | 'error';
        const message = typeof raw.message === 'string'
          ? String(raw.message)
          : `[host] ${Array.isArray(raw.args) ? (raw.args as string[]).join(' ') : ''}`;
        eventBus.publish(
          `log.${level}`,
          {
            level,
            message,
            context: (raw.context as string) ?? 'host',
            error: raw.error as string | undefined,
            timestamp: (raw.timestamp as number) ?? Date.now(),
            file: raw.file as string | undefined,
            line: raw.line as number | undefined,
          },
          'host',
        );
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("extensions:host-log", entry);
      }
    });

  } catch (err) {
    logger.error("Fatal error during app initialization:", err);
    dialog.showErrorBox(
      "Startup Error",
      `Finance Flow AI encountered a fatal error during startup:\n\n${err instanceof Error ? err.message : String(err)}\n\nPlease check the logs and try again.`,
    );
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().then(() => {
        if (mainWindow) webviewPanelManager?.setMainWindow(mainWindow);
      });
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", shutdownPersistence);
