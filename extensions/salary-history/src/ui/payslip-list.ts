/**
 * Phase 4 Task 11.2 — Salary history list (Lit element).
 *
 * Renders a paginated, sortable table of past payslips (newest first),
 * a year-to-date summary footer (computed by
 * `PayService.aggregateYearToDate`), and four KPI tiles. Edit/Delete
 * actions dispatch `payslip-edit-request` / `payslip-delete` CustomEvents;
 * the mount harness (Task 14) wires those to the form + DAO. Reads
 * (`finance.db.table('salary_history_pay_slips').find({})`) are performed
 * directly against the per-extension `finance` API.
 */

import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { FinanceApi } from '../../../../src/extension-host/api/index.js';
import type { PaySlip } from '../dao/pay-slips.js';
import { aggregateYearToDate, type YtdAggregate } from '../services/pay-service.js';

export interface AccountOption {
  readonly id: number;
  readonly name: string;
  readonly institution: string | null;
}

const PAGE_SIZE = 15;

@customElement('payslip-list')
export class PayslipList extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: #d4d4d4;
      font: 13px/1.5 system-ui, sans-serif;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 12px;
    }
    .kpi {
      border: 1px solid #3c3c3c;
      border-radius: 6px;
      padding: 8px 12px;
      background: #252526;
    }
    .kpi .label {
      font-size: 11px;
      color: #a8a8a8;
      text-transform: uppercase;
    }
    .kpi .value {
      font-size: 18px;
      font-variant-numeric: tabular-nums;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      text-align: left;
      padding: 6px 8px;
      border-bottom: 1px solid #3c3c3c;
    }
    th button {
      background: none;
      border: 0;
      color: #6da3d6;
      cursor: pointer;
      font: inherit;
      padding: 0;
    }
    .ytd {
      border: 1px solid #4ec9b0;
      border-radius: 6px;
      padding: 8px 12px;
      margin-top: 12px;
      background: #0d2e26;
      display: flex;
      gap: 24px;
      font-variant-numeric: tabular-nums;
    }
    .pager {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      align-items: center;
    }
    button.action {
      background: #1e1e1e;
      border: 1px solid #3c3c3c;
      color: #d4d4d4;
      border-radius: 4px;
      padding: 3px 8px;
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
  payslips: PaySlip[] = [];

  @property({ type: Array })
  accounts: AccountOption[] = [];

  @property({ type: String })
  financialYearStart = '07-01';

  @property({ type: String })
  referenceDate = '';

  @state()
  private _loaded = false;

  @state()
  private _sortKey: 'pay_date' | 'gross' = 'pay_date';

  @state()
  private _sortDir: 'asc' | 'desc' = 'desc';

  @state()
  private _page = 0;

  /** Fetch payslips + accounts when `finance` is provided. */
  async load(): Promise<void> {
    if (!this.finance || this._loaded) return;
    const rows = (await this.finance.db
      .table('salary_history_pay_slips')
      .find({}) as unknown) as PaySlip[];
    const accts = (await this.finance.db
      .table('accounts')
      .find({ is_active: true }) as unknown) as AccountOption[];
    this.payslips = rows.slice().sort(this._cmp.bind(this));
    if (this.accounts.length === 0) {
      this.accounts = accts.map((a) => ({
        id: a.id,
        name: a.name,
        institution: a.institution,
      }));
    }
    this._loaded = true;
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private _cmp(a: PaySlip, b: PaySlip): number {
    let r: number;
    if (this._sortKey === 'gross') {
      r = a.gross - b.gross;
    } else {
      r = a.pay_date < b.pay_date ? -1 : a.pay_date > b.pay_date ? 1 : 0;
    }
    return this._sortDir === 'asc' ? r : -r;
  }

  private _accountName(id: number): string {
    return this.accounts.find((a) => a.id === id)?.name ?? `#${id}`;
  }

  private _toggleSort(key: 'pay_date' | 'gross'): void {
    if (this._sortKey === key) {
      this._sortDir = this._sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this._sortKey = key;
      this._sortDir = 'desc';
    }
    this.payslips = this.payslips.slice().sort(this._cmp.bind(this));
  }

  private _ytd(): YtdAggregate {
    const ref = this.referenceDate || new Date().toISOString().slice(0, 10);
    return aggregateYearToDate(this.payslips, this.financialYearStart, ref);
  }

  private _onEdit(id: number): void {
    this.dispatchEvent(
      new CustomEvent('payslip-edit-request', {
        detail: { id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onDelete(id: number): void {
    if (!globalThis.confirm || globalThis.confirm(`Delete payslip #${id}?`)) {
      this.dispatchEvent(
        new CustomEvent('payslip-delete', {
          detail: { id },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  render(): unknown {
    const ytd = this._ytd();
    const pages = Math.max(1, Math.ceil(this.payslips.length / PAGE_SIZE));
    const page = Math.min(this._page, pages - 1);
    const rows = this.payslips.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    return html`
      <div class="kpis" data-testid="kpis">
        <div class="kpi"><div class="label">YTD Gross</div><div class="value" data-testid="kpi-gross">${ytd.gross.toFixed(2)}</div></div>
        <div class="kpi"><div class="label">YTD Net</div><div class="value" data-testid="kpi-net">${ytd.net.toFixed(2)}</div></div>
        <div class="kpi"><div class="label">Count</div><div class="value" data-testid="kpi-count">${ytd.count}</div></div>
        <div class="kpi"><div class="label">Avg / Week</div><div class="value" data-testid="kpi-avg">${(ytd.count > 0 ? ytd.gross / ytd.count : 0).toFixed(2)}</div></div>
      </div>
      ${rows.length === 0
        ? html`<div class="empty" data-testid="empty">No payslips yet.</div>`
        : html`
        <table data-testid="payslip-table">
          <thead>
            <tr>
              <th><button data-testid="sort-date" @click="${() => this._toggleSort('pay_date')}">Pay date</button></th>
              <th>Finance Year</th>
              <th>Account</th>
              <th><button data-testid="sort-gross" @click="${() => this._toggleSort('gross')}">Gross</button></th>
              <th>Net</th>
              <th>Hours</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(
              (p) => html`
                <tr data-testid="payslip-row" data-id="${p.id}">
                  <td>${p.pay_date}</td>
                  <td>${p.finance_year}</td>
                  <td>${this._accountName(p.account_id)}</td>
                  <td>${p.gross.toFixed(2)}</td>
                  <td>${p.net.toFixed(2)}</td>
                  <td>${(p.regular_hours + p.shift_hours + p.overtime_1_5_hours + p.overtime_2_0_hours + p.public_holiday_hours).toFixed(1)}</td>
                  <td>
                    <button class="action" data-testid="edit-${p.id}" @click="${() => this._onEdit(p.id ?? 0)}">Edit</button>
                    <button class="action" data-testid="delete-${p.id}" @click="${() => this._onDelete(p.id ?? 0)}">Delete</button>
                  </td>
                </tr>
              `,
            )}
          </tbody>
        </table>
        <div class="pager">
          <button class="action" data-testid="prev" ?disabled="${page <= 0}" @click="${() => (this._page = page - 1)}">Prev</button>
          <span data-testid="page-info">Page ${page + 1} / ${pages}</span>
          <button class="action" data-testid="next" ?disabled="${page >= pages - 1}" @click="${() => (this._page = page + 1)}">Next</button>
        </div>
      `}
      <div class="ytd" data-testid="ytd-footer">
        <span>YTD Gross: ${ytd.gross.toFixed(2)}</span>
        <span>YTD Net: ${ytd.net.toFixed(2)}</span>
        <span>PAYG: ${ytd.payg.toFixed(2)}</span>
        <span>SG: ${ytd.superannuation_guarantee.toFixed(2)}</span>
        <span>Count: ${ytd.count}</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'payslip-list': PayslipList;
  }
}
