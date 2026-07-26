/**
 * Phase 5 Stage 3 Task 2.2 — `WebviewPanelManager`.
 *
 * Owns the lifecycle of one Electron `WebContentsView` per open panel.
 * Key invariants:
 *
 *   - `panels` `Map<number, PanelHandle>` keyed by `webContents.id()` so any
 *     incoming IPC event can resolve the owning extension without trusting
 *     client-supplied `extensionId` (Decision 7 / Task 4.1).
 *   - `panelId` is a stable opaque string (`panel-${extensionId}-${viewId}`)
 *     used by the renderer's tab bar and workspace split code.
 *   - Panels are NOT lazy-unmounted in Stage 3 (lazy-unmount + dirty-state
 *     protection ships in Task 2.6 / Stage 4). `destroyAll()` is wired to
 *     `app.on('will-quit')` in Task 2.8 so Electron never leaks views.
 *   - Mount requests arriving before the main window is ready are buffered
 *     and replayed when `setMainWindow` is called. This handles the
 *     `onStartup` activation race where extensions request mounts before
 *     the BrowserWinimport { BrowserWimport { BrowserWindow, WebContentsView } from "electron";
 * 
 */

import { BrowserWindow, WebContentsView } from 'electron';
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export interface PanelHandle {
  panelId: string;
  extensionId: string;
  viewId: string;
  view: WebContentsView;
}

export interface WebviewPanelUIHandler {
  onMountRequested(
    extensionId: string,
    viewId: string,
    mountData?: object,
  ): void;
  onFocusRequested(panelId: string): void;
  onUiEvent(webContentsId: number, eventName: string, detail: unknown): void;
  onSetDirty(panelId: string, dirty: boolean): void;
  onAutoSaveDraft(panelId: string): Promise<void>;
}

interface MountRequest {
  extensionId: string;
  viewId: string;
  mountData?: object;
}

export class WebviewPanelManager {
  private readonly panels = new Map<number, PanelHandle>();
  private uiHandler: WebviewPanelUIHandler | null = null;
  private mainWindow: BrowserWindow | null = null;
  private readonly mountBuffer: MountRequest[] = [];
  private readonly pendingResizes = new Map<string, { x: number; y: number; width: number; height: number }>();
  private activePanelId: string | null = null;

  setMainWindow(window: BrowserWindow): void {
    console.log("[setMainWindow]", this);
    this.mainWindow = window;
    this.flushMountBuffer();
  }

  setUIHandler(handler: WebviewPanelUIHandler | null): void {
    this.uiHandler = handler;
  }

  mount(
    extensionId: string,
    viewId: string,
    mountData?: object,
  ): PanelHandle | null {

    console.log("[webview-panel] mount() called", {
    extensionId,
    viewId,
    hasMainWindow: !!this.mainWindow,
    });

    if (!this.mainWindow) {
      console.log("[webview-panel] Main window not ready. Buffering mount request.");
      this.mountBuffer.push({ extensionId, viewId, mountData });
      return null;
    }

    const panelId = `panel-${extensionId}-${viewId}`;
/*     console.log(`[webview-panel] Creating panel: ${panelId}`); */

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        preload: join(__dirname, "..", "preload", "panel-preload.cjs"),
      },
    });
/*     console.log(
    `[webview-panel] Created WebContentsView (webContentsId=${view.webContents.id})`,);

 */
/*     // Debug WebContents lifecycle
    view.webContents.on("did-start-loading", () => {
      console.log(`[webview-panel] ${panelId} did-start-loading`);
    });

    view.webContents.on("dom-ready", () => {
      console.log(`[webview-panel] ${panelId} dom-ready`);
    });

    view.webContents.on("did-finish-load", () => {
      console.log(`[webview-panel] ${panelId} did-finish-load`);

      view.webContents.send("panel:init", {
        extensionId,
        viewId,
        mountData,
      });
    });
 */
    view.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL) => {
        console.error(`[webview-panel] ${panelId} did-fail-load`, {
          errorCode,
          errorDescription,
          validatedURL,
        });
      }
    );



    const panelUrl = `finance-shell://panel/${encodeURIComponent(extensionId)}/${encodeURIComponent(viewId)}.html`;
    view.webContents.loadURL(panelUrl);

    this.mainWindow.contentView.addChildView(view);
