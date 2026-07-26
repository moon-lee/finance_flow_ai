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

  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _panelUnmountListener: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._restoreLayout();
    this._refreshPanels();
    this._panelUnmountListener = window.financeShell?.panel?.onMounted?.((panelId: string) => {
      this._refreshPanels();
      // Check if this panel is new (not in current layout)
      if (!this._findNode(this._layout, panelId)) {
        const panel = this._tabs.find(t => t.panelId === panelId);
        if (panel) {
          this._addPanel(panelId, panel.label);
        }
      }
      if (panelId.includes('accounts-seed-modal')) {
        this._focusPanel(panelId);
      }
    });
  }

  firstUpdated() {
    this._attachResizeObserver();
    console.log('[workspace] firstUpdated — sending bounds for panel:', this._activePanelId);
    // Use requestAnimationFrame to ensure layout is correct
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
    const right = this._addTab(node.children[1], panelId, label);
    return { ...node, children: [left, right] };
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
    try {
      const contributions = await window.financeShell?.extensions?.list?.();
      if (!contributions?.views) return;
      const tabs: Tab[] = contributions.views.map(v => ({
        panelId: `panel-${v.extensionId}-${v.view.id}`,
        label: v.view.name
      }));
      this._tabs = tabs;
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
    this.dispatchEvent(new CustomEvent('workspace:focus-panel', { detail: { panelId }, bubbles: true, composed: true }));
  }

  private _sendBoundsToPanel(panelId: string) {
    const content = this.renderRoot.querySelector('.content') as HTMLElement | null;
    if (!content) { console.warn('[workspace] _sendBoundsToPanel: .content element not found'); return; }
    const rect = content.getBoundingClientRect();
    const bounds = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    console.log('[workspace] _sendBoundsToPanel', { panelId, bounds });
    window.financeShell?.panel?.resize(panelId, bounds);
  }

  private _addPanel(panelId: string, label: string) {
    if (this._findNode(this._layout, panelId)) return;
    this._layout = this._addTab(this._layout, panelId, label);
    this._activePanelId = panelId;
    this._scheduleSave();
    requestAnimationFrame(() => this._sendBoundsToPanel(panelId));
  }

  private _closePanel(panelId: string) {
    const next = this._removeTab(this._layout, panelId);
    if (!next) return;
    this._layout = this._collapseEmptySplits(next);
    if (this._activePanelId === panelId) {
      const active = this._getActiveLeaf(this._layout);
      this._activePanelId = active?.panelId ?? this._firstLeafPanelId(this._layout);
    }
    this._scheduleSave();
    requestAnimationFrame(() => this._sendBoundsToPanel(this._activePanelId));
  }

  private _firstLeafPanelId(node: WorkspaceNode): string {
    if (isTab(node)) return node.panelId;
    return this._firstLeafPanelId(node.children[0]);
  }

  private _onTabFocus(panelId: string) {
    this._focusPanel(panelId);
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
    const activeLeaf = this._getActiveLeaf(this._layout);
    const activePanelId = activeLeaf?.panelId ?? this._activePanelId;
    const tabs = this._getLeafTabs(this._layout);

    if (isSplit(this._layout)) {
      const leftTabs = this._getLeafTabs(this._layout.children[0]);
      const rightTabs = this._getLeafTabs(this._layout.children[1]);
      const leftActive = this._getActiveLeaf(this._layout.children[0])?.panelId ?? leftTabs[0]?.panelId ?? '';
      const rightActive = this._getActiveLeaf(this._layout.children[1])?.panelId ?? rightTabs[0]?.panelId ?? '';
      return html`
        <div class="tab-strip">
          <tab-bar .tabs="${leftTabs}" .activePanelId="${leftActive}" @tab-focus="${(e: CustomEvent) => this._onTabFocus(e.detail.panelId)}" @tab-drag-end="${this._onTabDragEnd}"></tab-bar>
          <tab-bar .tabs="${rightTabs}" .activePanelId="${rightActive}" @tab-focus="${(e: CustomEvent) => this._onTabFocus(e.detail.panelId)}" @tab-drag-end="${this._onTabDragEnd}"></tab-bar>
        </div>
        <div class="content">
          <split-pane .direction="${this._layout.direction}">
            <div slot="left" style="width:100%;height:100%;"></div>
            <div slot="right" style="width:100%;height:100%;"></div>
          </split-pane>
        </div>
      `;
    }

    return html`
      <div class="tab-strip">
        <tab-bar .tabs="${tabs}" .activePanelId="${activePanelId}" @tab-focus="${(e: CustomEvent) => this._onTabFocus(e.detail.panelId)}" @tab-drag-end="${this._onTabDragEnd}"></tab-bar>
      </div>
      <div class="content">
        <slot>
          <div class="empty-state">Select a view from the Activity Bar</div>
        </slot>
      </div>
    `;
  }
}
