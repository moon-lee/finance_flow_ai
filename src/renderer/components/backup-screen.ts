import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { baseViewStyles, headerHighlightStyles } from '../styles/base-view-styles';
import { overlayCoordinator } from '../overlay-coordinator';

@customElement('backup-screen')
export class BackupScreen extends LitElement {
  static styles = css`
    ${baseViewStyles}
    ${headerHighlightStyles}

    .backup-header {
      margin-bottom: 24px;
    }

    .backup-header h1 {
      font-size: var(--ff-font-2xl);
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }

    .backup-header .subtitle {
      color: var(--text-tertiary);
      font-size: var(--ff-font-md);
      margin-top: 2px;
    }

    .backup-card {
      background: var(--workspace-bg);
      border: 1px solid var(--input-border);
      border-radius: 6px;
      padding: 20px;
      margin-bottom: 16px;
    }

    .backup-card h2 {
      font-size: var(--ff-font-base);
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 8px;
    }

    .backup-card p {
      font-size: var(--ff-font-md);
      color: var(--text-tertiary);
      margin: 0 0 16px;
    }

    .backup-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .backup-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 3px;
      font-family: inherit;
      font-size: var(--ff-font-md);
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: background 0.15s;
    }

    .backup-btn-primary {
      background: var(--btn-primary-bg);
      color: var(--btn-primary-text);
    }

    .backup-btn-primary:hover {
      background: var(--btn-primary-hover-bg);
    }

    .backup-btn-secondary {
      background: var(--btn-secondary-bg);
      color: var(--btn-secondary-text);
      border: 1px solid var(--btn-secondary-border);
    }

    .backup-btn-secondary:hover {
      border-color: var(--btn-secondary-hover-border);
    }

    .backup-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .encryption-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .encryption-toggle input[type="checkbox"] {
      accent-color: var(--input-focus-border);
      width: 16px;
      height: 16px;
    }

    .encryption-toggle label {
      font-size: var(--ff-font-md);
      color: var(--input-text);
      cursor: pointer;
    }

    .password-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 12px;
    }

    .password-field label {
      font-size: var(--ff-font-md);
      color: var(--text-tertiary);
    }

    .password-field input {
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--input-text);
      padding: 6px 10px;
      border-radius: 3px;
      font-family: inherit;
      font-size: var(--ff-font-md);
      width: 100%;
      max-width: 280px;
      box-sizing: border-box;
    }

    .password-field input:focus {
      outline: 1px solid var(--input-focus-border);
      border-color: var(--input-focus-border);
    }

    .last-backup {
      font-size: var(--ff-font-md);
      color: var(--text-tertiary);
      margin-top: 12px;
    }

    .error {
      color: var(--danger-color);
      font-size: var(--ff-font-md);
      margin-top: 8px;
    }

    .success {
      color: #4ec9b0;
      font-size: var(--ff-font-md);
      margin-top: 8px;
    }
  `;

  @state()
  private _exportEncrypt = false;

  @state()
  private _importEncrypt = false;

  @state()
  private _exportPassword = '';

  @state()
  private _importPassword = '';

  @state()
  private _status: string | null = null;

  @state()
  private _error: string | null = null;

  @state()
  private _loading = false;

  connectedCallback(): void {
    super.connectedCallback();
    overlayCoordinator.showOverlay('backup');
  }

  disconnectedCallback(): void {
    overlayCoordinator.hideOverlay('backup');
    super.disconnectedCallback();
  }

  private async _onExport(): Promise<void> {
    this._error = null;
    this._status = null;

    if (this._exportEncrypt && !this._exportPassword) {
      this._error = 'Enter a password for encrypted export.';
      return;
    }

    this._loading = true;
    try {
      const api = window.financeShell?.backup;
      if (!api?.export && !api?.exportEncrypted) {
        throw new Error('Backup API not available. Restart the app to load the latest preload.');
      }
      const result = this._exportEncrypt
        ? await api.exportEncrypted(this._exportPassword)
        : await api.export();
      if (result?.success) {
        this._status = this._exportEncrypt ? 'Encrypted export complete.' : 'Export complete.';
      } else if (result?.error) {
        this._error = result.error;
      }
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Export failed.';
    } finally {
      this._loading = false;
    }
  }

  private async _onImport(): Promise<void> {
    this._error = null;
    this._status = null;

    if (this._importEncrypt && !this._importPassword) {
      this._error = 'Enter the password for the encrypted backup.';
      return;
    }

    this._loading = true;
    try {
      const api = window.financeShell?.backup;
      if (!api?.import && !api?.importEncrypted) {
        throw new Error('Backup API not available. Restart the app to load the latest preload.');
      }
      const result = this._importEncrypt
        ? await api.importEncrypted(this._importPassword)
        : await api.import();
      if (result?.success) {
        this._status = this._importEncrypt ? 'Encrypted import complete.' : 'Import complete.';
      } else if (result?.error) {
        this._error = result.error;
      }
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Import failed.';
    } finally {
      this._loading = false;
    }
  }

  render() {
    const lastBackup = window.financeShell?.backup?.getLastBackupTime?.() ?? null;

    return html`
      <div class="backup-header">
        <h1>Backup & Restore</h1>
        <p class="subtitle">Export or import your database</p>
      </div>

      <div class="backup-card">
        <h2>Export</h2>
        <p>Save a copy of your database to a file.</p>
        <div class="encryption-toggle">
          <input type="checkbox" id="encrypt-export" .checked="${this._exportEncrypt}" @change="${(e: Event) => { this._exportEncrypt = (e.target as HTMLInputElement).checked; }}" />
          <label for="encrypt-export">Encrypt with password (AES-256-GCM)</label>
        </div>
        ${this._exportEncrypt ? html`
          <div class="password-field">
            <label for="export-password">Password</label>
            <input type="password" id="export-password" .value="${this._exportPassword}" @input="${(e: Event) => { this._exportPassword = (e.target as HTMLInputElement).value; }}" />
          </div>
        ` : ''}
        <div class="backup-actions">
          <button class="backup-btn backup-btn-primary" @click="${this._onExport}" ?disabled="${this._loading}">Export</button>
        </div>
      </div>

      <div class="backup-card">
        <h2>Import</h2>
        <p>Restore from a previously exported backup file.</p>
        <div class="encryption-toggle">
          <input type="checkbox" id="encrypt-import" .checked="${this._importEncrypt}" @change="${(e: Event) => { this._importEncrypt = (e.target as HTMLInputElement).checked; }}" />
          <label for="encrypt-import">Encrypted backup (AES-256-GCM)</label>
        </div>
        ${this._importEncrypt ? html`
          <div class="password-field">
            <label for="import-password">Password</label>
            <input type="password" id="import-password" .value="${this._importPassword}" @input="${(e: Event) => { this._importPassword = (e.target as HTMLInputElement).value; }}" />
          </div>
        ` : ''}
        <div class="backup-actions">
          <button class="backup-btn backup-btn-secondary" @click="${this._onImport}" ?disabled="${this._loading}">Import</button>
        </div>
      </div>

      ${lastBackup ? html`<div class="last-backup">Last backup: ${lastBackup}</div>` : ''}
      ${this._error ? html`<div class="error">${this._error}</div>` : ''}
      ${this._status ? html`<div class="success">${this._status}</div>` : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'backup-screen': BackupScreen;
  }
}
