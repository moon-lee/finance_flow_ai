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
      background: #252526;
      border-bottom: 1px solid #3c3c3c;
    }

    .tabs {
      display: flex;
      height: 100%;
    }

    .tab {
      display: flex;
      align-items: center;
      height: 100%;
      min-width: 140px;
      max-width: 220px;
      padding: 0 12px;
      border-right: 1px solid #3c3c3c;
      background: #1e1e1e;
      color: #ffffff;
      font-size: 13px;
      cursor: pointer;
      user-select: none;
      gap: 6px;
    }

    .tab.active {
      background: #1e1e1e;
      border-top: 1px solid #6366f1;
    }

    .tab:not(.active) {
      background: #2d2d2d;
    }

    .tab-close {
      margin-left: auto;
      font-size: 12px;
      opacity: 0.7;
    }

    .tab-close:hover {
      opacity: 1;
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
            <span>${tab.label}</span>
            ${tab.panelId ? html`<span class="tab-close" @click="${(e: Event) => this._onTabClose(e, tab.panelId)}">\u00d7</span>` : ''}
          </div>
        `)}
      </div>
    `;
  }
}
