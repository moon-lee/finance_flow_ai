import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface ActivityView {
  id: string;
  name: string;
  icon: string;
  color?: string;
}

@customElement('activity-bar')
export class ActivityBar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
    }

    button {
      position: relative;
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      font: inherit;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    button:hover,
    button.active {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary);
    }

    button:hover {
      transform: scale(1.05);
    }

    button.active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 6px;
      bottom: 6px;
      width: 3px;
      background: var(--accent);
      border-radius: 0 4px 4px 0;
      box-shadow: 0 0 8px var(--accent);
    }

    .settings {
      margin-top: auto;
    }

    .empty-hint {

    .empty-hint {
      color: var(--text-secondary);
      font-size: var(--ff-font-xs);
      margin-top: 8px;
      writing-mode: vertical-rl;
      text-orientation: mixed;
    }
  `;

  @property({ type: Array })
  views: ActivityView[] = [];

  @property({ type: String })
  activeView: string = '';

  private _selectView(viewId: string) {
    this.activeView = viewId;
    this.dispatchEvent(new CustomEvent('view-changed', {
      detail: { view: viewId, source: 'extension' },
      bubbles: true,
      composed: true
    }));
    this.requestUpdate();
  }

  render() {
    const buttons = this.views.map((view) => html`
      <button
        class="${this.activeView === view.id ? 'active' : ''}"
        title="${view.name}"
        aria-label="${view.name}"
        data-view-id="${view.id}"
        style="${this.activeView === view.id && view.color ? `background: ${view.color}; color: #ffffff;` : ''}"
        @click="${(e: MouseEvent) => { if (e.isTrusted) this._selectView(view.id); }}"
      >${view.icon}</button>
    `);
    return html`
      ${buttons}
      ${this.views.length === 0 ? html`<div class="empty-hint">No extensions</div>` : ''}
      <button
        class="settings ${this.activeView === '__settings__' ? 'active' : ''}"
        title="Settings"
        aria-label="Settings"
        @click="${(e: MouseEvent) => { if (e.isTrusted) this._selectView('__settings__'); }}"
      >S</button>
    `;
  }
}
