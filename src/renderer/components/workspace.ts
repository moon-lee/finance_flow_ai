import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './tab-bar';
import './split-pane';

export interface Tab {
  panelId: string;
  label: string;
}

export type WorkspaceNode =
  | { type: 'tab'; panelId: string; label: string }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; children: [WorkspaceNode, WorkspaceNode] };

function isTab(node: WorkspaceNode): node is { type: 'tab'; panelId: string; label: string } {
  return node.type === 'tab';
}

function isSplit(node: WorkspaceNode): node is { type: 'split'; direction: 'horizontal' | 'vertical'; children: [WorkspaceNode, WorkspaceNode] } {
  return node.type === 'split';
}

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
  private _layout: WorkspaceNode = {
    type: 'tab',
    panelId: 'panel-dashboard-dashboard-view',
    label: 'Dashboard'
  };

  @state()
  private _activePanelId = 'panel-dashboard-dashboard-view';

  @state()
  private _tabs: Tab[] = [];
  private _viewIdToLabel = new Map<string, string>();

  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _panelUnmountListener: (() => void) | null = null;
  private _requestBoundsListener: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._restoreLayout();
    void this._refreshPanels();
    this._panelUnmountListener = window.financeShell?.panel?.onMounted?.((panelId: string) => {
      console.log('[workspace] onMounted callback', { panelId, activePanelId: this._activePanelId });
      void this._onPanelMounted(panelId);
    });
    this._requestBoundsListener = window.financeShell?.panel?.onRequestBounds?.((panelId: string) => {
      console.log('[workspace] onRequestBounds callback', { panelId });
      this._sendBoundsToPanel(panelId);
    }) ?? null;
  }

  private async _onPanelMounted(panelId: string): Promise<void> {
    console.log('[workspace] _onPanelMounted start', { panelId, tabsCount: this._tabs.length });
    await this._refreshPanels();
    console.log('[workspace] _onPanelMounted after refresh', { panelId, tabsCount: this._tabs.length });
    // Add panel as a new tab if it's not already in the layout
    if (!this._findNode(this._layout, panelId)) {
      let panel = this._tabs.find(t => t.panelId === panelId);
      // Panel may not be in registered views (internal extension panel).
      // Fetch its label from the live panel list.
      if (!panel) {
        const panels = await window.financeShell?.panel?.list?.() as Array<{ panelId: string; extensionId: string; viewId: string }> | undefined;
        const live = panels?.find(p => p.panelId === panelId);
        if (live) {
          panel = { panelId, label: this._viewIdToLabel.get(live.viewId) ?? live.viewId };
          this._tabs.push(panel);
        }
      }
      if (panel) {
        console.log('[workspace] _onPanelMounted adding panel', { panelId, label: panel.label });
        this._addPanel(panel.panelId, panel.label);
      } else {
        console.warn('[workspace] _onPanelMounted panel not in tabs', { panelId, availableTabs: this._tabs.map(t => t.panelId) });
      }
    } else {
      console.log('[workspace] _onPanelMounted panel already in layout', { panelId });
      this._focusPanel(panelId);
    }
    // Show the panel with correct bounds
    this._sendBoundsToPanel(panelId);
    console.log('[workspace] _onPanelMounted done', { panelId });
  }

  firstUpdated() {
    this._attachResizeObserver();
    console.log('[workspace] firstUpdated — activePanelId:', this._activePanelId);
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

  private _getLeafTabs(node: WorkspaceNode): Tab[] {
    if (isTab(node)) return [{ panelId: node.panelId, label: node.label }];
    return [...this._getLeafTabs(node.children[0]), ...this._getLeafTabs(node.children[1])];
  }

  private _getActiveLeaf(node: WorkspaceNode): { type: 'tab'; panelId: string; label: string } | null {
    if (isTab(node)) return node;
    const leftActive = this._getActiveLeaf(node.children[0]);
    const rightActive = this._getActiveLeaf(node.children[1]);
    return leftActive ?? rightActive ?? null;
  }

  private _findNode(node: WorkspaceNode, panelId: string): WorkspaceNode | null {
    if (isTab(node) && node.panelId === panelId) return node;
    if (isSplit(node)) {
      const found = this._findNode(node.children[0], panelId) ?? this._findNode(node.children[1], panelId);
      if (found) return found;
    }
    return null;
  }

  private _setActive(node: WorkspaceNode, panelId: string): WorkspaceNode {
    if (isTab(node)) {
      return { ...node };
    }
    const left = this._setActive(node.children[0], panelId);
    const right = this._setActive(node.children[1], panelId);
    return { ...node, children: [left, right] };
  }

  private _addTab(node: WorkspaceNode, panelId: string, label: string): WorkspaceNode {
    if (isTab(node)) {
      return {
        type: 'split',
        direction: 'horizontal',
        children: [node, { type: 'tab', panelId, label }]
      };
    }
    const left = this._addTab(node.children[0], panelId, label);
    // Only add to the first (left) branch — adding to both branches
    // would duplicate the new tab at every leaf in the tree.
    return { ...node, children: [left, node.children[1]] };
  }

  private _removeTab(node: WorkspaceNode, panelId: string): WorkspaceNode | null {
    if (isTab(node)) {
      if (node.panelId === panelId) return null;
      return node;
    }
    const left = this._removeTab(node.children[0], panelId);
    const right = this._removeTab(node.children[1], panelId);
    if (!left && !right) return null;
    if (!left) return right;
    if (!right) return left;
    return { ...node, children: [left, right] };
  }

  private _collapseEmptySplits(node: WorkspaceNode): WorkspaceNode {
    if (isTab(node)) return node;
    const left = this._collapseEmptySplits(node.children[0]);
    const right = this._collapseEmptySplits(node.children[1]);
    if (isTab(left) && isTab(right) && left.panelId === right.panelId) {
      return left;
    }
    return { ...node, children: [left, right] };
  }

  private async _refreshPanels() {
    console.log('[workspace] _refreshPanels start');
    try {
      const contributions = await window.financeShell?.extensions?.list?.();
      console.log('[workspace] _refreshPanels fetched contributions', { viewCount: contributions?.views?.length });
      if (!contributions?.views) return;
      this._viewIdToLabel.set('pay-rate-history-view', 'Pay Rate History');
      const tabs: Tab[] = contributions.views.map(v => ({
        panelId: `panel-${v.extensionId}-${v.view.id}`,
        label: v.view.name
      }));
      // Preserve any previously-added unregistered panels (internal
      // extension panels not listed in the activity bar).
      for (const existing of this._tabs) {
        if (!tabs.find(t => t.panelId === existing.panelId)) {
          tabs.push(existing);
        }
      }
      this._tabs = tabs;
      console.log('[workspace] _refreshPanels tabs updated', { tabCount: tabs.length, activePanelId: this._activePanelId });
      if (tabs.length > 0 && !this._findNode(this._layout, this._activePanelId)) {
        this._activePanelId = tabs[0].panelId;
        this._layout = { type: 'tab', panelId: tabs[0].panelId, label: tabs[0].label };
        this._scheduleSave();
      }
      // Ensure panels get properly sized after discovery
      requestAnimationFrame(() => this._sendBoundsToPanel(this._activePanelId));
    } catch {
      // ignore
    }
    console.log('[workspace] _refreshPanels done');
  }

  private _restoreLayout() {
    try {
      const raw = localStorage.getItem('core.workspace.layout');
      if (!raw) return;
      const layout = JSON.parse(raw) as WorkspaceNode;
      if (layout && isTab(layout)) {
        this._layout = layout;
        this._activePanelId = layout.panelId;
      }
    } catch {
      // ignore corrupted layout
    }
  }

  private _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        const json = JSON.stringify(this._layout);
        if (json.length <= 16 * 1024) {
          localStorage.setItem('core.workspace.layout', json);
        }
      } catch {
        // ignore storage errors
      }
    }, 500);
  }

  private _focusPanel(panelId: string) {
    this._activePanelId = panelId;
    this._layout = this._setActive(this._layout, panelId);
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
    console.log('[workspace] _sendBoundsToPanel', { panelId, bounds, hasFinanceShell: !!window.financeShell, hasPanel: !!window.financeShell?.panel, hasResize: typeof window.financeShell?.panel?.resize });
    try {
      window.financeShell?.panel?.resize(panelId, bounds);
    } catch (err) {
      console.error('[workspace] _sendBoundsToPanel: resize() threw', err);
    }
  }

  private _addPanel(panelId: string, label: string) {
    if (this._findNode(this._layout, panelId)) return;
    this._layout = this._addTab(this._layout, panelId, label);
    this._activePanelId = panelId;
    this._scheduleSave();
    this.requestUpdate();
    requestAnimationFrame(() => this._sendBoundsToPanel(panelId));
  }

  private _closePanel(panelId: string) {
    window.financeShell?.panel?.unmount?.(panelId);
    const next = this._removeTab(this._layout, panelId);
    if (next) {
      this._layout = this._collapseEmptySplits(next);
      if (this._activePanelId === panelId) {
        const active = this._getActiveLeaf(this._layout);
        this._activePanelId = active?.panelId ?? '';
      }
      // Show the surviving panel — it may have been hidden by a previous
      // showPanel() call when the now-closed panel was active.
      if (this._activePanelId) {
        this._sendBoundsToPanel(this._activePanelId);
        window.financeShell?.panel?.show(this._activePanelId);
      }
    } else {
      this._layout = { type: 'tab', panelId: '', label: '' };
      this._activePanelId = '';
      window.financeShell?.panel?.unmountAll?.();
    }
    this._scheduleSave();
    this.requestUpdate();
  }

  private _firstLeafPanelId(node: WorkspaceNode): string {
    if (isTab(node)) return node.panelId;
    return this._firstLeafPanelId(node.children[0]);
  }

  private _onTabFocus(panelId: string) {
    this._focusPanel(panelId);
  }

  private _onTabClose(panelId: string) {
    console.log('[workspace] _onTabClose', panelId);
    this._closePanel(panelId);
  }

  private _onTabDragEnd() {
    this._refreshPanels();
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
    const allTabs = this._getLeafTabs(this._layout);
    const tabs = allTabs.filter(t => !!t.panelId);

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
        <tab-bar .tabs="${tabs}" .activePanelId="${this._activePanelId}" @tab-focus="${(e: CustomEvent) => this._onTabFocus(e.detail.panelId)}" @tab-close="${(e: CustomEvent) => this._onTabClose(e.detail.panelId)}" @tab-drag-end="${this._onTabDragEnd}"></tab-bar>
      </div>
      <div class="content">
        <slot>
          <div class="empty-state">Select a view from the Activity Bar</div>
        </slot>
      </div>
    `;
  }
}
