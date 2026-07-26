/**
 * Phase 5 Task 5.2 — Navigation orchestrator for the salary-history extension.
 *
 * Replaces the Phase 4 renderer-side `SalaryHistoryView` LitElement host.
 * The Orchestrator owns navigation state and DAO access inside the
 * WebviewPanel's renderer context (the bundle runs in the panel, not the
 * main renderer). UI components are pure surfaces that emit typed
 * CustomEvents; the Orchestrator listens for those events and drives
 * navigation + persistence.
 *
 * Account writes go through Core-owned `window.financeShell.accounts.create`
 * (the `accounts` table is read-only for extensions per Decision 4).
 * Payslip / rate writes go through the extension-namespaced `finance.db`
 * proxy (allowed because the tables carry the `salary_history_` prefix).
 */

import type { FinanceApi } from 'finance';

type AccountSeed = { name: string; institution: string | null };
type PayslipInput = Record<string, unknown>;

export class Orchestrator {
  private _finance: FinanceApi;
  private _container: HTMLElement;
  private _currentTag = '';
  private _mountData: Record<string, unknown> = {};
  private _editPaySlip: Record<string, unknown> | null = null;
  private _rateData: Record<string, unknown> | null = null;
  private _rateReadOnly = false;
  private _sectionOrder: string[] = [
    'period', 'totals', 'earnings', 'deductions', 'super', 'leave', 'leave-accrual', 'notes',
  ];
  private _rateError: string | null = null;
  private _confirmDelete = false;
  private _replaceMode = false;

  constructor(finance: FinanceApi, container: HTMLElement, mountData: Record<string, unknown> = {}) {
    this._finance = finance;
    this._container = container;
    this._mountData = mountData;
  }

  async init(): Promise<void> {
    await this._loadSectionOrder();
    this._bindEvents();
    // Show the initial view (payslip-list by default)
    this.navigate('payslip-list', this._mountData);
  }

  destroy(): void {
    this._unbindEvents();
  }

  // ── Event binding ──────────────────────────────────────────────────

  private readonly _handlers = new Map<string, EventListener>();

  private _bindEvents(): void {
    const on = (name: string, handler: (e: Event) => void): void => {
      const wrapped = handler as EventListener;
      this._handlers.set(name, wrapped);
      this._container.addEventListener(name, wrapped);
    };

    on('account-create', this._onAccountCreate);
    on('account-seed-skip', this._onSeedDismiss);
    on('account-seed-cancel', this._onSeedDismiss);
    on('payslip-add-request', this._onAddPayslip);
    on('payslip-create', this._onCreatePayslip);
    on('payslip-edit-request', this._onEditRequest);
    on('payslip-edit', this._onEditPayslip);
    on('payslip-cancel', this._onCancelForm);
    on('payslip-delete', this._onDeletePayslip);
    on('reorder-sections', this._onReorderRequest);
    on('section-order-change', this._onSectionOrderChange);
    on('section-order-cancel', this._onReorderCancel);
    on('rate-add-request', this._onAddRate);
    on('rate-edit-request', this._onRateEditRequest);
    on('rate-view-request', this._onRateViewRequest);
    on('rate-create', this._onRateCreate);
    on('rate-edit', this._onRateEdit);
    on('rate-form-cancel', this._onRateCancel);
    on('rate-delete-request', this._onRateDeleteRequest);
    on('rate-delete', this._onRateDelete);
    on('rate-replace-request', this._onRateReplaceRequest);
    on('rate-replace', this._onRateReplace);
    on('host-navigate', this._onHostNavigate);
  }

  private _unbindEvents(): void {
    for (const [name, handler] of this._handlers) {
      this._container.removeEventListener(name, handler);
    }
    this._handlers.clear();
  }

  // ── Navigation ─────────────────────────────────────────────────────

  navigate(
    tag: string,
    mountData: Record<string, unknown> = {},
    editPaySlip: Record<string, unknown> | null = null,
  ): void {
    this._currentTag = tag;
    this._mountData = mountData;
    this._editPaySlip = editPaySlip;
    void this._mountChild();
  }

