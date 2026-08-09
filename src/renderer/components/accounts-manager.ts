import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { baseViewStyles, headerHighlightStyles } from '../styles/base-view-styles';

interface Account {
  id: number;
  name: string;
  institution: string | null;
  is_active: boolean;
  created_at: string;
}

type FormMode = 'view' | 'create' | 'edit';

@customElement('accounts-manager')
export class AccountsManager extends LitElement {
  static styles = css`
    ${baseViewStyles}
    ${headerHighlightStyles}

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .header h1 {
      font-size: 20px;
      font-weight: 600;
      color: #ffffff;
      margin: 0;
    }

    .btn {
      background: #0e639c;
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: 3px;
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
    }

    .btn:hover {
      background: #1177bb;
    }

    .btn-secondary {
      background: #3c3c3c;
      color: #d4d4d4;
      border: 1px solid #3e3e3e;
    }

    .btn-secondary:hover {
      border-color: #007acc;
    }

    .btn-danger {
      background: transparent;
      color: #f48771;
      border: 1px solid #f48771;
    }

    .btn-danger:hover {
      background: #f48771;
      color: #1e1e1e;
    }

    .account-list {
      flex: 1;
      min-height: 0;
      min-width: 0;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .account-row {
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 12px 16px;
      background: #252526;
      border: 1px solid #3e3e3e;
      border-radius: 6px;
      margin-bottom: 8px;
      min-width: 0;
    }

    .account-info {
      flex: 1;
      min-width: 0;
    }

    .account-name {
      font-size: 14px;
      font-weight: 600;
      color: #ffffff;
    }

    .account-meta {
      font-size: 12px;
      color: #858585;
      margin-top: 2px;
    }

    .badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 3px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge-active {
      background: rgba(78, 201, 176, 0.15);
      color: #4ec9b0;
    }

    .badge-inactive {
      background: rgba(132, 132, 132, 0.15);
      color: #858585;
    }

    .row-actions {
      display: flex;
      gap: 8px;
    }

    .form-card {
      background: #252526;
      border: 1px solid #3e3e3e;
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 16px;
      min-width: 0;
    }

    .form-row {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      min-width: 0;
    }

    .form-field {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .form-field label {
      font-size: 12px;
      color: #858585;
    }

    .form-field input[type="text"] {
      background: #3c3c3c;
      border: 1px solid #3e3e3e;
      color: #d4d4d4;
      padding: 8px 10px;
      border-radius: 3px;
      font-family: inherit;
      font-size: 13px;
      box-sizing: border-box;
      width: 100%;
    }

    .form-field input[type="text"]:focus {
      outline: 1px solid #007acc;
      border-color: #007acc;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .toggle-row input[type="checkbox"] {
      accent-color: #007acc;
      width: 16px;
      height: 16px;
    }

    .toggle-row label {
      font-size: 13px;
      color: #d4d4d4;
      cursor: pointer;
    }

    .form-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
  `;

  @state()
  private _accounts: Account[] = [];

  @state()
  private _loading = true;

  @state()
  private _error: string | null = null;

  @state()
  private _mode: FormMode = 'view';

  @state()
  private _editId: number | null = null;

  @state()
  private _name = '';

  @state()
  private _institution = '';

  @state()
  private _isActive = true;

