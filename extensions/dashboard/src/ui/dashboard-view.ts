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
import type { DashboardData } from '../services/aggregator-service.js';

export class DashboardView extends LitElement {
  static properties = {
    aggregator: { attribute: false },
    cardOrder: { attribute: false }
  };

  aggregator: DashboardData | null = null;
  cardOrder: string[] = [];

  static styles = css`
    :host {
      display: block;
      padding: 16px;
      box-sizing: border-box;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .card {
      border: 1px solid var(--color-border, #e5e7eb);
      border-radius: 8px;
      padding: 12px 16px;
      background: var(--color-card, #ffffff);
    }
    .card h3 {
      margin: 0 0 8px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-muted, #6b7280);
    }
    .value {
      font-size: 22px;
      font-weight: 600;
      color: var(--color-text, #111827);
    }
    .subtitle {
      font-size: 12px;
      color: var(--color-muted, #6b7280);
      margin-top: 4px;
    }
    .placeholder {
      color: var(--color-muted, #9ca3af);
      font-size: 14px;
    }
    .missing {
      color: var(--color-muted, #6b7280);
      font-size: 13px;
      font-style: italic;
    }
    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; }
    }
  `;

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
    const label = data.totalBalance !== null && data.totalNetPayLast12Months !== null
      ? 'Balance + last payslip net'
      : data.totalBalance !== null
        ? 'Accounts balance only'
        : 'Last payslip net only';
    return html`
      <div class="card">
        <h3>Net Worth</h3>
        <div class="value">${data.totalBalance !== null
          ? this._formatCurrency(data.totalBalance, data.currency ?? 'AUD')
          : data.totalNetPayLast12Months !== null
            ? this._formatCurrency(data.totalNetPayLast12Months, data.currency ?? 'AUD')
            : html`<span class="placeholder">—</span>`}</div>
        <div class="subtitle">${label}</div>
      </div>
    `;
  }

  // Oops, typo above. Let me fix it inline.

  private _renderYtdSalary(): unknown {
    const data = this.aggregator?.ytdSalary;
    if (!data) return this._missing('YTD Salary');
    if (!data.summary) {
      return html`
        <div class="card">
          <h3>Year-to-Date Salary</h3>
          <div class="missing">Install Salary History to see this card</div>
        </div>
      `;
    }
    const rate = data.currentRate;
    const subtitle = rate
      ? `Current rate ${this._formatCurrency(rate.base_hourly_rate)}/hr since ${rate.effective_from}`
      : 'No current rate set';
    return html`
      <div class="card">
        <h3>Year-to-Date Salary</h3>
        <div class="value">${this._formatCurrency(data.summary.net)}</div>
        <div class="subtitle">Gross ${this._formatCurrency(data.summary.gross)} · ${subtitle}</div>
        <div class="subtitle">PAYG ${this._formatCurrency(data.summary.payg)} · SG ${this._formatCurrency(data.summary.superannuation_guarantee)}</div>
      </div>
    `;
  }

  private _renderLastPayslip(): unknown {
    const data = this.aggregator?.lastPayslip;
    if (!data || data.id === null) return this._missing('Last Payslip');
    return html`
      <div class="card">
        <h3>Last Payslip</h3>
        <div class="value">${this._formatCurrency(data.net ?? 0)}</div>
        <div class="subtitle">${data.pay_date ?? 'unknown date'} · ${data.currency ?? 'AUD'}</div>
        <div class="subtitle">Gross ${this._formatCurrency(data.gross ?? 0)}</div>
      </div>
    `;
  }

  private _renderAccountsSummary(): unknown {
    const data = this.aggregator?.accountsSummary;
    if (!data) return this._missing('Accounts');
    return html`
      <div class="card">
        <h3>Accounts</h3>
        <div class="value">${data.count} account${data.count === 1 ? '' : 's'}</div>
        <div class="subtitle">${data.totalBalance !== null ? `Total ${this._formatCurrency(data.totalBalance)}` : 'No balance data'}</div>
      </div>
    `;
  }

  private _missing(label: string): unknown {
    return html`
      <div class="card">
        <h3>${label}</h3>
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

  render() {
    const cards = this.cardOrder.map(id => this._renderCard(id));
    return html`
      <div class="grid">
        ${cards}
      </div>
    `;
  }
}

customElements.define('dashboard-view', DashboardView);
