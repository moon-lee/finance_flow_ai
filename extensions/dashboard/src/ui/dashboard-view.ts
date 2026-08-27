/**
 * Phase 5 Task 9 — Dashboard lit host element.
 *
 * New layout: single Pay Summary card in a 2-column grid (column 2
 * reserved for future cards). The card contains:
 *   - Last Payslip table (Date / Gross / Net)
 *   - Separator
 *   - YTD Comparison table (Actual / Estimated / Variance)
 *
 * Topbar includes a Finance Year filter dropdown populated from
 * core.financeYear.filter setting.
 */

import { LitElement, html } from 'lit';
import { property } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import type { DashboardData } from '../services/aggregator-service.js';

export class DashboardView extends LitElement {
  static properties = {
    aggregator: { attribute: false },
    cardOrder: { attribute: false },
    financialYearCurrent: { attribute: false },
    financeYearFilter: { attribute: false }
  };

  aggregator: DashboardData | null = null;
  cardOrder: string[] = [];
  financialYearCurrent = '';
  financeYearFilter = 5;

  private _boundMountUpdate = (e: Event): void => {
    const detail = (e as CustomEvent).detail as Record<string, unknown>;
    if (detail?.aggregator) this.aggregator = detail.aggregator as DashboardData;
    if (detail?.cardOrder) this.cardOrder = detail.cardOrder as string[];
    if (typeof detail?.financialYearCurrent === 'string') this.financialYearCurrent = detail.financialYearCurrent;
    if (typeof detail?.financeYearFilter === 'number') this.financeYearFilter = detail.financeYearFilter;
  };

  connectedCallback(): void {
    super.connectedCallback();
    this.parentElement?.addEventListener('mount-update', this._boundMountUpdate);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.parentElement?.removeEventListener('mount-update', this._boundMountUpdate);
  }

  static styles = [sharedStyles];

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

  private _fyOptions(): { label: string; value: string }[] {
    const ref = this.referenceDate || new Date().toISOString().slice(0, 10);
    const [ry, rm] = ref.split('-').map(Number);
    const [sm] = this.financialYearStart.split('-').map(Number);
    const currentStartYear = rm >= sm ? ry : ry - 1;
    const count = typeof this.financeYearFilter === 'number' ? this.financeYearFilter : 5;
    const options: { label: string; value: string }[] = [];
    for (let i = 0; i < count; i++) {
      const start = currentStartYear - i;
      const end = start + 1;
      options.push({
        label: `FY ${start}–${end}`,
        value: `${start}-${end}`
      });
    }
    return options;
  }

  private _currentFyValue(): string {
    const override = (this.financialYearCurrent ?? '').trim();
    if (override) return this._fyDisplay(override);
    const ref = this.referenceDate || new Date().toISOString().slice(0, 10);
    const [ry, rm] = ref.split('-').map(Number);
    const [sm] = this.financialYearStart.split('-').map(Number);
    const startYear = rm >= sm ? ry : ry - 1;
    return `${startYear}-${startYear + 1}`;
  }

  private _fyDisplay(fy: string): string {
    const trimmed = fy.trim();
    const m = /^(\d{4})-(\d{2})$/.exec(trimmed);
    if (!m) return trimmed;
    const start = Number(m[1]);
    const end2 = Number(m[2]);
    const century = Math.floor(start / 100);
    return `${start}-${century * 100 + end2}`;
  }

  private _onFyChange = (e: Event): void => {
    const target = (e.currentTarget ?? e.target) as HTMLSelectElement | null;
    const value = target?.value ?? '';
    if (!value) return;
    this.dispatchEvent(
      new CustomEvent('fy-changed', {
        detail: { financialYearCurrent: value },
        bubbles: true,
        composed: true
      })
    );
  };