  @state()
  private _formError: string | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this._loadAccounts();
  }

  private async _loadAccounts(): Promise<void> {
    this._loading = true;
    this._error = null;
    try {
      const accounts = await window.financeShell?.accounts?.list?.();
      this._accounts = accounts ?? [];
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load accounts';
    } finally {
      this._loading = false;
    }
  }

  private _openCreate(): void {
    this._mode = 'create';
    this._editId = null;
    this._name = '';
    this._institution = '';
    this._isActive = true;
    this._formError = null;
  }

  private _openEdit(account: Account): void {
    this._mode = 'edit';
    this._editId = account.id;
    this._name = account.name;
    this._institution = account.institution ?? '';
    this._isActive = account.is_active;
    this._formError = null;
  }

  private _closeForm(): void {
    this._mode = 'view';
    this._editId = null;
    this._formError = null;
  }

  private async _submit(): Promise<void> {
    this._formError = null;
    const name = this._name.trim();
    if (name === '') {
      this._formError = 'Account name is required.';
      return;
    }
    try {
      if (this._mode === 'create') {
        await window.financeShell?.accounts?.create?.({ name, institution: this._institution.trim() === '' ? null : this._institution.trim() });
      } else if (this._editId !== null) {
        await window.financeShell?.accounts?.update?.({ id: this._editId, name, institution: this._institution.trim() === '' ? null : this._institution.trim(), is_active: this._isActive });
      }
      this._closeForm();
      await this._loadAccounts();
    } catch (err) {
      this._formError = err instanceof Error ? err.message : 'Save failed';
    }
  }

  private async _toggleActive(account: Account): Promise<void> {
    try {
      await window.financeShell?.accounts?.update?.({ id: account.id, name: account.name, institution: account.institution, is_active: !account.is_active });
      await this._loadAccounts();
    } catch (err) {
      this._formError = err instanceof Error ? err.message : 'Update failed';
    }
  }

  private async _delete(account: Account): Promise<void> {
    try {
      await window.financeShell?.accounts?.delete?.({ id: account.id });
      if (this._editId === account.id) this._closeForm();
      await this._loadAccounts();
    } catch (err) {
      this._formError = err instanceof Error ? err.message : 'Delete failed';
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
    if (this._error) {
      return html`<div class="empty-state"><h3>Error</h3><p>${this._error}</p></div>`;
    }
    if (this._accounts.length === 0 && this._mode !== 'create' && this._editId === null) {
      return html`
        <div class="header"><h1>Accounts</h1></div>
        <div class="empty-state">
          <h3>No accounts yet</h3>
          <p>Create your first account to start tracking your finances.</p>
          <button class="btn" @click="${this._openCreate}">Create your first account</button>
        </div>
      `;
    }
    const isFormOpen = this._mode === 'create' || this._editId !== null;
    return html`
      <div class="header">
        <h1>Accounts</h1>
        ${!isFormOpen ? html`<button class="btn" @click="${this._openCreate}">New Account</button>` : ''}
      </div>

      ${isFormOpen ? html`
        <div class="form-card">
          <div class="form-row">
            <div class="form-field">
              <label>Account name</label>
              <input type="text" .value="${this._name}" @input="${(e: Event) => { this._name = (e.target as HTMLInputElement).value; }}" placeholder="Primary Salary" />
            </div>
            <div class="form-field">
              <label>Institution (optional)</label>
              <input type="text" .value="${this._institution}" @input="${(e: Event) => { this._institution = (e.target as HTMLInputElement).value; }}" placeholder="Bank" />
            </div>
          </div>
          ${this._mode === 'edit' ? html`
            <div class="toggle-row">
              <input type="checkbox" id="active-toggle" .checked="${this._isActive}" @change="${(e: Event) => { this._isActive = (e.target as HTMLInputElement).checked; }}" />
              <label for="active-toggle">Active</label>
            </div>
          ` : ''}
          ${this._formError ? html`<div class="error">${this._formError}</div>` : ''}
          <div class="form-actions">
            <button class="btn btn-secondary" @click="${this._closeForm}">Cancel</button>
            <button class="btn" @click="${this._submit}">${this._mode === 'create' ? 'Create' : 'Save'}</button>
          </div>
        </div>
      ` : ''}

      <div class="account-list">
        ${this._accounts.map((account) => html`
          <div class="account-row">
            <div class="account-info">
              <div class="account-name">${account.name}</div>
              <div class="account-meta">${account.institution ?? 'No institution'} · ${this._formatDate(account.created_at)}</div>
            </div>
            <span class="badge ${account.is_active ? 'badge-active' : 'badge-inactive'}">${account.is_active ? 'Active' : 'Inactive'}</span>
            <div class="row-actions">
              <button class="btn btn-secondary" @click="${() => this._openEdit(account)}">Edit</button>
              <button class="btn btn-secondary" @click="${() => this._toggleActive(account)}">${account.is_active ? 'Deactivate' : 'Activate'}</button>
              <button class="btn btn-danger" @click="${() => this._delete(account)}">Delete</button>
            </div>
          </div>
        `)}
      </div>
      ${this._formError ? html`<div class="error">${this._formError}</div>` : ''}
    `;
  }
}
