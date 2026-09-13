// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { SalaryOrchestrator } from '../../../../extensions/salary-history/src/ui/salary-orchestrator';
import { makeMockFinance } from './ui/mock-finance';

function makeEl(): SalaryOrchestrator {
  const el = document.createElement('salary-orchestrator') as unknown as SalaryOrchestrator;
  document.body.appendChild(el as unknown as Node);
  return el;
}

describe('salary-orchestrator', () => {
  it('defines the salary-orchestrator element', () => {
    expect(customElements.get('salary-orchestrator')).toBe(SalaryOrchestrator as unknown as CustomElementConstructor);
  });

  it('defaults to payslip-list when mount has no view', async () => {
    document.body.innerHTML = '';
    const el = makeEl();
    await el.init(makeMockFinance(), {});
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(el.view).toBe('payslip-list');
  });

  it('honours mount.view pay-rate-history-view', async () => {
    document.body.innerHTML = '';
    const el = makeEl();
    await el.init(makeMockFinance(), { view: 'pay-rate-history-view' });
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(el.view).toBe('pay-rate-history-view');
  });

  it('payslip-create inserts then returns to payslip-list', async () => {
    document.body.innerHTML = '';
    const el = makeEl();
    const finance = makeMockFinance() as unknown as {
      db: { table: (n: string) => { insert: (p: unknown) => Promise<unknown> } };
    };
    let inserted: unknown = null;
    const origTable = (finance.db.table as unknown as (n: string) => unknown);
    (finance.db as unknown as { table: unknown }).table = (n: string) => {
      const t = origTable(n) as { insert: (p: unknown) => Promise<unknown> };
      return {
        ...t,
        insert: async (p: unknown) => {
          inserted = p;
          return t.insert(p);
        },
      };
    };
    await el.init(finance as never, { view: 'payslip-form' });
    expect(el.view).toBe('payslip-form');
    el.dispatchEvent(new CustomEvent('payslip-create', { detail: { input: { gross: 100 } }, bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(inserted).toMatchObject({ gross: 100 });
    expect(el.view).toBe('payslip-list');
  });

  it('rate-form-cancel returns to pay-rate-history-view', async () => {
    document.body.innerHTML = '';
    const el = makeEl();
    await el.init(makeMockFinance(), { view: 'rate-row-form' });
    el.dispatchEvent(new CustomEvent('rate-form-cancel', { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(el.view).toBe('pay-rate-history-view');
  });

  it('has no legacy plain-class orchestrator module', async () => {
    const fs = await import('node:fs');
    expect(fs.existsSync('extensions/salary-history/src/orchestrator.ts')).toBe(false);
  });
});
