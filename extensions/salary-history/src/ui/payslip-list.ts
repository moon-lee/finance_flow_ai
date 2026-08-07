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
 *
 * Visual fidelity tracks `docs/design/salary-history-mvp/payslip-list.html`.
 */

import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { FinanceApi } from 'finance';
import type { PaySlip } from '../dao/pay-slips.js';
import { aggregateYearToDate, type YtdAggregate } from '../services/pay-service.js';
import { sharedStyles, listStyles } from './shared-styles.js';

export interface AccountOption {
  readonly id: number;
  readonly name: string;
  readonly institution: string | null;
}

type SortKey = 'pay_date' | 'gross' | 'net' | 'payg' | 'sg' | 'leave';
const PAGE_SIZE = 15;

@customElement('payslip-list')
export class PayslipList extends LitElement {
  static styles = [
    sharedStyles,
    listStyles,
    css`
      .container { max-width: 960px; margin: 0 auto; padding: 24px 20px 40px; }
      .subtitle { color: #858585; font-size: 13px; margin: 0 0 16px; }
      .summary-bar {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 12px;
        background: var(--ff-bg-panel);
        border: 1px solid var(--ff-border);
        border-radius: 6px;
        padding: 12px 16px;
        margin-bottom: 12px;
        font-size: 13px;
      }
      .summary-item, .kpi { display: block; flex: 1 1 0; text-align: center; }
      .summary-item .summary-label, .kpi .label {
        color: var(--ff-text-muted);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        margin-bottom: 2px;
      }
      .summary-item .summary-value, .kpi .value {
        font-family: "SF Mono", Consolas, monospace;
        font-size: 16px;
        color: var(--ff-text-strong);
        font-weight: 600;
      }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th {
        text-align: left;
        padding: 10px 12px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #858585;
        border-bottom: 1px solid #3e3e3e;
      }
      th.sortable { cursor: pointer; user-select: none; }
      th.sortable:hover { color: #d4d4d4; }
      th.sortable::after { content: ' ⇅'; color: #555; font-size: 10px; }
      th.sorted-desc::after { content: ' ↓'; color: #007acc; }
      th.sorted-asc::after { content: ' ↑'; color: #007acc; }
      td {
        padding: 8px 12px;
        border-bottom: 1px solid #2a2a2a;
        color: #d4d4d4;
        text-align: left;
      }
      th.num, td.num { text-align: right; }
      td.num { font-family: "SF Mono", Consolas, monospace; }
      td.fy { font-family: "SF Mono", Consolas, monospace; color: #858585; font-size: 12px; }
      td.actions { text-align: right; white-space: nowrap; }
      td.actions .btn-link { margin-left: 8px; }
      td.actions .btn-link:first-child { margin-left: 0; }
      .ytd-footer {
        background: var(--ff-bg-panel);
        border: 1px solid var(--ff-border);
        border-top: 2px solid var(--ff-teal);
        border-radius: 0 0 6px 6px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .ytd-footer-head {
        display: flex;
        align-items: baseline;
        gap: 16px;
        flex-wrap: wrap;
      }
      .ytd-footer-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--ff-teal);
      }
      .ytd-breakdown {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
        justify-content: end;
        gap: 8px;
        width: 100%;
        padding-top: 12px;
        border-top: 1px solid var(--ff-border);
      }
      .ytd-chip {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        min-width: 0;
        background: var(--ff-bg-subpanel);
        border: 1px solid var(--ff-border);
        border-radius: 4px;
        padding: 4px 8px;
        font-family: "SF Mono", Consolas, monospace;
        font-size: 12px;
        white-space: nowrap;
      }
      .ytd-chip .chip-label {
        color: var(--ff-text-muted);
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ytd-chip .chip-value { color: var(--ff-text); font-weight: 600; flex-shrink: 0; }
      .pagination {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 16px;
        background: #2a2a2a;
        border-top: 1px solid #3e3e3e;
        font-size: 12px;
        color: #858585;
      }
      .pagination .pages { display: flex; gap: 4px; }
      .pagination .page-btn {
        background: transparent;
        border: 1px solid #3e3e3e;
        color: #d4d4d4;
        padding: 4px 10px;
        border-radius: 3px;
        cursor: pointer;
        font-family: inherit;
        font-size: 12px;
      }
      .pagination .page-btn:hover { border-color: #007acc; }
      .pagination .page-btn.current { background: #007acc; border-color: #007acc; color: #ffffff; }
      .pagination .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .info-note {
        font-size: 12px;
        color: #858585;
        font-style: italic;
        margin-top: 8px;
        padding: 8px 12px;
        background: #1e1e1e;
        border-radius: 3px;
      }
      .info-note code { color: #4ec9b0; font-style: normal; }
    `,
  ];

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
  private _sortKey: SortKey = 'pay_date';

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
    const av = this._sortVal(a, this._sortKey);
    const bv = this._sortVal(b, this._sortKey);
    if (typeof av === 'string') {
      r = av < (bv as string) ? -1 : av > (bv as string) ? 1 : 0;
    } else {
      r = (av as number) - (bv as number);
    }
    return this._sortDir === 'asc' ? r : -r;
  }

  private _sortVal(p: PaySlip, key: SortKey): number | string {
    switch (key) {
      case 'gross':
        return p.gross;
      case 'net':
        return p.net;
      case 'payg':
        return p.payg_withholding;
      case 'sg':
        return p.superannuation_guarantee;
      case 'pay_date':
      default:
        return p.pay_date;
    }
  }

  private _toggleSort(key: SortKey): void {
    if (this._sortKey === key) {
      this._sortDir = this._sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this._sortKey = key;
      this._sortDir = 'desc';
    }
    this.payslips = this.payslips.slice().sort(this._cmp.bind(this));
  }

  private _th(key: SortKey, label: string, extraClass = '') {
    const active = this._sortKey === key;
    const cls = active
      ? `sortable ${this._sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc'}`
      : 'sortable';
    return html`<th class="${[cls, extraClass].filter(Boolean).join(' ')}" @click="${() => this._toggleSort(key)}">${label}</th>`;
  }

  private _money(n: number): string {
    return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Earnings-breakdown chips for the YTD footer. Three summary chips
   * (YTD PAYG, YTD SG, YTD Shift Allow) are always shown at the same
   * level; the remaining components are shown only when their YTD sum is
   * materially > 0 (threshold 0.005 avoids floating-point `$0.00` chips).
   */
  private _ytdBreakdownChips(ytd: YtdAggregate): unknown {
    const summary: Array<[string, number, string]> = [
      ['YTD PAYG', ytd.payg, 'payg'],
      ['YTD SG', ytd.superannuation_guarantee, 'sg'],
      ['YTD Shift Allow.', ytd.shift_allowance, 'shift-allowance'],
    ];
    const components: Array<[string, number, string]> = [
      ['Overtime 1.5', ytd.overtime_1_5x, 'overtime-1-5'],
      ['Overtime 2.0', ytd.overtime_2_0x, 'overtime-2-0'],
      ['Personal Leave', ytd.personal_leave, 'personal-leave'],
      ['Holiday Leave Loading', ytd.holiday_leave_loading, 'holiday-loading'],
      ['Holiday Pay', ytd.holiday_pay, 'holiday-pay'],
      ['Public Holiday', ytd.public_holiday, 'public-holiday'],
    ];
    const active = components.filter(([, v]) => v > 0.005);
    const chips = [...summary, ...active];
    if (chips.length === 0) return nothing;
    return html`
      <div class="ytd-breakdown" data-testid="ytd-breakdown">
        ${chips.map(
          ([label, value, key]) => html`
            <span class="ytd-chip" data-testid="ytd-chip-${key}">
              <span class="chip-label">${label}</span>
              <span class="chip-value">${this._money(value)}</span>
            </span>
          `,
        )}
      </div>
    `;
  }

  private _fyLabel(): string {
    const ref = this.referenceDate || new Date().toISOString().slice(0, 10);
    const [ry, rm] = ref.split('-').map(Number);
    const [sm] = this.financialYearStart.split('-').map(Number);
    const startYear = rm >= sm ? ry : ry - 1;
    return `${startYear}-${startYear + 1}`;
  }

  /** Expand a stored `YYYY-YY` finance year to `YYYY-YYYY` for display. */
  private _fyDisplay(fy: string): string {
    const m = /^(\d{4})-(\d{2})$/.exec(fy.trim());
    if (!m) return fy;
    const start = Number(m[1]);
    const end2 = Number(m[2]);
    const century = Math.floor(start / 100);
    return `${start}-${century * 100 + end2}`;
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

  private _onAdd(): void {
    this.dispatchEvent(new CustomEvent('payslip-add-request', { bubbles: true, composed: true }));
  }

  render(): unknown {
    const ytd = this._ytd();
    const total = this.payslips.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(this._page, pages - 1);
    const start = page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, total);
    const rows = this.payslips.slice(start, end);
    const subtitle = `FY ${this._fyDisplay(this._fyLabel())} · Account: ${this.accounts[0]?.name ?? '—'} · ${total} payslips`;

    return html`
      <div class="topbar">
        <span class="crumb-current">Pay History</span>
        <div class="spacer"></div>
        <button class="filter-btn">⌕ Filter</button>
        <button class="filter-btn" @click="${() => this._onAdd()}">+ Add Payslip</button>
      </div>

      <div class="container">
        <h1>Pay History</h1>
        <p class="subtitle">${subtitle}</p>

        <div class="summary-bar" data-testid="kpis">
          <div class="summary-item kpi"><div class="summary-label label">YTD Gross</div><div class="summary-value value" data-testid="kpi-gross">${this._money(ytd.gross)}</div></div>
          <div class="summary-item kpi"><div class="summary-label label">YTD Net</div><div class="summary-value value" data-testid="kpi-net">${this._money(ytd.net)}</div></div>
          <div class="summary-item kpi"><div class="summary-label label">Count</div><div class="summary-value value" data-testid="kpi-count">${ytd.count}</div></div>
          <div class="summary-item kpi"><div class="summary-label label">Avg / Week</div><div class="summary-value value" data-testid="kpi-avg">${this._money(ytd.count > 0 ? ytd.gross / ytd.count : 0)}</div></div>
        </div>

        ${total === 0
          ? html`<div class="empty" data-testid="empty">No payslips yet.</div>`
          : html`
            <div class="table-wrap">
              <table data-testid="payslip-table">
                <thead>
                   <tr>
                     ${this._th('pay_date', 'Pay date')}
                     <th>Finance Year</th>
                     ${this._th('gross', 'Gross', 'num')}
                     ${this._th('net', 'Net', 'num')}
                     ${this._th('payg', 'PAYG', 'num')}
                     ${this._th('sg', 'SG', 'num')}
                     ${this._th('leave', 'Leave Accrual', 'num')}
                     <th class="num">Actions</th>
                   </tr>
                </thead>
                <tbody>
                  ${rows.map(
                    (p) => html`
                      <tr data-testid="payslip-row" data-id="${p.id}">
                        <td class="fy">${p.pay_date}</td>
                        <td class="fy">${this._fyDisplay(p.finance_year)}</td>
                        <td class="num">${this._money(p.gross)}</td>
                        <td class="num">${this._money(p.net)}</td>
                        <td class="num">${this._money(p.payg_withholding)}</td>
                        <td class="num">${this._money(p.superannuation_guarantee)}</td>
                        <td class="num">${p.holiday_leave_accrual_hours.toFixed(2)}</td>
                        <td class="actions">
                          <button class="btn-link" data-testid="edit-${p.id}" @click="${() => this._onEdit(p.id ?? 0)}">Edit</button>
                          <button class="btn-link danger" data-testid="delete-${p.id}" @click="${() => this._onDelete(p.id ?? 0)}">Delete</button>
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>

              <div class="ytd-footer" data-testid="ytd-footer">
                <div class="ytd-footer-head">
                  <span class="ytd-footer-label">▾ Year-to-Date (FY${this._fyLabel()} · ${total} payslips)</span>
                </div>
                ${this._ytdBreakdownChips(ytd)}
              </div>

              <div class="pagination">
                <span>Showing ${total === 0 ? 0 : start + 1}–${end} of ${total}</span>
                <div class="pages">
                  <button class="page-btn" data-testid="prev" ?disabled="${page <= 0}" @click="${() => (this._page = page - 1)}">← Prev</button>
                  ${Array.from({ length: pages }, (_, i) => i).map(
                    (i) => html`<button class="page-btn ${i === page ? 'current' : ''}" ?disabled="${i === page}" @click="${() => (this._page = i)}">${i + 1}</button>`,
                  )}
                  <button class="page-btn" data-testid="next" ?disabled="${page >= pages - 1}" @click="${() => (this._page = page + 1)}">Next →</button>
                </div>
              </div>
            </div>

            <p class="info-note">YTD summary uses <code>PayService.aggregateYearToDate(payslips, financialYearStart)</code>. Edit populates the payslip form; Delete confirms then dispatches <code>payslip-delete</code>. Pagination shows 15 rows/page.</p>
          `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'payslip-list': PayslipList;
  }
}
