import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { baseViewStyles, headerHighlightStyles } from '../styles/base-view-styles';
import { overlayCoordinator } from '../overlay-coordinator';

interface Account {
  id: number;
  name: string;
  institution: string | null;
  is_active: boolean;
  created_at: string;
}

@customElement('accounts-manager')
export class AccountsManager extends LitElement {
  static styles = css`
    ${baseViewStyles}
    ${headerHighlightStyles}

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      min-width: 0;
    }

    .page-header h1 {
      font-size: var(--ff-font-2xl);
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 2px;
    }

    .page-header .subtitle {
      color: var(--text-tertiary);
      font-size: var(--ff-font-md);
      margin: 0;
    }

    .accounts-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      gap: 12px;
    }

    .accounts-count {
      color: var(--text-tertiary);
      font-size: var(--ff-font-md);
    }

    .accounts-btn {
      background: var(--btn-primary-bg);
      color: var(--btn-primary-text);
      border: none;
      padding: 7px 14px;
      border-radius: 3px;
      font-size: var(--ff-font-md);
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
    }

    .accounts-btn:hover {
      background: var(--btn-primary-hover-bg);
    }

    .accounts-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .accounts-btn-secondary {
      background: var(--btn-secondary-bg);
      color: var(--btn-secondary-text);
      border: 1px solid var(--btn-secondary-border);
    }

    .accounts-btn-secondary:hover {
      border-color: var(--btn-secondary-hover-border);
    }

    .accounts-btn-danger {
      background: transparent;
      color: var(--danger-color);
      border: 1px solid var(--danger-border);
    }

    .accounts-btn-danger:hover {
      background: var(--danger-hover-bg);
      color: var(--danger-hover-text);
    }

    .create-panel {
      background: var(--tab-bg);
      border: 1px solid var(--input-border);
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .create-panel-header {
      font-size: var(--ff-font-md);
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 12px;
    }

    .create-form {
      display: flex;
      gap: 12px;
      align-items: flex-end;
      flex-wrap: wrap;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .form-field label {
      font-size: var(--ff-font-md);
      color: var(--text-tertiary);
    }

    .form-field input[type="text"] {
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--input-text);
      padding: 6px 10px;
      border-radius: 3px;
      font-family: inherit;
      font-size: var(--ff-font-md);
      min-width: 180px;
    }

    .form-field input[type="text"]:focus {
      outline: 1px solid var(--input-focus-border);
      border-color: var(--input-focus-border);
    }

    .accounts-list {
      flex: 1;
      min-height: 0;
      min-width: 0;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .account-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 12px;
      background: var(--workspace-bg);
      border: 1px solid var(--input-border);
      border-radius: 6px;
      margin-bottom: 8px;
      min-width: 0;
    }

    .account-row:hover {
      border-color: var(--btn-secondary-hover-border);
    }

    .account-info {
      flex: 1;
      min-width: 0;
    }

    .account-name {
      font-size: var(--ff-font-md);
      font-weight: 600;
      color: var(--text-primary);
    }

    .account-meta {
      font-size: var(--ff-font-md);
      color: var(--text-tertiary);
      margin-top: 1px;
    }

    .badge {
      font-size: var(--ff-font-xs);
      padding: 2px 8px;
      border-radius: 3px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }

    .badge-active {
      background: rgba(78, 201, 176, 0.15);
      color: #4ec9b0;
    }

    .badge-inactive {
      background: var(--badge-inactive-bg);
      color: var(--badge-inactive-text);
    }

    .row-actions {
      display: flex;
      gap: 6px;
    }

    .row-actions .accounts-btn {
      padding: 5px 10px;
      font-size: var(--ff-font-xs);
    }

    .edit-row {
      display: flex;
      gap: 10px;
      align-items: flex-end;
      flex-wrap: wrap;
      width: 100%;
    }

    .edit-row .form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .edit-row label {
      font-size: var(--ff-font-md);
      color: var(--text-tertiary);
    }

    .edit-row input[type="text"] {
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--input-text);
      padding: 6px 10px;
      border-radius: 3px;
      font-family: inherit;
      font-size: var(--ff-font-md);
      min-width: 160px;
    }

    .edit-row input[type="text"]:focus {
      outline: 1px solid var(--input-focus-border);
      border-color: var(--input-focus-border);
    }

    .toggle-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .toggle-row input[type="checkbox"] {
      accent-color: var(--input-focus-border);
      width: 14px;
      height: 14px;
    }

    .toggle-row label {
      font-size: var(--ff-font-md);
      color: var(--input-text);
      cursor: pointer;
    }

    .empty-state {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--text-tertiary);
      text-align: center;
      gap: 10px;
      padding: 40px 20px;
    }

    .empty-state h3 {
      font-size: var(--ff-font-lg);
      font-weight: 600;
      color: var(--text-secondary);
      margin: 0;
    }

    .empty-state p {
      font-size: var(--ff-font-md);
      margin: 0;
      max-width: 320px;
    }

    .status {
      font-size: var(--ff-font-md);
      color: #4ec9b0;
      margin-bottom: 10px;
    }

    .error {
      color: var(--danger-color);
      font-size: var(--ff-font-md);
      margin-bottom: 10px;
    }
  `;

