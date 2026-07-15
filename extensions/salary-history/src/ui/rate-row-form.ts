/**
 * Phase 4 Task 11.5 — Rate row form (add/edit a single pay-rate row).
 *
 * Decision 11: confirm panel FIRST (no destructive editing before the user
 * accepts the semantics). Decision 17: read-only view of history rows is
 * handled by `pay-rate-history-view`; this form is only used for the current
 * row (edit) or a brand-new row (add).
 *
 * On submit it emits `rate-create` (new) or `rate-edit` (existing) so the
 * orchestrator can route to `finance.db.table('salary_history_rate_history')`
 * and (for add) call `PayRateService.closeCurrentRate()` + insert.
 *
 * Visual fidelity tracks `docs/design/salary-history-mvp/rate-row-form.html`
 * (topbar + breadcrumb, sectioned card layout, green confirm dialog,
 * change-highlighted fields, footer actions).
 */

import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { RateRow } from '../dao/pay-rate-history.js';
import { sharedStyles, formStyles } from './shared-styles.js';

interface RateFieldDef {
  key: keyof RateRow;
  label: string;
}

const RATE_FIELDS: RateFieldDef[] = [
  { key: 'base_hourly_rate', label: 'Base hourly rate' },
  { key: 'standard_hours_per_week', label: 'Standard hours / week' },
  { key: 'shift_allowance_multiplier', label: 'Shift allowance multiplier' },
  { key: 'shift_allowance_hours_per_week', label: 'Shift allowance hours / week' },
  { key: 'overtime_1_5_multiplier', label: 'Overtime 1.5× multiplier' },
  { key: 'overtime_2_0_multiplier', label: 'Overtime 2.0× multiplier' },
  { key: 'superannuation_rate', label: 'Superannuation rate' },
  { key: 'holiday_leave_loading_rate', label: 'Holiday leave loading rate' },
  { key: 'accrual_rate_per_week', label: 'Accrual rate / week' },
  { key: 'starting_holiday_leave_balance', label: 'Starting holiday leave balance' },
];

/** Mock-faithful descriptive sublabels (rate-row-form.html). */
const RATE_FIELD_HINTS: Record<string, string> = {
  base_hourly_rate: '($/hr)',
  standard_hours_per_week: '',
  shift_allowance_multiplier: '(default 0.15)',
  shift_allowance_hours_per_week: '(default 38; hours the shift allowance is paid on)',
  overtime_1_5_multiplier: '(default 1.5)',
  overtime_2_0_multiplier: '(default 2.0)',
  superannuation_rate: '(ATO mandate; current 12%)',
  holiday_leave_loading_rate: '(default 0.175 = 17.5%)',
  accrual_rate_per_week: '(default 2.92 hours)',
  starting_holiday_leave_balance: '(default 0 hours)',
};

const DEFAULTS: Partial<Record<keyof RateRow, number | string | null>> = {
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
  notes: '',
};