  private _renderPaySummaryCard(): unknown {
    const data = this.aggregator;
    const fyLabel = this._fyDisplay(this._currentFyValue());
    const currentFy = this._currentFyValue();

    return html`
      <div class="card">
        <div class="card-header">
          <span class="card-title">Pay Summary</span>
          <span class="card-badge">${fyLabel}</span>
        </div>

        <div class="section-title">Last Payslip</div>
        <table class="ytd-table">
          <thead>
            <tr>
              <th>Date</th>
              <th class="num">GROSS</th>
              <th class="num">NET</th>
            </tr>
          </thead>
          <tbody>
            ${data?.lastPayslip && data.lastPayslip.id !== null ? html`
              <tr>
                <td>${data.lastPayslip.pay_date ?? '—'}</td>
                <td class="num actual">${this._formatCurrency(data.lastPayslip.gross)}</td>
                <td class="num actual">${this._formatCurrency(data.lastPayslip.net)}</td>
              </tr>
            ` : html`
              <tr><td colspan="3">No payslips yet</td></tr>
            `}
          </tbody>
        </table>

        <div class="section-sep"></div>

        <div class="section-title">YTD Comparison</div>
        <table class="ytd-table">
          <thead>
            <tr>
              <th></th>
              <th class="num">Actual</th>
              <th class="num">Estimated</th>
              <th class="num">Variance</th>
            </tr>
          </thead>
          <tbody>
            ${data?.ytdSalary?.summary && data?.estimatedYtd ? html`
              <tr>
                <td>GROSS</td>
                <td class="num actual">${this._formatCurrency(data.ytdSalary.summary.gross)}</td>
                <td class="num estimated">${this._formatCurrency(data.estimatedYtd.gross)}</td>
                <td class="num ${data.estimatedYtd.gross - data.ytdSalary.summary.gross >= 0 ? 'variance-positive' : 'variance-negative'}">${this._formatCurrency(data.estimatedYtd.gross - data.ytdSalary.summary.gross)}</td>
              </tr>
              <tr>
                <td>NET</td>
                <td class="num actual">${this._formatCurrency(data.ytdSalary.summary.net)}</td>
                <td class="num estimated">${this._formatCurrency(data.estimatedYtd.net)}</td>
                <td class="num ${data.estimatedYtd.net - data.ytdSalary.summary.net >= 0 ? 'variance-positive' : 'variance-negative'}">${this._formatCurrency(data.estimatedYtd.net - data.ytdSalary.summary.net)}</td>
              </tr>
              <tr>
                <td>PAYG</td>
                <td class="num actual">${this._formatCurrency(data.ytdSalary.summary.payg)}</td>
                <td class="num estimated">${this._formatCurrency(data.estimatedYtd.payg)}</td>
                <td class="num ${data.estimatedYtd.payg - data.ytdSalary.summary.payg >= 0 ? 'variance-positive' : 'variance-negative'}">${this._formatCurrency(data.estimatedYtd.payg - data.ytdSalary.summary.payg)}</td>
              </tr>
            ` : html`
              <tr><td colspan="4">Install Salary History to see this card</td></tr>
            `}
          </tbody>
        </table>
      </div>
    `;
  }

  private _onReorder = (): void => {
    this.dispatchEvent(
      new CustomEvent('reorder-cards', { bubbles: true, composed: true }),
    );
  };

  render() {
    const cards = this.cardOrder.map(id => {
      if (id === 'pay-summary') return this._renderPaySummaryCard();
      return null;
    });
    const fyOptions = this._fyOptions();
    const currentFy = this._currentFyValue();

    return html`
      <div class="topbar">
        <span class="crumb-current">Dashboard</span>
        <select class="fy-select" .value=${currentFy} @change=${this._onFyChange}>
          ${fyOptions.map(opt => html`<option value=${opt.value}>${opt.label}</option>`)}
        </select>
        <span class="spacer"></span>
        <button class="reorder-btn" @click=${this._onReorder}>⇅ Reorder Cards</button>
      </div>
      <div class="grid">
        ${cards}
      </div>
    `;
  }
}

customElements.define('dashboard-view', DashboardView);