  @state()
  private _accounts: Account[] = [];

  @state()
  private _loading = true;

  @state()
  private _status: string | null = null;

  @state()
  private _error: string | null = null;

  @state()
  private _showCreate = false;

  @state()
  private _createName = '';

  @state()
  private _createInstitution = '';

  @state()
  private _editingId: number | null = null;

  @state()
  private _editName = '';

  @state()
  private _editInstitution = '';

  @state()
  private _editActive = true;

  connectedCallback(): void {
    super.connectedCallback();
    this._loadAccounts();
    overlayCoordinator.showOverlay('accounts');
  }

  disconnectedCallback(): void {
    overlayCoordinator.hideOverlay('accounts');
    super.disconnectedCallback();
  }

  private async _loadAccounts(): Promise<void> {
    this._loading = true;
    this._error = null;
    this._status = null;
    try {
      const accounts = await window.financeShell?.accounts?.list?.();
      this._accounts = accounts ?? [];
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load accounts';
    } finally {
      this._loading = false;
    }
  }

  private _toggleCreate(): void {
    this._showCreate = !this._showCreate;
    if (this._showCreate) {
      this._createName = '';
      this._createInstitution = '';
      this._error = null;
      this._status = null;
    }
  }

  private async _create(): Promise<void> {
    this._error = null;
    this._status = null;
    const name = this._createName.trim();
    if (name === '') {
      this._error = 'Account name is required.';
      return;
    }
    try {
      await window.financeShell?.accounts?.create?.({
        name,
        institution: this._createInstitution.trim() === '' ? null : this._createInstitution.trim(),
      });
      this._createName = '';
      this._createInstitution = '';
      this._showCreate = false;
      this._status = 'Account created.';
      await this._loadAccounts();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Create failed';
    }
  }

  private _startEdit(account: Account): void {
    this._editingId = account.id;
    this._editName = account.name;
    this._editInstitution = account.institution ?? '';
    this._editActive = account.is_active;
    this._error = null;
    this._status = null;
  }

  private _cancelEdit(): void {
    this._editingId = null;
    this._editName = '';
    this._editInstitution = '';
    this._editActive = true;
    this._error = null;
  }

  private async _saveEdit(): Promise<void> {
    this._error = null;
    this._status = null;
    const name = this._editName.trim();
    if (name === '' || this._editingId === null) {
      this._error = 'Account name is required.';
      return;
    }
    try {
      await window.financeShell?.accounts?.update?.({
        id: this._editingId,
        name,
        institution: this._editInstitution.trim() === '' ? null : this._editInstitution.trim(),
        is_active: this._editActive,
      });
      this._cancelEdit();
      this._status = 'Account updated.';
      await this._loadAccounts();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Save failed';
    }
  }

  private async _toggleActive(account: Account): Promise<void> {
    this._error = null;
    this._status = null;
    try {
      await window.financeShell?.accounts?.update?.({
        id: account.id,
        name: account.name,
        institution: account.institution,
        is_active: !account.is_active,
      });
      this._status = account.is_active ? 'Account deactivated.' : 'Account activated.';
      await this._loadAccounts();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Update failed';
    }
  }

