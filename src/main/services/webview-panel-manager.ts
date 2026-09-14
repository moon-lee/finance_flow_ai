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

import { BrowserWindow, WebContents, WebContentsView } from 'electron';
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { toAccelerator } from './shortcut-registry';
import { getSetting } from './settings-service';
import { resolveThemeColor } from '../../shared/theme-color';
import { EventBus } from './event-bus';
import { getLogger } from './logger';

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export interface PanelHandle {
  panelId: string;
  extensionId: string;
  viewId: string;
  view: WebContentsView;
  keepAlive: boolean;
}

export interface WebviewPanelUIHandler {
  onMountRequested(
    extensionId: string,
    viewId: string,
    mountData?: object,
  ): void;
  onFocusRequested(panelId: string): void;
  onUiEvent(webContentsId: number, eventName: string, detail: unknown): void;
  onSetDirty(extensionId: string, dirty: boolean): void;
  onAutoSaveDraft(extensionId: string): Promise<void>;
  onBeforeUnmount(extensionId: string): Promise<void>;
  /**
   * Todo auto-refresh (Option A) — silent data push. Optional so existing
   * `setUIHandler` call sites without it keep compiling.
   */
  onDataPush?: (
    extensionId: string,
    viewId: string,
    mountData?: object,
  ) => void;
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
  private overlayActive = false;
  private readonly dirtyPanelIds = new Set<string>();
  private readonly keepAliveExtensionIds = new Set<string>();
  private readonly lastActiveTimes = new Map<string, number>();
  private lazyUnmountTimer: ReturnType<typeof setInterval> | null = null;
  private readonly startupTime = Date.now();
  private readonly startupGraceMs: number;
  private shortcutHandler: ((webContents: WebContents, accelerator: string) => void) | null = null;
  private eventBus: EventBus | null = null;


  setShortcutHandler(handler: (webContents: WebContents, accelerator: string) => void): void {
    this.shortcutHandler = handler;
  }

  setEventBus(bus: EventBus | null): void {
    this.eventBus = bus;
  }

  constructor(options?: { startupGraceMs?: number }) {
    this.startupGraceMs = options?.startupGraceMs ?? 300_000;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    this.flushMountBuffer();
    this.startLazyUnmountTimer();
    //window.webContents.openDevTools({ mode: "detach" });
  }

  setUIHandler(handler: WebviewPanelUIHandler | null): void {
    this.uiHandler = handler;
  }

  private getManifest: ((id: string) => { themeColor?: string } | undefined) | null = null;

  setManifestProvider(provider: (id: string) => { themeColor?: string } | undefined): void {
    this.getManifest = provider;
  }

  private resolveThemeColor(extensionId: string): string | undefined {
    let setting: unknown;
    try {
      setting = getSetting<string>(`${extensionId}.themeColor`);
    } catch {
      setting = undefined;
    }
    return resolveThemeColor({
      setting,
      manifest: this.getManifest?.(extensionId)?.themeColor,
      report: (message, value) => getLogger().warn(`${message}:`, value as string),
    });
  }

  setDirty(panelId: string, dirty: boolean): void {
    getLogger().log(`[webview-panel] setDirty: ${panelId} dirty=${dirty}`);
    if (dirty) {
      this.dirtyPanelIds.add(panelId);
    } else {
      this.dirtyPanelIds.delete(panelId);
    }
  }

  isDirty(panelId: string): boolean {
    return this.dirtyPanelIds.has(panelId);
  }

  setExtensionKeepAlive(extensionId: string, keepAlive: boolean): void {
    if (keepAlive) {
      this.keepAliveExtensionIds.add(extensionId);
    } else {
      this.keepAliveExtensionIds.delete(extensionId);
    }
  }

  private getLazyUnmountTimeout(): number {
    return getSetting<number>('core.workspace.lazyUnmountTimeout') ?? 300_000;
  }

  private markActive(panelId: string): void {
    this.lastActiveTimes.set(panelId, Date.now());
  }

  private startLazyUnmountTimer(): void {
    this.stopLazyUnmountTimer();
    //if (this.lazyUnmountTimer) return;
    if (this.panels.size === 0) return;
    this.lazyUnmountTimer = setInterval(() => this.checkLazyUnmount(), 30_000);
  }

