/**
 * Phase 4 Task 11.4 — Rate history view (Lit element).
 *
 * Renders all rate rows ordered `effective_from DESC` (newest first) with
 * a "Current" badge on the row whose `effective_to IS NULL`, and a
 * green left border + green row tint on the current row (history rows
 * neutral). Per Decision 17 the current row shows an `[ Edit ]` button;
 * history rows show `[ View ]` (read-only). The `[ + Add New Rate ]`
 * button dispatches an `rate-add-request` CustomEvent the mount harness
 * uses to open the rate-row form (Decision 11 + 17).
 *
 * Visual fidelity tracks `docs/design/salary-history-mvp/pay-rate-history.html`
 * (topbar + breadcrumb, info-banner, card-wrapped table, monospace numerics,
 * green current row). The 8-column layout (Status / Effective From / Effective
 * To / Base Hourly / Std Hrs/wk / SG Rate / Notes / Action) is the
 * user-approved deviation from the 12-column mock (per visual-parity note).
 */

import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { FinanceApi } from 'finance';
import type { RateRow } from '../dao/pay-rate-history.js';
import { sharedStyles } from '../styles/shared-styles.js';

const RATE_COLUMNS: { key: keyof RateRow; label: string; kind: 'money' | 'int' | 'rate' }[] = [
  { key: 'base_hourly_rate', label: 'Base Hourly', kind: 'money' },
  { key: 'standard_hours_per_week', label: 'Std Hrs/wk', kind: 'int' },
  { key: 'superannuation_rate', label: 'SG Rate', kind: 'rate' },
];

@customElement('pay-rate-history-view')
export class PayRateHistoryView extends LitElement {
  static styles = [
    sharedStyles,
    css`
      .container {
        max-width: 1080px;
        margin: 0 auto;
        padding: 24px 20px 40px;
      }
      .subtitle {
        color: var(--ff-text-muted);
        font-size: var(--ff-font-sm);
        margin: 0 0 16px;
      }
      .info-banner {
        background: var(--ff-bg-subpanel);
        border: 1px solid var(--ff-border);
        border-radius: 6px;
        padding: 12px 16px;
        margin-bottom: 16px;
        font-size: var(--ff-font-sm);
        color: var(--ff-text);
      }
      .info-banner strong {
        color: var(--ff-accent);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--ff-font-sm);
      }
      th {
        text-align: left;
        padding: 8px 10px;
        font-size: var(--ff-font-sm);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        color: var(--ff-text-muted);
        border-bottom: 1px solid var(--ff-border);
        white-space: nowrap;
      }
      td {
        padding: var(--ff-font-sm);
        border-bottom: 1px solid var(--ff-bg-subpanel);
        color: var(--ff-text);
      }
      th.num,
      td.num {
        text-align: right;
      }
      tr.current {
        background: var(--ff-border);
        box-shadow: inset 3px 0 0 var(--ff-accent);
      }
      tr.current:hover {
        background: #233023;
      }
      .badge {
        display: inline-block;
        background: var(--ff-accent);
        color: var(--ff-bg-base);
        font-size: var(--ff-font-sm);
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 3px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        vertical-align: middle;
      }
      .badge-history {
        background: var(--ff-border);
        color: var(--ff-text-muted);
      }
      .actions {
        white-space: nowrap;
        text-align: right;
      }
      .btn-danger-link {
        color: #f48771;
        margin-left: 8px;
      }
      .btn-danger-link:hover {
        color: #ff9a86;
        text-decoration: underline;
      }
      .empty-effective_to {
        color: var(--ff-accent);
        font-weight: 700;
      }
      .info-note {
        font-size: var(--ff-font-sm);
        color: var(--ff-text-muted);
        font-style: italic;
        margin-top: 8px;
        padding: 8px 12px;
        background: var(--ff-bg-base);
        border-radius: 3px;
      }
      .info-note code {
        color: var(--ff-accent);
        font-style: normal;
      }
    `,
  ];

  @property({ attribute: false })
  finance: FinanceApi | null = null;

  @property({ type: Array })
  rates: RateRow[] = [];

  @state()
  private _loaded = false;

  async load(): Promise<void> {
    if (!this.finance || this._loaded) return;
    await this.reload();
  }