@customElement('rate-row-form')
export class RateRowForm extends LitElement {
  static styles = [
    sharedStyles,
    formStyles,
    css`
      .container { max-width: 760px; margin: 0 auto; padding: 24px 20px 40px; }
      .subtitle { color: #858585; font-size: 13px; margin: 0 0 24px; }

      .confirm-panel {
        background: #1e2a1e;
        border: 1px solid #4ec9b0;
        border-left: 4px solid #4ec9b0;
        border-radius: 4px;
        padding: 14px 16px;
        margin-bottom: 16px;
      }
      .confirm-panel h3 {
        margin: 0 0 8px;
        font-size: 14px;
        font-weight: 700;
        color: #4ec9b0;
      }
      .confirm-panel-body { margin: 0 0 12px; font-size: 13px; color: #d4d4d4; line-height: 1.6; }
      .confirm-panel-body code { color: #4ec9b0; }
      .confirm-panel-body strong { color: #fff; }
      .confirm-panel-detail {
        background: #1e1e1e;
        border: 1px solid #3e3e3e;
        border-radius: 3px;
        padding: 10px 12px;
        margin: 8px 0;
        font-family: "SF Mono", Consolas, monospace;
        font-size: 12px;
      }
      .confirm-panel-detail ul { margin: 0; padding-left: 18px; }
      .confirm-panel-detail li { margin: 2px 0; }
      .confirm-panel-detail code { color: #9cdc9c; }
      .confirm-panel-actions { display: flex; gap: 8px; margin-top: 10px; }

      .errors {
        background: #2e1b1b;
        border: 1px solid #5a2a2a;
        border-radius: 4px;
        padding: 8px 12px;
        margin-bottom: 16px;
        font-size: 12px;
        color: #f48771;
      }

      .btn-action { background: #4ec9b0; color: #1e1e1e; border: 1px solid #4ec9b0; padding: 6px 14px; border-radius: 3px; font-size: 12px; cursor: pointer; font-family: inherit; font-weight: 600; }
      .btn-action:hover { background: #6fdec0; }
      .btn-action.muted { background: transparent; color: #858585; border-color: #3e3e3e; }
      .btn-action.muted:hover { background: #3c3c3c; color: #d4d4d4; }

      .info-note { font-size: 12px; color: #858585; font-style: italic; margin-top: 8px; padding: 8px 12px; background: #1e1e1e; border-radius: 3px; }
      .info-note::before { content: 'ℹ '; color: #4ec9b0; }
      .info-note code { color: #4ec9b0; }
    `,
  ];

  private _rate: RateRow | null = null;

  @property({ attribute: false })
  set rate(v: RateRow | null) {
    const old = this._rate;
    this._rate = v;
    if (old !== v && !this._confirmed) {
      this._values = { fields: this._buildDefaults() };
      this._errors = [];
    }
    this.requestUpdate('rate', old);
  }
  get rate(): RateRow | null {
    return this._rate;
  }

  @property({ type: Boolean })
  readOnly = false;

  @state()
  private _confirmed = false;

  @state()
  private _values: { fields: Record<string, string> } = { fields: {} };

  @state()
  private _errors: string[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    this._values = { fields: this._buildDefaults() };
    this._errors = [];
  }

  private _buildDefaults(): Record<string, string> {
    const out: Record<string, string> = {};
    const src = this.rate ?? DEFAULTS;
    for (const f of RATE_FIELDS) {
      const v = src[f.key];
      out[f.key] = v == null ? '' : String(v);
    }
    out.effective_from = this.rate?.effective_from ?? '';
    out.effective_to = this.rate?.effective_to ?? '';
    out.notes = this.rate?.notes ?? '';
    return out;
  }

  private _onField(key: keyof RateRow): void {
    const input = this.renderRoot.querySelector<HTMLInputElement>(`#input-${key}`);
    if (input) this._values.fields[key] = input.value;
  }

  private _onNotes(): void {
    const t = this.renderRoot.querySelector<HTMLTextAreaElement>('#input-notes');
    if (t) this._values.fields.notes = t.value;
  }

  private _isChanged(key: keyof RateRow): boolean {
    const initial = this.rate ? this.rate[key] : DEFAULTS[key];
    const initStr = initial == null ? '' : String(initial);
    const cur = this._values.fields[key] ?? '';
    return initStr !== cur;
  }

  private _buildInput(f: RateFieldDef, disabled = false): unknown {
    const key = f.key as string;
    const changed = this._isChanged(f.key);
    const err = this._errors.find((e) => e.startsWith(f.label)) ?? '';
    const original = String(this.rate?.[f.key] ?? DEFAULTS[f.key] ?? '');
    const hint = RATE_FIELD_HINTS[key] ?? '';
    const sublabel = changed && hint ? `${hint} — changed from ${original}` : hint;
    return html`
      <div class="field ${changed ? 'field-changed' : ''}" data-testid="field-${key}">
        <label for="input-${key}">
          <span class="label-main">${key}</span>
          ${sublabel ? html`<span class="label-sub">${sublabel}</span>` : ''}
        </label>
        <input id="input-${key}" data-testid="input-${key}" type="number" step="any" min="0"
          ?disabled="${disabled}" .value="${this._values.fields[key] ?? ''}" @input="${() => this._onField(f.key)}" />
        ${err ? html`<div class="field-error">${err}</div>` : ''}
      </div>
    `;
  }

