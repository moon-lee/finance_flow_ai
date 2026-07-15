/**
 * Phase 4 Task 11.1 — Payslip entry form (Lit element).
 *
 * Decision 14 + Decision 18 shape the form: 8 always-render sections
 * (ordered by the `salary-history.sectionOrder` setting, default
 * `["period","totals","earnings","deductions","super","leave","leave-accrual","notes"]`).
 * The user enters 3 minimal facts (`pay_date`, `gross`, `net`) plus
 * optional hour inputs; the earnings / PAYG / super breakdowns are
 * DERIVED (read-only preview) from the current rate row via
 * `PayService.calculatePaySlipBreakdown` — see Decision 14.
 *
 * ## Data flow
 *
 * Reads (`finance.db.table(...)`) are performed by this element against
 * the per-extension `finance` API object. Writes are NOT performed here:
 * the form dispatches a `payslip-create` (new) / `payslip-edit`
 * (existing) CustomEvent with the fully-derived `PaySlipInput` payload;
 * the mount harness (Task 14) routes that event to `finance.db`
 * persistence. This keeps the element a pure UI surface that is fully
 * testable with a stubbed `finance`.
 *
 * ## finance_year auto-fill (Review Finding 9)
 *
 * `finance_year` is auto-computed from `pay_date` + the
 * `financialYearStart` (`MM-DD`) setting via
 * `PayService.computeFinanceYear`. If the user edits the field away
 * from the derived value, a non-blocking amber callout appears with
 * two actions: "Auto-correct" (accept the derived value) and
 * "Keep override" (suppress the warning; the form still submits).
 */

