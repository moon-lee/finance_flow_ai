/**
 * Phase 5 Task 9 — Dashboard lit host element.
 *
 * Receives `aggregator` (a `DashboardData` payload) + `cardOrder` (an
 * array of card ids controlling render order) and slots them into a 2×2
 * grid of Lit-rendered cards. Each card component is a pure Lit template
 * that emits no events; the aggregator service owns all data fetching.
 *
 * Cards degrade gracefully: when a card's data is `null` / empty, the
 * card shows a "—" or "install Salary History to see this card"
 * placeholder instead of crashing.
 */

import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import type { DashboardData } from '../services/aggregator-service.js';

export class DashboardView extends LitElement {
  static properties = {
    aggregator: { attribute: false },
    cardOrder: { attribute: false },
    financialYearCurrent: { attribute: false }
  };

  aggregator: DashboardData | null = null;
  cardOrder: string[] = [];
  financialYearCurrent = '';

  private _boundMountUpdate = (e: Event): void => {
    const detail = (e as CustomEvent).detail as Record<string, unknown>;
    if (detail?.aggregator) this.aggregator = detail.aggregator as DashboardData;
    if (detail?.cardOrder) this.cardOrder = detail.cardOrder as string[];
    if (typeof detail?.financialYearCurrent === 'string') this.financialYearCurrent = detail.financialYearCurrent;
  };

  connectedCallback(): void {
    super.connectedCallback();
    this.parentElement?.addEventListener('mount-update', this._boundMountUpdate);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.parentElement?.removeEventListener('mount-update', this._boundMountUpdate);
  }

  static styles = css`
    :host {
      display: block;
      box-sizing: border-box;
      font: 14px/1.5 system-ui, sans-serif;
    }
    .subtitle { 
      color: #858585; 
      font: 13px/1.5 system-ui, sans-serif;
    }
    .topbar {
      background: #252526;
      border-bottom: 1px solid #3e3e3e;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .topbar .crumb-current {
      color: #d4d4d4;
      font-weight: 500;
    }
    .topbar .spacer {
      flex: 1;
    }
    .topbar .reorder-btn {
      background: #3c3c3c;
      color: #d4d4d4;
      border: 1px solid #3e3e3e;
      padding: 5px 12px;
      border-radius: 3px;
      cursor: pointer;
    }
    .topbar .reorder-btn:hover {
      border-color: #007acc;
    }
    .reorder-btn {
      background: transparent;
      color: #858585;
      border: 1px solid #3e3e3e;
      padding: 4px 10px;
      border-radius: 3px;
      font-size: 12px;
      cursor: pointer;
      font-family: inherit;
    }
    .grid {
      display: grid;
      padding: 24px 20px 20px 20px;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .card {
      background: #252526;
      border: 1px solid #3e3e3e;
      border-radius: 6px;
      padding: 16px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 12px;
    }
    .card-title {
      font-size: 13px;
      font-weight: 600;
      color: #858585;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .card-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 3px;
      background: #4ec9b0;
      color: #1e1e1e;
      font-weight: 600;
    }
    .card-badge.warn {
      background: #cca700;
      color: #1e1e1e;
    }
    .card-badge.placeholder {
      background: #3c3c3c;
      color: #858585;
    }
    .card-value {
      font-family: "SF Mono", Consolas, monospace;
      font-size: 22px;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 4px;
    }
    .card-sub {
      font-size: 12px;
      color: #858585;
    }
    .card-detail {
      font-size: 12px;
      color: #858585;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #3e3e3e;
    }
    .placeholder {
      color: #858585;
      font-size: 13px;
    }
    .placeholder a {
      color: #007acc;
      cursor: pointer;
    }
    .missing {
      color: #858585;
      font-size: 13px;
      font-style: italic;
    }
    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; }
    }
  `;

  @property({ type: String })
  referenceDate = '';
  
  @property({ type: String })
  financialYearStart = '07-01';