  private async _mountChild(): Promise<void> {
    if (!this._currentTag) return;
    try {
      const child = document.createElement(this._currentTag);
      const childEl = child as unknown as Record<string, unknown>;

      childEl.finance = this._finance;
      childEl.sectionOrder = this._sectionOrder;

      if (Object.keys(this._mountData).length > 0) {
        Object.assign(childEl, this._mountData);
      }
      if (this._editPaySlip) childEl.editPaySlip = this._editPaySlip;
      this._editPaySlip = null;

      if (this._currentTag === 'rate-row-form') {
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

      this._container.replaceChildren(child);
    } catch (err) {
      console.error(`[salary-history] orchestrator mount failed for ${this._currentTag}:`, err);
    }
  }

  // ── Settings persistence ───────────────────────────────────────────

  private async _loadSectionOrder(): Promise<void> {
    if (!this._finance.settings) return;
    const saved = (await this._finance.settings.get('salary-history.sectionOrder')) as string | undefined;
    if (typeof saved === 'string') {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) this._sectionOrder = parsed as string[];
      } catch { /* ignore malformed saved order */ }
    }
  }

  // ── Account events ─────────────────────────────────────────────────

  private _onAccountCreate = async (e: Event): Promise<void> => {
    const detail = (e as CustomEvent).detail as AccountSeed;
    try {
      await window.financeShell.accounts.create(detail);
    } catch (err) {
      console.error('[salary-history] account creation failed:', err);
      return;
    }
    this.navigate('payslip-form', this._mountData);
  };

  private _onSeedDismiss = (): void => {
    this.navigate('payslip-list', this._mountData);
  };

  // ── Payslip events ─────────────────────────────────────────────────

  private _onAddPayslip = (): void => {
    this.navigate('payslip-form', this._mountData);
  };

  private _onCreatePayslip = async (e: Event): Promise<void> => {
    const { input } = (e as CustomEvent).detail as { input: PayslipInput };
    try {
      await this._finance.db.table('salary_history_pay_slips').insert(input);
    } catch (err) {
      console.error('[salary-history] payslip create failed:', err);
      return;
    }
    this.navigate('payslip-list', this._mountData);
  };

  private _onEditRequest = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    const row = (await this._finance.db
      .table('salary_history_pay_slips')
      .findOne({ id })) as Record<string, unknown> | undefined;
    this.navigate('payslip-form', this._mountData, row ?? null);
  };

  private _onEditPayslip = async (e: Event): Promise<void> => {
    const { id, input } = (e as CustomEvent).detail as { id: number; input: PayslipInput };
    try {
      await this._finance.db.table('salary_history_pay_slips').update(input, { id });
    } catch (err) {
      console.error('[salary-history] payslip update failed:', err);
      return;
    }
    this.navigate('payslip-list', this._mountData);
  };

  private _onCancelForm = (): void => {
    this.navigate('payslip-list', this._mountData);
  };

  private _onDeletePayslip = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    try {
      await this._finance.db.table('salary_history_pay_slips').delete({ id });
    } catch (err) {
      console.error('[salary-history] payslip delete failed:', err);
      return;
    }
    this.navigate('payslip-list', this._mountData);
  };

  // ── Section reorder events ─────────────────────────────────────────

  private _onReorderRequest = (): void => {
    this.navigate('reorder-sections-modal', this._mountData);
  };

  private _onSectionOrderChange = async (e: Event): Promise<void> => {
    const order = (e as CustomEvent).detail as string[];
    if (!Array.isArray(order)) return;
    this._sectionOrder = order;
    if (this._finance.settings) {
      try {
        await this._finance.settings.set('salary-history.sectionOrder', JSON.stringify(order));
      } catch (err) {
        console.error('[salary-history] failed to persist section order:', err);
      }
    }
    this.navigate('payslip-form', this._mountData);
  };

  private _onReorderCancel = (): void => {
    this.navigate('payslip-form', this._mountData);
  };

  // ── Rate events ────────────────────────────────────────────────────

  private _onAddRate = (): void => {
    this._editPaySlip = null;
    this._rateData = null;
    this._rateReadOnly = false;
    this.navigate('rate-row-form', this._mountData);
  };

  private _onRateEditRequest = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    const row = (await this._finance.db
      .table('salary_history_rate_history')
      .findOne({ id })) as Record<string, unknown> | undefined;
    this._editPaySlip = null;
    this._rateData = row ?? null;
    this._rateReadOnly = false;
    this.navigate('rate-row-form', this._mountData);
  };

  private _onRateViewRequest = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    const row = (await this._finance.db
      .table('salary_history_rate_history')
      .findOne({ id })) as Record<string, unknown> | undefined;
    this._editPaySlip = null;
    if (!row) {
      this.navigate('pay-rate-history-view', this._mountData);
      return;
    }
    this._rateData = row;
    this._rateReadOnly = true;
    this.navigate('rate-row-form', this._mountData);
  };

  private _onRateCreate = async (e: Event): Promise<void> => {
    const { input } = (e as CustomEvent).detail as { input: Record<string, unknown> };
    const effectiveTo = input.effective_to === null || input.effective_to === '' ? null : input.effective_to;
    try {
      if (effectiveTo === null) {
        const current = (await this._finance.db
          .table('salary_history_rate_history')
          .findOne({ effective_to: { $isNull: true } })) as Record<string, unknown> | undefined;
        if (current && typeof current.id === 'number') {
          await this._failRateWrite(
            new Error('UNIQUE constraint failed: a current rate already exists'),
            undefined,
          );
          return;
        }
      }
      await this._finance.db.table('salary_history_rate_history').insert(input);
    } catch (err) {
      await this._failRateWrite(err, undefined);
      return;
    }
    this.navigate('pay-rate-history-view', this._mountData);
  };

  private _onRateEdit = async (e: Event): Promise<void> => {
    const { id, input } = (e as CustomEvent).detail as { id: number; input: Record<string, unknown> };
    try {
      await this._finance.db.table('salary_history_rate_history').update(input, { id });
    } catch (err) {
      await this._failRateWrite(err, id);
      return;
    }
    this.navigate('pay-rate-history-view', this._mountData);
  };

  private async _failRateWrite(err: unknown, rateId: number | undefined): Promise<void> {
    console.error('[salary-history] rate write failed:', err);
    const message =
      err instanceof Error && /UNIQUE/i.test(err.message)
        ? 'A current rate (end date empty) already exists. Only one current rate is allowed — edit the existing current rate, or give this row an end date.'
        : 'Could not save the rate. Please try again.';
    this._rateError = message;

    if (rateId !== undefined) {
      const row = (await this._finance.db
        .table('salary_history_rate_history')
        .findOne({ id: rateId })) as Record<string, unknown> | undefined;
      this._rateData = row ?? null;
    } else {
      this._rateData = null;
    }
    this._rateReadOnly = false;

    const live = this._container.querySelector('rate-row-form') as
      | (HTMLElement & { rateError: string | null; rate: unknown; readOnly: boolean })
      | null;
    if (live) {
      live.rateError = message;
      live.rate = this._rateData;
      live.readOnly = false;
    } else {
      this.navigate('rate-row-form', this._mountData);
    }
  }

  private _onRateDeleteRequest = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    const row = (await this._finance.db
      .table('salary_history_rate_history')
      .findOne({ id })) as Record<string, unknown> | undefined;
    if (!row) {
      this.navigate('pay-rate-history-view', this._mountData);
      return;
    }
    this._rateData = row;
    this._rateReadOnly = false;
    this._confirmDelete = true;
    this.navigate('rate-row-form', this._mountData);
  };

  private _onRateDelete = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    try {
      await this._finance.db.table('salary_history_rate_history').delete({ id });
    } catch (err) {
      console.error('[salary-history] rate delete failed:', err);
    }
    this.navigate('pay-rate-history-view', this._mountData);
  };

  private _onRateReplaceRequest = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    const row = (await this._finance.db
      .table('salary_history_rate_history')
      .findOne({ id })) as Record<string, unknown> | undefined;
    if (!row) {
      this.navigate('pay-rate-history-view', this._mountData);
      return;
    }
    this._rateData = row;
    this._rateReadOnly = false;
    this._replaceMode = true;
    this.navigate('rate-row-form', this._mountData);
  };

  private _onRateReplace = async (e: Event): Promise<void> => {
    const { id, input } = (e as CustomEvent).detail as { id: number; input: Record<string, unknown> };
    const effectiveFrom = String(input.effective_from ?? '');
    try {
      await this._finance.db
        .table('salary_history_rate_history')
        .update({ effective_to: effectiveFrom }, { id });
      await this._finance.db.table('salary_history_rate_history').insert(input);
    } catch (err) {
      await this._failRateWrite(err, id);
      return;
    }
    this.navigate('pay-rate-history-view', this._mountData);
  };

  private _onRateCancel = (): void => {
    this.navigate('pay-rate-history-view', this._mountData);
  };

  private _onHostNavigate = (e: Event): void => {
    const { view, mountData } = (e as CustomEvent).detail as { view: string; mountData?: Record<string, unknown> };
    console.log('[salary-history] host-navigate received:', view);
    this.navigate(view, mountData ?? this._mountData);
  };
}