import { LitElement, css, html, type PropertyValues, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { FinanceApi } from 'finance';
import { sharedStyles, formStyles } from './shared-styles.js';
import type { PaySlip, PaySlipInput } from '../dao/pay-slips.js';
import type { RateRow } from '../dao/pay-rate-history.js';
import {
  calculatePaySlipBreakdown,
  calculateHolidayLeaveAccrual,
  validatePayslipInput,
  validateFinanceYear,
  computeFinanceYear,
  reconcilePaySlip,
  type PaySlipBreakdown,
  type ReconciliationResult,
} from '../services/pay-service.js';
import { validatePayg, type PaygValidationResult } from '../services/payg-calc.js';

/** Canonical 8-section render order (Decision 18 + Plan Amendment 7). */
export const CANONICAL_SECTION_ORDER = [
  'period',
  'totals',
  'earnings',
  'deductions',
  'super',
  'leave',
  'leave-accrual',
  'notes',
] as const;

export type SectionId = (typeof CANONICAL_SECTION_ORDER)[number];

export interface AccountOption {
  readonly id: number;
  readonly name: string;
  readonly institution: string | null;
}

const STORED_HOUR_FIELDS = [
  'regular_hours',
  'shift_hours',
  'overtime_1_5_hours',
  'overtime_2_0_hours',
  'public_holiday_hours',
] as const;

interface FormValues {
  pay_date: string;
  finance_year: string;
  account_id: number | null;
  gross: string;
  net: string;
  notes: string;
  regular_hours: string;
  shift_hours: string;
  overtime_1_5_hours: string;
  overtime_2_0_hours: string;
  holiday_hours: string;
  public_holiday_hours: string;
  personal_leave_hours: string;
}

const EMPTY_VALUES: FormValues = {
  pay_date: '',
  finance_year: '',
  account_id: null,
  gross: '',
  net: '',
  notes: '',
  regular_hours: '',
  shift_hours: '',
  overtime_1_5_hours: '',
  overtime_2_0_hours: '',
  holiday_hours: '',
  public_holiday_hours: '',
  personal_leave_hours: '',
};

function num(v: string): number {
  if (v.trim() === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

@customElement('payslip-form')
export class PayslipForm extends LitElement {
  static styles = [
    sharedStyles,
    formStyles,
    css`
      :host {
        font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      * { box-sizing: border-box; }
      .container { max-width: 760px; margin: 0 auto; padding: 24px 20px 40px; }
      .subtitle { color: #858585; font-size: 13px; margin: 0 0 24px; }
      .section.readonly { border-color: #5a4a1a; }
      .section.accrual { border-color: #c2913a; }
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
      .reorder-btn:hover { border-color: #007acc; color: #d4d4d4; }
      input[readonly], input:disabled { background: #2a2a2a; color: #858585; font-style: italic; }
      .read-only-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
      .read-only-row .label { color: #858585; font-family: 'SF Mono', Consolas, monospace; font-size: 12px; }
      .read-only-row .value { color: #d4d4d4; font-family: 'SF Mono', Consolas, monospace; }
      .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; }
      .toggle { cursor: pointer; color: #6da3d6; }
      .hours-block { background: #1e1e1e; border: 1px solid #3e3e3e; border-radius: 4px; padding: 12px; margin-top: 12px; }
      .hours-block-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: #858585; margin-bottom: 8px; }
      .amber { background: #4a3c00; border: 1px solid #cca700; color: #e8d28a; border-radius: 4px; padding: 8px 10px; margin: 8px 0; font-size: 12px; }
      .amber button { margin-left: 6px; }
      .green { background: #0d2e26; border: 1px solid #4ec9b0; color: #9fe6d6; border-radius: 4px; padding: 8px 10px; margin: 8px 0; font-size: 12px; }
      .red { background: #3a1414; border: 1px solid #f48771; color: #f3b3a6; border-radius: 4px; padding: 8px 10px; margin: 8px 0; font-size: 12px; }
      .errors { color: #f48771; font-size: 12px; margin: 8px 0; }
      .formula { color: #8a8a8a; font-size: 11px; margin-top: 8px; font-family: 'SF Mono', Consolas, monospace; }
      .btn-validate { background: #2a2a2a; color: #007acc; border: 1px solid #007acc; padding: 5px 12px; border-radius: 3px; font-size: 12px; cursor: pointer; font-family: inherit; }
      .btn-validate:hover { background: #003a66; }
      .payg-btn-row { display: flex; align-items: center; gap: 12px; margin-top: 8px; flex-wrap: wrap; }
      .payg-result { margin-top: 12px; padding: 10px 12px; background: #1e3a2e; border-left: 3px solid #4ec9b0; border-radius: 3px; font-size: 12px; color: #d4d4d4; }
      .payg-result-icon { color: #4ec9b0; font-weight: 700; margin-right: 6px; }
      .payg-detail { color: #858585; margin-top: 4px; font-family: 'SF Mono', Consolas, monospace; font-size: 11px; }
      .info-note { font-size: 11px; color: #858585; font-style: italic; margin: 0 0 8px; }
    `,
  ];

  /** Per-extension `finance` API (db accessor bound to this extension). */
  @property({ attribute: false })
  finance: FinanceApi | null = null;

  /** Render order for the 8 sections (Decision 15 + 18). */
  @property({ type: Array })
  sectionOrder: string[] = [...CANONICAL_SECTION_ORDER];

  /** Account options for the Period dropdown (parent pre-populates or we fetch). */
  @property({ type: Array })
  accounts: AccountOption[] = [];

  /** `MM-DD` financial-year start (from `salary-history.financialYearStart`). */
  @property({ type: String })
  financialYearStart = '07-01';

  /** PAYG tolerance in dollars (from `salary-history.paygToleranceDollars`). */
  @property({ type: Number })
  paygToleranceDollars = 5;

  /** ATO tax year for PAYG validation (from `salary-history.paygTaxYear`). */
  @property({ type: String })
  paygTaxYear = '2026-2027';

  /** Currency default (from `salary-history.defaultCurrency`). */
  @property({ type: String })
  defaultCurrency = 'AUD';

  /** When set, the form is in EDIT mode and prefilled from this payslip. */
  @property({ attribute: false })
  editPaySlip: PaySlip | null = null;

  @state()
  _values: FormValues = { ...EMPTY_VALUES };

  @state()
  _rate: RateRow | null = null;

  @state()
  _breakdown: PaySlipBreakdown | null = null;

  @state()
  _reconcile: ReconciliationResult | null = null;

  @state()
  _payg: PaygValidationResult | null = null;

  @state()
  _errors: readonly string[] = [];

  @state()
  _fyWarning: string | null = null;

  @state()
  _showHours = false;

  @state()
  _referenceLoaded = false;

  /**
   * Load the current rate row (for breakdown derivation) and the account
   * list for the Period dropdown. Called once on connect when `finance`
   * is available. Tests may skip this and set `_rate` / `accounts`
   * directly for determinism.
   */
  async loadReferenceData(): Promise<void> {
    if (!this.finance || this._referenceLoaded) return;
    const [rateRows, accountRows] = await Promise.all([
      this.finance.db.table('salary_history_rate_history').find({}) as Promise<unknown>,
      this.finance.db.table('accounts').find({ is_active: true }) as Promise<unknown>,
    ]);
    const rates = (rateRows as RateRow[]).filter((r) => r.effective_to === null);
    this._rate = rates.length > 0 ? rates[0] : null;
    if (this.accounts.length === 0) {
      this.accounts = (accountRows as { id: number; name: string; institution: string | null }[]).map(
        (a) => ({ id: a.id, name: a.name, institution: a.institution }),
      );
    }
    this._referenceLoaded = true;
    await this.recompute();
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (this.editPaySlip) this._prefillFromEdit();
    void this.loadReferenceData();
  }

  private _prefillFromEdit(): void {
    const p = this.editPaySlip;
    if (!p) return;
    this._values = {
      pay_date: p.pay_date,
      finance_year: p.finance_year,
      account_id: p.account_id,
      gross: String(p.gross),
      net: String(p.net),
      notes: p.notes ?? '',
      regular_hours: String(p.regular_hours),
      shift_hours: String(p.shift_hours),
      overtime_1_5_hours: String(p.overtime_1_5_hours),
      overtime_2_0_hours: String(p.overtime_2_0_hours),
      holiday_hours: '',
      public_holiday_hours: String(p.public_holiday_hours),
      personal_leave_hours: '',
    };
  }

  /** Recompute the derived breakdown + reconciliation from current inputs. */
  async recompute(): Promise<void> {
    const gross = num(this._values.gross);
    const net = num(this._values.net);
    const payDate = this._values.pay_date;

    if (payDate && gross > 0) {
      const hours = {
        regular_hours: num(this._values.regular_hours),
        shift_hours: num(this._values.shift_hours),
        overtime_1_5_hours: num(this._values.overtime_1_5_hours),
        overtime_2_0_hours: num(this._values.overtime_2_0_hours),
        holiday_hours: num(this._values.holiday_hours),
        public_holiday_hours: num(this._values.public_holiday_hours),
        personal_leave_hours: num(this._values.personal_leave_hours),
      };
      const rateRow = this._rate;
      if (rateRow) {
        this._breakdown = calculatePaySlipBreakdown(
          payDate,
          gross,
          net,
          hours,
          rateRow,
          {},
        );
        this._reconcile = reconcilePaySlip(this._breakdown, gross, this.paygToleranceDollars);
      } else {
        this._breakdown = null;
        this._reconcile = null;
      }
    } else {
      this._breakdown = null;
      this._reconcile = null;
    }

    // finance_year auto-fill + validate (Review Finding 9).
    if (payDate) {
      const expected = computeFinanceYear(payDate, this.financialYearStart);
      if (expected) {
        if (!this._values.finance_year) {
          this._values = { ...this._values, finance_year: expected };
        }
        const fyCheck = validateFinanceYear(
          payDate,
          this._values.finance_year,
          this.financialYearStart,
        );
        this._fyWarning = fyCheck.ok ? null : fyCheck.errors[0] ?? null;
      }
    } else {
      this._fyWarning = null;
    }
    this.requestUpdate();
  }

  private _onInput(field: keyof FormValues, e: Event): void {
    const target = e.target as HTMLInputElement;
    this._values = { ...this._values, [field]: target.value };
    void this.recompute();
  }

  private _onAccountChange(e: Event): void {
    const target = e.target as HTMLSelectElement;
    const id = Number(target.value);
    this._values = { ...this._values, account_id: Number.isFinite(id) ? id : null };
  }

  private _toggleHours(): void {
    this._showHours = !this._showHours;
  }

  private _onValidatePayg(): void {
    const gross = num(this._values.gross);
    const net = num(this._values.net);
    this._payg = validatePayg(gross, net, this.paygTaxYear, this.paygToleranceDollars);
  }

  private _autoCorrectFy(): void {
    const expected = computeFinanceYear(this._values.pay_date, this.financialYearStart);
    if (expected) {
      this._values = { ...this._values, finance_year: expected };
      this._fyWarning = null;
    }
  }

  private _keepFyOverride(): void {
    this._fyWarning = null;
  }

  /** Build the `PaySlipInput` payload (derived breakdown + user inputs). */
  private _buildInput(): PaySlipInput {
    const v = this._values;
    const bd = this._breakdown ?? {
      base_hourly: 0,
      shift_allowance: 0,
      overtime_1_5x: 0,
      overtime_2_0x: 0,
      holiday_pay: 0,
      holiday_leave_loading: 0,
      public_holiday: 0,
      personal_leave: 0,
      payg_withholding: Math.max(0, num(v.gross) - num(v.net)),
      superannuation_guarantee: 0,
    };
    const prevBalance =
      this.editPaySlip?.holiday_leave_accrual_hours ??
      this._rate?.starting_holiday_leave_balance ?? 0;
    const accrualRate = this._rate?.accrual_rate_per_week ?? 2.92;
    const holidayHours = num(v.holiday_hours);
    const accrual = calculateHolidayLeaveAccrual(prevBalance, holidayHours, accrualRate);

    return {
      account_id: v.account_id ?? 0,
      pay_period_start: v.pay_date,
      pay_period_end: v.pay_date,
      pay_date: v.pay_date,
      finance_year: v.finance_year,
      gross: num(v.gross),
      net: num(v.net),
      currency: this.defaultCurrency,
      shift_allowance: bd.shift_allowance,
      base_hourly: bd.base_hourly,
      overtime_1_5x: bd.overtime_1_5x,
      overtime_2_0x: bd.overtime_2_0x,
      holiday_leave_loading: bd.holiday_leave_loading,
      holiday_pay: bd.holiday_pay,
      public_holiday: bd.public_holiday,
      payg_withholding: bd.payg_withholding,
      superannuation_guarantee: bd.superannuation_guarantee,
      personal_leave: bd.personal_leave,
      regular_hours: num(v.regular_hours),
      shift_hours: num(v.shift_hours),
      overtime_1_5_hours: num(v.overtime_1_5_hours),
      overtime_2_0_hours: num(v.overtime_2_0_hours),
      public_holiday_hours: num(v.public_holiday_hours),
      holiday_leave_accrual_hours: accrual,
      notes: v.notes.trim() === '' ? null : v.notes,
    };
  }

  private _onCancel(): void {
    this.dispatchEvent(
      new CustomEvent('payslip-cancel', { bubbles: true, composed: true }),
    );
  }

  private _onSubmit(e: Event): void {
    e.preventDefault();
    const input = this._buildInput();
    const check = validatePayslipInput(input);
    if (!check.ok) {
      this._errors = check.errors;
      return;
    }
    this._errors = [];
    if (this.editPaySlip?.id !== undefined) {
      this.dispatchEvent(
        new CustomEvent('payslip-edit', {
          detail: { id: this.editPaySlip.id, input },
          bubbles: true,
          composed: true,
        }),
      );
    } else {
      this.dispatchEvent(
        new CustomEvent('payslip-create', {
          detail: { input },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private _renderInput(
    section: string,
    field: keyof FormValues,
    label: string,
    type: string,
    sub?: string,
    full?: boolean,
  ): unknown {
    const labelHtml = sub
      ? html`${label} <span class="label-sub">${sub}</span>`
      : html`${label}`;
    if (type === 'select') {
      return html`
        <div class="field ${full ? 'field-full' : ''}" data-testid="field-${field}">
          <label>${labelHtml}</label>
          <select
            data-testid="input-${field}"
            @change="${(e: Event) => this._onAccountChange(e)}"
          >
            <option value="">— select account —</option>
            ${this.accounts.map(
              (a) => html`<option value="${a.id}" ?selected="${a.id === this._values.account_id}">${a.name}</option>`,
            )}
          </select>
        </div>
      `;
    }
    return html`
      <div class="field ${full ? 'field-full' : ''}" data-testid="field-${field}">
        <label>${labelHtml}</label>
        <input
          data-testid="input-${field}"
          type="${type}"
          .value="${this._values[field]}"
          @input="${(e: Event) => this._onInput(field, e)}"
        />
      </div>
    `;
  }

  private _renderEarningsPreview(): unknown {
    const bd = this._breakdown;
    if (!bd)
      return html`<p class="info-note">Enter pay date, gross and net to preview the breakdown.</p>`;
    const rows: [string, number][] = [
      ['base_hourly', bd.base_hourly],
      ['shift_allowance', bd.shift_allowance],
      ['overtime_1_5x', bd.overtime_1_5x],
      ['overtime_2_0x', bd.overtime_2_0x],
      ['holiday_pay', bd.holiday_pay],
      ['holiday_leave_loading', bd.holiday_leave_loading],
      ['public_holiday', bd.public_holiday],
      ['personal_leave', bd.personal_leave],
    ];
    return html`
      <p class="info-note">Derived from rate row effective at pay_date × hours entered below. Toggle "This week was different" to override the hours used in the calculation.</p>
      ${rows.map(
        ([label, amt]) => html`<div class="read-only-row"><span class="label">${label}</span><span class="value">$${amt.toFixed(2)}</span></div>`,
      )}
      ${this._reconcile && !this._reconcile.withinTolerance
        ? html`<div class="amber" data-testid="reconcile-warning">${this._reconcile.warning}</div>`
        : nothing}
    `;
  }

  private _renderPayg(): unknown {
    const payg = this._payg;
    const derived = this._breakdown ? this._breakdown.payg_withholding : null;
    return html`
      <div class="read-only-row">
        <span class="label">payg_withholding <span style="color:#858585;font-style:normal;">(gross − net)</span></span>
        <span class="value">${derived !== null ? `$${derived.toFixed(2)}` : '—'}</span>
      </div>
      <div class="payg-btn-row">
        <button type="button" class="btn-validate" data-testid="validate-payg" @click="${() => this._onValidatePayg()}">✓ Validate PAYG</button>
        <span style="font-size:12px;color:#858585;">Compares derived PAYG to ATO weekly tax estimate</span>
      </div>
      ${payg
        ? payg.bracketError
          ? html`<div class="amber" data-testid="payg-result">Bracket data unavailable for ${payg.taxYear}</div>`
          : payg.withinTolerance
            ? html`<div class="payg-result" data-testid="payg-result"><span class="payg-result-icon">✓</span>PAYG within tolerance<div class="payg-detail">Δ ${payg.difference.toFixed(2)} (tolerance: $${payg.tolerance.toFixed(2)})</div></div>`
            : html`<div class="red" data-testid="payg-result">PAYG differs from ATO estimate by ${payg.difference.toFixed(2)}</div>`
        : nothing}
    `;
  }

  private _renderSuper(): unknown {
    const sg = this._breakdown?.superannuation_guarantee ?? 0;
    return html`
      <div class="read-only-row">
        <span class="label">superannuation_guarantee <span style="color:#858585;font-style:normal;">(gross × sg_rate, default 12%)</span></span>
        <span class="value">$${sg.toFixed(2)}</span>
      </div>
    `;
  }

  private _renderHours(): unknown {
    if (!this._showHours) {
      return html`<div class="toggle-row"><span class="label">This week was different (hours)</span><span class="toggle" data-testid="toggle-hours" @click="${() => this._toggleHours()}">▸</span></div>`;
    }
    return html`
      <div class="toggle-row"><span class="label">This week was different (hours)</span><span class="toggle" data-testid="toggle-hours" @click="${() => this._toggleHours()}">▾</span></div>
      <div class="hours-block" data-testid="hours-fields">
        <div class="hours-block-title">Hours breakdown — drives earnings above via rate row</div>
        <div class="grid-3">
          ${this._renderInput('leave', 'regular_hours', 'regular_hours', 'number')}
          ${this._renderInput('leave', 'shift_hours', 'shift_hours', 'number')}
          ${this._renderInput('leave', 'overtime_1_5_hours', 'overtime_1_5_hours', 'number')}
          ${this._renderInput('leave', 'overtime_2_0_hours', 'overtime_2_0_hours', 'number')}
          ${this._renderInput('leave', 'holiday_hours', 'holiday_hours', 'number')}
          ${this._renderInput('leave', 'public_holiday_hours', 'public_holiday_hours', 'number')}
          ${this._renderInput('leave', 'personal_leave_hours', 'personal_leave_hours', 'number')}
        </div>
      </div>
    `;
  }

  private _renderAccrual(): unknown {
    const newBalance = this._buildInput().holiday_leave_accrual_hours;
    const prev = this.editPaySlip?.holiday_leave_accrual_hours ?? this._rate?.starting_holiday_leave_balance ?? 0;
    const holidayHours = num(this._values.holiday_hours);
    const rate = this._rate?.accrual_rate_per_week ?? 2.92;
    return html`
      <div class="read-only-row"><span class="label">Previous balance</span><span class="value">${prev} h</span></div>
      <div class="read-only-row"><span class="label">− Holiday leave taken</span><span class="value">${holidayHours.toFixed(2)} h</span></div>
      <div class="read-only-row"><span class="label">+ Weekly accrual</span><span class="value">${rate} h</span></div>
      <div class="read-only-row" style="border-top:1px solid #3e3e3e;padding-top:6px;margin-top:4px;"><span class="label"><strong>New balance</strong></span><span class="value"><strong data-testid="accrual-new">${newBalance.toFixed(2)} h</strong></span></div>
    `;
  }

  private _section(
    id: string,
    title: string,
    badge: string | null,
    body: unknown,
    extraClass = '',
  ): unknown {
    const cls =
      id === 'earnings' || id === 'deductions' || id === 'super'
        ? `section readonly ${extraClass}`.trim()
        : `section ${extraClass}`.trim();
    return html`
      <div class="${cls}" data-testid="section-${id}">
        <div class="section-header">
          <h3>${title}</h3>
          ${badge ? html`<span class="section-badge">${badge}</span>` : nothing}
        </div>
        <div class="section-body">${body}</div>
      </div>
    `;
  }

  private _renderSection(id: string): unknown {
    switch (id) {
      case 'period':
        return this._section(
          'period',
          'Period',
          'always visible',
          html`
            <div class="grid-2">
              ${this._renderInput('period', 'pay_date', 'Pay date', 'date')}
              ${this._renderInput('period', 'finance_year', 'Financial year', 'text')}
              ${this._renderInput('period', 'account_id', 'Account', 'select', undefined, true)}
            </div>
            ${this._fyWarning
              ? html`<div class="amber" data-testid="fy-warning">
                  ${this._fyWarning}
                  <button type="button" data-testid="fy-autocorrect" @click="${() => this._autoCorrectFy()}">Auto-correct</button>
                  <button type="button" data-testid="fy-keep" @click="${() => this._keepFyOverride()}">Keep override</button>
                </div>`
              : nothing}
          `,
        );
      case 'totals':
        return this._section(
          'totals',
          'Totals',
          'always visible · user input',
          html`
            <div class="grid-2">
              ${this._renderInput('totals', 'gross', 'Gross', 'number', '($)')}
              ${this._renderInput('totals', 'net', 'Net', 'number', '($)')}
            </div>
            <p class="info-note" style="margin-top:8px;">Pay date, gross, and net are the only required inputs. Everything else is derived from the rate row effective at pay_date × hours, plus PAYG = gross − net and SG = gross × sg_rate.</p>
          `,
        );
      case 'earnings':
        return this._section('earnings', 'Earnings (derived)', 'read-only', this._renderEarningsPreview());
      case 'deductions':
        return this._section('deductions', 'Deductions', 'derived', this._renderPayg());
      case 'super':
        return this._section('super', 'Super', 'derived', this._renderSuper());
      case 'leave':
        return this._section('leave', 'Leave', 'user input', this._renderHours());
      case 'leave-accrual':
        return this._section('leave-accrual', 'Leave Accrual', 'read-only · auto-derived', this._renderAccrual(), 'accrual');
      case 'notes':
        return this._section(
          'notes',
          'Notes',
          null,
          html`
            <div class="field field-full" data-testid="field-notes">
              <label>Notes</label>
              <textarea
                data-testid="input-notes"
                .value="${this._values.notes}"
                @input="${(e: Event) => this._onInput('notes', e)}"
              ></textarea>
            </div>
          `,
        );
      default:
        return nothing;
    }
  }

  private _subtitle(): string {
    const account = this.accounts.find((a) => a.id === this._values.account_id) ?? this.accounts[0];
    const fy = this._values.finance_year || '—';
    const name = account?.name ?? '—';
    return `FY ${fy} · Account: ${name}`;
  }

  private _onReorder(): void {
    this.dispatchEvent(
      new CustomEvent('reorder-sections', { bubbles: true, composed: true }),
    );
  }

  render(): unknown {
    return html`
      <div class="topbar">
        <span class="crumb-link" data-testid="back-link" @click="${() => this._onCancel()}">← Salary History</span>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">${this.editPaySlip ? 'Edit Payslip' : 'New Payslip'}</span>
        <div class="spacer"></div>
        <button class="reorder-btn" data-testid="reorder-sections" @click="${() => this._onReorder()}">⇅ Reorder Sections</button>
      </div>
      <div class="container">
        <h1 data-testid="form-title">${this.editPaySlip ? 'Edit Payslip' : 'New Payslip'}</h1>
        <p class="subtitle" data-testid="form-subtitle">${this._subtitle()}</p>
        <form data-testid="payslip-form" @submit="${(e: Event) => this._onSubmit(e)}">
          ${this.sectionOrder.map((id) => this._renderSection(id))}
          ${this._errors.length > 0
            ? html`<div class="errors" data-testid="form-errors">${this._errors.map((e) => html`<div>${e}</div>`)}</div>`
            : nothing}
          <div class="footer">
            <button type="button" class="btn btn-secondary" data-testid="cancel" @click="${() => this._onCancel()}">Cancel</button>
            <button type="submit" class="btn btn-primary" data-testid="submit">
              ${this.editPaySlip ? 'Save changes' : 'Create payslip'}
            </button>
          </div>
        </form>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'payslip-form': PayslipForm;
  }
}
