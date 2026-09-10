import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import './tab-bar';
import type { Tab } from './types';
import { rendererLogger } from '../logger';
import { resolveThemeColor } from '../../shared/theme-color';
export type { Tab };

interface PersistedLayout {
  version: 1;
  tabs: Tab[];
  activePanelId: string;
}

const DEFAULT_TAB: Tab = { panelId: 'panel-dashboard-dashboard-view', label: 'Dashboard' };

@customElement('workspace-panel')
export class WorkspacePanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      height: 100%;
      background: var(--workspace-bg);
    }

    .tab-strip {
      display: flex;
      min-width: 0;
      background: var(--tab-bg);
      border-bottom: 1px solid var(--workspace-header-border);
    }

    .content {
      flex: 1;
      min-width: 0;
      min-height: 0;
      position: relative;
      overflow: hidden;
    }

    .empty-state {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-tertiary);
      font-size: var(--ff-font-md);
    }
  `;

  @state()
  private _tabs: Tab[] = [DEFAULT_TAB];

  @state()
  private _activePanelId = DEFAULT_TAB.panelId;

  @property({ type: Boolean })
  hideTabStrip = false;

  private _viewIdToLabel = new Map<string, string>();
  private _viewIdToColor = new Map<string, string>();
  private _extensionIdToColor = new Map<string, string>();
  private _unmountedPanelViewIds = new Map<string, string>();

  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _panelUnmountListener: (() => void) | null = null;
  private _requestBoundsListener: (() => void) | null = null;
  private _restoreFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private _unmountedPanelIds = new Set<string>();
  private _panelUnmountedListener: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._restoreLayout();
    void this._refreshPanels();
    // Notify activity bar + nav panel of the restored active view after
    // the first refresh so the panelId → viewId lookup is available.
    setTimeout(() => this._notifyViewChanged(this._activePanelId), 0);
    // Wait for extension host to be ready, then activate restored tabs
    window.financeShell?.extensions?.onHostStatus?.((status: { status: string }) => {
      if (status.status === 'ready') {
        this._activateRestoredTabs();
      }
    });
    // Safety net: if the host never reports 'ready' (e.g. it was already
    // ready when we connected, so the subscription never re-fires), release
    // the restore guard so later real user mounts can focus normally.
    if (this._restorePending) {
      this._restoreFallbackTimer = setTimeout(() => {
        if (this._restorePending) {
          this._restorePending = false;
          this._restoredActivePanelId = '';
        }
      }, 5000);
    }
    // Track commandId for internal views mounted via nav commands
    window.addEventListener('command-selected', ((event: Event) => {
      const customEvent = event as CustomEvent<{ command: string; extensionCommand: boolean }>;
      if (customEvent.detail?.extensionCommand) {
        this._pendingCommandId = customEvent.detail.command;
      }
    }) as EventListener);
    this._panelUnmountListener = window.financeShell?.panel?.onMounted?.((panelId: string) => {
      void this._onPanelMounted(panelId);
    });
    this._requestBoundsListener = window.financeShell?.panel?.onRequestBounds?.((panelId: string) => {
      this._sendBoundsToPanel(panelId);
    }) ?? null;
    this._panelUnmountedListener = window.financeShell?.panel?.onUnmounted?.((panelId: string, viewId: string) => {
      this._unmountedPanelIds.add(panelId);
      this._unmountedPanelViewIds.set(panelId, viewId);
      this._viewIdToLabel.set(viewId, this._viewIdToLabel.get(viewId) ?? viewId);
      this.requestUpdate();
    }) ?? null;
  }

  private _pendingCommandId: string | null = null;
  private _restoringTabs = false;
  private _restorePending = false;
  private _restoredActivePanelId = '';

  private _colorForPanelId(panelId: string): string | undefined {
    const exactColor = this._extensionIdToColor.get(panelId);
    if (exactColor) return exactColor;

    for (const [extensionId, color] of this._extensionIdToColor) {
      if (panelId.startsWith(`panel-${extensionId}-`)) return color;
    }

    return undefined;
  }

  private async _onPanelMounted(panelId: string): Promise<void> {
    const isRestoredTab = this._tabs.some(t => t.panelId === panelId);
    if (this._restoringTabs || (this._restorePending && isRestoredTab)) {
      this._sendBoundsToPanel(panelId);
      return;
    }
    await this._refreshPanels();
    if (!this._tabs.some(t => t.panelId === panelId)) {
      const panels = await window.financeShell?.panel?.list?.() as Array<{ panelId: string; extensionId: string; viewId: string }> | undefined;
      const live = panels?.find(p => p.panelId === panelId);
      if (live) {
        this._addPanel(
          panelId,
          this._viewIdToLabel.get(live.viewId) ?? live.viewId,
          this._pendingCommandId ?? undefined,
          this._extensionIdToColor.get(live.extensionId) ??
            this._viewIdToColor.get(live.viewId) ??
            this._colorForPanelId(panelId),
        );
      } else {
        rendererLogger.warn(`_onPanelMounted panel not in tabs panelId=${panelId} availableTabs=${this._tabs.map(t => t.panelId).join(',')}`, 'workspace');
      }
      this._pendingCommandId = null;
    } else {
      this._unmountedPanelIds.delete(panelId);
      this._unmountedPanelViewIds.delete(panelId);
      this._focusPanel(panelId);
    }
    this._sendBoundsToPanel(panelId);
  }

  firstUpdated() {
    this._attachResizeObserver();
    requestAnimationFrame(() => {
      this._sendBoundsToPanel(this._activePanelId);
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._saveTimer) clearTimeout(this._saveTimer);
    if (this._restoreFallbackTimer) {
      clearTimeout(this._restoreFallbackTimer);
      this._restoreFallbackTimer = null;
    }
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._panelUnmountListener) {
      this._panelUnmountListener();
      this._panelUnmountListener = null;
    }
    if (this._requestBoundsListener) {
      this._requestBoundsListener();
      this._requestBoundsListener = null;
    }
    if (this._panelUnmountedListener) {
      this._panelUnmountedListener();
      this._panelUnmountedListener = null;
    }
  }

  private async _refreshPanels() {
    try {
      const contributions = await window.financeShell?.extensions?.list?.();
      if (!contributions?.views) return;
      for (const [extensionId, manifestColor] of Object.entries(contributions.themeColors ?? {})) {
        let setting: unknown;
        try {
          setting = await window.financeShell?.settings?.get?.(`${extensionId}.themeColor`);
        } catch {
          setting = undefined;
        }
        const color = resolveThemeColor({ setting, manifest: manifestColor ?? undefined });
        if (color) this._extensionIdToColor.set(extensionId, color);
        else this._extensionIdToColor.delete(extensionId);
      }
      // Record contributed view labels so _onPanelMounted can resolve a
      // freshly mounted panel's tab label without hitting the live list.
      for (const v of contributions.views) {
        this._viewIdToLabel.set(v.view.id, v.view.name);
        let setting: unknown;
        try {
          setting = await window.financeShell?.settings?.get?.(`${v.extensionId}.themeColor`);
        } catch {
          setting = undefined;
        }
        const color = resolveThemeColor({
          setting,
          manifest: contributions.themeColors?.[v.extensionId] ?? undefined,
        });
        if (color) this._viewIdToColor.set(v.view.id, color);
        else this._viewIdToColor.delete(v.view.id);
      }
      this._viewIdToLabel.set('pay-rate-history-view', 'Pay Rate History');
      const contributedLabels = new Map(
        contributions.views.map(v => [`panel-${v.extensionId}-${v.view.id}`, v.view.name])
      );
      const contributedColors = new Map(
        contributions.views.map(v => [
          `panel-${v.extensionId}-${v.view.id}`,
          this._viewIdToColor.get(v.view.id),
        ])
      );
      const livePanels = await window.financeShell?.panel?.list?.() as Array<{
        panelId: string;
        extensionId: string;
      }> | undefined;
      const livePanelColors = new Map(
        (livePanels ?? []).map(panel => [panel.panelId, this._extensionIdToColor.get(panel.extensionId)])
      );
      // Tabs are open panels only; contributed views become tabs when their
      // panel mounts (_onPanelMounted). Reconcile labels here so a renamed
      // view updates the tabs that are already open, and keep any
      // previously-added unregistered panels (internal extension panels not
      // listed in the activity bar).
      this._tabs = this._tabs.map(t => {
        const label = contributedLabels.get(t.panelId);
        const color = contributedColors.get(t.panelId) ??
          livePanelColors.get(t.panelId) ??
          this._colorForPanelId(t.panelId);
        if (label && label !== t.label) return { ...t, label, color };
        if (color !== t.color) return { ...t, color };
        return t;
      });
      if (this._tabs.length > 0 && !this._tabs.some(t => t.panelId === this._activePanelId)) {
        this._activePanelId = this._tabs[0].panelId;
      }
      this._scheduleSave();
      // Ensure panels get properly sized after discovery
      requestAnimationFrame(() => this._sendBoundsToPanel(this._activePanelId));
    } catch {
      // ignore
    }
  }

  async refreshThemeColors(): Promise<void> {
    await this._refreshPanels();
    this.requestUpdate();
  }

  private _restoreLayout() {
    try {
      const raw = localStorage.getItem('core.workspace.layout');
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<PersistedLayout> & { type?: string; panelId?: string; label?: string };
      if (saved && Array.isArray(saved.tabs)) {
        const tabs = (saved.tabs as Tab[]).filter(t => t && typeof t.panelId === 'string' && t.panelId.length > 0);
        if (tabs.length > 0) {
          this._tabs = tabs;
          this._activePanelId =
            typeof saved.activePanelId === 'string' && tabs.some(t => t.panelId === saved.activePanelId)
              ? saved.activePanelId
              : tabs[0].panelId;
          // Remember the restored active tab so _activateRestoredTabs can
          // re-assert it even if an onStartup panel (e.g. Dashboard) mounts
          // and steals focus before the host reports 'ready'.
          this._restoredActivePanelId = this._activePanelId;
          this._restorePending = true;
        }
      } else if (saved?.type === 'tab' && typeof saved.panelId === 'string') {
        // Legacy single-tab layout (pre-flat-model): migrate to flat format.
        this._tabs = [{ panelId: saved.panelId, label: saved.label ?? DEFAULT_TAB.label }];
        this._activePanelId = saved.panelId;
        this._restoredActivePanelId = this._activePanelId;
        this._restorePending = true;
      }
    } catch {
      // ignore corrupted layout
    }
  }

  // Activate views for tabs that were restored from localStorage but not yet mounted.
  // Panel IDs are in format "panel-${extensionId}-${viewId}".
  private async _activateRestoredTabs(): Promise<void> {
    if (!window.financeShell?.extensions?.activateView) return;
    // Get all views from extensions to build panelId -> viewId mapping
    // (panelId format: panel-${extensionId}-${viewId}, extensionId may contain dashes)
    const contributions = await window.financeShell.extensions.list();
    if (!contributions?.views) return;
    const panelIdToViewId = new Map<string, string>();
    for (const v of contributions.views) {
      const panelId = `panel-${v.extensionId}-${v.view.id}`;
      panelIdToViewId.set(panelId, v.view.id);
    }
    // Each activated view mounts its panel and fires onMounted -> _onPanelMounted,
    // which would otherwise overwrite the restored activePanelId with whichever
    // tab activated last. Hold the restored active tab aside while activating.
    const restoredActive = this._restoredActivePanelId || this._activePanelId;
    this._restoringTabs = true;
    try {
      for (const tab of this._tabs) {
        const viewId = panelIdToViewId.get(tab.panelId);
        rendererLogger.log(`_activateRestoredTabs: tab panelId=${tab.panelId} -> viewId=${viewId ?? '(internal)'} commandId=${tab.commandId}`, 'workspace');
        if (viewId) {
          try {
            await window.financeShell.extensions.activateView(viewId);
          } catch {
            // ignore activation failures
          }
        } else if (tab.commandId) {
          // Internal view with saved commandId - execute it to restore
          rendererLogger.debug(`_activateRestoredTabs: executing command for internal view ${tab.commandId}`, 'workspace');
          try {
            await window.financeShell.extensions.executeCommand(tab.commandId);
          } catch {
            // ignore activation failures
          }
        } else {
          // Tab for an internal view without commandId - will be mounted on-demand
          rendererLogger.log(`_activateRestoredTabs: skipping internal view panelId=${tab.panelId}`, 'workspace');
        }
      }
    } finally {
      this._restoringTabs = false;
    }
    // Restore is complete: a mount that arrives after this point is a real
    // user-driven mount and may focus normally.
    if (this._restoreFallbackTimer) {
      clearTimeout(this._restoreFallbackTimer);
      this._restoreFallbackTimer = null;
    }
    this._restorePending = false;
    this._restoredActivePanelId = '';
    // Re-assert the restored active tab now that every saved panel is mounted;
    // activation above focuses each panel in turn, so the last one would win.
    if (this._tabs.some((t) => t.panelId === restoredActive)) {
      this._focusPanel(restoredActive);
    }
  }

  private _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        const layout: PersistedLayout = { version: 1, tabs: this._tabs, activePanelId: this._activePanelId };
        const json = JSON.stringify(layout);
        if (json.length <= 16 * 1024) {
          localStorage.setItem('core.workspace.layout', json);
        }
      } catch {
        // ignore storage errors
      }
    }, 500);
  }

  private _focusPanel(panelId: string) {
    if (!this._tabs.some(t => t.panelId === panelId)) return;
    this._activePanelId = panelId;
    this._scheduleSave();
    if (this._unmountedPanelIds.has(panelId)) {
      void this._restorePanel(panelId);
      this.requestUpdate();
      return;
    }
    this._sendBoundsToPanel(panelId);
    window.financeShell?.panel?.show(panelId);
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent('workspace:focus-panel', { detail: { panelId }, bubbles: true, composed: true }));
    this._notifyViewChanged(panelId);
  }

  private _sendBoundsToPanel(panelId: string) {
    const content = this.renderRoot.querySelector('.content') as HTMLElement | null;
    if (!content) {
      rendererLogger.warn('_sendBoundsToPanel: .content element not found', 'workspace');
      return;
    }
    const rect = content.getBoundingClientRect();
    const bounds = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    try {
      window.financeShell?.panel?.resize(panelId, bounds);
    } catch (err) {
        rendererLogger.error('_sendBoundsToPanel: resize() threw', 'workspace', err as Error);
    }
  }

  private _notifyViewChanged(panelId: string) {
    window.financeShell?.panel?.list?.().then((panels) => {
      const live = panels?.find((p) => p.panelId === panelId);
      if (live?.viewId) {
        this.dispatchEvent(
          new CustomEvent('view-changed', {
            detail: { view: live.viewId, source: 'workspace' },
            bubbles: true,
            composed: true,
          }),
        );
      }
    });
  }

  private _addPanel(panelId: string, label: string, commandId?: string, color?: string) {
    if (this._tabs.some(t => t.panelId === panelId)) return;
    this._tabs = [...this._tabs, { panelId, label, commandId, color }];
    this._activePanelId = panelId;
    this._scheduleSave();
    this.requestUpdate();
    requestAnimationFrame(() => this._sendBoundsToPanel(panelId));
    this._notifyViewChanged(panelId);
  }

  private _closePanel(panelId: string) {
    window.financeShell?.panel?.unmount?.(panelId);
    const index = this._tabs.findIndex(t => t.panelId === panelId);
    if (index === -1) return;
    const nextTabs = this._tabs.filter(t => t.panelId !== panelId);
    this._tabs = nextTabs;
    if (this._activePanelId === panelId) {
      const next = nextTabs[Math.min(index, nextTabs.length - 1)];
      this._activePanelId = next?.panelId ?? '';
    }
    if (this._activePanelId) {
      this._sendBoundsToPanel(this._activePanelId);
      if (!this._unmountedPanelIds.has(this._activePanelId)) {
        window.financeShell?.panel?.show(this._activePanelId);
      }
    } else {
      window.financeShell?.panel?.unmountAll?.();
    }
    this._scheduleSave();
    this.requestUpdate();
    if (this._activePanelId) this._notifyViewChanged(this._activePanelId);
  }

  private _onTabFocus(panelId: string) {
    this._focusPanel(panelId);
  }

  private async _restorePanel(panelId: string) {
    const tab = this._tabs.find(t => t.panelId === panelId);
    if (tab?.commandId) {
      try {
        await window.financeShell?.extensions?.executeCommand?.(tab.commandId);
        return;
      } catch {
        // fall back to activateView if command execution fails
      }
    }
    const viewId = this._unmountedPanelViewIds.get(panelId);
    if (!viewId) return;
    try {
      await window.financeShell?.extensions?.activateView?.(viewId);
    } catch {
      // ignore remount failures
    }
  }

  private _onTabClose(panelId: string) {
    this._closePanel(panelId);
  }

  private _resizeObserver: ResizeObserver | null = null;

  private _attachResizeObserver() {
    const content = this.renderRoot.querySelector('.content') as HTMLElement | null;
    if (!content) return;
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._resizeObserver = new ResizeObserver(() => {
      const rect = content.getBoundingClientRect();
      const bounds = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
      window.financeShell?.panel?.resize(this._activePanelId, bounds);
    });
    this._resizeObserver.observe(content);
  }

  render() {
    const tabs = this._tabs.filter(t => !!t.panelId);

    if (!tabs.length || this.hideTabStrip) {
      return html`
        <div class="content">
          <slot>
            <div class="empty-state">Select a view from the Activity Bar</div>
          </slot>
        </div>
      `;
    }

    return html`
      <div class="tab-strip">
        <tab-bar .tabs="${tabs}" .activePanelId="${this._activePanelId}" @tab-focus="${(e: CustomEvent) => this._onTabFocus(e.detail.panelId)}" @tab-close="${(e: CustomEvent) => this._onTabClose(e.detail.panelId)}"></tab-bar>
      </div>
      <div class="content">
        ${this._activePanelId && this._unmountedPanelIds.has(this._activePanelId) ? html`
          <div class="empty-state" @click="${() => this._restorePanel(this._activePanelId)}">
            <div>
              <div style="font-size: var(--ff-font-lg); margin-bottom: 8px;">Panel asleep</div>
              <div style="color: var(--text-tertiary); font-size: var(--ff-font-sm);">Click to restore</div>
            </div>
          </div>
        ` : ''}
        <slot>
          <div class="empty-state">Select a view from the Activity Bar</div>
        </slot>
      </div>
    `;
  }
}
