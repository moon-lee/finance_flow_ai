import { LitElement, css, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { ExtensionLogger } from 'finance-logger';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : (class {} as unknown as typeof LitElement);
const logger = new ExtensionLogger('salary-history');

export type SalaryTag =
  | 'payslip-list'
  | 'pay-rate-history-view'
  | 'payslip-form'
  | 'rate-row-form'
  | 'reorder-sections-modal';

export class SalaryOrchestrator extends Base {
  static override styles = typeof HTMLElement !== 'undefined' ? [sharedStyles, css`#child{flex:1;min-height:0;display:block;overflow:hidden}`] as any : [];
  finance: any = null;
  view: SalaryTag = 'payslip-list';
  mountData: Record<string, unknown> = {};
  error = '';
  sectionOrder: string[] = ['period', 'totals', 'earnings', 'deductions', 'super', 'leave', 'leave-accrual', 'notes'];
  private _returnTo: 'payslip-list' | 'pay-rate-history-view' = 'payslip-list';
  private _editPaySlip: Record<string, unknown> | null = null;
  private _rateData: Record<string, unknown> | null = null;
  private _rateReadOnly = false;
  private _rateError: string | null = null;
  private _confirmDelete = false;
  private _replaceMode = false;
  private _reorderReturn: SalaryTag = 'payslip-form';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.pushFinance();
  }

  async init(f: any, mount: Record<string, unknown> = {}): Promise<void> {
    this.finance = f;
    this.mountData = mount;
    // Target child arrives as mount.view (single-panel mounts) or legacy mount.viewId.
    const v = (mount.view ?? mount.viewId) as string | undefined;
    if (v === 'salary' || v === 'payslip-list' || v === undefined) this.view = 'payslip-list';
    else if (v === 'pay-rate-history-view') this.view = 'pay-rate-history-view';
    else if (v === 'payslip-form') this.view = 'payslip-form';
    else if (v === 'rate-row-form') this.view = 'rate-row-form';
    else if (v === 'reorder-sections-modal') this.view = 'reorder-sections-modal';
    else {
      logger.warn(`unknown salary view "${v}", defaulting to payslip-list`);
      this.view = 'payslip-list';
    }
    try {
      const saved = await f.settings?.get('salary-history.sectionOrder');
      const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
      if (Array.isArray(parsed)) this.sectionOrder = parsed as string[];
    } catch { /* keep default */ }
    this._returnTo = (this.view === 'rate-row-form' || this.view === 'pay-rate-history-view')
      ? 'pay-rate-history-view'
      : 'payslip-list';
    await this.pushFinance();
  }

  navigate(tag: SalaryTag): void {
    this.view = tag;
    (this as any).requestUpdate?.();
    void this.pushFinance();
  }

  private async _refreshList(): Promise<void> {
    try {
      await (this as any).updateComplete;
    } catch { /* non-Lit context */ }
    const c = this.child() as any;
    if (c && typeof c.reload === 'function') {
      try {
        await c.reload();
      } catch (e: any) {
        this.error = String(e?.message || e);
      }
    }
  }

  override connectedCallback(): void {
    (super.connectedCallback as (() => void) | undefined)?.call(this);
    const on = (name: string, handler: EventListener): void => {
      this.addEventListener(name, handler);
    };
    on('payslip-add-request', this._onAddPayslip as unknown as EventListener);
    on('payslip-create', this._onCreatePayslip as unknown as EventListener);
    on('payslip-edit-request', this._onEditRequest as unknown as EventListener);
    on('payslip-edit', this._onEditPayslip as unknown as EventListener);
    on('payslip-cancel', this._onCancelForm as unknown as EventListener);
    on('payslip-delete', this._onDeletePayslip as unknown as EventListener);
    on('reorder-sections', this._onReorderRequest as unknown as EventListener);
    on('section-order-change', this._onSectionOrderChange as unknown as EventListener);
    on('section-order-cancel', this._onReorderCancel as unknown as EventListener);
    on('rate-add-request', this._onAddRate as unknown as EventListener);
    on('rate-edit-request', this._onRateEditRequest as unknown as EventListener);
    on('rate-view-request', this._onRateViewRequest as unknown as EventListener);
    on('rate-create', this._onRateCreate as unknown as EventListener);
    on('rate-edit', this._onRateEdit as unknown as EventListener);
    on('rate-form-cancel', this._onRateCancel as unknown as EventListener);
    on('rate-delete-request', this._onRateDeleteRequest as unknown as EventListener);
    on('rate-delete', this._onRateDelete as unknown as EventListener);
    on('rate-replace-request', this._onRateReplaceRequest as unknown as EventListener);
    on('rate-replace', this._onRateReplace as unknown as EventListener);
    on('host-navigate', this._onHostNavigate as unknown as EventListener);
  }

  override disconnectedCallback(): void {
    const off = (name: string, handler: EventListener): void => {
      this.removeEventListener(name, handler);
    };
    off('payslip-add-request', this._onAddPayslip as unknown as EventListener);
    off('payslip-create', this._onCreatePayslip as unknown as EventListener);
    off('payslip-edit-request', this._onEditRequest as unknown as EventListener);
    off('payslip-edit', this._onEditPayslip as unknown as EventListener);
    off('payslip-cancel', this._onCancelForm as unknown as EventListener);
    off('payslip-delete', this._onDeletePayslip as unknown as EventListener);
    off('reorder-sections', this._onReorderRequest as unknown as EventListener);
    off('section-order-change', this._onSectionOrderChange as unknown as EventListener);
    off('section-order-cancel', this._onReorderCancel as unknown as EventListener);
    off('rate-add-request', this._onAddRate as unknown as EventListener);
    off('rate-edit-request', this._onRateEditRequest as unknown as EventListener);
    off('rate-view-request', this._onRateViewRequest as unknown as EventListener);
    off('rate-create', this._onRateCreate as unknown as EventListener);
    off('rate-edit', this._onRateEdit as unknown as EventListener);
    off('rate-form-cancel', this._onRateCancel as unknown as EventListener);
    off('rate-delete-request', this._onRateDeleteRequest as unknown as EventListener);
    off('rate-delete', this._onRateDelete as unknown as EventListener);
    off('rate-replace-request', this._onRateReplaceRequest as unknown as EventListener);
    off('rate-replace', this._onRateReplace as unknown as EventListener);
    off('host-navigate', this._onHostNavigate as unknown as EventListener);
    (super.disconnectedCallback as (() => void) | undefined)?.call(this);
  }

  private child(): any {
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    return root?.querySelector('#child');
  }

  private async pushFinance(): Promise<void> {
    (this as any).requestUpdate?.();
    try {
      await (this as any).updateComplete;
    } catch { /* non-Lit context */ }
    const c = this.child() as any;
    if (c && this.finance) {
      try {
        if ('sectionOrder' in c) c.sectionOrder = [...this.sectionOrder];
        Object.assign(c, this.mountData);
        c.finance = this.finance;
        if (this.view === 'payslip-form' && this._editPaySlip && 'editPaySlip' in c) c.editPaySlip = this._editPaySlip;
        if (this.view === 'rate-row-form') {
          if ('rate' in c) c.rate = this._rateData;
          if ('readOnly' in c) c.readOnly = this._rateReadOnly;
          if ('rateError' in c) c.rateError = this._rateError;
          if ('confirmDelete' in c) c.confirmDelete = this._confirmDelete;
          if ('replaceMode' in c) c.replaceMode = this._replaceMode;
        }
        this._editPaySlip = null;
        this._rateData = null;
        this._rateReadOnly = false;
        this._rateError = null;
        this._confirmDelete = false;
        this._replaceMode = false;
      } catch { /* child without expected props */ }
      if (typeof c.setFinance === 'function') {
        try {
          await c.setFinance(this.finance);
        } catch (e: any) {
          this.error = String(e?.message || e);
        }
      } else if (typeof c.load === 'function') {
        // payslip-list / pay-rate-history-view expose load(), not setFinance():
        // their connectedCallback fetch is skipped when finance arrives late.
        try {
          await c.load();
        } catch (e: any) {
          this.error = String(e?.message || e);
        }
      } else if (typeof c.loadReferenceData === 'function') {
        // payslip-form exposes loadReferenceData(), not setFinance()/load().
        try {
          await c.loadReferenceData();
        } catch (e: any) {
          this.error = String(e?.message || e);
        }
      }
    }
  }

  // ── Payslip events (ported verbatim from orchestrator.ts:130-330) ─────────────

  private _onAddPayslip = (): void => {
    this._returnTo = 'payslip-list';
    this.navigate('payslip-form');
  };

  private _onCreatePayslip = async (e: Event): Promise<void> => {
    const { input } = (e as CustomEvent).detail as { input: Record<string, unknown> };
    try {
      await this.finance.db.table('salary_history_pay_slips').insert(input);
    } catch (err) {
      logger.error('payslip create failed:', err);
      return;
    }
    this.navigate(this._returnTo);
    await this._refreshList();
  };

  private _onEditRequest = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    const row = (await this.finance.db
      .table('salary_history_pay_slips')
      .findOne({ id })) as Record<string, unknown> | undefined;
    this._returnTo = 'payslip-list';
    this._editPaySlip = row ?? null;
    this.navigate('payslip-form');
  };

  private _onEditPayslip = async (e: Event): Promise<void> => {
    const { id, input } = (e as CustomEvent).detail as { id: number; input: Record<string, unknown> };
    try {
      await this.finance.db.table('salary_history_pay_slips').update({ id }, input);
    } catch (err) {
      logger.error('payslip update failed:', err);
      return;
    }
    this.navigate(this._returnTo);
    await this._refreshList();
  };

  private _onCancelForm = (): void => {
    this.navigate(this._returnTo);
  };

  private _onDeletePayslip = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    try {
      await this.finance.db.table('salary_history_pay_slips').delete({ id });
    } catch (err) {
      logger.error('payslip delete failed:', err);
      return;
    }
    this.navigate(this._returnTo);
    await this._refreshList();
  };

  // ── Section reorder events ─────────────────────────────────────────

  private _onReorderRequest = (): void => {
    this._reorderReturn = 'payslip-form';
    this.navigate('reorder-sections-modal');
  };

  private _onSectionOrderChange = async (e: Event): Promise<void> => {
    const order = (e as CustomEvent).detail as string[];
    if (!Array.isArray(order)) return;
    this.sectionOrder = order;
    if (this.finance.settings) {
      try {
        await this.finance.settings.set('salary-history.sectionOrder', JSON.stringify(order));
      } catch (err) {
        logger.error('failed to persist section order:', err);
      }
    }
    this.navigate(this._reorderReturn);
  };

  private _onReorderCancel = (): void => {
    this.navigate(this._reorderReturn);
  };

  // ── Rate events ────────────────────────────────────────────────────

  private _onAddRate = (): void => {
    this._editPaySlip = null;
    this._rateData = null;
    this._rateReadOnly = false;
    this._returnTo = 'pay-rate-history-view';
    this.navigate('rate-row-form');
  };

  private _onRateEditRequest = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    const row = (await this.finance.db
      .table('salary_history_rate_history')
      .findOne({ id })) as Record<string, unknown> | undefined;
    this._editPaySlip = null;
    this._rateData = row ?? null;
    this._rateReadOnly = false;
    this._returnTo = 'pay-rate-history-view';
    this.navigate('rate-row-form');
  };

  private _onRateViewRequest = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    const row = (await this.finance.db
      .table('salary_history_rate_history')
      .findOne({ id })) as Record<string, unknown> | undefined;
    this._editPaySlip = null;
    this._returnTo = 'pay-rate-history-view';
    if (!row) {
      this.navigate(this._returnTo);
      return;
    }
    this._rateData = row;
    this._rateReadOnly = true;
    this.navigate('rate-row-form');
  };

  private _onRateCreate = async (e: Event): Promise<void> => {
    const { input } = (e as CustomEvent).detail as { input: Record<string, unknown> };
    const effectiveTo = input.effective_to === null || input.effective_to === '' ? null : input.effective_to;
    try {
      if (effectiveTo === null) {
        const current = (await this.finance.db
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
      await this.finance.db.table('salary_history_rate_history').insert(input);
    } catch (err) {
      await this._failRateWrite(err, undefined);
      return;
    }
    this.navigate(this._returnTo);
    await this._refreshList();
  };

  private _onRateEdit = async (e: Event): Promise<void> => {
    const { id, input } = (e as CustomEvent).detail as { id: number; input: Record<string, unknown> };
    try {
      await this.finance.db.table('salary_history_rate_history').update({ id }, input);
    } catch (err) {
      await this._failRateWrite(err, id);
      return;
    }
    this.navigate(this._returnTo);
    await this._refreshList();
  };

  private async _failRateWrite(err: unknown, rateId: number | undefined): Promise<void> {
    logger.error('rate write failed:', err);
    const message =
      err instanceof Error && /UNIQUE/i.test(err.message)
        ? 'A current rate (end date empty) already exists. Only one current rate is allowed — edit the existing current rate, or give this row an end date.'
        : 'Could not save the rate. Please try again.';
    this._rateError = message;

    if (rateId !== undefined) {
      const row = (await this.finance.db
        .table('salary_history_rate_history')
        .findOne({ id: rateId })) as Record<string, unknown> | undefined;
      this._rateData = row ?? null;
    } else {
      this._rateData = null;
    }
    this._rateReadOnly = false;

    const root = (this as any).renderRoot as ShadowRoot | undefined;
    const live = root?.querySelector('rate-row-form') as
      | (HTMLElement & { rateError: string | null; rate: unknown; readOnly: boolean })
      | null
      | undefined;
    if (live) {
      live.rateError = message;
      live.rate = this._rateData;
      live.readOnly = false;
    } else {
      this.navigate('rate-row-form');
    }
  }

  private _onRateDeleteRequest = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    const row = (await this.finance.db
      .table('salary_history_rate_history')
      .findOne({ id })) as Record<string, unknown> | undefined;
    this._returnTo = 'pay-rate-history-view';
    if (!row) {
      this.navigate(this._returnTo);
      return;
    }
    this._rateData = row;
    this._rateReadOnly = false;
    this._confirmDelete = true;
    this.navigate('rate-row-form');
  };

  private _onRateDelete = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    try {
      await this.finance.db.table('salary_history_rate_history').delete({ id });
    } catch (err) {
      logger.error('rate delete failed:', err);
    }
    this.navigate(this._returnTo);
    await this._refreshList();
  };

  private _onRateReplaceRequest = async (e: Event): Promise<void> => {
    const { id } = (e as CustomEvent).detail as { id: number };
    const row = (await this.finance.db
      .table('salary_history_rate_history')
      .findOne({ id })) as Record<string, unknown> | undefined;
    this._returnTo = 'pay-rate-history-view';
    if (!row) {
      this.navigate(this._returnTo);
      return;
    }
    this._rateData = row;
    this._rateReadOnly = false;
    this._replaceMode = true;
    this.navigate('rate-row-form');
  };

  private _onRateReplace = async (e: Event): Promise<void> => {
    const { id, input } = (e as CustomEvent).detail as { id: number; input: Record<string, unknown> };
    const effectiveFrom = String(input.effective_from ?? '');
    try {
      await this.finance.db
        .table('salary_history_rate_history')
        .update({ id }, { effective_to: effectiveFrom });
      await this.finance.db.table('salary_history_rate_history').insert(input);
    } catch (err) {
      await this._failRateWrite(err, id);
      return;
    }
    this.navigate(this._returnTo);
    await this._refreshList();
  };

  private _onRateCancel = (): void => {
    this.navigate(this._returnTo);
  };

  private _onHostNavigate = (e: Event): void => {
    const { view, mountData } = (e as CustomEvent).detail as { view: string; mountData?: Record<string, unknown> };
    logger.info('host-navigate received:', view);
    void this.init(this.finance, { view, ...(mountData ?? {}) });
  };

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      ${this.error ? html`<div class="view-container"><div class="view-container-inner"><p class="field-error">Error: ${this.error}</p></div></div>` : ''}
      ${this.view === 'payslip-list' ? html`<payslip-list id="child"></payslip-list>` : ''}
      ${this.view === 'pay-rate-history-view' ? html`<pay-rate-history-view id="child"></pay-rate-history-view>` : ''}
      ${this.view === 'payslip-form' ? html`<payslip-form id="child"></payslip-form>` : ''}
      ${this.view === 'rate-row-form' ? html`<rate-row-form id="child"></rate-row-form>` : ''}
      ${this.view === 'reorder-sections-modal' ? html`<reorder-sections-modal id="child"></reorder-sections-modal>` : ''}
    `;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('salary-orchestrator')) {
  customElements.define('salary-orchestrator', SalaryOrchestrator as unknown as CustomElementConstructor);
}