/*     console.log("[webview-panel] children:", this.mainWindow.contentView.children?.length);
 */
    const { width, height } = this.mainWindow.contentView.getBounds();
    view.setBounds({ x: 0, y: 0, width, height });
    view.setVisible(false);  // Hidden initially; will be shown by resize() when bounds are sent
    console.log('[webview-panel] panel', panelId, 'added to contentView with initial bounds (hidden)');

    const handle: PanelHandle = { panelId, extensionId, viewId, view };
    const webContentsId = view.webContents.id;
    this.panels.set(webContentsId, handle);

    const pending = this.pendingResizes.get(panelId);
    if (pending) {
      this.pendingResizes.delete(panelId);
      view.setVisible(true);
      view.setBounds(pending);
      this.activePanelId = panelId;
      console.log('[webview-panel] applied pending resize for', panelId, pending);
    }

    if (this.mainWindow) {
      this.mainWindow.webContents.send("panel:mounted", panelId);
    }

    return handle;
  }

  unmount(panelId: string): void {
    const entry = Array.from(this.panels.entries()).find(
      ([, h]) => h.panelId === panelId,
    );
    if (!entry) return;
    const [webContentsId, handle] = entry;
    this.panels.delete(webContentsId);
    this.pendingResizes.delete(panelId);
    
    const view = handle.view;
    try {
      console.log(`[webview-panel] unmounting panel ${handle.panelId}`);
      this.mainWindow?.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) {
        view.webContents.close();
      }
    } catch (err) {
      console.warn(
        `[webview-panel] failed to unmount panel ${handle.panelId}:`,
        err,
      );
    }

  }

  focus(panelId: string): void {
    const handle = this.findByPanelId(panelId);
    if (handle) {
      handle.view.webContents.focus();
    }
  }

  findPanelByWebContentsId(webContentsId: number): PanelHandle | undefined {
    return this.panels.get(webContentsId);
  }

  forwardUiEvent(
    webContentsId: number,
    eventName: string,
    detail: unknown,
  ): { extensionId: string } | null {
    const panel = this.panels.get(webContentsId);
    if (!panel) {
      console.warn(
        `[webview-panel] dropped ui-event from unknown sender ${webContentsId}`,
      );
      return null;
    }
    const extensionId = panel.extensionId;
    if (this.uiHandler) {
      this.uiHandler.onUiEvent(webContentsId, eventName, detail);
    }
    this.mainWindow?.webContents.send("extensions:ui-event-from-panel", {
      extensionId,
      eventName,
      detail,
    });
    return { extensionId };
  }

  requestMount(
    extensionId: string,
    viewId: string,
    mountData?: object,
  ): PanelHandle | null {
    if (this.mainWindow) {
      return this.mount(extensionId, viewId, mountData);
    }
    return null;
  }

  resize(
    panelId: string,
    bounds: { x: number; y: number; width: number; height: number },
  ): void {
    const handle = this.findByPanelId(panelId);
    if (!handle) {
      console.log('[webview-panel] resize: panel', panelId, 'not found yet — buffering');
      this.pendingResizes.set(panelId, bounds);
      return;
    }

    const view = handle.view;
    try {
      console.log('[webview-panel] resizing panel', handle.panelId, 'to', bounds);

      if (!view.webContents.isDestroyed()) {
        view.setVisible(true);
        view.setBounds(bounds);
        this.activePanelId = panelId;
        console.log('[webview-panel] panel', handle.panelId, 'setBounds done (shown)');
      }
    } catch (err) {
      console.warn(
        `[webview-panel] failed to resize panel ${handle.panelId}:`,
        err,
      );
    }

  }

  showPanel(panelId: string): void {
    const handle = this.findByPanelId(panelId);
    if (!handle) {
      console.warn('[webview-panel] showPanel: panel', panelId, 'not found');
      return;
    }

    // Hide the previous active panel if it's different
    if (this.activePanelId && this.activePanelId !== panelId) {
      const oldHandle = this.findByPanelId(this.activePanelId);
      if (oldHandle && !oldHandle.view.webContents.isDestroyed()) {
        oldHandle.view.setVisible(false);
        console.log('[webview-panel] hidden panel', this.activePanelId);
      }
    }

    handle.view.setVisible(true);
    this.activePanelId = panelId;
    console.log('[webview-panel] shown panel', panelId);
  }

  findByPanelId(panelId: string): PanelHandle | undefined {
    return Array.from(this.panels.values()).find((h) => h.panelId === panelId);
  }

  list(): PanelHandle[] {
    return Array.from(this.panels.values());
  }

  getActivePanelId(): string | null {
    return this.activePanelId;
  }

  private flushMountBuffer(): void {
    if (!this.mainWindow) return;
    const pending = this.mountBuffer.splice(0);
    for (const req of pending) {
      this.mount(req.extensionId, req.viewId, req.mountData);
    }
  }

  async destroyAll(): Promise<void> {
    const handles = Array.from(this.panels.values());
    this.panels.clear();
    this.pendingResizes.clear();
    await Promise.allSettled(
      handles.map(async (handle) => {
        try {
          if (this.uiHandler) {
            await Promise.race([
              this.uiHandler.onAutoSaveDraft(handle.panelId),
              new Promise<void>((_, reject) =>
                setTimeout(
                  () => reject(new Error("autoSaveDraft timed out")),
                  500,
                ),
              ),
            ]);
          }
        } catch (err) {
          console.warn(
            `[webview-panel] autoSaveDraft failed for ${handle.panelId}:`,
            err,
          );
        }
        const view = handle.view;

        try {
          console.log(`[webview-panel] destroying panel ${handle.panelId}`);
          this.mainWindow?.contentView.removeChildView(view);
          if (!view.webContents.isDestroyed()) {
            view.webContents.close();
          }
        } catch (err) {
          console.warn(
            `[webview-panel] failed to destroy panel ${handle.panelId}:`,
            err,
          );
        }
      }),
    );
  }
}
