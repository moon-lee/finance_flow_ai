import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface Tab {
  panelId: string;
  label: string;
}

@customElement('tab-bar')
export class TabBar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      min-width: 0;
      height: 36px;
      background: #2d2d30;
      border-bottom: 1px solid #3e3e3e;
    }

    .tabs {
      display: flex;
      height: 100%;
      flex-shrink: 0;
    }

    .tab {
      display: flex;
      align-items: center;
      height: 100%;
      min-width: 100px;
      max-width: 200px;
      padding: 0 12px;
      border-right: 1px solid #3e3e3e;
      background: #2d2d30;
      color: #858585;
      font-size: 13px;
      cursor: pointer;
      user-select: none;
      gap: 8px;
      position: relative;
    }

    .tab:hover {
      background: #37373d;
    }

    .tab.active {
      background: #1e1e1e;
      color: #ffffff;
      border-bottom: 1px solid #1e1e1e;
      margin-bottom: -1px;
    }

    .tab-icon {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 700;
      flex-shrink: 0;
    }

    .tab.active .tab-icon {
      background: #007acc;
      color: #ffffff;
    }

    .tab:not(.active) .tab-icon {
      background: #3c3c3c;
      color: #cccccc;
    }

    .tab-label {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tab-close {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      font-size: 14px;
      color: #858585;
      line-height: 1;
    }

    .tab-close:hover {
      background: #3e3e3e;
      color: #ffffff;
    }

    .tab.active .tab-close:hover {
      background: #007acc;
      color: #ffffff;
    }

    .tab-drop-affordance {
      width: 6px;
      cursor: col-resize;
      background: transparent;
      flex-shrink: 0;
    }

    .tab-drop-affordance:hover {
      background: #007acc;
    }
  `;

  @property({ type: Array })
  tabs: Tab[] = [];

  @property({ type: String })
  activePanelId = '';

  @property({ type: String })
  direction: 'horizontal' | 'vertical' = 'horizontal';

  private _onTabClick(panelId: string) {
    this.dispatchEvent(new CustomEvent('tab-focus', { detail: { panelId }, bubbles: true, composed: true }));
  }

  private _onTabClose(e: Event, panelId: string) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('tab-close', { detail: { panelId }, bubbles: true, composed: true }));
  }

  private _onDragStart(event: DragEvent, panelId: string) {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', panelId);
    event.dataTransfer.effectAllowed = 'move';
  }

  private _onDragEnd() {
    this.dispatchEvent(new CustomEvent('tab-drag-end', { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div class="tabs" role="tablist">
        ${this.tabs.map(tab => html`
          <div class="tab ${tab.panelId === this.activePanelId ? 'active' : ''}"
               role="tab"
               aria-selected="${tab.panelId === this.activePanelId}"
               draggable="${tab.panelId ? 'true' : 'false'}"
               @click="${() => tab.panelId && this._onTabClick(tab.panelId)}"
               @dragstart="${(e: DragEvent) => tab.panelId && this._onDragStart(e, tab.panelId)}"
               @dragend="${this._onDragEnd}">
            <span class="tab-icon">${tab.label.split(' ')[1]?.charAt(0).toUpperCase() ?? tab.label.charAt(0).toUpperCase()}</span>
            <span class="tab-label">${tab.label}</span>
            ${tab.panelId ? html`<span class="tab-close" @click="${(e: Event) => this._onTabClose(e, tab.panelId)}">\u00d7</span>` : ''}
          </div>
        `)}
      </div>
    `;
  }
}
