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
  private readonly mountShowTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private activePanelId: string | null = null;

  setMainWindow(window: BrowserWindow): void {
    console.log('[setMainWindow] window:', window);
    this.mainWindow = window;
    this.flushMountBuffer();
    //window.webContents.openDevTools({ mode: "detach" });
  }

  setUIHandler(handler: WebviewPanelUIHandler | null): void {
    this.uiHandler = handler;
  }

  mount(
    extensionId: string,
    viewId: string,
    mountData?: object,
  ): PanelHandle | null {

    console.log('[webview-panel] mount() called', {
      extensionId,
      viewId,
      hasMainWindow: !!this.mainWindow,
      activePanelId: this.activePanelId,
      panelsCount: this.panels.size,
    });

    if (!this.mainWindow) {
      //console.log('[webview-panel] Main window not ready. Buffering mount request.');
      this.mountBuffer.push({ extensionId, viewId, mountData });
      return null;
    }

    const panelId = `panel-${extensionId}-${viewId}`;

    // Dedup: if this panel already exists, show it instead of creating a duplicate
    const existing = this.findByPanelId(panelId);
    if (existing) {
      console.log('[webview-panel] panel already exists, showing:', panelId);
      this.showPanel(panelId);
      return existing;
    }

    console.log('[webview-panel] creating NEW panel:', panelId);

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        preload: join(__dirname, "..", "preload", "panel-preload.cjs"),
      },
    });

    const webContentsId = view.webContents.id;
