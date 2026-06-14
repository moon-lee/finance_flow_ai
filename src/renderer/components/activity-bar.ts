import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

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
      color: #94a3b8;
      cursor: pointer;
      font: inherit;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    button:hover,
    button.active {
      background: rgba(255, 255, 255, 0.08);
      color: #f8fafc;
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
  `;

  private _activeView = 'Dashboard';

  private _selectView(view: string) {
    this._activeView = view;
    this.dispatchEvent(new CustomEvent('view-changed', {
      detail: { view },
      bubbles: true,
      composed: true
    }));
    this.requestUpdate();
  }

  render() {
    return html`
      <button class="${this._activeView === 'Dashboard' ? 'active' : ''}" title="Dashboard" aria-label="Dashboard" @click="${() => this._selectView('Dashboard')}">D</button>
      <button class="${this._activeView === 'Salary' ? 'active' : ''}" title="Salary History" aria-label="Salary History" @click="${() => this._selectView('Salary')}">P</button>
      <button class="${this._activeView === 'Budget' ? 'active' : ''}" title="Budget" aria-label="Budget" @click="${() => this._selectView('Budget')}">B</button>
      <button class="${this._activeView === 'Tax' ? 'active' : ''}" title="Tax" aria-label="Tax" @click="${() => this._selectView('Tax')}">X</button>
      <button class="settings ${this._activeView === 'Settings' ? 'active' : ''}" title="Settings" aria-label="Settings" @click="${() => this._selectView('Settings')}">S</button>
    `;
  }
}
