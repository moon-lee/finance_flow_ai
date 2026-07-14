/**
 * Phase 4 Task 11.4 — Rate history view (Lit element).
 *
 * Renders all rate rows ordered `effective_from DESC` (newest first) with
 * a "Current" badge on the row whose `effective_to IS NULL`, and a
 * green left border on the current row (history rows neutral). Per
 * Decision 17 the current row shows an `[ Edit ]` button; history rows
 * show `[ View ]` (read-only). The `[ + Add New Rate ]` button
 * dispatches an `rate-add-request` CustomEvent the mount harness uses
 * to open the rate-row form (Decision 11 + 17).
 */

import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { FinanceApi } from 'finance';
import type { RateRow } from '../dao/pay-rate-history.js';

const RATE_COLUMNS: { key: keyof RateRow; label: string }[] = [
  { key: 'base_hourly_rate', label: 'Base Hourly' },
  { key: 'standard_hours_per_week', label: 'Std Hrs/wk' },
  { key: 'superannuation_rate', label: 'SG Rate' },
];

@customElement('pay-rate-history-view')
export class PayRateHistoryView extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: #d4d4d4;
      font: 13px/1.5 system-ui, sans-serif;
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    h2 {
      margin: 0;
      font-size: 15px;
    }
    button.primary {
      background: #007acc;
      color: #fff;
      border: 0;
      border-radius: 4px;
      padding: 6px 14px;
      cursor: pointer;
    }
    .rates-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .rates-table th,
    .rates-table td {
      border: 1px solid #3c3c3c;
      padding: 4px 8px;
      text-align: left;
      white-space: nowrap;
    }
    .rates-table th {
      background: #1e1e1e;
      color: #cfcfcf;
    }
    .rates-table tr.current td:first-child {
      border-left: 4px solid #4ec9b0;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      padding: 1px 8px;
      border-radius: 10px;
      margin-left: 8px;
    }
    .badge.current {
      background: #0d2e26;
      color: #4ec9b0;
      border: 1px solid #4ec9b0;
    }
    .badge.history {
      background: #1e1e1e;
      color: #9a9a9a;
      border: 1px solid #3c3c3c;
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    button.action {
      background: #1e1e1e;
      border: 1px solid #3c3c3c;
      color: #d4d4d4;
      border-radius: 4px;
      padding: 3px 10px;
      cursor: pointer;
    }
    .empty {
      color: #9a9a9a;
      padding: 16px 0;
    }
  `;

  @property({ attribute: false })
  finance: FinanceApi | null = null;

  @property({ type: Array })
  rates: RateRow[] = [];

  @state()
  private _loaded = false;

  async load(): Promise<void> {
    if (!this.finance || this._loaded) return;
    const rows = (await this.finance.db
      .table('salary_history_rate_history')
      .find({}) as unknown) as RateRow[];
    this.rates = rows
      .slice()
      .sort((a, b) => (a.effective_from < b.effective_from ? 1 : a.effective_from > b.effective_from ? -1 : 0));
    this._loaded = true;
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private _isCurrent(r: RateRow): boolean {
    return r.effective_to === null;
  }

  private _onAdd(): void {
    this.dispatchEvent(
      new CustomEvent('rate-add-request', { bubbles: true, composed: true }),
    );
  }

  private _onEdit(id: number): void {
    this.dispatchEvent(
      new CustomEvent('rate-edit-request', { detail: { id }, bubbles: true, composed: true }),
    );
  }

  private _onView(id: number): void {
    this.dispatchEvent(
      new CustomEvent('rate-view-request', { detail: { id }, bubbles: true, composed: true }),
    );
  }

  private _renderHeader(): unknown {
    return html`
      <thead>
        <tr>
          <th>Status</th>
          <th>Effective From</th>
          <th>Effective To</th>
          ${RATE_COLUMNS.map((c) => html`<th>${c.label}</th>`)}
          <th>Notes</th>
          <th>Action</th>
        </tr>
      </thead>
    `;
  }

  private _renderRow(r: RateRow): unknown {
    const current = this._isCurrent(r);
    return html`
      <tr class="${current ? 'current' : ''}" data-testid="rate-row" data-id="${r.id}">
        <td>
          <span class="badge ${current ? 'current' : 'history'}" data-testid="rate-badge">${current ? 'Current' : 'History'}</span>
        </td>
        <td data-testid="rate-effective_from">${r.effective_from}</td>
        <td data-testid="rate-effective_to">${r.effective_to ?? ''}</td>
        ${RATE_COLUMNS.map(
          (c) => html`<td data-testid="rate-${c.key}">${(r[c.key] as number).toFixed(3)}</td>`,
        )}
        <td data-testid="rate-notes">${r.notes ?? ''}</td>
        <td class="actions">
          ${current
            ? html`<button class="action" data-testid="rate-edit" @click="${() => this._onEdit(r.id ?? 0)}">Edit</button>`
            : html`<button class="action" data-testid="rate-view" @click="${() => this._onView(r.id ?? 0)}">View</button>`}
        </td>
      </tr>
    `;
  }

  render(): unknown {
    return html`
      <div class="topbar">
        <h2 data-testid="rate-history-title">Pay Rate History</h2>
        <button class="primary" data-testid="add-rate" @click="${this._onAdd}">+ Add New Rate</button>
      </div>
      ${this.rates.length === 0
        ? html`<div class="empty" data-testid="rate-empty">No rate rows yet.</div>`
        : html`<table class="rates-table" data-testid="rates-table">
            ${this._renderHeader()}
            <tbody>
              ${this.rates.map((r) => this._renderRow(r))}
            </tbody>
          </table>`}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pay-rate-history-view': PayRateHistoryView;
  }
}
