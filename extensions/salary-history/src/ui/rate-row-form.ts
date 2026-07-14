/**
 * Phase 4 Task 11.5 — Add/edit rate row form (Lit element).
 *
 * A confirmation panel is shown BEFORE the form (inline at the top):
 * "Adding this rate will close the current rate" plus a diff of the
 * current vs new values, with Confirm/Cancel. After confirm, the form
 * renders 10 rate-row fields (pre-filled from the current rate for an
 * edit), validates via `PayRateService.validateRateRow`, and on submit
 * dispatches a `rate-create` (new) / `rate-edit` (current) CustomEvent
 * with the `RateRowInput` payload. The mount harness routes the
 * event to `addNewRate` / `editCurrentRate`.
 */

import { LitElement, css, html, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { FinanceApi } from 'finance';
import type { RateRow, RateRowInput } from '../dao/pay-rate-history.js';
import { validateRateRow } from '../services/pay-rate-service.js';

type RateFieldKey =
  | 'base_hourly_rate'
  | 'standard_hours_per_week'
  | 'shift_allowance_multiplier'
  | 'shift_allowance_hours_per_week'
  | 'overtime_1_5_multiplier'
  | 'overtime_2_0_multiplier'
  | 'superannuation_rate'
  | 'holiday_leave_loading_rate'
  | 'accrual_rate_per_week'
  | 'starting_holiday_leave_balance';

const RATE_FIELDS: { key: RateFieldKey; label: string }[] = [
  { key: 'base_hourly_rate', label: 'Base $/hr' },
  { key: 'standard_hours_per_week', label: 'Standard hrs/wk' },
  { key: 'shift_allowance_multiplier', label: 'Shift allowance mult' },
  { key: 'shift_allowance_hours_per_week', label: 'Shift allowance hrs/wk' },
  { key: 'overtime_1_5_multiplier', label: 'Overtime 1.5x mult' },
  { key: 'overtime_2_0_multiplier', label: 'Overtime 2.0x mult' },
  { key: 'superannuation_rate', label: 'Superannuation rate' },
  { key: 'holiday_leave_loading_rate', label: 'Holiday leave loading' },
  { key: 'accrual_rate_per_week', label: 'Accrual rate/wk' },
  { key: 'starting_holiday_leave_balance', label: 'Starting leave balance' },
];

const DEFAULTS: Record<RateFieldKey, number> = {
  base_hourly_rate: 0,
  standard_hours_per_week: 38,
  shift_allowance_multiplier: 0.15,
  shift_allowance_hours_per_week: 38,
  overtime_1_5_multiplier: 1.5,
  overtime_2_0_multiplier: 2.0,
  superannuation_rate: 0.12,
  holiday_leave_loading_rate: 0.175,
  accrual_rate_per_week: 2.92,
  starting_holiday_leave_balance: 0,
};

interface RateFormValues {
  effective_from: string;
  effective_to: string;
  notes: string;
  fields: Record<RateFieldKey, string>;
}

function num(v: string): number {
  if (v.trim() === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

@customElement('rate-row-form')
export class RateRowForm extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: #d4d4d4;
      font: 13px/1.5 system-ui, sans-serif;
    }
    .confirm {
      border: 1px solid #cca700;
      background: #4a3c00;
      color: #e8d28a;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .confirm pre {
      white-space: pre-wrap;
      font-size: 12px;
      margin: 8px 0;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 12px;
      color: #b9b9b9;
      margin-bottom: 8px;
    }
    input {
      background: #1e1e1e;
      border: 1px solid #3c3c3c;
      color: #d4d4d4;
      border-radius: 4px;
      padding: 4px 6px;
      font: inherit;
    }
    input.changed {
      border-color: #c2913a;
    }
    .row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 16px;
    }
    .errors {
      color: #f48771;
      font-size: 12px;
      margin: 8px 0;
    }
    button.primary {
      background: #007acc;
      color: #fff;
      border: 0;
      border-radius: 4px;
      padding: 6px 14px;
      cursor: pointer;
    }
    button.ghost {
      background: transparent;
      border: 1px solid #3c3c3c;
      color: #94a3b8;
      border-radius: 4px;
      padding: 6px 14px;
      cursor: pointer;
    }
  `;

  @property({ attribute: false })
  finance: FinanceApi | null = null;

  /** The current rate row (for pre-fill + edit-mode), or null for a fresh add. */
  @property({ attribute: false })
  rate: RateRow | null = null;

  @state()
  private _confirmed = false;

  @state()
  private _values: RateFormValues = this._buildDefaults();

  @state()
  private _initial: RateFormValues = this._buildDefaults();

  @state()
  private _errors: readonly string[] = [];

  private _buildDefaults(): RateFormValues {
    const r = this.rate;
    const fields = {} as Record<RateFieldKey, string>;
    for (const f of RATE_FIELDS) {
      fields[f.key] = r ? String(r[f.key]) : String(DEFAULTS[f.key]);
    }
    return {
      effective_from: r ? r.effective_from : '',
      effective_to: r && r.effective_to ? r.effective_to : '',
      notes: r && r.notes ? r.notes : '',
      fields,
    };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._values = this._buildDefaults();
    this._initial = this._buildDefaults();
  }

  willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    // Rebuild pre-filled defaults whenever the current rate changes, but
    // only before the user has confirmed the panel (so we never clobber
    // in-progress edits in the form).
    if (changed.has('rate') && !this._confirmed) {
      this._values = this._buildDefaults();
      this._initial = this._buildDefaults();
    }
  }

  private _onConfirm(): void {
    this._confirmed = true;
  }

  private _onCancel(): void {
    this.dispatchEvent(
      new CustomEvent('rate-form-cancel', { bubbles: true, composed: true }),
    );
  }

  private _onField(key: RateFieldKey, e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this._values = { ...this._values, fields: { ...this._values.fields, [key]: v } };
  }

  private _onText(field: 'effective_from' | 'effective_to' | 'notes', e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this._values = { ...this._values, [field]: v };
  }

  private _isChanged(key: RateFieldKey): boolean {
    return this._values.fields[key] !== this._initial.fields[key];
  }

  private _buildInput(): RateRowInput {
    const fields = {} as Record<RateFieldKey, number>;
    for (const f of RATE_FIELDS) fields[f.key] = num(this._values.fields[f.key]);
    return {
      effective_from: this._values.effective_from,
      effective_to: this._values.effective_to.trim() === '' ? null : this._values.effective_to,
      notes: this._values.notes.trim() === '' ? null : this._values.notes,
      base_hourly_rate: fields.base_hourly_rate,
      standard_hours_per_week: fields.standard_hours_per_week,
      shift_allowance_multiplier: fields.shift_allowance_multiplier,
      shift_allowance_hours_per_week: fields.shift_allowance_hours_per_week,
      overtime_1_5_multiplier: fields.overtime_1_5_multiplier,
      overtime_2_0_multiplier: fields.overtime_2_0_multiplier,
      superannuation_rate: fields.superannuation_rate,
      holiday_leave_loading_rate: fields.holiday_leave_loading_rate,
      accrual_rate_per_week: fields.accrual_rate_per_week,
      starting_holiday_leave_balance: fields.starting_holiday_leave_balance,
    };
  }

  private _onSubmit(e: Event): void {
    e.preventDefault();
    const payload = this._buildInput();
    const check = validateRateRow(payload);
    if (!check.ok) {
      this._errors = check.errors;
      return;
    }
    this._errors = [];
    if (this.rate?.id !== undefined) {
      this.dispatchEvent(
        new CustomEvent('rate-edit', {
          detail: { id: this.rate.id, input: payload },
          bubbles: true,
          composed: true,
        }),
      );
    } else {
      this.dispatchEvent(
        new CustomEvent('rate-create', {
          detail: { input: payload },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private _renderConfirm(): unknown {
    const current = this.rate;
    const diff = current
      ? RATE_FIELDS.map((f) => {
          const oldV = (current[f.key] as number).toFixed(3);
          const newV = this._values.fields[f.key];
          return `${f.label}: ${oldV} → ${newV}`;
        }).join('\n')
      : '(no current rate — this becomes the first)';
    return html`
      <div class="confirm" data-testid="confirm-panel">
        <strong>Adding this rate will close the current rate</strong>
        <pre>${diff}</pre>
        <div class="actions">
          <button class="primary" data-testid="confirm-add" @click="${this._onConfirm}">Confirm &amp; Save</button>
          <button class="ghost" data-testid="confirm-cancel" @click="${this._onCancel}">Cancel</button>
        </div>
      </div>
    `;
  }

  render(): unknown {
    if (!this._confirmed) {
      return this._renderConfirm();
    }
    return html`
      <form data-testid="rate-form" @submit="${(e: Event) => this._onSubmit(e)}">
        <label data-testid="field-effective_from">
          Effective from
          <input data-testid="input-effective_from" type="date" .value="${this._values.effective_from}" @input="${(e: Event) => this._onText('effective_from', e)}" />
        </label>
        <label data-testid="field-effective_to">
          Effective to (blank = current)
          <input data-testid="input-effective_to" type="date" .value="${this._values.effective_to}" @input="${(e: Event) => this._onText('effective_to', e)}" />
        </label>
        <div class="row" data-testid="rate-fields">
          ${RATE_FIELDS.map(
            (f) => html`
              <label class="${this._isChanged(f.key) ? 'changed' : ''}" data-testid="field-${f.key}">
                ${f.label}
                <input
                  class="${this._isChanged(f.key) ? 'changed' : ''}"
                  data-testid="input-${f.key}"
                  type="number"
                  step="any"
                  .value="${this._values.fields[f.key]}"
                  @input="${(e: Event) => this._onField(f.key, e)}"
                />
              </label>
            `,
          )}
        </div>
        <label data-testid="field-notes">
          Notes
          <input data-testid="input-notes" type="text" .value="${this._values.notes}" @input="${(e: Event) => this._onText('notes', e)}" />
        </label>
        ${this._errors.length > 0
          ? html`<div class="errors" data-testid="rate-errors">${this._errors.map((er) => html`<div>${er}</div>`)}</div>`
          : ''}
        <div class="actions">
          <button type="button" class="ghost" data-testid="rate-cancel" @click="${this._onCancel}">Cancel</button>
          <button type="submit" class="primary" data-testid="rate-submit">Save</button>
        </div>
      </form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rate-row-form': RateRowForm;
  }
}
