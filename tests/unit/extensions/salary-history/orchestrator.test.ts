// @vitest-environment happy-dom
/**
 * Phase 5 fix — first-run account seed view.
 *
 * Regression coverage for the seed-modal trigger removed by commit 01ecefb:
 * when the Core-owned `accounts` table is empty, opening the salary-history
 * panel (default `payslip-list` view) must instead mount `accounts-seed-modal`.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Orchestrator } from '../../../../extensions/salary-history/src/orchestrator';
import { makeMockFinance } from './ui/mock-finance';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function setFinanceShell(count: number): void {
  (window as unknown as { financeShell: unknown }).financeShell = {
    accounts: {
      count: vi.fn().mockResolvedValue({ count }),
      create: vi.fn().mockResolvedValue({ id: 1 }),
    },
  };
}

describe('salary-history Orchestrator first-run seed view', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (window as unknown as { financeShell: unknown }).financeShell = undefined;
  });

  it('mounts accounts-seed-modal when the accounts table is empty', async () => {
    setFinanceShell(0);
    const container = makeContainer();
    const orch = new Orchestrator(makeMockFinance(), container, {});
    await orch.init();
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe('accounts-seed-modal');
  });

  it('mounts payslip-list when the accounts table already has rows', async () => {
    setFinanceShell(2);
    const container = makeContainer();
    const orch = new Orchestrator(makeMockFinance(), container, {});
    await orch.init();
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe('payslip-list');
  });

  it('falls back to payslip-list when accounts.count is unavailable', async () => {
    (window as unknown as { financeShell: unknown }).financeShell = { accounts: {} };
    const container = makeContainer();
    const orch = new Orchestrator(makeMockFinance(), container, {});
    await orch.init();
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe('payslip-list');
  });

  it('honours an explicit viewId and skips the seed check', async () => {
    setFinanceShell(0);
    const container = makeContainer();
    const orch = new Orchestrator(makeMockFinance(), container, { viewId: 'pay-rate-history-view' });
    await orch.init();
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe('pay-rate-history-view');
  });

  it('creates the account exactly once from a single account-create event', async () => {
    const create = vi.fn().mockResolvedValue({ id: 1 });
    (window as unknown as { financeShell: unknown }).financeShell = {
      accounts: { count: vi.fn().mockResolvedValue({ count: 0 }), create },
    };
    const container = makeContainer();
    const orch = new Orchestrator(makeMockFinance(), container, {});
    await orch.init();

    container.dispatchEvent(
      new CustomEvent('account-create', {
        detail: { name: 'Primary Salary', institution: null },
        bubbles: true,
        composed: true,
      }),
    );

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith({ name: 'Primary Salary', institution: null });
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe('payslip-form');
  });
});
