import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

export interface PaletteCommand {
  id: string;
  label: string;
  /** If true, this is an extension command and we forward the click to Main. */
  extensionCommand?: boolean;
  /** Optional keyboard shortcut shown right-aligned in the row (e.g. "Ctrl+Alt+H"). */
  keybinding?: string;
}

const BUILT_IN_COMMANDS: PaletteCommand[] = [
  { id: 'view-dashboard', label: 'View: Dashboard' },
  { id: 'toggle-ai', label: 'View: Toggle AI Assistant' },
  { id: 'new-workspace', label: 'File: New Workspace' }
];

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
      border-bottom: 1px solid var(--panel-border);
      background: transparent;
      color: var(--text-primary);
      font-size: var(--ff-font-md);
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
      font-size: var(--ff-font-md);
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .palette-item.selected {
      background: var(--accent);
      color: var(--text-primary);
    }

    .palette-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .palette-item .label-text {
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .keybinding {
      flex: 0 0 auto;
      display: inline-flex;
      gap: 2px;
    }

    .keybinding kbd {
      font-family: 'SF Mono', Consolas, monospace;
      font-size: var(--ff-font-xs);
      line-height: 1;
      padding: 2px 5px;
      border-radius: 4px;
      border: 1px solid var(--panel-border);
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-secondary);
    }

    .palette-item.selected .keybinding kbd {
      border-color: var(--panel-border);
      background: rgba(255, 255, 255, 0.14);
      color: var(--text-primary);
    }

    .group-label {
      padding: 6px 12px 2px;
      color: var(--text-secondary);
      font-size: var(--ff-font-xs);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .empty-hint {
      padding: 12px;
      color: var(--text-secondary);
      font-size: var(--ff-font-md);
      text-align: center;
    }
  `;

  @state()
  private _selectedIndex = 0;

  // [Review fix §3.3] Holds the live filter query. Updated via the input's
  // `@input` handler; resets to '' when the palette is re-opened.
  @state()
  private _query = '';

  @property({ type: Array })
  extensionCommands: PaletteCommand[] = [];

  /** Case-insensitive substring filter applied to both groups. */
  private _matches(cmd: PaletteCommand): boolean {
    if (this._query === '') return true;
    return cmd.label.toLowerCase().includes(this._query.toLowerCase());
  }

  private get _builtInFiltered(): PaletteCommand[] {
    return BUILT_IN_COMMANDS.filter((c) => this._matches(c));
  }

  private get _extensionFiltered(): PaletteCommand[] {
    return this.extensionCommands.filter((c) => this._matches(c));
  }

  /** Flat list for keyboard navigation. Indices line up with rendered rows. */
  private get _items(): PaletteCommand[] {
    return [...this._builtInFiltered, ...this._extensionFiltered];
  }

  firstUpdated() {
    this.addEventListener('keydown', this._handleKeyDown);
  }

  focusInput() {
    const input = this.shadowRoot?.querySelector('input');
    if (input) {
      input.focus();
      input.value = '';
    }
    this._query = '';
    this._selectedIndex = 0;
  }

  private _handleInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this._query = input.value;
    this._selectedIndex = 0;
  }

  private _handleKeyDown(event: KeyboardEvent) {
    const items = this._items;
    if (items.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this._selectedIndex = (this._selectedIndex + 1) % items.length;
      this._scrollSelectedIntoView();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this._selectedIndex = (this._selectedIndex - 1 + items.length) % items.length;
      this._scrollSelectedIntoView();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this._selectItem(items[this._selectedIndex]);
    }
  }

  // [Follow-up §3.11] Command Palette selection scroll into view
  private _scrollSelectedIntoView() {
    this.updateComplete.then(() => {
      const selected = this.shadowRoot?.querySelector('.palette-item.selected');
      selected?.scrollIntoView({ block: 'nearest' });
    });
  }

  private _selectItem(item: PaletteCommand) {
    this.dispatchEvent(new CustomEvent('command-selected', {
      detail: { command: item.id, extensionCommand: !!item.extensionCommand },
      bubbles: true,
      composed: true
    }));
  }

  /** Renders an "Ctrl+Alt+H" keybinding as a row of <kbd> key caps. */
  private _renderKeybinding(item: PaletteCommand) {
    if (!item.keybinding) return '';
    const keys = item.keybinding.split('+');
    return html`<span class="keybinding">${keys.map((k) => html`<kbd>${k}</kbd>`)}</span>`;
  }

  render() {
    const builtIn = this._builtInFiltered;
    const extension = this._extensionFiltered;
    const builtInEnd = builtIn.length;
    const hasResults = builtIn.length + extension.length > 0;

    return html`
      <input
        aria-label="Command palette input"
        placeholder="Type a command..."
        @input=${this._handleInput}
      />
      <div class="palette-list" role="listbox">
        ${hasResults ? '' : html`<div class="empty-hint">No matching commands</div>`}
        ${builtIn.length > 0 ? html`<div class="group-label">Built-in</div>` : ''}
        ${builtIn.map((item, index) => html`
          <div
            class="palette-item ${index === this._selectedIndex ? 'selected' : ''}"
            role="option"
            aria-selected="${index === this._selectedIndex}"
            @click="${() => this._selectItem(item)}"
            @mouseenter="${() => this._selectedIndex = index}"
          ><span class="label-text">${item.label}</span>${this._renderKeybinding(item)}</div>
        `)}
        ${extension.length > 0 ? html`<div class="group-label">Extensions</div>` : ''}
        ${extension.map((item, i) => {
          const index = builtInEnd + i;
          return html`
            <div
              class="palette-item ${index === this._selectedIndex ? 'selected' : ''}"
              role="option"
              aria-selected="${index === this._selectedIndex}"
              @click="${() => this._selectItem(item)}"
              @mouseenter="${() => this._selectedIndex = index}"
             ><span class="label-text">${item.label}</span>${this._renderKeybinding(item)}</div>
           `;
         })}
      </div>
    `;
  }
}