/*     console.log('[webview-panel] WebContentsView created, webContentsId:', webContentsId);

    view.webContents.on("did-start-loading", () => {
      console.log(`[webview-panel] ${panelId} did-start-loading`);
    });

    view.webContents.on("dom-ready", () => {
      console.log(`[webview-panel] ${panelId} dom-ready`);
    });
 */
    view.webContents.on("did-finish-load", () => {
      console.log(`[webview-panel] ${panelId} did-finish-load — sending panel:init`);

      view.webContents.send("panel:init", {
        extensionId,
        viewId,
        mountData,
      });
    });

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
    //console.log('[webview-panel] loading URL:', panelUrl);
    view.webContents.loadURL(panelUrl);

    // Start hidden — the renderer sends panel:resize with correct workspace-area bounds.
    // If that never arrives (rAF / preload timing), the fallback timer makes the
    // panel visible after 500 ms at reasonable default bounds.
    view.setVisible(false);
    this.mainWindow.contentView.addChildView(view);
    //console.log('[webview-panel] added childView to contentView (hidden), children:', this.mainWindow.contentView.children?.length);

    const handle: PanelHandle = { panelId, extensionId, viewId, view };
    this.panels.set(webContentsId, handle);
    //console.log('[webview-panel] panel registered:', panelId, 'webContentsId:', webContentsId);

    // Apply any pending resize that arrived before the view was created
    const pending = this.pendingResizes.get(panelId);
    if (pending) {
      //console.log('[webview-panel] found pending resize for', panelId);
      this.pendingResizes.delete(panelId);
      this.showPanel(panelId);
      view.setBounds(pending);
    } else {
      // Fallback timer: if the renderer doesn't send panel:resize within 200ms,
      // make the panel visible at computed workspace-area size.
      // The workspace grid has: activity-bar (56) + nav (260) = 316px left offset,
      // ai-panel (320px) right offset, tab-strip (36px) top, status-bar (26px) bottom.
      const TAB_STRIP_HEIGHT = 36;
      const STATUS_BAR_HEIGHT = 26;
      const LEFT_OFFSET = 56 + 260; // activity-bar + navigation
      const RIGHT_OFFSET = 320; // ai-panel

      const timer = setTimeout(() => {
        this.mountShowTimers.delete(panelId);
        if (!this.panels.has(webContentsId)) return; // already unmounted
        if (view.webContents.isDestroyed()) return;
        console.log('[webview-panel] fallback timer firing for', panelId, '— making visible');
        const wb = this.mainWindow?.contentView.getBounds();
        if (wb) {
          const fallbackBounds = {
            x: LEFT_OFFSET,
            y: TAB_STRIP_HEIGHT,
            width: Math.max(wb.width - LEFT_OFFSET - RIGHT_OFFSET, 400),
            height: Math.max(wb.height - TAB_STRIP_HEIGHT - STATUS_BAR_HEIGHT, 200),
          };
          this.showPanel(panelId);
          view.setBounds(fallbackBounds);
          console.log('[webview-panel] fallback bounds applied for', panelId, fallbackBounds);
        }
        // After showing with fallback bounds, ask the renderer for exact bounds
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          console.log('[webview-panel] requesting exact bounds from renderer for', panelId);
          this.mainWindow.webContents.send('workspace:request-bounds', panelId);
        }
      }, 200);
      this.mountShowTimers.set(panelId, timer);
    }

    if (this.mainWindow) {
      console.log('[webview-panel] sending panel:mounted to renderer:', panelId);
      this.mainWindow.webContents.send("panel:mounted", panelId);
    } else {
      console.warn('[webview-panel] mainWindow is null, cannot send panel:mounted');
    }

    return handle;
  }

  unmount(panelId: string): void {
    //console.log('[webview-panel] unmount() called', { panelId });
    const entry = Array.from(this.panels.entries()).find(
      ([, h]) => h.panelId === panelId,
    );
    if (!entry) {
      console.warn('[webview-panel] unmount: panel not found', panelId);
      return;
    }
    const [webContentsId, handle] = entry;
    this.panels.delete(webContentsId);
    this.pendingResizes.delete(panelId);
    const timer = this.mountShowTimers.get(panelId);
    if (timer) { clearTimeout(timer); this.mountShowTimers.delete(panelId); }
    
    const view = handle.view;
    try {
      //console.log(`[webview-panel] unmounting panel ${handle.panelId}`);
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
    //console.log('[webview-panel] focus() called', { panelId });
    const handle = this.findByPanelId(panelId);
    if (handle) {
      handle.view.webContents.focus();
    } else {
      console.warn('[webview-panel] focus: panel not found', panelId);
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
    //console.log('[webview-panel] resize() called', { panelId, bounds });
    // Ignore 0x0 bounds — these come from the ResizeObserver firing during
    // Lit re-render when the .content element briefly has zero dimensions.
    if (bounds.width <= 0 || bounds.height <= 0) {
      console.log('[webview-panel] resize: ignoring 0x0 bounds for', panelId);
      return;
    }

    const handle = this.findByPanelId(panelId);
    if (!handle) {
      //console.log('[webview-panel] resize: panel', panelId, 'not found yet — buffering');
      this.pendingResizes.set(panelId, bounds);
      return;
    }

    // Renderer sent real bounds — cancel the fallback timer
    const timer = this.mountShowTimers.get(panelId);
    if (timer) {
      clearTimeout(timer);
      this.mountShowTimers.delete(panelId);
      console.log('[webview-panel] cancelled fallback timer for', panelId);
      // First resize for a newly mounted panel — show it and hide others
      this.showPanel(panelId);
    }

    const view = handle.view;
    try {
      //console.log('[webview-panel] resizing panel', handle.panelId, 'to', bounds);

      if (!view.webContents.isDestroyed()) {
        view.setVisible(true);
        view.setBounds(bounds);
        // Note: activePanelId is only set by showPanel() and mount() fallback,
        // not by resize(). resize() may be called for any panel that needs
        // bounds (e.g. workspace resize), not just the active one.
        //console.log('[webview-panel] panel', handle.panelId, 'setBounds done (shown)');
      }
    } catch (err) {
      console.warn(
        `[webview-panel] failed to resize panel ${handle.panelId}:`,
        err,
      );
    }

  }

  showPanel(panelId: string): void {
    console.log('[webview-panel] showPanel() called', { panelId, activePanelId: this.activePanelId, panelsCount: this.panels.size });
    const handle = this.findByPanelId(panelId);
    if (!handle) {
      console.warn('[webview-panel] showPanel: panel', panelId, 'not found');
      return;
    }

    // Hide ALL other panels — only one should be visible at a time.
    // Previous implementation only hid `activePanelId`, but resize()
    // could make other panels visible without updating activePanelId,
    // leaving multiple panels visible simultaneously.
    let hiddenCount = 0;
    for (const [, h] of this.panels) {
      if (h.panelId !== panelId && !h.view.webContents.isDestroyed()) {
        h.view.setVisible(false);
        hiddenCount++;
      }
    }
    console.log('[webview-panel] showPanel hidden', hiddenCount, 'other panels');

    // Bring to front in z-order (addChildView on existing child moves it to top)
    if (this.mainWindow) {
      this.mainWindow.contentView.addChildView(handle.view);
    }

    handle.view.setVisible(true);
    this.activePanelId = panelId;
    console.log('[webview-panel] showPanel done — activePanelId:', panelId);
  }

  findByPanelId(panelId: string): PanelHandle | undefined {
    const found = Array.from(this.panels.values()).find((h) => h.panelId === panelId);
    if (!found) {
      console.log('[webview-panel] findByPanelId NOT found:', panelId, '— existing panels:', Array.from(this.panels.values()).map(h => h.panelId));
    }
    return found;
  }

  list(): PanelHandle[] {
    return Array.from(this.panels.values());
  }

  getActivePanelId(): string | null {
    return this.activePanelId;
  }

  resizeActivePanel(): void {
    if (!this.activePanelId || !this.mainWindow) return;
    const handle = this.findByPanelId(this.activePanelId);
    if (!handle || handle.view.webContents.isDestroyed()) return;

    const TAB_STRIP_HEIGHT = 36;
    const STATUS_BAR_HEIGHT = 26;
    const LEFT_OFFSET = 56 + 260;
    const RIGHT_OFFSET = 320;

    const wb = this.mainWindow.contentView.getBounds();
    const bounds = {
      x: LEFT_OFFSET,
      y: TAB_STRIP_HEIGHT,
      width: Math.max(wb.width - LEFT_OFFSET - RIGHT_OFFSET, 400),
      height: Math.max(wb.height - TAB_STRIP_HEIGHT - STATUS_BAR_HEIGHT, 200),
    };
    handle.view.setBounds(bounds);
  }

  /**
   * Navigate an already-mounted panel to a different internal view.
   * Sends `panel:navigate` to the panel's WebContentsView so the
   * orchestrator can switch views without creating a new panel.
   */
  navigatePanel(extensionId: string, view: string, mountData?: object): boolean {
    //console.log('[webview-panel] navigatePanel:', { extensionId, view });
    const handle = Array.from(this.panels.values()).find(
      (h) => h.extensionId === extensionId,
    );
    if (!handle) {
      console.warn('[webview-panel] navigatePanel: no panel found for extension', extensionId);
      return false;
    }
    if (handle.view.webContents.isDestroyed()) {
      console.warn('[webview-panel] navigatePanel: panel webContents destroyed', handle.panelId);
      return false;
    }
    handle.view.webContents.send('panel:navigate', { view, mountData });
    return true;
  }

  unmountAll(): void {
    //console.log('[webview-panel] unmountAll() — destroying', this.panels.size, 'panels');
    for (const timer of this.mountShowTimers.values()) clearTimeout(timer);
    this.mountShowTimers.clear();
    this.pendingResizes.clear();
    const handles = Array.from(this.panels.values());
    this.panels.clear();
    this.activePanelId = null;
    for (const handle of handles) {
      try {
        this.mainWindow?.contentView.removeChildView(handle.view);
        if (!handle.view.webContents.isDestroyed()) {
          handle.view.webContents.close();
        }
      } catch (err) {
        console.warn('[webview-panel] failed to unmount', handle.panelId, err);
      }
    }
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
    for (const timer of this.mountShowTimers.values()) clearTimeout(timer);
    this.mountShowTimers.clear();
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
          //console.log(`[webview-panel] destroying panel ${handle.panelId}`);
          this.mainWindow?.contentView.removeChildView(view);
        } catch { /* view or window already destroyed */ }
        try {
          if (!view.webContents.isDestroyed()) {
            view.webContents.close();
          }
        } catch { /* webContents already destroyed */ }
      }),
    );
  }
}
