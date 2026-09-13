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
});