  /** Re-fetch rate rows (used after create/update/delete/replace). */
  async reload(): Promise<void> {
    if (!this.finance) return;
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

  private _money(n: number): string {
    return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private _fmt(c: { kind: 'money' | 'int' | 'rate' }, v: number): string {
    if (c.kind === 'money') return this._money(v);
    if (c.kind === 'int') return String(Math.round(v));
    return v.toFixed(2);
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

  private _onDelete(id: number): void {
    this.dispatchEvent(
      new CustomEvent('rate-delete-request', { detail: { id }, bubbles: true, composed: true }),
    );
  }

  private _onReplace(id: number): void {
    this.dispatchEvent(
      new CustomEvent('rate-replace-request', { detail: { id }, bubbles: true, composed: true }),
    );
  }

  private _renderHeader(): unknown {
    return html`
      <thead>
        <tr>
           <th>Status</th>
           <th>Effective From</th>
           <th>Effective To</th>
           ${RATE_COLUMNS.map((c) => html`<th class="num">${c.label}</th>`)}
           <th>Notes</th>
           <th class="num">Actions</th>
        </tr>
      </thead>
    `;
  }

  private _renderRow(r: RateRow): unknown {
    const current = this._isCurrent(r);
    return html`
      <tr
        class="${current ? 'current' : ''}"
        data-testid="rate-row"
        data-id="${r.id}"
      >
        <td>
          <span class="badge ${current ? '' : 'badge-history'}" data-testid="rate-badge">${current ? 'Current' : 'History'}</span>
        </td>
        <td data-testid="rate-effective_from">${r.effective_from}</td>
        <td class="${r.effective_to === null ? 'empty-effective_to' : ''}" data-testid="rate-effective_to">${r.effective_to ?? '— (open)'}</td>
        ${RATE_COLUMNS.map(
          (c) => html`<td class="num" data-testid="rate-${c.key}">${this._fmt(c, r[c.key] as number)}</td>`,
        )}
        <td data-testid="rate-notes">${r.notes ?? ''}</td>
        <td class="actions">
          ${current
            ? html`
              <button
                class="btn-link"
                data-testid="rate-edit"
                @click="${() => this._onEdit(r.id ?? 0)}"
              >Edit</button>
              <button
                class="btn-link"
                data-testid="rate-replace"
                @click="${() => this._onReplace(r.id ?? 0)}"
              >Replace</button>`
            : html`<button
                class="btn-link"
                data-testid="rate-view"
                @click="${() => this._onView(r.id ?? 0)}"
              >View</button>`}
          <button
            class="btn-link btn-danger-link"
            data-testid="rate-delete"
            @click="${() => this._onDelete(r.id ?? 0)}"
          >Delete</button>
        </td>
      </tr>
    `;
  }

  render(): unknown {
    return html`
      <div class="view-scroll">
      <div class="topbar">
        <span class="crumb-current">Pay Rate History</span>
        <div class="spacer"></div>
        <button class="filter-btn" data-testid="add-rate" @click="${this._onAdd}">+ New Rate</button>
      </div>

      <div class="container">
        <h1 data-testid="rate-history-title">Pay Rate History</h1>
        <p class="subtitle">Effective-dated rate rows · used by <code>PayService.calculatePaySlipBreakdown</code> via <code>PayRateService.getRateForDate(pay_date)</code></p>

        <div class="info-banner">
          <strong>One rate row has <code>effective_to = NULL</code></strong> at any time — that's the current rate. Adding a new rate row automatically closes the previous current row. Historical payslips always compute with their era's rates.
        </div>

        ${this.rates.length === 0
          ? html`<div class="empty" data-testid="rate-empty">No rate rows yet.</div>`
          : html`<div class="table-wrap">
              <table class="rates-table" data-testid="rates-table">
                ${this._renderHeader()}
                <tbody>
                  ${this.rates.map((r) => this._renderRow(r))}
                </tbody>
              </table>
            </div>`}

        <p class="info-note">"Edit" is only available on the current row (the one with <code>effective_to = NULL</code>); historical rows are read-only "View". Adding a new rate row opens <code>rate-row-form</code> and confirms with a dialog.</p>
      </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pay-rate-history-view': PayRateHistoryView;
  }
}