  private _formatCurrency(value: number | null, fallbackCurrency = 'AUD'): string {
    if (value === null || value === undefined) return '—';
    try {
      return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: fallbackCurrency,
        minimumFractionDigits: 2
      }).format(value);
    } catch {
      return `${fallbackCurrency} ${value.toFixed(2)}`;
    }
  }

  private _renderNetWorth(): unknown {
    const data = this.aggregator?.netWorth;
    if (!data) return this._missing('Net Worth');
    const total = data.totalBalance !== null ? data.totalBalance : data.totalNetPayLast12Months;
    const label = data.totalBalance !== null && data.totalNetPayLast12Months !== null
      ? 'Balance + last payslip net'
      : data.totalBalance !== null
        ? 'Accounts balance only'
        : 'Last payslip net only';
    const badge = total !== null
      ? html`<span class="card-badge">${this._formatCurrency(total, data.currency ?? 'AUD')}</span>`
      : html`<span class="card-badge placeholder">—</span>`;
    return html`
      <div class="card">
        <div class="card-header">
          <span class="card-title">Net Worth</span>
          ${badge}
        </div>
        <div class="card-value">${total !== null
          ? this._formatCurrency(total, data.currency ?? 'AUD')
          : html`<span class="placeholder">—</span>`}</div>
        <div class="card-sub">${label}</div>
      </div>
    `;
  }

  private _renderYtdSalary(): unknown {
    const data = this.aggregator?.ytdSalary;
    if (!data) return this._missing('YTD Salary');
    if (!data.summary) {
      return html`
        <div class="card">
          <div class="card-header">
            <span class="card-title">Year-to-Date Salary</span>
          </div>
          <div class="placeholder">Install Salary History to see this card</div>
        </div>
      `;
    }
    const rate = data.currentRate;
    const subtitle = rate
      ? `Current rate ${this._formatCurrency(rate.base_hourly_rate)}/hr since ${rate.effective_from}`
      : 'No current rate set';
    return html`
      <div class="card">
        <div class="card-header">
          <span class="card-title">Year-to-Date Salary</span>
          <span class="card-badge">${this._formatCurrency(data.summary.gross)}</span>
        </div>
        <div class="card-value">${this._formatCurrency(data.summary.net)}</div>
        <div class="card-sub">Gross ${this._formatCurrency(data.summary.gross)} · ${subtitle}</div>
        <div class="card-sub">PAYG ${this._formatCurrency(data.summary.payg)} · SG ${this._formatCurrency(data.summary.superannuation_guarantee)}</div>
      </div>
    `;
  }

  private _renderLastPayslip(): unknown {
    const data = this.aggregator?.lastPayslip;
    if (!data || data.id === null) return this._missing('Last Payslip');
    const badge = data.pay_date
      ? html`<span class="card-badge placeholder">${data.pay_date}</span>`
      : html`<span class="card-badge placeholder">—</span>`;
    return html`
      <div class="card">
        <div class="card-header">
          <span class="card-title">Last Payslip</span>
          ${badge}
        </div>
        <div class="card-value">${this._formatCurrency(data.net ?? 0)}</div>
        <div class="card-sub">Gross ${this._formatCurrency(data.gross ?? 0)}</div>
        <div class="card-detail">${data.pay_date ?? 'unknown date'} · ${data.currency ?? 'AUD'}</div>
      </div>
    `;
  }

  private _renderAccountsSummary(): unknown {
    const data = this.aggregator?.accountsSummary;
    if (!data) return this._missing('Accounts');
    return html`
      <div class="card">
        <div class="card-header">
          <span class="card-title">Accounts Summary</span>
          <span class="card-badge">${data.count} active</span>
        </div>
        <div class="card-value">${data.count} account${data.count === 1 ? '' : 's'}</div>
        <div class="card-sub">${data.totalBalance !== null ? `Total ${this._formatCurrency(data.totalBalance)}` : 'No balance data'}</div>
      </div>
    `;
  }

  private _missing(label: string): unknown {
    return html`
      <div class="card">
        <div class="card-header">
          <span class="card-title">${label}</span>
        </div>
        <div class="missing">Install Salary History to see this card</div>
      </div>
    `;
  }

  private _renderCard(id: string): unknown {
    switch (id) {
      case 'net-worth': return this._renderNetWorth();
      case 'ytd-salary': return this._renderYtdSalary();
      case 'last-payslip': return this._renderLastPayslip();
      case 'accounts-summary': return this._renderAccountsSummary();
      default: return this._missing(id);
    }
  }

  private _onReorder(): void {
    this.dispatchEvent(
      new CustomEvent('reorder-cards', { bubbles: true, composed: true }),
    );
  }

  private _fyLabel(): string {
    const override = (this.financialYearCurrent ?? '').trim();
    if (override) return this._fyDisplay(override);
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

  render() {
    const cards = this.cardOrder.map(id => this._renderCard(id));
    const subtitle = `(FY ${this._fyDisplay(this._fyLabel())})`;
    
    return html`
      <div class="topbar">
        <span class="crumb-current">Dashboard</span>
        <span class="subtitle">${subtitle}</span>
        <div class="spacer"></div>
        <button class="reorder-btn" @click="${this._onReorder}">⇅ Reorder Cards</button>
      </div>
      <div class="grid">
        ${cards}
      </div>
    `;
  }
}

customElements.define('dashboard-view', DashboardView);
