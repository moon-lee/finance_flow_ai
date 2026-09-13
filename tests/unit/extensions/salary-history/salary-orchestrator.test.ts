// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { SalaryOrchestrator } from '../../../../extensions/salary-history/src/ui/salary-orchestrator';
import '../../../../extensions/salary-history/src/ui/payslip-list';
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

  it('payslip-delete removes the row and refreshes the list', async () => {
    document.body.innerHTML = '';
    const el = makeEl();
    const slips = [
      { id: 1, finance_year: '2025-2026', pay_date: '2026-01-20', gross: 100, net: 80, payg_withholding: 20, superannuation_guarantee: 12, holiday_leave_accrual_hours: 0 },
      { id: 2, finance_year: '2025-2026', pay_date: '2026-02-20', gross: 200, net: 160, payg_withholding: 40, superannuation_guarantee: 24, holiday_leave_accrual_hours: 0 },
    ];
    const finance = makeMockFinance({ paySlips: slips }) as unknown as {
      db: { table: (n: string) => { delete: (q: unknown) => Promise<number> } };
    };
    const origTable = finance.db.table as unknown as (n: string) => { delete: (q: unknown) => Promise<number> };
    let deleted: unknown = null;
    (finance.db as unknown as { table: unknown }).table = (n: string) => {
      const t = origTable(n);
      return {
        ...t,
        find: async () => slips,
        delete: async (q: unknown) => {
          deleted = q;
          const idx = slips.findIndex((s) => s.id === (q as { id: number }).id);
          if (idx >= 0) slips.splice(idx, 1);
          return t.delete(q);
        },
      };
    };
    await el.init(finance as never, {});
    el.dispatchEvent(new CustomEvent('payslip-delete', { detail: { id: 1 }, bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 50));
    expect(deleted).toEqual({ id: 1 });
    expect(el.view).toBe('payslip-list');
    const child = (el as unknown as { renderRoot: ShadowRoot }).renderRoot.querySelector('payslip-list') as unknown as { payslips: { id: number }[] };
    expect(child.payslips.map((p) => p.id)).toEqual([2]);
  });
});