  private stopLazyUnmountTimer(): void {
    if (this.lazyUnmountTimer) {
      clearInterval(this.lazyUnmountTimer);
      this.lazyUnmountTimer = null;
    }
  }

  private async checkLazyUnmount(): Promise<void> {

    const now = Date.now();
    const timeout = this.getLazyUnmountTimeout();
    if (timeout === 0) return;

    const toUnmount: string[] = [];

    for (const [, handle] of this.panels) {
      if (this.dirtyPanelIds.has(handle.panelId)) continue;
      if (handle.keepAlive) continue;
      if (handle.view.webContents.isDestroyed()) continue;
      if (handle.panelId === this.activePanelId) continue;

      const lastActive = this.lastActiveTimes.get(handle.panelId) ?? 0;
      if (now - lastActive > timeout) {
        toUnmount.push(handle.panelId);
      }
    }

    for (const panelId of toUnmount) {
      await this.lazyUnmountPanel(panelId);
    }
  }

  private async lazyUnmountPanel(panelId: string): Promise<void> {
    const handle = this.findByPanelId(panelId);
    if (!handle) return;
    if (this.dirtyPanelIds.has(panelId)) return;
    if (handle.keepAlive) return;

    if (this.eventBus) {
      this.eventBus.publish('panel.lazy-unmount', { panelId, viewId: handle.viewId });
    }

    try {
      if (this.uiHandler) {
        await Promise.race([
          this.uiHandler.onBeforeUnmount(handle.extensionId),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('onBeforeUnmount timed out')), 500)
          ),
        ]);
      }
    } catch (err) {
      getLogger().warn(`[webview-panel] onBeforeUnmount failed for ${panelId}:`, err);
    }

    try {
      await this.autoSaveDraft(panelId);
    } catch {
      // autoSaveDraft already logs its own errors
    }

    const webContentsId = handle.view.webContents.id;
    this.panels.delete(webContentsId);
    this.pendingResizes.delete(panelId);
    this.lastActiveTimes.delete(panelId);
    const timer = this.mountShowTimers.get(panelId);
    if (timer) { clearTimeout(timer); this.mountShowTimers.delete(panelId); }

    const view = handle.view;
    try {
      this.mainWindow?.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) {
        view.webContents.close();
      }
    } catch (err) {
      getLogger().warn(`[webview-panel] lazy unmount failed for ${panelId}:`, err);
    }

    if (this.activePanelId === panelId) {
      this.activePanelId = null;
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('panel:unmounted', panelId, handle.viewId);
    }
  }

  isOverlayActive(): boolean {
    return this.overlayActive;
  }

  findByExtensionId(extensionId: string): PanelHandle | undefined {
    return Array.from(this.panels.values()).find(h => h.extensionId === extensionId);
  }

  async autoSaveDraft(panelId: string): Promise<void> {
    const handle = this.findByPanelId(panelId);
    if (!handle) {
      getLogger().warn(`[webview-panel] autoSaveDraft: panel not found for ${panelId}`);
      return;
    }
    if (!this.uiHandler) {
      getLogger().warn('[webview-panel] autoSaveDraft: uiHandler is null');
      return;
    }
    try {
      await Promise.race([
        this.uiHandler.onAutoSaveDraft(handle.extensionId),
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error('autoSaveDraft timed out')),
            getSetting<number>('core.workspace.autoSaveTimeout') ?? 500,
          ),
        ),
      ]);
    } catch (err) {
      getLogger().error(`[webview-panel] autoSaveDraft failed for ${panelId}:`, err);
      this.mainWindow?.webContents.send('panel:auto-save-failed', { panelId, viewId: handle.viewId, dirty: this.dirtyPanelIds.has(panelId) });
      if (this.eventBus) {
        this.eventBus.publish('panel.auto-save-failed', { panelId, viewId: handle.viewId, dirty: this.dirtyPanelIds.has(panelId) });
      }
    }
  }

  mount(
    extensionId: string,
    viewId: string,
    mountData?: object,
  ): PanelHandle | null {

    if (!this.mainWindow) {
      this.mountBuffer.push({ extensionId, viewId, mountData });
      return null;
    }

    const panelId = `panel-${extensionId}-${viewId}`;
    const existing = this.findByPanelId(panelId);

    if (existing) {
      if (!existing.view.webContents.isDestroyed()) {
        existing.view.webContents.send("panel:mount-update", {
          mountData,
          themeColor: this.resolveThemeColor(extensionId),
        });
      }
      if (!this.overlayActive) {
        this.showPanel(panelId);
      }
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send("panel:mounted", panelId);
      }
      return existing;
    }

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        preload: join(__dirname, "..", "preload", "panel-preload.cjs"),
      },
    });

    const webContentsId = view.webContents.id;

    view.webContents.on("did-finish-load", () => {
      view.webContents.send("panel:init", {
        extensionId,
        viewId,
        mountData,
        themeColor: this.resolveThemeColor(extensionId),
      });
    });

    view.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL) => {
          getLogger().error(`[webview-panel] ${panelId} did-fail-load`, {
          errorCode,
          errorDescription,
          validatedURL,
        });
      }
    );

    const panelUrl = `finance-shell://panel/${encodeURIComponent(extensionId)}/${encodeURIComponent(viewId)}.html`;
    view.webContents.loadURL(panelUrl);

    if (this.shortcutHandler) {
      const handler = this.shortcutHandler;
      view.webContents.on('before-input-event', (_event, input) => {
        if (input.type !== 'keyDown') return;
        const accelerator = toAccelerator(input);
        handler(view.webContents, accelerator);
      });
    }

    view.setVisible(false);
    this.mainWindow.contentView.addChildView(view);

    const handle: PanelHandle = { panelId, extensionId, viewId, view, keepAlive: this.keepAliveExtensionIds.has(extensionId) };
    this.panels.set(webContentsId, handle);

    // Apply any pending resize that arrived before the view was created
    const pending = this.pendingResizes.get(panelId);
    if (pending) {
      this.pendingResizes.delete(panelId);
      this.showPanel(panelId);
      view.setBounds(pending);
    } else {
      // Fallback timer: if the renderer doesn't send panel:resize within 200ms,
      // make the panel visible at computed workspace-area size.
      // The workspace grid has: activity-bar (56) + nav (260) = 316px left offset,
      // no right panel (ai-panel removed), tab-strip (36px) top, status-bar (26px) bottom.
      const TAB_STRIP_HEIGHT = 36;
      const STATUS_BAR_HEIGHT = 26;
      const LEFT_OFFSET = 56 + 260; // activity-bar + navigation
      const RIGHT_OFFSET = 0; // ai-panel removed

      const timer = setTimeout(() => {
        this.mountShowTimers.delete(panelId);
        if (!this.panels.has(webContentsId)) return; // already unmounted
        if (view.webContents.isDestroyed()) return;
        getLogger().log('[webview-panel] fallback timer firing for', panelId, ' making visible');
        const wb = this.mainWindow?.contentView.getBounds();
        if (wb) {
          const fallbackBounds = {
            x: LEFT_OFFSET,
            y: TAB_STRIP_HEIGHT,
            width: Math.max(wb.width - LEFT_OFFSET - RIGHT_OFFSET, 400),
            height: Math.max(wb.height - TAB_STRIP_HEIGHT - STATUS_BAR_HEIGHT, 200),
          };
          if (!this.overlayActive) {
            this.showPanel(panelId);
          }
          view.setBounds(fallbackBounds);
          getLogger().log('[webview-panel] fallback bounds applied for', panelId, fallbackBounds);
        }
        // After showing with fallback bounds, ask the renderer for exact bounds
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            getLogger().log('[webview-panel] requesting exact bounds from renderer for', panelId);
          this.mainWindow.webContents.send('workspace:request-bounds', panelId);
        }
      }, 200);
      this.mountShowTimers.set(panelId, timer);
    }

    if (this.mainWindow) {
      this.mainWindow.webContents.send("panel:mounted", panelId);
    } else {
      getLogger().warn('[webview-panel] mainWindow is null, cannot send panel:mounted');
    }

    this.markActive(panelId);
    this.startLazyUnmountTimer();

    return handle;
  }

  unmount(panelId: string): void {
    //console.log('[webview-panel] unmount() called', { panelId });
    const entry = Array.from(this.panels.entries()).find(
      ([, h]) => h.panelId === panelId,
    );
    if (!entry) {
      getLogger().warn('[webview-panel] unmount: panel not found', panelId);
      return;
    }
    const [webContentsId, handle] = entry;
    this.panels.delete(webContentsId);
    this.pendingResizes.delete(panelId);
    this.lastActiveTimes.delete(panelId);
    const timer = this.mountShowTimers.get(panelId);
    if (timer) { clearTimeout(timer); this.mountShowTimers.delete(panelId); }
    
    const view = handle.view;
    try {
      this.mainWindow?.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) {
        view.webContents.close();
      }
    } catch (err) {
      getLogger().warn(
        `[webview-panel] failed to unmount panel ${handle.panelId}:`,
        err,
      );
    }

    if (this.panels.size === 0) {
      this.stopLazyUnmountTimer();
    }
  }

  focus(panelId: string): void {
    const handle = this.findByPanelId(panelId);
    if (handle) {
      handle.view.webContents.focus();
      this.markActive(panelId);
      this.startLazyUnmountTimer();
    } else {
      getLogger().warn('[webview-panel] focus: panel not found', panelId);
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
      getLogger().warn(
        `[webview-panel] dropped ui-event from unknown sender ${webContentsId}`,
      );
      return null;
    }
    const extensionId = panel.extensionId;
    if (this.uiHandler) {
      this.uiHandler.onUiEvent(webContentsId, eventName, detail);
    }
    getLogger().info(
      `[webview-panel] forwarded ui-event "${eventName}" from ${extensionId}`,
    );
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

  /**
   * Todo auto-refresh (Option A) — deliver fresh mountData to an
   * already-mounted panel WITHOUT showing or focusing it. Sends
   * `panel:mount-update`; the panel's bootstrap re-dispatches it as a
   * DOM `mount-update` CustomEvent which the view's existing listener
   * applies in place. Returns `false` when no such panel is mounted
   * (caller should `requestMount` for first mount instead).
   */
  pushMountData(
    extensionId: string,
    viewId: string,
    mountData?: object,
  ): boolean {
    const panelId = `panel-${extensionId}-${viewId}`;
    const handle = this.findByPanelId(panelId);
    if (!handle) return false;
    if (handle.view.webContents.isDestroyed()) return false;
    handle.view.webContents.send('panel:mount-update', {
      mountData,
      themeColor: this.resolveThemeColor(extensionId),
    });
    return true;
  }

  refreshThemeColor(extensionId: string): void {
    const themeColor = this.resolveThemeColor(extensionId);
    for (const handle of this.panels.values()) {
      if (handle.extensionId !== extensionId || handle.view.webContents.isDestroyed()) continue;
      handle.view.webContents.send('panel:mount-update', { themeColor });
    }
  }

  resize(
    panelId: string,
    bounds: { x: number; y: number; width: number; height: number },
  ): void {
    //console.log('[webview-panel] resize() called', { panelId, bounds });
    // Ignore 0x0 bounds — these come from the ResizeObserver firing during
    // Lit re-render when the .content element briefly has zero dimensions.
    if (bounds.width <= 0 || bounds.height <= 0) {
      getLogger().log('[webview-panel] resize: ignoring 0x0 bounds for', panelId);
      return;
    }

    const handle = this.findByPanelId(panelId);
    if (!handle) {
      this.pendingResizes.set(panelId, bounds);
      return;
    }

    // Renderer sent real bounds — cancel the fallback timer
    const timer = this.mountShowTimers.get(panelId);
    if (timer) {
      clearTimeout(timer);
      this.mountShowTimers.delete(panelId);
      if (!this.overlayActive && (!this.activePanelId || this.activePanelId === panelId)) {
        this.showPanel(panelId);
      }
    }

    const view = handle.view;
    try {

      if (!view.webContents.isDestroyed()) {
        // Do not re-show panels while a DOM overlay is open; bounds still
        // apply so the panel is correctly positioned when restored.
        if (!this.overlayActive) {
          view.setVisible(true);
        }
        view.setBounds(bounds);
        // Note: activePanelId is only set by showPanel() and mount() fallback,
        // not by resize(). resize() may be called for any panel that needs
        // bounds (e.g. workspace resize), not just the active one.
        //console.log('[webview-panel] panel', handle.panelId, 'setBounds done (shown)');
      }
    } catch (err) {
      getLogger().warn(
        `[webview-panel] failed to resize panel ${handle.panelId}:`,
        err,
      );
    }

    this.markActive(panelId);
    this.startLazyUnmountTimer();
  }

  showPanel(panelId: string): void {
    const handle = this.findByPanelId(panelId);
    if (!handle) {
      return;
    }

    // Hide ALL other panels — only one should be visible at a time.
    // Previous implementation only hid `activePanelId`, but resize()
    // could make other panels visible without updating activePanelId,
    // leaving multiple panels visible simultaneously.
   // let hiddenCount = 0;
    for (const [, h] of this.panels) {
      if (h.panelId !== panelId && !h.view.webContents.isDestroyed()) {
        h.view.setVisible(false);
     //   hiddenCount++;
      }
    }
   // console.log('[webview-panel] showPanel hidden', hiddenCount, 'other panels');

    // Bring to front in z-order (addChildView on existing child moves it to top)
    if (this.mainWindow) {
      this.mainWindow.contentView.addChildView(handle.view);
    }

    handle.view.setVisible(true);
    this.activePanelId = panelId;
    this.markActive(panelId);
    this.startLazyUnmountTimer();
  }

  hidePanelsForOverlay(): void {
    this.overlayActive = true;
    for (const [, h] of this.panels) {
      if (!h.view.webContents.isDestroyed()) {
        h.view.setVisible(false);
      }
    }
  }

  restorePanels(): void {
    this.overlayActive = false;
    if (this.activePanelId && this.findByPanelId(this.activePanelId)) {
      this.showPanel(this.activePanelId);
    }
  }

  broadcastTheme(theme: string): void {
    for (const [, h] of this.panels) {
      if (!h.view.webContents.isDestroyed()) {
        h.view.webContents.send('theme:changed', theme);
      }
    }
  }

  findByPanelId(panelId: string): PanelHandle | undefined {
    const found = Array.from(this.panels.values()).find((h) => h.panelId === panelId);
/*      if (!found) {
        getLogger().log('[webview-panel] findByPanelId NOT found:', panelId, ' existing panels:', Array.from(this.panels.values()).map(h => h.panelId));
      } */
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
      getLogger().warn('[webview-panel] navigatePanel: no panel found for extension', extensionId);
      return false;
    }
    if (handle.view.webContents.isDestroyed()) {
      getLogger().warn('[webview-panel] navigatePanel: panel webContents destroyed', handle.panelId);
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
    this.lastActiveTimes.clear();
    this.stopLazyUnmountTimer();
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
        getLogger().warn('[webview-panel] failed to unmount', handle.panelId, err);
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
    this.pendingResizes.clear();
    this.lastActiveTimes.clear();
    this.stopLazyUnmountTimer();
    for (const timer of this.mountShowTimers.values()) clearTimeout(timer);
    this.mountShowTimers.clear();
    await Promise.allSettled(
      handles.map(async (handle) => {
        try {
          if (this.uiHandler) {
            await Promise.race([
              this.uiHandler.onAutoSaveDraft(handle.extensionId),
              new Promise<void>((_, reject) =>
                setTimeout(
                  () => reject(new Error("autoSaveDraft timed out")),
                  getSetting<number>('core.workspace.autoSaveTimeout') ?? 500,
                ),
              ),
            ]);
          }
        } catch (err) {
          getLogger().warn(
            `[webview-panel] autoSaveDraft failed for ${handle.panelId}:`,
            err,
          );
        }
        const view = handle.view;

        try {
          this.mainWindow?.contentView.removeChildView(view);
        } catch { /* view or window already destroyed */ }
        try {
          if (!view.webContents.isDestroyed()) {
            view.webContents.close();
          }
        } catch { /* webContents already destroyed */ }
      }),
    );
    this.panels.clear();
    this.activePanelId = null;
  }
}