  private _money(n: number): string {
    return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private _parse(): { ok: true; value: Record<string, number | string | null> } | { ok: false; errors: string[] } {
    const out: Record<string, number | string | null> = {};
    const errors: string[] = [];
    for (const f of RATE_FIELDS) {
      const raw = (this._values.fields[f.key] ?? '').trim();
      if (raw === '') {
        errors.push(`Missing value for ${f.label}`);
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        errors.push(`Invalid number for ${f.label}`);
        continue;
      }
      out[f.key] = n;
    }
    out.effective_from = (this._values.fields.effective_from ?? '').trim();
    out.effective_to = (this._values.fields.effective_to ?? '').trim() || null;
    out.notes = (this._values.fields.notes ?? '').trim() || null;
    return errors.length ? { ok: false, errors } : { ok: true, value: out };
  }

  private _onSubmit(e: Event): void {
    e.preventDefault();
    const parsed = this._parse();
    if (!parsed.ok) {
      this._errors = parsed.errors;
      return;
    }
    const input = parsed.value;
    const detail = this.rate ? { id: this.rate.id, input } : { input };
    if (detail && 'id' in detail && detail.id != null) {
      this.dispatchEvent(new CustomEvent('rate-edit', { detail, bubbles: true, composed: true }));
    } else {
      this.dispatchEvent(new CustomEvent('rate-create', { detail, bubbles: true, composed: true }));
    }
  }

  private _onConfirm(): void {
    this._confirmed = true;
  }

  private _onCancel(): void {
    this.dispatchEvent(new CustomEvent('rate-form-cancel', { bubbles: true, composed: true }));
  }

  private _renderConfirmPanel(): unknown {
    const cur = this.rate;
    const changedCount = RATE_FIELDS.filter((f) => this._isChanged(f.key)).length;
    return html`
      <div class="confirm-panel" data-testid="confirm-panel">
        <h3>⚠ Confirm rate change</h3>
        ${cur
          ? html`<p class="confirm-panel-body">Adding this rate will <strong>close the current rate</strong>. The current rate (effective from <code>${cur.effective_from}</code>) will have its <code>effective_to</code> set to the new rate's start date. Historical payslips keep using the closed rate; new payslips from that date use the new rate.</p>`
          : html`<p class="confirm-panel-body">This creates the <strong>first pay-rate row</strong> — there is no current rate to close yet.</p>`}
        <div class="confirm-panel-detail">
          <div>Current rate · base <code>${cur ? this._money(cur.base_hourly_rate as number) : '—'}</code> · std <code>${cur?.standard_hours_per_week ?? '—'}h</code> · SG <code>${cur?.superannuation_rate ?? '—'}</code></div>
          ${changedCount > 0
            ? html`<ul>${RATE_FIELDS.filter((f) => this._isChanged(f.key)).map(
                (f) => html`<li><code>${f.key}</code> ${String(cur?.[f.key] ?? DEFAULTS[f.key] ?? '')} → <strong>${this._values.fields[f.key]}</strong></li>`,
              )}</ul>`
            : html`<p>No values changed yet — editing the fields above will show the diff here.</p>`}
        </div>
        <div class="confirm-panel-actions">
          <button class="btn-action" data-testid="confirm-add" @click="${this._onConfirm}">✓ Confirm &amp; Save</button>
          <button class="btn-action muted" data-testid="confirm-cancel" @click="${this._onCancel}">Cancel</button>
        </div>
      </div>
    `;
  }

  render(): unknown {
    if (this.readOnly) return this._renderForm(true);
    return this._renderForm(false);
  }

  private _renderForm(readOnly: boolean): unknown {
    return html`
      <div class="topbar">
        <span class="crumb-link" data-testid="back-link" @click="${() => this._onCancel()}">← Pay Rate History</span>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">${readOnly ? 'View Rate' : this.rate ? 'Edit Rate' : 'Add New Rate'}</span>
      </div>
      <div class="container">
        <h1 data-testid="rate-form-title">${readOnly ? 'View Rate' : this.rate ? 'Edit Rate' : 'Add New Rate'}</h1>
        <p class="subtitle">${readOnly
          ? 'Read-only view of a historical rate row.'
          : this.rate
            ? 'Pre-filled from current rate. Edit fields you want to change; leave the rest as-is.'
            : 'Enter the new rate details. Saving will close the current rate.'}</p>

        ${!readOnly && !this._confirmed ? this._renderConfirmPanel() : ''}

        ${!readOnly && this._errors.length
          ? html`<div class="errors" data-testid="rate-errors">${this._errors.map((e) => html`<div>${e}</div>`)}</div>`
          : ''}

        <form class="rate-form" data-testid="rate-form" @submit="${this._onSubmit}">
          <section class="section">
            <div class="section-header">
              <h2 class="section-title">Effective dates</h2>
              <span class="section-badge">required</span>
            </div>
            <div class="section-body grid-2">
              <div class="field ${this._isChanged('effective_from') ? 'field-changed' : ''}" data-testid="field-effective_from">
                <label for="input-effective_from"><span class="label-main">Effective from</span><span class="label-sub">(date this rate becomes active)</span></label>
                <input id="input-effective_from" data-testid="input-effective_from" type="date"
                  ?disabled="${readOnly}" .value="${this._values.fields.effective_from ?? ''}" @input="${() => this._onField('effective_from')}" />
              </div>
              <div class="field ${this._isChanged('effective_to') ? 'field-changed' : ''}" data-testid="field-effective_to">
                <label for="input-effective_to"><span class="label-main">Effective to</span><span class="label-sub">(leave blank for current/open-ended)</span></label>
                <input id="input-effective_to" data-testid="input-effective_to" type="date"
                  ?disabled="${readOnly}" .value="${this._values.fields.effective_to ?? ''}" @input="${() => this._onField('effective_to')}" />
              </div>
            </div>
          </section>

          <section class="section">
            <div class="section-header">
              <h2 class="section-title">Rates</h2>
              <span class="section-badge">10 fields</span>
            </div>
            <div class="section-body grid-2" data-testid="rate-fields">
              ${RATE_FIELDS.map((f) => this._buildInput(f, readOnly))}
            </div>
          </section>

          <section class="section">
            <div class="section-header">
              <h2 class="section-title">Notes</h2>
            </div>
            <div class="section-body">
              <div class="field textarea" data-testid="field-notes">
                <label for="input-notes"><span class="label-main">Notes</span><span class="label-sub">notes</span></label>
                <textarea id="input-notes" data-testid="input-notes" rows="3"
                  ?disabled="${readOnly}" .value="${this._values.fields.notes ?? ''}" @input="${this._onNotes}"></textarea>
              </div>
            </div>
          </section>

          <div class="footer">
            ${readOnly
              ? html`<button class="btn btn-secondary" type="button" data-testid="rate-cancel" @click="${this._onCancel}">Back</button>`
              : html`
                <button class="btn btn-secondary" type="button" data-testid="rate-cancel" @click="${this._onCancel}">Cancel</button>
                <button class="btn btn-primary" type="submit" data-testid="rate-submit">Save rate</button>`}
          </div>
        </form>
        <p class="info-note">Validated by <code>PayRateService.validateRateRow</code>: <code>effective_from &lt; effective_to</code> if both set; all rates ≥ 0; <code>SG ≤ 1</code>. The Confirm &amp; Save button calls <code>PayRateService.addNewRate</code> in a single SQLite transaction (atomic close + insert).</p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rate-row-form': RateRowForm;
  }
}
