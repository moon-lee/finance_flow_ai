import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './tab-bar';

export interface Tab {
  panelId: string;
  label: string;
}

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
      background: #252526;
      border-bottom: 1px solid #3c3c3c;
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
      color: #9a9a9a;
      font-size: 14px;
    }
  `;

  @state()
  private _tabs: Tab[] = [DEFAULT_TAB];

  @state()
  private _activePanelId = DEFAULT_TAB.panelId;

  private _viewIdToLabel = new Map<string, string>();

  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _panelUnmountListener: (() => void) | null = null;
  private _requestBoundsListener: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._restoreLayout();
    void this._refreshPanels();
    this._panelUnmountListener = window.financeShell?.panel?.onMounted?.((panelId: string) => {
      void this._onPanelMounted(panelId);
    });
    this._requestBoundsListener = window.financeShell?.panel?.onRequestBounds?.((panelId: string) => {
      this._sendBoundsToPanel(panelId);
    }) ?? null;
  }

  private async _onPanelMounted(panelId: string): Promise<void> {
    await this._refreshPanels();
    // Focus the tab if the panel is already open; otherwise add it.
    if (!this._tabs.some(t => t.panelId === panelId)) {
      // Panel may not be in registered views (internal extension panel).
      // Fetch its label from the live panel list.
      const panels = await window.financeShell?.panel?.list?.() as Array<{ panelId: string; extensionId: string; viewId: string }> | undefined;
      const live = panels?.find(p => p.panelId === panelId);
      if (live) {
        this._addPanel(panelId, this._viewIdToLabel.get(live.viewId) ?? live.viewId);
      } else {
        console.warn('[workspace] _onPanelMounted panel not in tabs', { panelId, availableTabs: this._tabs.map(t => t.panelId) });
      }
    } else {
      this._focusPanel(panelId);
    }
    // Show the panel with correct bounds
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
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._panelUnmountListener) {
      this._panelUnmountListener();
      this._panelUnmountListener = null;
    }
    if (this._requestBoundsListener) {
      this._requestBoundsListener();
      this._requestBoundsListener = null;
    }
  }

  private async _refreshPanels() {
    try {
      const contributions = await window.financeShell?.extensions?.list?.();
      if (!contributions?.views) return;
      // Record contributed view labels so _onPanelMounted can resolve a
      // freshly mounted panel's tab label without hitting the live list.
      for (const v of contributions.views) {
        this._viewIdToLabel.set(v.view.id, v.view.name);
      }
      this._viewIdToLabel.set('pay-rate-history-view', 'Pay Rate History');
      const contributedLabels = new Map(
        contributions.views.map(v => [`panel-${v.extensionId}-${v.view.id}`, v.view.name])
      );
      // Tabs are open panels only; contributed views become tabs when their
      // panel mounts (_onPanelMounted). Reconcile labels here so a renamed
      // view updates the tabs that are already open, and keep any
      // previously-added unregistered panels (internal extension panels not
      // listed in the activity bar).
      this._tabs = this._tabs.map(t => {
        const label = contributedLabels.get(t.panelId);
        return label && label !== t.label ? { ...t, label } : t;
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
        }
      } else if (saved?.type === 'tab' && typeof saved.panelId === 'string') {
        // Legacy single-tab layout (pre-flat-model): migrate to flat format.
        this._tabs = [{ panelId: saved.panelId, label: saved.label ?? DEFAULT_TAB.label }];
        this._activePanelId = saved.panelId;
      }
    } catch {
      // ignore corrupted layout
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
    this._sendBoundsToPanel(panelId);
    window.financeShell?.panel?.show(panelId);
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent('workspace:focus-panel', { detail: { panelId }, bubbles: true, composed: true }));
  }

  private _sendBoundsToPanel(panelId: string) {
    const content = this.renderRoot.querySelector('.content') as HTMLElement | null;
    if (!content) {
      console.warn('[workspace] _sendBoundsToPanel: .content element not found');
      return;
    }
    const rect = content.getBoundingClientRect();
    const bounds = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    try {
      window.financeShell?.panel?.resize(panelId, bounds);
    } catch (err) {
      console.error('[workspace] _sendBoundsToPanel: resize() threw', err);
    }
  }

  private _addPanel(panelId: string, label: string) {
    if (this._tabs.some(t => t.panelId === panelId)) return;
    this._tabs = [...this._tabs, { panelId, label }];
    this._activePanelId = panelId;
    this._scheduleSave();
    this.requestUpdate();
    requestAnimationFrame(() => this._sendBoundsToPanel(panelId));
  }

  private _closePanel(panelId: string) {
    window.financeShell?.panel?.unmount?.(panelId);
    const index = this._tabs.findIndex(t => t.panelId === panelId);
    if (index === -1) return;
    const nextTabs = this._tabs.filter(t => t.panelId !== panelId);
    this._tabs = nextTabs;
    if (this._activePanelId === panelId) {
      // Focus the tab that took the closed tab's place, or the new last tab.
      const next = nextTabs[Math.min(index, nextTabs.length - 1)];
      this._activePanelId = next?.panelId ?? '';
    }
    // Show the surviving panel — it may have been hidden by a previous
    // showPanel() call when the now-closed panel was active.
    if (this._activePanelId) {
      this._sendBoundsToPanel(this._activePanelId);
      window.financeShell?.panel?.show(this._activePanelId);
    } else {
      window.financeShell?.panel?.unmountAll?.();
    }
    this._scheduleSave();
    this.requestUpdate();
  }

  private _onTabFocus(panelId: string) {
    this._focusPanel(panelId);
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

    if (!tabs.length) {
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
        <slot>
          <div class="empty-state">Select a view from the Activity Bar</div>
        </slot>
      </div>
    `;
  }
}
