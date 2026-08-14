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
      font-size: 20px;
      font-weight: 600;
      color: #ffffff;
      margin: 0 0 4px;
    }

    .shortcuts-header .subtitle {
      color: #858585;
      font-size: 13px;
      margin: 0;
    }

    .shortcuts-section {
      background: #252526;
      border: 1px solid #3e3e3e;
      border-radius: 6px;
      margin-bottom: 16px;
      overflow: hidden;
    }

    .shortcuts-section-header {
      padding: 12px 16px;
      background: #2d2d30;
      border-bottom: 1px solid #3e3e3e;
      font-size: 13px;
      font-weight: 600;
      color: #ffffff;
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
      background: #2a2a2a;
    }

    .shortcut-label {
      flex: 1;
      min-width: 0;
      font-size: 13px;
      color: #d4d4d4;
    }

    .shortcut-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .shortcut-badge {
      font-family: 'SF Mono', Consolas, monospace;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      background: #3c3c3c;
      color: #cbd5e1;
      border: 1px solid #4a4a4a;
      cursor: pointer;
      min-width: 80px;
      text-align: center;
    }

    .shortcut-badge:hover {
      border-color: #007acc;
      color: #ffffff;
    }

    .shortcut-badge.core {
      border-color: #4a4a4a;
      color: #858585;
      cursor: default;
    }

    .shortcut-badge.core:hover {
      border-color: #4a4a4a;
      color: #858585;
    }

    .reset-btn {
      background: transparent;
      border: 1px solid #3e3e3e;
      color: #858585;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
    }

    .reset-btn:hover {
      border-color: #f85149;
      color: #f85149;
    }

    .global-reset {
      padding: 12px 16px;
      border-top: 1px solid #3e3e3e;
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
      return html`<div class="shortcuts-body"><div style="color:#858585;padding:16px;">Loading shortcuts...</div></div>`;
    }
    if (this._error) {
      return html`<div class="shortcuts-body"><div style="color:#f85149;padding:16px;">Error: ${this._error}</div></div>`;
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
          <div style="color:#858585;padding:16px 0;">No shortcuts registered.</div>
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
          <div class="global-reset">
            <button class="reset-btn" @click=${() => this._resetAll()}>Reset All to Defaults</button>
          </div>
        </div>
      </div>
    `;
  }
}
