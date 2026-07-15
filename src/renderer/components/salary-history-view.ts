/**
 * Phase 4 Task 14.6 / Task 17 — host element for an extension's mounted UI.
 *
 * Receives `extensionId` + `componentTag` (plus optional `mountData`) and
 * realises the mount: it dynamically imports the extension bundle (which
 * registers the custom element as a side effect), builds a renderer-side
 * `finance` proxy, creates the element, injects `finance` + `mountData`,
 * and slots it in. The Host process has no DOM, so the actual rendering
 * can only happen here, in the Renderer.
 *
 * It also acts as the **navigation orchestrator** (Task 17 TU1–TU4): the
 * child components are pure UI surfaces that emit typed CustomEvents
 * (`account-create`, `payslip-create`, `payslip-edit`, `payslip-add-request`,
 * `payslip-edit-request`, `payslip-delete`, `payslip-cancel`, …). This
 * element listens for those events and drives navigation + persistence:
 *   - account writes go through the Core-owned `financeShell.accounts.create`
 *     path (the `accounts` table is read-only for extensions per Decision 4);
 *   - payslip writes go through the extension-namespaced `finance.db`
 *     proxy (allowed because the table carries the `salary_history_` prefix).
 *
 * The dynamic import is wrapped in try/catch: if the bundle is unavailable
 * (e.g. dev server without a pre-built bundle) the failure is logged rather
 * than crashing the app shell.
 */

import { LitElement, html } from 'lit';
import { createFinance } from '../create-finance';
import type { FinanceApi } from '../../types/finance';

type AccountSeed = { name: string; institution: string | null };
type PayslipInput = Record<string, unknown>;

export class SalaryHistoryView extends LitElement {
  static properties = {
    extensionId: { type: String },
    componentTag: { type: String },
    mountData: { attribute: false },
    bundleUrl: { type: String, attribute: false }
  };

  extensionId = '';
  componentTag = '';
  mountData: Record<string, unknown> = {};
  /** Optional absolute `file://` URL of the extension bundle (set by Main). */
  bundleUrl = '';

  /** Pre-fetched row to hand to the payslip form in edit mode. */
  private _editPaySlip: Record<string, unknown> | null = null;

  /** Pre-fetched rate row to hand to the rate form (add = null). */
  private _rateData: Record<string, unknown> | null = null;

  /** When true the rate form renders read-only (history "View"). */
  private _rateReadOnly = false;

  /** Current form-section render order (Decision 18 + Plan Amendment 7). */
  private _sectionOrder: string[] = [
    'period', 'totals', 'earnings', 'deductions', 'super', 'leave', 'leave-accrual', 'notes',
  ];

  /** Renderer-side `FinanceApi` proxy (extension-namespaced DB access). */
  private _finance: FinanceApi | null = null;

  /** Transient error surfaced to `rate-row-form` after a failed rate write. */
  private _rateError: string | null = null;

  /** Opens `rate-row-form` directly in its delete-confirm state. */
  private _confirmDelete = false;

