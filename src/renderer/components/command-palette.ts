import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('command-palette')
export class CommandPalette extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    input {
      width: 100%;
      padding: 14px;
      border: 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: transparent;
      color: #ffffff;
      font-size: 14px;
    }

    input:focus {
      outline: none;
    }

    .palette-list {
      max-height: 320px;
      overflow-y: auto;
      padding: 6px;
    }

    .palette-item {
      padding: 8px 12px;
      font-size: 13px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .palette-item.selected {
      background: var(--accent);
      color: #ffffff;
    }
  `;

  @state()
  private _selectedIndex = 0;

  private _items = [
    { id: 'view-dashboard', label: 'View: Dashboard' },
    { id: 'toggle-ai', label: 'View: Toggle AI Assistant' },
    { id: 'new-workspace', label: 'File: New Workspace' }
  ];

  firstUpdated() {
    this.addEventListener('keydown', this._handleKeyDown);
  }

  focusInput() {
    const input = this.shadowRoot?.querySelector('input');
    if (input) {
      input.focus();
      input.value = '';
    }
    this._selectedIndex = 0;
  }

  private _handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this._selectedIndex = (this._selectedIndex + 1) % this._items.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this._selectedIndex = (this._selectedIndex - 1 + this._items.length) % this._items.length;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this._selectItem(this._items[this._selectedIndex]);
    }
  }

  private _selectItem(item: { id: string; label: string }) {
    this.dispatchEvent(new CustomEvent('command-selected', {
      detail: { command: item.id },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    return html`
      <input aria-label="Command palette input" placeholder="Type a command..." />
      <div class="palette-list" role="listbox">
        ${this._items.map((item, index) => html`
          <div 
            class="palette-item ${index === this._selectedIndex ? 'selected' : ''}" 
            role="option"
            aria-selected="${index === this._selectedIndex}"
            @click="${() => this._selectItem(item)}"
            @mouseenter="${() => this._selectedIndex = index}"
          >
            ${item.label}
          </div>
        `)}
      </div>
    `;
  }
}
