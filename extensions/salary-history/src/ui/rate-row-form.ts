/**
 * Phase 4 Task 11.5 — Rate row form (add/edit a single pay-rate row).
 *
 * Decision 17: read-only view of history rows is handled by
 * `pay-rate-history-view`; this form is only used for the current row (edit)
 * or a brand-new row (add). New rates default `effective_from` to today.
 *
 * On submit it emits `rate-create` (new) or `rate-edit` (existing) so the
 * orchestrator can route to `finance.db.table('salary_history_rate_history')`
 * and (for add) close the previous current rate before inserting the new one
 * (Decision 16 close-then-insert; enforced by migration 006's partial unique
 * index on `effective_to IS NULL`). A "Delete" button opens an in-form
 * confirmation panel that emits `rate-delete`; the orchestrator then removes
 * the row.
 *
 * Visual fidelity tracks `docs/design/salary-history-mvp/rate-row-form.html`
 * (topbar + breadcrumb, sectioned card layout, change-highlighted fields,
 * footer actions).
 */

import { LitElement, css, html, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { RateRow } from '../dao/pay-rate-history.js';
import { sharedStyles } from '../styles/shared-styles.js';

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
  notes: '',
};

/** Local date as `YYYY-MM-DD` for `type="date"` inputs. */
function todayISO(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

@customElement('rate-row-form')
export class RateRowForm extends LitElement {
  static styles = [
    sharedStyles,
    css`
      .container {
        max-width: 960px;
        margin: 0 auto;
        padding: 24px 20px 40px;
      }
      .subtitle {
        color: var(--ff-text-muted, #858585);
        font-size: var(--ff-font-sm);
        margin: 0 0 24px;
      }

      .errors {
        background: var(--ff-danger-bg, #2e1b1b);
        border: 1px solid var(--ff-danger-border, #5a2a2a);
        border-radius: 4px;
        padding: 8px 12px;
        margin-bottom: 16px;
        font-size: var(--ff-font-sm);
        color: var(--ff-danger, #f48771);
      }

      .btn-action {
        background: var(--ff-teal, #4ec9b0);
        color: var(--ff-bg-base, #1e1e1e);
        border: 1px solid var(--ff-teal, #4ec9b0);
        padding: 6px 14px;
        border-radius: 3px;
        font-size: var(--ff-font-base);
        cursor: pointer;
        font-weight: 600;
      }
      .btn-action:hover {
        background: var(--ff-teal-hover, #6fdec0);
      }
      .btn-action.muted {
        background: transparent;
        color: var(--ff-text-muted, #858585);
        border-color: var(--ff-border, #3e3e3e);
      }
      .btn-action.muted:hover {
        background: var(--ff-bg-input, #3c3c3c);
        color: var(--ff-text, #d4d4d4);
      }

      .btn-danger {
        background: var(--ff-danger-bg, #5a2a2a);
        color: var(--ff-danger, #f48771);
        border: 1px solid var(--ff-danger-bg, #5a2a2a);
        padding: 6px 14px;
        border-radius: 3px;
        font-size: var(--ff-font-base);
        cursor: pointer;
        font-weight: 600;
      }
      .btn-danger:hover {
        background: var(--ff-danger-hover, #7a3636);
      }

      .delete-confirm {
        background: var(--ff-bg-subpanel, #2a2a2a);
        border: 1px solid var(--ff-danger-border, #5a2a2a);
        border-radius: 6px;
        padding: 20px;
        margin-top: 8px;
      }
      .delete-warning {
        color: var(--ff-danger, #f48771);
        font-size: var(--ff-font-base);
        margin: 0 0 12px;
      }
      .delete-summary {
        list-style: none;
        padding: 0;
        margin: 0 0 16px;
      }
      .delete-summary li {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        border-bottom: 1px solid var(--ff-border, #3e3e3e);
        font-size: var(--ff-font-sm);
        color: var(--ff-text, #d4d4d4);
      }
      .delete-summary li span {
        color: var(--ff-text-muted, #858585);
      }
      .delete-summary code {
        color: var(--ff-teal, #4ec9b0);
      }

      .info-note {
        font-size: var(--ff-font-base);
        color: var(--ff-text-muted, #858585);
        font-style: italic;
        margin-top: 8px;
        padding: 8px 12px;
        background: var(--ff-bg-base, #1e1e1e);
        border-radius: 3px;
      }
      .info-note::before {
        content: 'ℹ ';
        color: var(--ff-teal, #4ec9b0);
      }
      .info-note code {
        color: var(--ff-accent, #007acc);
      }
    `,
  ];

  private _rate: RateRow | null = null;

  @property({ attribute: false })
  set rate(v: RateRow | null) {
    const old = this._rate;
    this._rate = v;
    if (old !== v) {
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

  /** When true (set by the orchestrator on a list "Delete"), the form opens
   * directly in its delete-confirmation state instead of the edit form. */
  @property({ type: Boolean })
  confirmDelete = false;

  /** Transient error banner (e.g. a second-current-rate constraint
   * violation surfaced by the orchestrator after a failed save). */
  @property({ type: String })
  rateError: string | null = null;

  /** When true the form is replacing the current rate: pre-filled from the
   * current row but `effective_from` defaults to today and `effective_to` to
   * open, and submitting dispatches `rate-replace` (close old + insert new). */
  @property({ type: Boolean })
  replaceMode = false;

  @state()
  private _values: { fields: Record<string, string> } = { fields: {} };

  @state()
  private _errors: string[] = [];

  /** True while the delete-confirmation panel is shown (in-form or list-driven). */
  @state()
  private _deleteMode = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._values = { fields: this._buildDefaults() };
    this._errors = [];
  }

  willUpdate(changed: PropertyValues): void {
    // Orchestrator assigns rate after connect; rebuild field defaults on late arrival.
    if (changed.has('rate')) {
      this._values = { fields: this._buildDefaults() };
      this._errors = [];
    }
    if (changed.has('confirmDelete')) {
      this._deleteMode = this.confirmDelete;
    }
    // Replace mode changes which defaults apply (effective_from → today,
    // effective_to → open); the orchestrator sets `replaceMode` after `rate`,
    // so rebuild the field defaults when it flips on.
    if (changed.has('replaceMode') && this.replaceMode) {
      this._values = { fields: this._buildDefaults() };
    }
  }

  private _buildDefaults(): Record<string, string> {
    const out: Record<string, string> = {};
    const src = this.rate ?? DEFAULTS;
    for (const f of RATE_FIELDS) {
      const v = src[f.key];
      out[f.key] = v == null ? '' : String(v);
    }
    // New rates default effective_from to today; existing rows keep their value.
    // Replace mode keeps the current row's rate numbers but starts the new
    // rate from today (open-ended), since it supersedes the current rate.
    if (this.replaceMode) {
      out.effective_from = todayISO();
      out.effective_to = '';
    } else {
      out.effective_from = this.rate?.effective_from ?? todayISO();
      out.effective_to = this.rate?.effective_to ?? '';
    }
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
    // Add mode has no baseline row to diff against — never highlight.
    if (!this.rate) return false;
    const initial = this.rate[key];
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
          <span class="label-main">${key.replace(/_/g, ' ')}</span>
          ${sublabel ? html`<span class="label-sub">${sublabel}</span>` : ''}
        </label>
        <input
          id="input-${key}"
          data-testid="input-${key}"
          type="number"
          step="any"
          min="0"
          ?disabled="${disabled}"
          .value="${this._values.fields[key] ?? ''}"
          @input="${() => this._onField(f.key)}"
        />
        ${err ? html`<div class="field-error">${err}</div>` : ''}
      </div>
    `;
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
    if (this.replaceMode) {
      // Replacing the current rate: close the old current row (the one we
      // were pre-filled from) at the new effective_from, then insert the new
      // open-ended rate. The orchestrator performs both steps atomically.
      this.dispatchEvent(new CustomEvent('rate-replace', { detail, bubbles: true, composed: true }));
      return;
    }
    if (detail && 'id' in detail && detail.id != null) {
      this.dispatchEvent(new CustomEvent('rate-edit', { detail, bubbles: true, composed: true }));
    } else {
      this.dispatchEvent(new CustomEvent('rate-create', { detail, bubbles: true, composed: true }));
    }
  }

  private _onCancel(): void {
    this.dispatchEvent(new CustomEvent('rate-form-cancel', { bubbles: true, composed: true }));
  }

  /** Confirm delete — dispatch the final `rate-delete` event. */
  private _onDelete(): void {
    if (this.rate?.id == null) return;
    this.dispatchEvent(
      new CustomEvent('rate-delete', { detail: { id: this.rate.id }, bubbles: true, composed: true }),
    );
  }

  /** Cancel delete — return to the form, or to the list if opened for delete. */
  private _onCancelDelete(): void {
    if (this.confirmDelete) {
      this.dispatchEvent(new CustomEvent('rate-form-cancel', { bubbles: true, composed: true }));
    } else {
      this._deleteMode = false;
    }
  }

  private _renderDeleteConfirm(): unknown {
    const r = this.rate;
    return html`
      <div class="view-scroll">
      <div class="topbar">
        <span
          class="crumb-link"
          data-testid="back-link"
          @click="${this._onCancelDelete}"
        >← Pay Rate History</span>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">Delete Rate</span>
      </div>
      <div class="container">
        <h1 data-testid="rate-form-title">Delete Rate</h1>
        <div class="delete-confirm" data-testid="delete-confirm">
          <p class="delete-warning">Delete this rate row? This cannot be undone.</p>
          <ul class="delete-summary">
            <li><span>Effective from</span><code>${r?.effective_from ?? ''}</code></li>
            <li><span>Effective to</span><code>${r?.effective_to ?? '— (open)'}</code></li>
            <li><span>Base hourly</span><code>${r?.base_hourly_rate ?? ''}</code></li>
          </ul>
          <div class="footer">
            <button
              class="btn btn-secondary"
              type="button"
              data-testid="rate-delete-cancel"
              @click="${this._onCancelDelete}"
            >Cancel</button>
            <button
              class="btn btn-danger"
              type="button"
              data-testid="rate-delete-confirm"
              @click="${this._onDelete}"
            >Delete rate</button>
          </div>
        </div>
      </div>
      </div>
    `;
  }

  render(): unknown {
    if (this._deleteMode) return this._renderDeleteConfirm();
    if (this.readOnly) return this._renderForm(true);
    return this._renderForm(false);
  }

  private _renderForm(readOnly: boolean): unknown {
    return html`
      <div class="view-scroll">
      <div class="topbar">
        <span
          class="crumb-link"
          data-testid="back-link"
          @click="${() => this._onCancel()}"
        >← Pay Rate History</span>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">${readOnly ? 'View Rate' : this.rate ? 'Update Rate' : 'Add New Rate'}</span>
      </div>
      <div class="container">
        <h1 data-testid="rate-form-title">${readOnly ? 'View Rate' : this.replaceMode ? 'Replace Current Rate' : this.rate ? 'Update Rate' : 'Add New Rate'}</h1>
        <p class="subtitle">${readOnly
          ? 'Read-only view of a historical rate row.'
          : this.replaceMode
            ? 'Pre-filled from the current rate, starting today. Saving closes the old current rate and opens this new one.'
            : this.rate
              ? 'Pre-filled from current rate. Edit fields you want to change; leave the rest as-is.'
              : 'Enter the new rate details. Saving will close the current rate.'}</p>

        ${!readOnly && this._errors.length
          ? html`<div class="errors" data-testid="rate-errors">${this._errors.map((e) => html`<div>${e}</div>`)}</div>`
          : ''}

        ${this.rateError
          ? html`<div class="errors" data-testid="rate-error-banner">${this.rateError}</div>`
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
                <input
                  id="input-effective_from"
                  data-testid="input-effective_from"
                  type="date"
                  ?disabled="${readOnly}"
                  .value="${this._values.fields.effective_from ?? ''}"
                  @input="${() => this._onField('effective_from')}"
                />
              </div>
              <div class="field ${this._isChanged('effective_to') ? 'field-changed' : ''}" data-testid="field-effective_to">
                <label for="input-effective_to"><span class="label-main">Effective to</span><span class="label-sub">(leave blank for current/open-ended)</span></label>
                <input
                  id="input-effective_to"
                  data-testid="input-effective_to"
                  type="date"
                  ?disabled="${readOnly}"
                  .value="${this._values.fields.effective_to ?? ''}"
                  @input="${() => this._onField('effective_to')}"
                />
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
                <textarea
                  id="input-notes"
                  data-testid="input-notes"
                  rows="3"
                  ?disabled="${readOnly}"
                  .value="${this._values.fields.notes ?? ''}"
                  @input="${this._onNotes}"
                ></textarea>
              </div>
            </div>
          </section>

          <div class="footer">
            ${readOnly
              ? html`
                <button
                  class="btn btn-secondary"
                  type="button"
                  data-testid="rate-cancel"
                  @click="${this._onCancel}"
                >Back</button>`
              : html`
                <button
                  class="btn btn-secondary"
                  type="button"
                  data-testid="rate-cancel"
                  @click="${this._onCancel}"
                >Cancel</button>
                <button
                  class="btn btn-primary"
                  type="submit"
                  data-testid="rate-submit"
                >${this.rate ? 'Update Rate' : 'Save rate'}</button>`}
          </div>
        </form>
        <p class="info-note">Validated by <code>PayRateService.validateRateRow</code>: <code>effective_from &lt; effective_to</code> if both set; all rates ≥ 0; <code>SG ≤ 1</code>. Saving a new rate calls <code>PayRateService.addNewRate</code> in a single SQLite transaction (atomic close + insert).</p>
      </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rate-row-form': RateRowForm;
  }
}
