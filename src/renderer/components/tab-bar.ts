import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Tab } from './types';

@customElement('tab-bar')
export class TabBar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      min-width: 0;
      height: 38px;
      background: var(--tab-bg);
      border-bottom: 1px solid var(--tab-border);
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
      border-right: 1px solid var(--tab-border);
      background: var(--tab-bg);
      color: var(--tab-text);
      font-size: var(--ff-font-base);
      cursor: pointer;
      user-select: none;
      gap: 8px;
      position: relative;
    }

    .tab:hover {
      background: var(--section-header-hover-bg);
    }

    .tab.active {
      background: var(--tab-active-bg);
      color: var(--tab-active-text);
      border-bottom: 1px solid var(--tab-active-bg);
      margin-bottom: -1px;
    }

    .tab-icon {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      font-size: var(--ff-font-md);
      font-weight: 700;
      flex-shrink: 0;
    }

    .tab.active .tab-icon {
      background: var(--tab-icon-active-bg);
      color: var(--tab-active-text);
    }

    .tab:not(.active) .tab-icon {
      background: var(--tab-icon-inactive-bg);
      color: var(--tab-icon-inactive-text);
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
      font-size: var(--ff-font-lg);
      color: var(--tab-text);
      line-height: 1;
    }

    .tab-close:hover {
      background: var(--tab-close-hover-bg);
      color: var(--tab-active-text);
    }

    .tab.active .tab-close:hover {
      background: var(--tab-icon-active-bg);
      color: var(--tab-active-text);
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

  render() {
    return html`
      <div class="tabs" role="tablist">
        ${this.tabs.map(tab => html`
          <div class="tab ${tab.panelId === this.activePanelId ? 'active' : ''}"
               role="tab"
               aria-selected="${tab.panelId === this.activePanelId}"
               @click="${() => tab.panelId && this._onTabClick(tab.panelId)}">
            <span
              class="tab-icon"
              style="${tab.panelId === this.activePanelId && tab.color ? `background: ${tab.color}; color: #ffffff;` : ''}"
            >${tab.label.split(' ')[1]?.charAt(0).toUpperCase() ?? tab.label.charAt(0).toUpperCase()}</span>
            <span class="tab-label">${tab.label}</span>
            ${tab.panelId ? html`<span class="tab-close" @click="${(e: Event) => this._onTabClose(e, tab.panelId)}">\u00d7</span>` : ''}
          </div>
        `)}
      </div>
    `;
  }
}
