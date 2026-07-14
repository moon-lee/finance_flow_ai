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
import type { FinanceApi } from '../../../../src/extension-host/api/index.js';
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
  static styles = css`
    :host {
      display: block;
      color: #d4d4d4;
      font: 13px/1.5 system-ui, sans-serif;
    }
    h3 {
      margin: 0 0 8px;
      font-size: 13px;
      text-transform: uppercase;
      color: #a8a8a8;
    }
    .section {
      border: 1px solid #3c3c3c;
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 10px;
      background: #252526;
    }
    .section.readonly {
      border-color: #5a4a1a;
    }
    .section.accrual {
      border-color: #c2913a;
    }
    .row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 12px;
      color: #b9b9b9;
    }
    input, select, textarea {
      background: #1e1e1e;
      border: 1px solid #3c3c3c;
      color: #d4d4d4;
      border-radius: 4px;
      padding: 4px 6px;
      font: inherit;
    }
    .preview {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 16px;
      font-size: 12px;
    }
    .preview .amt {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .amber {
      background: #4a3c00;
      border: 1px solid #cca700;
      color: #e8d28a;
      border-radius: 4px;
      padding: 8px 10px;
      margin: 8px 0;
      font-size: 12px;
    }
    .green {
      background: #0d2e26;
      border: 1px solid #4ec9b0;
      color: #9fe6d6;
      border-radius: 4px;
      padding: 8px 10px;
      margin: 8px 0;
      font-size: 12px;
    }
    .red {
      background: #3a1414;
      border: 1px solid #f48771;
      color: #f3b3a6;
      border-radius: 4px;
      padding: 8px 10px;
      margin: 8px 0;
      font-size: 12px;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    button.primary {
      background: #007acc;
      color: #fff;
      border: 0;
      border-radius: 4px;
      padding: 6px 14px;
      cursor: pointer;
    }
    .errors {
      color: #f48771;
      font-size: 12px;
      margin: 8px 0;
    }
    .formula {
      color: #8a8a8a;
      font-size: 11px;
      margin-top: 4px;
    }
    .toggle {
      cursor: pointer;
      color: #6da3d6;
    }
  `;

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
  ): unknown {
    if (type === 'select') {
      return html`
        <label data-testid="field-${field}">
          ${label}
          <select
            data-testid="input-${field}"
            @change="${(e: Event) => this._onAccountChange(e)}"
          >
            <option value="">— select account —</option>
            ${this.accounts.map(
              (a) => html`<option value="${a.id}" ?selected="${a.id === this._values.account_id}">${a.name}</option>`,
            )}
          </select>
        </label>
      `;
    }
    return html`
      <label data-testid="field-${field}">
        ${label}
        <input
          data-testid="input-${field}"
          type="${type}"
          .value="${this._values[field]}"
          @input="${(e: Event) => this._onInput(field, e)}"
        />
      </label>
    `;
  }

  private _renderEarningsPreview(): unknown {
    const bd = this._breakdown;
    if (!bd) return html`<span class="formula">Enter pay date, gross and net to preview the breakdown.</span>`;
    const rows: [string, number][] = [
      ['Base hourly', bd.base_hourly],
      ['Shift allowance', bd.shift_allowance],
      ['Overtime 1.5x', bd.overtime_1_5x],
      ['Overtime 2.0x', bd.overtime_2_0x],
      ['Holiday pay', bd.holiday_pay],
      ['Holiday leave loading', bd.holiday_leave_loading],
      ['Public holiday', bd.public_holiday],
      ['Personal leave', bd.personal_leave],
    ];
    return html`
      <div class="preview">
        ${rows.map(
          ([label, amt]) => html`<span>${label}</span><span class="amt">${amt.toFixed(2)}</span>`,
        )}
      </div>
      ${this._reconcile && !this._reconcile.withinTolerance
        ? html`<div class="amber" data-testid="reconcile-warning">${this._reconcile.warning}</div>`
        : nothing}
    `;
  }

  private _renderPayg(): unknown {
    const payg = this._payg;
    return html`
      <label data-testid="field-payg">
        PAYG withholding (derived = gross − net)
        <input data-testid="input-payg_withholding" type="text" disabled .value="${this._breakdown ? this._breakdown.payg_withholding.toFixed(2) : ''}" />
      </label>
      <button type="button" data-testid="validate-payg" @click="${() => this._onValidatePayg()}">✓ Validate PAYG</button>
      ${payg
        ? payg.bracketError
          ? html`<div class="amber" data-testid="payg-result">Bracket data unavailable for ${payg.taxYear}</div>`
          : payg.withinTolerance
            ? html`<div class="green" data-testid="payg-result">PAYG within tolerance (Δ ${payg.difference.toFixed(2)})</div>`
            : html`<div class="red" data-testid="payg-result">PAYG differs from ATO estimate by ${payg.difference.toFixed(2)}</div>`
        : nothing}
    `;
  }

  private _renderSuper(): unknown {
    const sg = this._breakdown?.superannuation_guarantee ?? 0;
    return html`
      <label data-testid="field-super">
        Superannuation guarantee (derived = gross × rate)
        <input data-testid="input-super" type="text" disabled .value="${sg.toFixed(2)}" />
      </label>
    `;
  }

  private _renderHours(): unknown {
    if (!this._showHours) {
      return html`<span class="toggle" data-testid="toggle-hours" @click="${() => this._toggleHours()}">▸ This week was different</span>`;
    }
    return html`
      <span class="toggle" data-testid="toggle-hours" @click="${() => this._toggleHours()}">▾ This week was different</span>
      <div class="row" data-testid="hours-fields">
        ${this._renderInput('leave', 'regular_hours', 'Regular hours', 'number')}
        ${this._renderInput('leave', 'shift_hours', 'Shift hours', 'number')}
        ${this._renderInput('leave', 'overtime_1_5_hours', 'OT 1.5x hours', 'number')}
        ${this._renderInput('leave', 'overtime_2_0_hours', 'OT 2.0x hours', 'number')}
        ${this._renderInput('leave', 'holiday_hours', 'Holiday hours taken', 'number')}
        ${this._renderInput('leave', 'public_holiday_hours', 'Public holiday hours', 'number')}
        ${this._renderInput('leave', 'personal_leave_hours', 'Personal leave hours', 'number')}
      </div>
    `;
  }

  private _renderAccrual(): unknown {
    const newBalance = this._buildInput().holiday_leave_accrual_hours;
    const prev = this.editPaySlip?.holiday_leave_accrual_hours ?? this._rate?.starting_holiday_leave_balance ?? 0;
    const holidayHours = num(this._values.holiday_hours);
    const rate = this._rate?.accrual_rate_per_week ?? 2.92;
    return html`
      <label data-testid="field-accrual">
        Holiday leave accrual balance (auto-calculated)
        <input data-testid="input-accrual" type="text" disabled .value="${newBalance.toFixed(2)}" />
      </label>
      <div class="formula" data-testid="accrual-breakdown">
        <div>Previous balance: <span data-testid="accrual-prev">${prev}</span></div>
        <div>− Holiday hours taken: <span data-testid="accrual-taken">${holidayHours}</span></div>
        <div>+ Accrual rate/week: <span data-testid="accrual-rate">${rate}</span></div>
        <div>= New balance: <span data-testid="accrual-new">${newBalance.toFixed(2)}</span></div>
      </div>
    `;
  }

  private _renderSection(id: string): unknown {
    switch (id) {
      case 'period':
        return html`<div class="section" data-testid="section-period">
          <h3>Period</h3>
          ${this._renderInput('period', 'pay_date', 'Pay date', 'date')}
          ${this._renderInput('period', 'finance_year', 'Financial year', 'text')}
          ${this._renderInput('period', 'account_id', 'Account', 'select')}
          ${this._fyWarning
            ? html`<div class="amber" data-testid="fy-warning">
                ${this._fyWarning}
                <button type="button" data-testid="fy-autocorrect" @click="${() => this._autoCorrectFy()}">Auto-correct</button>
                <button type="button" data-testid="fy-keep" @click="${() => this._keepFyOverride()}">Keep override</button>
              </div>`
            : nothing}
        </div>`;
      case 'totals':
        return html`<div class="section" data-testid="section-totals">
          <h3>Totals</h3>
          ${this._renderInput('totals', 'gross', 'Gross ($)', 'number')}
          ${this._renderInput('totals', 'net', 'Net ($)', 'number')}
        </div>`;
      case 'earnings':
        return html`<div class="section readonly" data-testid="section-earnings">
          <h3>Earnings (derived)</h3>
          ${this._renderEarningsPreview()}
        </div>`;
      case 'deductions':
        return html`<div class="section readonly" data-testid="section-deductions">
          <h3>Deductions</h3>
          ${this._renderPayg()}
        </div>`;
      case 'super':
        return html`<div class="section readonly" data-testid="section-super">
          <h3>Super</h3>
          ${this._renderSuper()}
        </div>`;
      case 'leave':
        return html`<div class="section" data-testid="section-leave">
          <h3>Leave</h3>
          ${this._renderHours()}
        </div>`;
      case 'leave-accrual':
        return html`<div class="section accrual" data-testid="section-leave-accrual">
          <h3>Leave Accrual</h3>
          ${this._renderAccrual()}
        </div>`;
        case 'notes':
          return html`<div class="section" data-testid="section-notes">
            <h3>Notes</h3>
            <label data-testid="field-notes">
              Notes
              <textarea
                data-testid="input-notes"
                .value="${this._values.notes}"
                @input="${(e: Event) => this._onInput('notes', e)}"
              ></textarea>
            </label>
          </div>`;
      default:
        return nothing;
    }
  }

  render(): unknown {
    return html`
      <form data-testid="payslip-form" @submit="${(e: Event) => this._onSubmit(e)}">
        ${this.sectionOrder.map((id) => this._renderSection(id))}
        ${this._errors.length > 0
          ? html`<div class="errors" data-testid="form-errors">${this._errors.map((e) => html`<div>${e}</div>`)}</div>`
          : nothing}
        <div class="actions">
          <button type="submit" class="primary" data-testid="submit">
            ${this.editPaySlip ? 'Save changes' : 'Create payslip'}
          </button>
        </div>
      </form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'payslip-form': PayslipForm;
  }
}
