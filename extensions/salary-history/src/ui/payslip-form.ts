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
import { sharedStyles } from '../styles/shared-styles.js';
import type { PaySlip, PaySlipInput } from '../dao/pay-slips.js';
import { getRateForDate, type RateRow } from '../dao/pay-rate-history.js';
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
  previous_balance: string;
  superannuation_override: string;
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
  overtime_1_5_hours: '0',
  overtime_2_0_hours: '0',
  holiday_hours: '0',
  public_holiday_hours: '0',
  personal_leave_hours: '0',
  previous_balance: '0',
  superannuation_override: '',
};

function num(v: string | undefined | null): number {
  if (v === undefined || v === null || v.trim() === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Format a monetary amount to a fixed 2-decimal string (e.g. 1616.9 → "1616.90"). */
function money2(n: number): string {
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

@customElement('payslip-form')
export class PayslipForm extends LitElement {
  static styles = [
    sharedStyles,
    css`

      * {
        box-sizing: border-box;
      }
      .container {
        max-width: 960px;
        margin: 0 auto;
        padding: 24px 20px 40px;
      }
      .subtitle {
        color: #858585;
        font-size: var(--ff-font-sm);
        margin: 0 0 24px;
      }
      .section.readonly {
        border-color: #5a4a1a;
      }
      .section.accrual {
        border-color: #c2913a;
      }
      .reorder-btn {
        background: transparent;
        color: #858585;
        border: 1px solid #3e3e3e;
        padding: 4px 10px;
        border-radius: 3px;
        font-size: var(--ff-font-base, 14px);
        cursor: pointer;
      }
      .reorder-btn:hover {
        border-color: #007acc;
        color: #d4d4d4;
      }
      input[readonly],
      input:disabled {
        background: #2a2a2a;
        color: #858585;
        font-style: italic;
      }
      .read-only-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        font-size: var(--ff-font-md);
      }
      .read-only-row .label {
        color: #858585;
        font-size: var(--ff-font-base);
      }
      .read-only-row .value {
        color: #d4d4d4;
      }
      .toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: var(--ff-font-base);
        padding: 8px 0;
      }
      .toggle-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        color: var(--ff-accent, #6da3d6);
        background: var(--ff-bg-base, #1e1e1e);
        border: 1px solid var(--ff-border, #3e3e3e);
        border-radius: 4px;
        padding: 6px 12px;
        line-height: 1;
      }
      .toggle-btn:hover {
        background: var(--ff-bg-subpanel, #2a2a2a);
        border-color: var(--ff-accent, #6da3d6);
      }
      .toggle-icon {
        font-size: var(--ff-font-lg);
        line-height: 1;
        transform: translateY(1px);
      }
      .toggle-text {
        font-weight: 500;
      }
      .hours-block {
        background: #1e1e1e;
        border: 1px solid #3e3e3e;
        border-radius: 4px;
        padding: 12px;
        margin-top: 12px;
      }
      .hours-block-title {
        font-size: var(--ff-font-sm);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        color: #858585;
        margin-bottom: 8px;
      }
      .amber {
        background: #4a3c00;
        border: 1px solid #cca700;
        color: #e8d28a;
        border-radius: 4px;
        padding: 8px 10px;
        margin: 8px 0;
        font-size: var(--ff-font-base);
      }
      .amber button {
        margin-left: 6px;
      }
      .green {
        background: #0d2e26;
        border: 1px solid #4ec9b0;
        color: #9fe6d6;
        border-radius: 4px;
        padding: 8px 10px;
        margin: 8px 0;
        font-size: var(--ff-font-base);
      }
      .red {
        background: #3a1414;
        border: 1px solid #f48771;
        color: #f3b3a6;
        border-radius: 4px;
        padding: 8px 10px;
        margin: 8px 0;
        font-size: var(--ff-font-base);
      }
      .errors {
        color: #f48771;
        font-size: var(--ff-font-base);
        margin: 8px 0;
      }
      .formula {
        color: #8a8a8a;
        font-size: var(--ff-font-sm);
        margin-top: 8px;
      }
      .btn-validate {
        background: var(--ff-bg-base, #1e1e1e);
        color: var(--ff-accent, #6da3d6);
        border: 1px solid var(--ff-border, #3e3e3e);
        padding: 6px 12px;
        border-radius: 3px;
        font-size: var(--ff-font-base);
        cursor: pointer;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .btn-validate:hover {
        background: var(--ff-bg-subpanel, #2a2a2a);
        border-color: var(--ff-accent, #6da3d6);
      }
      .payg-btn-row {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        padding: 8px 0;
        font-size: var(--ff-font-base);
      }
      .payg-result {
        margin-top: 12px;
        padding: 10px 12px;
        background: #1e3a2e;
        border-left: 3px solid #4ec9b0;
        border-radius: 3px;
        font-size: var(--ff-font-base);
        color: #d4d4d4;
      }
      .payg-result-icon {
        color: #4ec9b0;
        font-weight: 700;
        margin-right: 6px;
      }
      .payg-detail {
        color: #858585;
        margin-top: 4px;
        font-size: var(--ff-font-sm);
      }
      .info-note {
        font-size: var(--ff-font-sm);
        color: #858585;
        font-style: italic;
        margin: 0 0 8px;
      }
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

  /** `MM-DD` financial-year start (from `core.financialYear.start`). */
  @property({ type: String })
  financialYearStart = '07-01';

  /** Current financial year label (from `core.financialYear.current`). */
  @property({ type: String })
  financialYear = '';

  /** PAYG tolerance in dollars (from `salary-history.paygToleranceDollars`). */
  @property({ type: Number })
  paygToleranceDollars = 5;

  /** ATO tax year for PAYG validation (from `core.financialYear.current`). */
  @property({ type: String })
  paygTaxYear = '';

  /** Currency default (from `core.defaultCurrency`). */
  @property({ type: String })
  defaultCurrency = 'AUD';

  /** When set, the form is in EDIT mode and prefilled from this payslip. */
  @property({ attribute: false })
  editPaySlip: PaySlip | null = null;

  willUpdate(changed: PropertyValues): void {
    // Orchestrator assigns editPaySlip after connect; rebuild values on late arrival.
    if (changed.has('editPaySlip') && this.editPaySlip) {
      this._prefillFromEdit();
      void this.recompute();
    }
  }

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

  /** Stored `holiday_leave_accrual_hours` of the chronologically previous payslip (edit mode only, read-only display). */
  _predecessorBalance: number | null = null;

  /**
   * Read Core-owned financial year settings so this form does not depend on
   * extension-scoped mountData for FY context.
   */
  private async _loadCoreFinancialYear(): Promise<void> {
    if (!this.finance?.settings) return;
    const fyStart = await this.finance.settings.get('core.financialYear.start');
    if (typeof fyStart === 'string') {
      this.financialYearStart = fyStart;
    }
    const fyCurrent = await this.finance.settings.get('core.financialYear.current');
    if (typeof fyCurrent === 'string') {
      this.financialYear = fyCurrent;
      this.paygTaxYear = fyCurrent;
    }
  }

  /**
   * Load the current rate row (for breakdown derivation) and the account
   * list for the Period dropdown. Called once on connect when `finance`
   * is available. Tests may skip this and set `_rate` / `accounts`
   * directly for determinism.
   */
  async loadReferenceData(): Promise<void> {
    if (!this.finance || this._referenceLoaded) return;
    await this._loadCoreFinancialYear();
    const payDate = this._values.pay_date || todayISO();
    const [rateRow, accountRows] = await Promise.all([
      getRateForDate(this.finance, payDate) as Promise<unknown>,
      this.finance.db.table('accounts').find({ is_active: true }) as Promise<unknown>,
    ]);
    this._rate = (rateRow as RateRow) ?? null;
    if (this.accounts.length === 0) {
      this.accounts = (accountRows as { id: number; name: string; institution: string | null }[]).map(
        (a) => ({ id: a.id, name: a.name, institution: a.institution }),
      );
    }

    // Seed sensible defaults for a fresh (non-edit) form. Edit mode has already
    // populated `_values` via `_prefillFromEdit`, so these only fill empties.
    // These MUST run before the predecessor query below so the query uses the
    // real account_id / pay_date rather than the empty initial values.
    if (!this.editPaySlip) {
      const seed: Partial<FormValues> = {};
      if (!this._values.pay_date) seed.pay_date = todayISO();
      // Primary salary account = first active account.
      if (this._values.account_id === null && this.accounts.length > 0) {
        seed.account_id = this.accounts[0].id;
      }
      // Default regular hours to a standard full-time week (rate's
      // standard_hours_per_week when available, else 38). Rule 1: shift
      // hours mirror regular. Leave hours stay 0 (rule 3 drivers).
      if (!this._values.regular_hours) {
        const regular = String(this._rate?.standard_hours_per_week ?? 38);
        seed.regular_hours = regular;
        if (!this._values.shift_hours) seed.shift_hours = regular;
      }
      if (Object.keys(seed).length > 0) {
        this._values = { ...this._values, ...seed };
      }
    }

    // Best-guess "previous balance": the chronologically previous payslip's
    // stored balance (same account). Used as the editable seed in CREATE mode
    // and as the read-only display in EDIT mode. `_refreshPredecessor` also
    // re-seeds when the user changes the account in create mode.
    await this._refreshPredecessor();

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
      gross: money2(p.gross),
      net: money2(p.net),
      notes: p.notes ?? '',
      regular_hours: String(p.regular_hours),
      shift_hours: String(p.shift_hours),
      overtime_1_5_hours: String(p.overtime_1_5_hours),
      overtime_2_0_hours: String(p.overtime_2_0_hours),
      holiday_hours: String(p.holiday_hours),
      public_holiday_hours: String(p.public_holiday_hours),
      personal_leave_hours: String(p.personal_leave_hours),
      // In edit mode the editable "Previous balance" input carries the stored
      // New balance of THIS row. It is the source of truth on save (no calc
      // is applied in edit mode), so it must be reversible: the user can
      // correct the balance directly here.
      previous_balance: money2(p.holiday_leave_accrual_hours),
      superannuation_override: money2(p.superannuation_guarantee),
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
    const next: Partial<FormValues> = { [field]: target.value as never };
    const v = this._values;

    // Rule 1: shift hours mirror regular hours.
    if (field === 'regular_hours') {
      next.shift_hours = target.value;
    }

    // Rule 3: regular = standard week − (holiday + public holiday + personal leave).
    // When any leave field changes, re-derive regular (and shift follows it).
    // Build the leave sum from the NEW values — use the just-entered value for
    // the field being edited, and the (already-updated) current value for the
    // others. Adding target.value on top of v[field] double-counts the edited
    // field (it already holds its prior value in the stale snapshot).
    const LEAVE_FIELDS: ReadonlyArray<keyof FormValues> = [
      'holiday_hours',
      'public_holiday_hours',
      'personal_leave_hours',
    ];
    if (LEAVE_FIELDS.includes(field)) {
      const base = this._rate?.standard_hours_per_week ?? 38;
      const leaveSum = LEAVE_FIELDS.reduce(
        (sum, f) => sum + num(f === field ? target.value : (this._values[f] as string)),
        0,
      );
      const regular = Math.max(0, base - leaveSum);
      next.regular_hours = String(regular);
      next.shift_hours = String(regular);
    }

    this._values = { ...v, ...next };

    // When pay_date changes, re-fetch the historically accurate rate row
    // so the breakdown uses the correct rates for that pay period.
    if (field === 'pay_date') {
      void this._refreshRateForDate().then(() => this.recompute());
    } else {
      void this.recompute();
    }
  }

  private _onAccountChange(e: Event): void {
    const target = e.target as HTMLSelectElement;
    const id = Number(target.value);
    this._values = { ...this._values, account_id: Number.isFinite(id) ? id : null };
    // Re-seed the best-guess previous balance for the newly selected account
    // (CREATE mode only — edit mode shows the row's own stored balance).
    if (!this.editPaySlip) void this._refreshPredecessor();
  }

  /** Query the chronologically previous payslip for the current account/date. */
  private async _refreshPredecessor(): Promise<void> {
    if (!this.finance) return;
    const predecessorRows = (await this.finance.db
      .table('salary_history_pay_slips')
      .find({
        account_id: this._values.account_id,
        pay_date: { $lt: this._values.pay_date },
      })) as Array<{ pay_date: string; holiday_leave_accrual_hours: number }>;
    const predecessor = predecessorRows
      .slice()
      .sort((a, b) => (a.pay_date < b.pay_date ? 1 : a.pay_date > b.pay_date ? -1 : 0))[0] as
      | { pay_date: string; holiday_leave_accrual_hours: number }
      | undefined;
    this._predecessorBalance = predecessor ? predecessor.holiday_leave_accrual_hours : null;
    if (!this.editPaySlip) {
      this._values = {
        ...this._values,
        previous_balance: String(this._predecessorBalance ?? 0),
      };
    }
    await this.recompute();
  }

  private _toggleHours(): void {
    this._showHours = !this._showHours;
  }

  /** Re-fetch the rate row effective at the current pay_date. Called when pay_date changes. */
  private async _refreshRateForDate(): Promise<void> {
    if (!this.finance) return;
    const payDate = this._values.pay_date;
    if (!payDate) return;
    const row = await getRateForDate(this.finance, payDate);
    this._rate = (row as RateRow) ?? null;
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
    const prevBalance = num(v.previous_balance);
    const accrualRate = this._rate?.accrual_rate_per_week ?? 2.92;
    const holidayHours = num(v.holiday_hours);
    // In EDIT mode the stored New balance is the source of truth: no
    // calculation is re-applied (the user may have corrected it). The editable
    // "Previous balance" input holds that stored value and is saved verbatim.
    const accrual = this.editPaySlip
      ? num(v.previous_balance)
      : calculateHolidayLeaveAccrual(prevBalance, holidayHours, accrualRate);

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
      superannuation_guarantee: this._values.superannuation_override && this._values.superannuation_override !== '' ? num(this._values.superannuation_override) : bd.superannuation_guarantee,
      personal_leave: bd.personal_leave,
      regular_hours: num(v.regular_hours),
      shift_hours: num(v.shift_hours),
      overtime_1_5_hours: num(v.overtime_1_5_hours),
      overtime_2_0_hours: num(v.overtime_2_0_hours),
      holiday_hours: num(v.holiday_hours),
      public_holiday_hours: num(v.public_holiday_hours),
      personal_leave_hours: num(v.personal_leave_hours),
      holiday_leave_accrual_hours: accrual,
      notes: v.notes.trim() === '' ? null : v.notes,
    };
  }

  private _onCancel(): void {
    this.dispatchEvent(
      new CustomEvent('payslip-cancel', { bubbles: true, composed: true }),
    );
  }

  private _onFormKeyDown(e: KeyboardEvent): void {
    // Prevent Enter in a text/number input from implicitly submitting the
    // form (which would save prematurely). Only the submit button or the
    // notes textarea may trigger submission via Enter.
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    const isSubmitButton = target instanceof HTMLButtonElement && target.type === 'submit';
    const isTextarea = target instanceof HTMLTextAreaElement;
    if (!isSubmitButton && !isTextarea) {
      e.preventDefault();
    }
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
    step?: string,
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
          step="${step ?? ''}"
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
      ['base hourly', bd.base_hourly],
      ['shift allowance', bd.shift_allowance],
      ['overtime 1.5x', bd.overtime_1_5x],
      ['overtime 2.0x', bd.overtime_2_0x],
      ['holiday pay', bd.holiday_pay],
      ['holiday leave loading', bd.holiday_leave_loading],
      ['public holiday', bd.public_holiday],
      ['personal leave', bd.personal_leave],
    ];
    return html`
      <p class="info-note">Derived from rate row effective at pay_date × hours
        entered below. Toggle "This week was different" to override the hours
        used in the calculation.</p>
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
        <button
          type="button"
          class="btn-validate"
          data-testid="validate-payg"
          @click="${() => this._onValidatePayg()}"
        ><span class="toggle-icon">✓</span> Validate PAYG</button>
        <span style="font-size:var(--ff-font-xs);color:#858585;">Compares derived PAYG to ATO weekly tax estimate</span>
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
    const bd = this._breakdown;
    const autoSg = bd?.superannuation_guarantee ?? 0;
    const override = this._values.superannuation_override;
    const display = override !== '' ? num(override) : autoSg;
    return html`
      <div class="edit-super-row super-divider" data-testid="field-superannuation_guarantee">
        <label class="edit-super-label" for="input-superannuation_guarantee">superannuation guarantee <span class="hint">(auto: (gross − overtime − holiday loading) × sg_rate)</span></label>
        <input
          class="edit-super-input"
          data-testid="input-superannuation_guarantee"
          type="number"
          step="0.01"
          .value="${override !== '' ? override : (bd ? money2(autoSg) : '0.00')}"
          @input="${(e: Event) => this._onInput('superannuation_override', e)}"
        />
      </div>
    `;
  }

  private _renderHours(): unknown {
    if (!this._showHours) {
      return html`
        <div class="toggle-row">
          <span class="label">This week was different (hours)</span>
          <button
            type="button"
            class="toggle-btn"
            data-testid="toggle-hours"
            aria-expanded="false"
            @click="${() => this._toggleHours()}"
          ><span class="toggle-icon">▸</span><span class="toggle-text">Show hours</span></button>
        </div>
      `;
    }
    return html`
      <div class="toggle-row">
        <span class="label">This week was different (hours)</span>
        <button
          type="button"
          class="toggle-btn"
          data-testid="toggle-hours"
          aria-expanded="true"
          @click="${() => this._toggleHours()}"
        ><span class="toggle-icon">▾</span><span class="toggle-text">Hide hours</span></button>
      </div>
      <div class="hours-block" data-testid="hours-fields">
        <div class="hours-block-title">Hours breakdown — drives earnings above via rate row</div>
        <div class="grid-3">
          ${this._renderInput('leave', 'regular_hours', 'regular hours', 'number', undefined, false, '0.01')}
          ${this._renderInput('leave', 'shift_hours', 'shift hours', 'number', undefined, false, '0.01')}
          ${this._renderInput('leave', 'overtime_1_5_hours', 'overtime 1.5 hours', 'number', undefined, false, '0.01')}
          ${this._renderInput('leave', 'overtime_2_0_hours', 'overtime 2.0 hours', 'number', undefined, false, '0.01')}
          ${this._renderInput('leave', 'holiday_hours', 'holiday hours', 'number', undefined, false, '0.01')}
          ${this._renderInput('leave', 'public_holiday_hours', 'public holiday hours', 'number', undefined, false, '0.01')}
          ${this._renderInput('leave', 'personal_leave_hours', 'personal leave hours', 'number', undefined, false, '0.01')}
        </div>
      </div>
    `;
  }

  private _renderAccrual(): unknown {
    const newBalance = this._buildInput().holiday_leave_accrual_hours;
    const holidayHours = num(this._values.holiday_hours);
    const rate = this._rate?.accrual_rate_per_week ?? 2.92;
    if (this.editPaySlip) {
      // EDIT mode: Previous balance is read-only; New balance (at its original
      // bottom position) is an editable input pre-filled from the stored
      // holiday_leave_accrual_hours of this row and saved verbatim (no calc).
      return html`
        <div class="read-only-row"><span class="label">Previous balance</span><span class="value" data-testid="display-previous_balance">${(this._predecessorBalance ?? 0).toFixed(2)} h</span></div>
        <div class="read-only-row"><span class="label">− Holiday leave taken</span><span class="value">${holidayHours.toFixed(2)} h</span></div>
        <div class="read-only-row"><span class="label">+ Weekly accrual</span><span class="value">${rate} h</span></div>
        <div class="edit-balance-row balance-divider">
          <label class="edit-balance-label" for="input-new_balance">New balance <span class="hint">(editable)</span></label>
          <input
            id="input-new_balance"
            class="edit-balance-input"
            data-testid="input-new_balance"
            type="number"
            step="0.01"
            .value="${this._values.previous_balance ?? '0'}"
            @input="${(e: Event) => this._onInput('previous_balance', e)}"
          />
        </div>
      `;
    }
    return html`
      <div class="edit-balance-row">
        <label class="edit-balance-label" for="input-previous_balance">Previous balance <span class="hint">(editable — correct if wrong)</span></label>
        <input
          id="input-previous_balance"
          class="edit-balance-input"
          data-testid="input-previous_balance"
          type="number"
          step="0.01"
          .value="${this._values.previous_balance ?? '0'}"
          @input="${(e: Event) => this._onInput('previous_balance', e)}"
        />
      </div>
      <div class="read-only-row"><span class="label">− Holiday leave taken</span><span class="value">${holidayHours.toFixed(2)} h</span></div>
      <div class="read-only-row"><span class="label">+ Weekly accrual</span><span class="value">${rate} h</span></div>
      <div class="read-only-row balance-divider">
        <span class="label"><strong>New balance</strong></span>
        <span class="value">
          <strong data-testid="accrual-new">${newBalance.toFixed(2)} h</strong>
        </span>
      </div>
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
                  <button
                    type="button"
                    data-testid="fy-autocorrect"
                    @click="${() => this._autoCorrectFy()}"
                  >Auto-correct</button>
                  <button
                    type="button"
                    data-testid="fy-keep"
                    @click="${() => this._keepFyOverride()}"
                  >Keep override</button>
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
               <div class="inline-field" data-testid="field-gross">
                 <label>Gross <span class="label-sub">($)</span></label>
                 <input
                   data-testid="input-gross"
                   type="number"
                   step="0.01"
                   class="inline-field-input"
                   .value="${this._values.gross}"
                   @input="${(e: Event) => this._onInput('gross', e)}"
                 />
               </div>
               <div class="inline-field" data-testid="field-net">
                 <label>Net <span class="label-sub">($)</span></label>
                 <input
                   data-testid="input-net"
                   type="number"
                   step="0.01"
                   class="inline-field-input"
                   .value="${this._values.net}"
                   @input="${(e: Event) => this._onInput('net', e)}"
                 />
               </div>
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
      <div class="view-scroll">
      <div class="topbar">
        <span
          class="crumb-link"
          data-testid="back-link"
          @click="${() => this._onCancel()}"
        >← Pay History</span>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">${this.editPaySlip ? 'Edit Payslip' : 'New Payslip'}</span>
        <div class="spacer"></div>
        <button
          class="reorder-btn"
          data-testid="reorder-sections"
          @click="${() => this._onReorder()}"
        >⇅ Reorder Sections</button>
      </div>
      <div class="container">
        <h1 data-testid="form-title">${this.editPaySlip ? 'Edit Payslip' : 'New Payslip'}</h1>
        <p class="subtitle" data-testid="form-subtitle">${this._subtitle()}</p>
        <form
          data-testid="payslip-form"
          @submit="${(e: Event) => this._onSubmit(e)}"
          @keydown="${(e: KeyboardEvent) => this._onFormKeyDown(e)}"
        >
          ${this.sectionOrder.map((id) => this._renderSection(id))}
          ${this._errors.length > 0
            ? html`<div class="errors" data-testid="form-errors">${this._errors.map((e) => html`<div>${e}</div>`)}</div>`
            : nothing}
          <div class="footer">
            <button
              type="button"
              class="btn btn-secondary"
              data-testid="cancel"
              @click="${() => this._onCancel()}"
            >Cancel</button>
            <button
              type="submit"
              class="btn btn-primary"
              data-testid="submit"
            >${this.editPaySlip ? 'Save changes' : 'Add Payslip'}</button>
          </div>
        </form>
      </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'payslip-form': PayslipForm;
  }
}
