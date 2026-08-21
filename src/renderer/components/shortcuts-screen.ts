import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { baseViewStyles, headerHighlightStyles } from '../styles/base-view-styles';
import { overlayCoordinator } from '../overlay-coordinator';

interface ShortcutEntry {
  commandId: string;
  extensionId: string;
  accelerator: string;
}

@customElement('shortcuts-screen')
export class ShortcutsScreen extends LitElement {
  static styles = css`
    ${baseViewStyles}
    ${headerHighlightStyles}

    .shortcuts-body {
      flex: 1;
      min-width: 0;
      min-height: 0;
      overflow-y: auto;
    }

    .shortcuts-header {
      margin-bottom: 24px;
    }

    .shortcuts-header h1 {
      font-size: var(--ff-font-2xl);
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 4px;
    }

    .shortcuts-header .subtitle {
      color: var(--text-tertiary);
      font-size: var(--ff-font-md);
      margin: 0;
    }

    .shortcuts-section {
      background: var(--workspace-bg);
      border: 1px solid var(--input-border);
      border-radius: 6px;
      margin-bottom: 16px;
      overflow: hidden;
    }

    .shortcuts-section-header {
      padding: 12px 16px;
      background: var(--tab-bg);
      border-bottom: 1px solid var(--input-border);
      font-size: var(--ff-font-md);
      font-weight: 600;
      color: var(--section-header-text);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .shortcuts-section-body {
      padding: 8px 0;
    }

    .shortcut-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 8px 16px;
    }

    .shortcut-row:hover {
      background: var(--section-header-hover-bg);
    }

    .shortcut-label {
      flex: 1;
      min-width: 0;
      font-size: var(--ff-font-md);
      color: var(--input-text);
    }

    .shortcut-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .shortcut-badge {
      font-family: 'SF Mono', Consolas, monospace;
      font-size: var(--ff-font-md);
      padding: 3px 8px;
      border-radius: 4px;
      background: var(--btn-secondary-bg);
      color: var(--text-secondary);
      border: 1px solid var(--btn-secondary-border);
      cursor: pointer;
      min-width: 80px;
      text-align: center;
    }

    .shortcut-badge:hover {
      border-color: var(--input-focus-border);
      color: var(--text-primary);
    }

    .shortcut-badge.core {
      border-color: var(--btn-secondary-border);
      color: var(--text-tertiary);
      cursor: default;
    }

    .shortcut-badge.core:hover {
      border-color: var(--btn-secondary-border);
      color: var(--text-tertiary);
    }

    .reset-btn {
      background: transparent;
      border: 1px solid var(--input-border);
      color: var(--text-tertiary);
      font-size: var(--ff-font-md);
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
    }

    .reset-btn:hover {
      border-color: var(--danger-color);
      color: var(--danger-color);
    }

    .shortcuts-footer {
      padding: 12px 16px;
      border-top: 1px solid var(--input-border);
    }

    .status-loading {
      color: var(--text-tertiary);
      padding: 16px;
    }

    .status-error {
      color: var(--danger-color);
      padding: 16px;
    }

    .status-empty {
      color: var(--text-tertiary);
      padding: 16px 0;
    }
  `;

  @state()
  private _shortcuts: ShortcutEntry[] = [];

  @state()
  private _loading = true;

  @state()
  private _error: string | null = null;

  connectedCallback() {
    super.connectedCallback();
    overlayCoordinator.showOverlay('shortcuts');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    overlayCoordinator.hideOverlay('shortcuts');
  }

  firstUpdated() {
    this._loadShortcuts();
  }

  private async _loadShortcuts() {
    try {
      this._loading = true;
      this._error = null;
      const shortcuts = await window.financeShell?.shortcuts?.list?.();
      this._shortcuts = shortcuts ?? [];
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._loading = false;
    }
  }

  private _groupedShortcuts() {
    const groups = new Map<string, ShortcutEntry[]>();
    for (const entry of this._shortcuts) {
      const existing = groups.get(entry.extensionId) ?? [];
      existing.push(entry);
      groups.set(entry.extensionId, existing);
    }
    return groups;
  }

  private async _rebind(entry: ShortcutEntry) {
    if (entry.extensionId === 'core') return;
    const current = entry.accelerator || '(not set)';
    const input = window.prompt(`Rebind shortcut for "${entry.commandId}"\nCurrent: ${current}\n\nEnter new accelerator (e.g. Ctrl+Shift+K) or leave empty to clear:`, current);
    if (input === null) return;
    const newAccelerator = input.trim();
    try {
      await window.financeShell?.shortcuts?.update?.(entry.extensionId, entry.commandId, newAccelerator);
      await this._loadShortcuts();
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    }
  }

  private async _resetExtension(extensionId: string) {
    try {
      await window.financeShell?.shortcuts?.reset?.(extensionId);
      await this._loadShortcuts();
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    }
  }

  private async _resetAll() {
    try {
      await window.financeShell?.shortcuts?.reset?.();
      await this._loadShortcuts();
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    }
  }

  render() {
    if (this._loading) {
      return html`<div class="shortcuts-body"><div class="status-loading">Loading shortcuts...</div></div>`;
    }
    if (this._error) {
      return html`<div class="shortcuts-body"><div class="status-error">Error: ${this._error}</div></div>`;
    }

    const groups = this._groupedShortcuts();

    const noShortcuts = groups.size === 0;

    return html`
      <div class="shortcuts-body">
        <div class="shortcuts-header">
          <h1>Keyboard Shortcuts</h1>
          <p class="subtitle">Click an accelerator to rebind. Core shortcuts cannot be changed.</p>
        </div>

        ${noShortcuts ? html`
          <div class="status-empty">No shortcuts registered.</div>
        ` : Array.from(groups.entries()).map(([extensionId, entries]) => html`
          <div class="shortcuts-section">
            <div class="shortcuts-section-header">
              <span>${extensionId}</span>
              <button class="reset-btn" @click=${() => this._resetExtension(extensionId)}>Reset</button>
            </div>
            <div class="shortcuts-section-body">
              ${entries.map(entry => html`
                <div class="shortcut-row">
                  <span class="shortcut-label">${entry.commandId}</span>
                  <div class="shortcut-actions">
                    <span class="shortcut-badge ${entry.extensionId === 'core' ? 'core' : ''}"
                          @click=${() => this._rebind(entry)}
                          title="${entry.extensionId === 'core' ? 'Core shortcut' : 'Click to rebind'}">
                      ${entry.accelerator || '(not set)'}
                    </span>
                  </div>
                </div>
              `)}
            </div>
          </div>
        `)}

        <div class="shortcuts-section">
          <div class="shortcuts-footer">
            <button class="reset-btn" @click=${() => this._resetAll()}>Reset All to Defaults</button>
          </div>
        </div>
      </div>
    `;
  }
}