  /** Opens `rate-row-form` in replace-current-rate mode. */
  private _replaceMode = false;

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('account-create', this._onAccountCreate as EventListener);
    this.addEventListener('account-seed-skip', this._onSeedDismiss as EventListener);
    this.addEventListener('account-seed-cancel', this._onSeedDismiss as EventListener);
    this.addEventListener('payslip-add-request', this._onAddPayslip as EventListener);
    this.addEventListener('payslip-create', this._onCreatePayslip as EventListener);
    this.addEventListener('payslip-edit-request', this._onEditRequest as EventListener);
    this.addEventListener('payslip-edit', this._onEditPayslip as EventListener);
    this.addEventListener('payslip-cancel', this._onCancelForm as EventListener);
    this.addEventListener('payslip-delete', this._onDeletePayslip as EventListener);
    this.addEventListener('reorder-sections', this._onReorderRequest as EventListener);
    this.addEventListener('section-order-change', this._onSectionOrderChange as EventListener);
    this.addEventListener('section-order-cancel', this._onReorderCancel as EventListener);
    // Rate-history navigation (Decision 16 + 17).
    this.addEventListener('rate-add-request', this._onAddRate as EventListener);
    this.addEventListener('rate-edit-request', this._onRateEditRequest as EventListener);
    this.addEventListener('rate-view-request', this._onRateViewRequest as EventListener);
    this.addEventListener('rate-create', this._onRateCreate as EventListener);
    this.addEventListener('rate-edit', this._onRateEdit as EventListener);
    this.addEventListener('rate-form-cancel', this._onRateCancel as EventListener);
    this.addEventListener('rate-delete-request', this._onRateDeleteRequest as EventListener);
    this.addEventListener('rate-delete', this._onRateDelete as EventListener);
    this.addEventListener('rate-replace-request', this._onRateReplaceRequest as EventListener);
    this.addEventListener('rate-replace', this._onRateReplace as EventListener);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('account-create', this._onAccountCreate as EventListener);
    this.removeEventListener('account-seed-skip', this._onSeedDismiss as EventListener);
    this.removeEventListener('account-seed-cancel', this._onSeedDismiss as EventListener);
    this.removeEventListener('payslip-add-request', this._onAddPayslip as EventListener);
    this.removeEventListener('payslip-create', this._onCreatePayslip as EventListener);
    this.removeEventListener('payslip-edit-request', this._onEditRequest as EventListener);
    this.removeEventListener('payslip-edit', this._onEditPayslip as EventListener);
    this.removeEventListener('payslip-cancel', this._onCancelForm as EventListener);
    this.removeEventListener('payslip-delete', this._onDeletePayslip as EventListener);
    this.removeEventListener('reorder-sections', this._onReorderRequest as EventListener);
    this.removeEventListener('section-order-change', this._onSectionOrderChange as EventListener);
    this.removeEventListener('section-order-cancel', this._onReorderCancel as EventListener);
    this.removeEventListener('rate-add-request', this._onAddRate as EventListener);
    this.removeEventListener('rate-edit-request', this._onRateEditRequest as EventListener);
    this.removeEventListener('rate-view-request', this._onRateViewRequest as EventListener);
    this.removeEventListener('rate-create', this._onRateCreate as EventListener);
    this.removeEventListener('rate-edit', this._onRateEdit as EventListener);
    this.removeEventListener('rate-form-cancel', this._onRateCancel as EventListener);
    this.removeEventListener('rate-delete-request', this._onRateDeleteRequest as EventListener);
    this.removeEventListener('rate-delete', this._onRateDelete as EventListener);
    this.removeEventListener('rate-replace-request', this._onRateReplaceRequest as EventListener);
    this.removeEventListener('rate-replace', this._onRateReplace as EventListener);
  }

  updated(changed: Map<string, unknown>): void {
    if (
      changed.has('extensionId') ||
      changed.has('componentTag') ||
      changed.has('mountData') ||
      changed.has('bundleUrl')
    ) {
      void this.mountChild();
    }
  }

  /** Switch the mounted child element and re-run the mount. */
  private navigate(tag: string, mountData: Record<string, unknown> = {}, editPaySlip: Record<string, unknown> | null = null): void {
    this.componentTag = tag;
    this.mountData = mountData;
    this._editPaySlip = editPaySlip;
    // Mounting is driven by `updated()` (which fires when `componentTag`
    // changes). Do NOT call `mountChild()` here as well — a second mount
    // would run after `mountChild` has already nulled `_rateData` /
    // `_editPaySlip`, replacing the pre-filled edit form with a blank one.
  }

  private async mountChild(): Promise<void> {
    if (!this.extensionId || !this.componentTag) return;
    try {
      // Prefer the absolute `file://` bundle URL supplied by Main (works
      // regardless of where the renderer page is served from). Fall back to a
      // relative guess only if Main omitted it.
      const fallback = `../extensions/${this.extensionId}.js`;
      const bundleUrl = this.bundleUrl || fallback;
      // Import the host bundle (defines activate/deactivate + registerUIComponents).
      const mod = await import(/* @vite-ignore */ bundleUrl);
      // Register the custom elements (browser-only dynamic import of the `lit`
      // UI components). Must complete before we create the element so it
      // upgrades with its Lit behavior and reactive properties. (The host
      // bundle itself stays DOM-free so it can load in the Node Extension
      // Host without `HTMLElement is not defined`.)
      await (mod as { registerUIComponents?: () => Promise<void> }).registerUIComponents?.();

      const child = document.createElement(this.componentTag);
      const childEl = child as unknown as Record<string, unknown>;
      this._finance = createFinance(this.extensionId);
      childEl.finance = this._finance;
      // Load any persisted section order (Decision 18) before mounting.
      if (this._finance.settings) {
        const saved = (await this._finance.settings.get('salary-history.sectionOrder')) as
          | string
          | undefined;
        if (typeof saved === 'string') {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) this._sectionOrder = parsed as string[];
          } catch {
            /* ignore malformed saved order */
          }
        }
      }
      childEl.sectionOrder = this._sectionOrder;
      // Forward host-provided mount data (e.g. `salary-history.defaultCurrency`
      // / `financialYearStart` read by the extension in `activate`) onto the
      // child element's reactive properties, so the extension can surface
      // settings-derived values. (Task 16.3 manual test depends on this.)
      if (this.mountData) Object.assign(childEl, this.mountData);
      if (this._editPaySlip) childEl.editPaySlip = this._editPaySlip;
      this._editPaySlip = null;
      if (this.componentTag === 'rate-row-form') {
        childEl.rate = this._rateData;
        childEl.readOnly = this._rateReadOnly;
        childEl.rateError = this._rateError;
        childEl.confirmDelete = this._confirmDelete;
        childEl.replaceMode = this._replaceMode;
        this._rateData = null;
        this._rateReadOnly = false;
        this._rateError = null;
        this._confirmDelete = false;
        this._replaceMode = false;
      }

      const existing = this.querySelector('[data-ext-root]');
      if (existing) existing.remove();
      child.setAttribute('data-ext-root', '');
      this.appendChild(child);
    } catch (err) {
      console.error(`[renderer] failed to mount ${this.extensionId}/${this.componentTag}:`, err);
    }
  }

  private _onAccountCreate = async (e: Event): Promise<void> => {
    const detail = (e as CustomEvent).detail as AccountSeed;
    try {
      await window.financeShell.accounts.create(detail);
    } catch (err) {
      console.error('[renderer] account creation failed:', err);
      return;
    }
    // After the first account exists, drop the user straight into the form
    // (Test Unit 1 expectation: form renders with the account in the dropdown).
    this.navigate('payslip-form', this.mountData);
  };

  private _onSeedDismiss = (): void => {
    this.navigate('payslip-list', this.mountData);
  };

  private _onAddPayslip = (): void => {
    this.navigate('payslip-form', this.mountData);
  };

  private _onCreatePayslip = async (e: Event): Promise<void> => {
    const { input } = (e as CustomEvent).detail as { input: PayslipInput };
    if (!this._finance) return;
    try {
      await this._finance.db.table('salary_history_pay_slips').insert(input);
    } catch (err) {
      console.error('[renderer] payslip create failed:', err);
      return;
    }
    this.navigate('payslip-list', this.mountData);
  };

  private _onEditRequest = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    if (!this._finance) return;
    const row = (await this._finance.db
      .table('salary_history_pay_slips')
      .findOne({ id })) as Record<string, unknown> | undefined;
    this.navigate('payslip-form', this.mountData, row ?? null);
  };

  private _onEditPayslip = async (e: Event): Promise<void> => {
    const { id, input } = (e as CustomEvent).detail as { id: number; input: PayslipInput };
    if (!this._finance) return;
    try {
      await this._finance.db.table('salary_history_pay_slips').update(input, { id });
    } catch (err) {
      console.error('[renderer] payslip update failed:', err);
      return;
    }
    this.navigate('payslip-list', this.mountData);
  };

  private _onCancelForm = (): void => {
    this.navigate('payslip-list', this.mountData);
  };

  private _onDeletePayslip = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    if (!this._finance) return;
    try {
      await this._finance.db.table('salary_history_pay_slips').delete({ id });
    } catch (err) {
      console.error('[renderer] payslip delete failed:', err);
      return;
    }
    this.navigate('payslip-list', this.mountData);
  };

  private _onReorderRequest = (): void => {
    this.navigate('reorder-sections-modal', this.mountData);
  };

  private _onSectionOrderChange = async (e: Event): Promise<void> => {
    const order = (e as CustomEvent).detail as string[];
    if (!Array.isArray(order)) return;
    this._sectionOrder = order;
    if (this._finance?.settings) {
      try {
        await this._finance.settings.set('salary-history.sectionOrder', JSON.stringify(order));
      } catch (err) {
        console.error('[renderer] failed to persist section order:', err);
      }
    }
    this.navigate('payslip-form', this.mountData);
  };

  private _onReorderCancel = (): void => {
    this.navigate('payslip-form', this.mountData);
  };

  // ----- Rate-history navigation (Decision 16 + 17) -----

  private _onAddRate = (): void => {
    this._editPaySlip = null;
    this._rateData = null;
    this._rateReadOnly = false;
    this.navigate('rate-row-form', this.mountData);
  };

  private _onRateEditRequest = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    if (!this._finance) return;
    const row = (await this._finance.db
      .table('salary_history_rate_history')
      .findOne({ id })) as Record<string, unknown> | undefined;
    this._editPaySlip = null;
    this._rateData = row ?? null;
    this._rateReadOnly = false;
    this.navigate('rate-row-form', this.mountData);
  };

  private _onRateViewRequest = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    if (!this._finance) return;
    const row = (await this._finance.db
      .table('salary_history_rate_history')
      .findOne({ id })) as Record<string, unknown> | undefined;
    this._editPaySlip = null;
    if (!row) {
      this.navigate('pay-rate-history-view', this.mountData);
      return;
    }
    this._rateData = row;
    this._rateReadOnly = true;
    this.navigate('rate-row-form', this.mountData);
  };

  private _onRateCreate = async (e: Event): Promise<void> => {
    const { input } = (e as CustomEvent).detail as { input: Record<string, unknown> };
    if (!this._finance) return;
    const effectiveTo = input.effective_to === null || input.effective_to === '' ? null : input.effective_to;
    try {
      // A new row with no end date becomes the current rate. Validate up front
      // (Decision 16 close-then-insert + migration 006's single-current rule):
      // if a current rate already exists, surface a friendly banner and abort
      // instead of round-tripping an insert that would hit the UNIQUE index.
      if (effectiveTo === null) {
        const current = (await this._finance.db
          .table('salary_history_rate_history')
          .findOne({ effective_to: { $isNull: true } })) as Record<string, unknown> | undefined;
        if (current && typeof current.id === 'number') {
          // There is already an open-ended current rate. We do NOT close it
          // under the user's current row — that would silently rewrite history
          // and lose the user's intended end date. Show the error and stop.
          await this._failRateWrite(
            new Error('UNIQUE constraint failed: a current rate already exists'),
            undefined
          );
          return;
        }
      }
      await this._finance.db.table('salary_history_rate_history').insert(input);
    } catch (err) {
      await this._failRateWrite(err, undefined);
      return;
    }
    this.navigate('pay-rate-history-view', this.mountData);
  };

  private _onRateEdit = async (e: Event): Promise<void> => {
    const { id, input } = (e as CustomEvent).detail as { id: number; input: Record<string, unknown> };
    if (!this._finance) return;
    try {
      await this._finance.db.table('salary_history_rate_history').update(input, { id });
    } catch (err) {
      await this._failRateWrite(err, id);
      return;
    }
    this.navigate('pay-rate-history-view', this.mountData);
  };

  /**
   * Surface a failed rate write back to the form instead of silently
   * dropping it. The most likely failure is the migration-006 unique
   * constraint (a second `effective_to IS NULL` current rate); re-open the
   * form (re-fetching the row for edits) with a friendly error banner.
   */
  /**
   * Surface a failed rate write back to the form instead of silently
   * dropping it. The most likely failure is the migration-006 unique
   * constraint (a second `effective_to IS NULL` current rate). We push the
   * error onto the **already-mounted** `rate-row-form` element so the
   * user's typed input is preserved and the banner appears immediately.
   * (Using `navigate()` here would be a no-op: `componentTag` is already
   * `'rate-row-form'`, so `updated()` would skip `mountChild()` and the
   * live element would never receive `rateError`.)
   */
  private async _failRateWrite(err: unknown, rateId: number | undefined): Promise<void> {
    console.error('[renderer] rate write failed:', err);
    const message =
      err instanceof Error && /UNIQUE/i.test(err.message)
        ? 'A current rate (end date empty) already exists. Only one current rate is allowed — edit the existing current rate, or give this row an end date.'
        : 'Could not save the rate. Please try again.';
    this._rateError = message;

    // Re-fetch the row for edits so the form is pre-filled if it remounts.
    if (rateId !== undefined && this._finance) {
      const row = (await this._finance.db
        .table('salary_history_rate_history')
        .findOne({ id: rateId })) as Record<string, unknown> | undefined;
      this._rateData = row ?? null;
    } else {
      this._rateData = null;
    }
    this._rateReadOnly = false;

    // Push the error onto the live form element (preserves typed input).
    const live = this.querySelector('rate-row-form') as
      | (HTMLElement & { rateError: string | null; rate: unknown; readOnly: boolean })
      | null;
    if (live) {
      live.rateError = message;
      live.rate = this._rateData;
      live.readOnly = false;
    } else {
      // Form not mounted yet — fall back to a remount.
      this.navigate('rate-row-form', this.mountData);
    }
  }

  private _onRateDeleteRequest = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    if (!this._finance) return;
    const row = (await this._finance.db
      .table('salary_history_rate_history')
      .findOne({ id })) as Record<string, unknown> | undefined;
    if (!row) {
      this.navigate('pay-rate-history-view', this.mountData);
      return;
    }
    this._rateData = row;
    this._rateReadOnly = false;
    this._confirmDelete = true;
    this.navigate('rate-row-form', this.mountData);
  };

  private _onRateDelete = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    if (!this._finance) return;
    try {
      await this._finance.db.table('salary_history_rate_history').delete({ id });
    } catch (err) {
      console.error('[renderer] rate delete failed:', err);
    }
    this.navigate('pay-rate-history-view', this.mountData);
  };

  private _onRateReplaceRequest = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    if (!this._finance) return;
    const row = (await this._finance.db
      .table('salary_history_rate_history')
      .findOne({ id })) as Record<string, unknown> | undefined;
    if (!row) {
      this.navigate('pay-rate-history-view', this.mountData);
      return;
    }
    this._rateData = row;
    this._rateReadOnly = false;
    this._replaceMode = true;
    this.navigate('rate-row-form', this.mountData);
  };

  /**
   * Replace the current rate (Option A): close the old current row at the new
   * rate's `effective_from`, then insert the new open-ended rate. This is the
   * explicit, user-initiated "replace" action — distinct from the blocked
   * open-ended "add" path — so it intentionally bypasses the single-current
   * pre-write check that lives in `_onRateCreate`.
   */
  private _onRateReplace = async (e: Event): Promise<void> => {
    const { id, input } = (e as CustomEvent).detail as { id: number; input: Record<string, unknown> };
    if (!this._finance) return;
    const effectiveFrom = String(input.effective_from ?? '');
    try {
      // Close the old current row (the one being replaced) at the new start date.
      await this._finance.db
        .table('salary_history_rate_history')
        .update({ id }, { effective_to: effectiveFrom });
      // Insert the new current rate.
      await this._finance.db.table('salary_history_rate_history').insert(input);
    } catch (err) {
      await this._failRateWrite(err, id);
      return;
    }
    this.navigate('pay-rate-history-view', this.mountData);
  };

  private _onRateCancel = (): void => {
    this.navigate('pay-rate-history-view', this.mountData);
  };

  render() {
    return html`<slot></slot>`;
  }
}

customElements.define('salary-history-view', SalaryHistoryView);
