import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
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

    .tab.drop-before {
      box-shadow: inset 2px 0 0 var(--accent);
    }

    .tab.drop-after {
      box-shadow: inset -2px 0 0 var(--accent);
    }
  `;

  @property({ type: Array })
  tabs: Tab[] = [];

  @property({ type: String })
  activePanelId = '';

  @property({ type: String })
  direction: 'horizontal' | 'vertical' = 'horizontal';

  @state()
  private _dragFrom: string | null = null;

  @state()
  private _dropKey: string | null = null;

  private _onTabClick(panelId: string) {
    this.dispatchEvent(new CustomEvent('tab-focus', { detail: { panelId }, bubbles: true, composed: true }));
  }

  private _onTabClose(e: Event, panelId: string) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('tab-close', { detail: { panelId }, bubbles: true, composed: true }));
  }

  private _onDragStart(e: DragEvent, panelId: string) {
    this._dragFrom = panelId;
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', panelId);
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  private _onDragOver(e: DragEvent, panelId: string) {
    e.preventDefault();
    if (!this._dragFrom || this._dragFrom === panelId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientX > rect.left + rect.width / 2;
    this._dropKey = `${after ? 'after' : 'before'}:${panelId}`;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  private _onDragLeave(e: DragEvent) {
    const to = (e as DragEvent & { relatedTarget?: Node | null }).relatedTarget;
    if (to && (e.currentTarget as HTMLElement).contains(to as Node)) return;
    this._dropKey = null;
  }

  private _onDrop(e: DragEvent, panelId: string) {
    e.preventDefault();
    const from = this._dragFrom ?? e.dataTransfer?.getData('text/plain') ?? '';
    this._dragFrom = null;
    this._dropKey = null;
    if (!from || from === panelId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientX > rect.left + rect.width / 2;
    this.dispatchEvent(new CustomEvent('tab-reorder', { detail: { fromPanelId: from, toPanelId: panelId, after }, bubbles: true, composed: true }));
  }

  private _onDragEnd() {
    this._dragFrom = null;
    this._dropKey = null;
  }

  private _onTabKeyDown(e: KeyboardEvent, panelId: string) {
    if (!e.ctrlKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    this.dispatchEvent(new CustomEvent('tab-move', { detail: { panelId, dir: e.key === 'ArrowRight' ? 1 : -1 }, bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div class="tabs" role="tablist">
        ${this.tabs.map(tab => html`
          <div class="tab ${tab.panelId === this.activePanelId ? 'active' : ''} ${this._dropKey === `before:${tab.panelId}` ? 'drop-before' : ''} ${this._dropKey === `after:${tab.panelId}` ? 'drop-after' : ''}"
                role="tab"
                tabindex="0"
                draggable="true"
                aria-selected="${tab.panelId === this.activePanelId}"
                @click="${() => tab.panelId && this._onTabClick(tab.panelId)}"
                @keydown="${(e: KeyboardEvent) => tab.panelId && this._onTabKeyDown(e, tab.panelId)}"
                @dragstart="${(e: DragEvent) => tab.panelId && this._onDragStart(e, tab.panelId)}"
                @dragover="${(e: DragEvent) => tab.panelId && this._onDragOver(e, tab.panelId)}"
                @dragleave="${(e: DragEvent) => this._onDragLeave(e)}"
                @drop="${(e: DragEvent) => tab.panelId && this._onDrop(e, tab.panelId)}"
                @dragend="${() => this._onDragEnd()}">
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