  private async _delete(account: Account): Promise<void> {
    this._error = null;
    this._status = null;
    try {
      await window.financeShell?.accounts?.delete?.({ id: account.id });
      if (this._editingId === account.id) this._cancelEdit();
      this._status = 'Account deleted.';
      await this._loadAccounts();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Delete failed';
    }
  }

  private _formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  }

  render() {
    if (this._loading) {
      return html`<div class="empty-state"><h3>Loading accounts...</h3></div>`;
    }

    return html`
      <div class="page-header">
        <div>
          <h1>Accounts</h1>
          <p class="subtitle">Manage your bank accounts and institutions</p>
        </div>
        <button class="accounts-btn" @click="${this._toggleCreate}">
          ${this._showCreate ? 'Close' : 'New Account'}
        </button>
      </div>

      ${this._error ? html`<div class="error">${this._error}</div>` : ''}
      ${this._status ? html`<div class="status">${this._status}</div>` : ''}

      ${this._showCreate ? html`
        <div class="create-panel">
          <div class="create-panel-header">New Account</div>
          <div class="create-form">
            <div class="form-field">
              <label for="new-account-name">Account name</label>
              <input type="text" id="new-account-name" .value="${this._createName}" @input="${(e: Event) => { this._createName = (e.target as HTMLInputElement).value; }}" placeholder="Primary Salary" />
            </div>
            <div class="form-field">
              <label for="new-account-institution">Institution (optional)</label>
              <input type="text" id="new-account-institution" .value="${this._createInstitution}" @input="${(e: Event) => { this._createInstitution = (e.target as HTMLInputElement).value; }}" placeholder="Bank" />
            </div>
            <button class="accounts-btn" @click="${this._create}" ?disabled="${this._loading}">Create</button>
          </div>
        </div>
      ` : ''}

      <div class="accounts-toolbar">
        <span class="accounts-count">${this._accounts.length} account${this._accounts.length === 1 ? '' : 's'}</span>
      </div>

      <div class="accounts-list">
        ${this._accounts.length === 0 ? html`
          <div class="empty-state">
            <h3>No accounts yet</h3>
            <p>Create your first account to start tracking your finances.</p>
          </div>
        ` : ''}
        ${this._accounts.map((account) => html`
          <div class="account-row">
            ${this._editingId === account.id ? html`
              <div class="edit-row">
                <div class="form-field">
                  <label>Account name</label>
                  <input type="text" .value="${this._editName}" @input="${(e: Event) => { this._editName = (e.target as HTMLInputElement).value; }}" />
                </div>
                <div class="form-field">
                  <label>Institution</label>
                  <input type="text" .value="${this._editInstitution}" @input="${(e: Event) => { this._editInstitution = (e.target as HTMLInputElement).value; }}" />
                </div>
                <div class="toggle-row">
                  <input type="checkbox" id="edit-active-${account.id}" .checked="${this._editActive}" @change="${(e: Event) => { this._editActive = (e.target as HTMLInputElement).checked; }}" />
                  <label for="edit-active-${account.id}">Active</label>
                </div>
                <button class="accounts-btn" @click="${this._saveEdit}" ?disabled="${this._loading}">Save</button>
                <button class="accounts-btn accounts-btn-secondary" @click="${this._cancelEdit}">Cancel</button>
              </div>
            ` : html`
              <div class="account-info">
                <div class="account-name">${account.name}</div>
                <div class="account-meta">${account.institution ?? 'No institution'} · ${this._formatDate(account.created_at)}</div>
              </div>
              <span class="badge ${account.is_active ? 'badge-active' : 'badge-inactive'}">${account.is_active ? 'Active' : 'Inactive'}</span>
              <div class="row-actions">
                <button class="accounts-btn accounts-btn-secondary" @click="${() => this._startEdit(account)}">Edit</button>
                <button class="accounts-btn accounts-btn-secondary" @click="${() => this._toggleActive(account)}">${account.is_active ? 'Deactivate' : 'Activate'}</button>
                <button class="accounts-btn accounts-btn-danger" @click="${() => this._delete(account)}">Delete</button>
              </div>
            `}
          </div>
        `)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'accounts-manager': AccountsManager;
  }
}
