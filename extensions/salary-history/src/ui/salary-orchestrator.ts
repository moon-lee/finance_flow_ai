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
    await this.pushFinance();
  }

  navigate(tag: SalaryTag): void {
    this.view = tag;
    (this as any).requestUpdate?.();
    void this.pushFinance();
  }

  private child(): any {
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    return root?.querySelector('#child');
  }

  private async pushFinance(): Promise<void> {
    (this as any).requestUpdate?.();
    await Promise.resolve();
    const c = this.child() as any;
    if (c && this.finance) {
      try {
        if ('sectionOrder' in c) c.sectionOrder = [...this.sectionOrder];
        Object.assign(c, this.mountData);
        c.finance = this.finance;
      } catch { /* child without expected props */ }
      if (typeof c.setFinance === 'function') {
        try {
          await c.setFinance(this.finance);
        } catch (e: any) {
          this.error = String(e?.message || e);
        }
      }
    }
  }

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
