/**
 * Phase 4 Task 11.3 — First-run account seed modal (Lit element).
 *
 * Shown automatically on first activation when the `accounts` shared
 * table is empty. Lets the user name a salary account (with an
 * optional institution) or skip. The modal is a pure UI surface: it
 * dispatches an `account-create` CustomEvent (detail: `{ name, institution }`)
 * for the mount harness to persist (the `accounts` table is
 * Core-owned / read-only for extensions per Decision 4, so the write
 * is routed through a Core-provided path, not the extension's own
 * `finance.db`). Skip / Cancel dismiss the modal without a write.
 */

import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('accounts-seed-modal')
export class AccountsSeedModal extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: #d4d4d4;
      font: 13px/1.5 system-ui, sans-serif;
    }
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: grid;
      place-items: center;
      z-index: 50;
    }
    .modal {
      width: 360px;
      background: #252526;
      border: 1px solid #3c3c3c;
      border-radius: 8px;
      padding: 20px;
    }
    h2 {
      margin: 0 0 4px;
      font-size: 16px;
    }
    .welcome {
      font-size: 28px;
    }
    p {
      color: #b9b9b9;
      font-size: 13px;
      margin: 8px 0 16px;
    }
    .banner {
      background: #4a3c00;
      border: 1px solid #cca700;
      color: #e8d28a;
      border-radius: 4px;
      padding: 6px 10px;
      font-size: 11px;
      margin-bottom: 12px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 12px;
      color: #b9b9b9;
      margin-bottom: 10px;
    }
    input {
      background: #1e1e1e;
      border: 1px solid #3c3c3c;
      color: #d4d4d4;
      border-radius: 4px;
      padding: 4px 6px;
      font: inherit;
    }
    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    button {
      border: 0;
      border-radius: 4px;
      padding: 6px 14px;
      cursor: pointer;
      font: inherit;
    }
    .primary {
      background: #007acc;
      color: #fff;
    }
    .ghost {
      background: transparent;
      color: #94a3b8;
      border: 1px solid #3c3c3c;
    }
  `;

  /** Dismissed state — parent removes the element on dismiss. */
  @property({ type: Boolean })
  open = true;

  @state()
  private _name = 'Primary Salary';

  @state()
  private _institution = '';

  private _onName(e: Event): void {
    this._name = (e.target as HTMLInputElement).value;
  }

  private _onInstitution(e: Event): void {
    this._institution = (e.target as HTMLInputElement).value;
  }

  private _onCreate(): void {
    const name = this._name.trim();
    if (name === '') return;
    this.dispatchEvent(
      new CustomEvent('account-create', {
        detail: { name, institution: this._institution.trim() === '' ? null : this._institution.trim() },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onSkip(): void {
    this.dispatchEvent(
      new CustomEvent('account-seed-skip', { bubbles: true, composed: true }),
    );
  }

  private _onCancel(): void {
    this.dispatchEvent(
      new CustomEvent('account-seed-cancel', { bubbles: true, composed: true }),
    );
  }

  render(): unknown {
    if (!this.open) return html``;
    return html`
      <div class="backdrop" data-testid="seed-backdrop">
        <div class="modal" role="dialog" aria-label="Welcome to Salary History" data-testid="seed-modal">
          <div class="welcome">👋</div>
          <h2 data-testid="seed-title">Welcome to Salary History</h2>
          <p>Create a salary account to start tracking your payslips. You can add more later from the Accounts section.</p>
          <div class="banner">First-run only — you can skip and create accounts later.</div>
          <label data-testid="field-name">
            Account name
            <input data-testid="input-name" type="text" .value="${this._name}" @input="${this._onName}" />
          </label>
          <label data-testid="field-institution">
            Institution (optional)
            <input data-testid="input-institution" type="text" .value="${this._institution}" @input="${this._onInstitution}" />
          </label>
          <div class="actions">
            <button class="ghost" data-testid="seed-skip" @click="${this._onSkip}">Skip for now</button>
            <button class="ghost" data-testid="seed-cancel" @click="${this._onCancel}">Cancel</button>
            <button class="primary" data-testid="seed-create" @click="${this._onCreate}">Create Account</button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'accounts-seed-modal': AccountsSeedModal;
  }
}
