// @vitest-environment happy-dom
/**
 * Regression tests for the DashboardOrchestrator mount path.
 *
 * Phase 7 bug: after reordering cards, the pay-backed dashboard cards
 * (YTD salary, last payslip) lost their data. Root cause: `_mountChild`
 * always re-ran `buildAggregator(this._finance, settings)` when mounting
 * `dashboard-view`. In the panel renderer `finance.services.invoke` is a
 * noop that resolves null (panel-bootstrap.ts), so the rebuilt aggregator
 * had nulls for every pay-backed card. The host-computed aggregator shipped
 * as mountData was discarded. This suite pins the fix: mountData's
 * `aggregator` wins over a locally rebuilt one.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DashboardOrchestrator } from '../../../../extensions/dashboard/src/orchestrator';
import '../../../../extensions/dashboard/src/ui/dashboard-view';
import '../../../../extensions/dashboard/src/ui/reorder-cards-modal';
import type { FinanceApi } from 'finance';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

/** Panel-style finance: db reads work, services.invoke resolves null. */
function makePanelFinance(accounts: Array<Record<string, unknown>> = []): FinanceApi {
  return {
    db: {
      table: vi.fn().mockReturnValue({ find: vi.fn().mockResolvedValue(accounts) }),
    },
    services: {
      register: vi.fn(),
      unregister: vi.fn(),
      invoke: vi.fn().mockResolvedValue(null),
    },
    commands: { registerCommand: vi.fn(), execute: vi.fn().mockResolvedValue(null) },
    ai: { registerTool: vi.fn() },
    settings: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    },
    ui: {},
  } as unknown as FinanceApi;
}

/** Panel-style finance with FY settings backed by a simple map. */
function makeFyFinance(fyValues: Record<string, string>): FinanceApi {
  const base = makePanelFinance();
  const get = vi.fn().mockImplementation(async (key: string) => fyValues[key]);
  return { ...base, settings: { ...base.settings, get } } as unknown as FinanceApi;
}

const HOST_AGGREGATOR = {
  netWorth: {
    totalBalance: 20000,
    totalNetPayLast12Months: 4500,
    currency: 'AUD',
  },
  ytdSalary: {
    summary: {
      gross: 60000,
      net: 45000,
      payg: 12000,
      superannuation_guarantee: 6000,
      count: 12,
      shift_allowance: 0,
      overtime_1_5x: 0,
      overtime_2_0x: 0,
      personal_leave: 0,
      holiday_leave_loading: 0,
      holiday_pay: 0,
      public_holiday: 0,
    },
    currentRate: {
      base_hourly_rate: 50,
      standard_hours_per_week: 38,
      shift_allowance_multiplier: 0,
      effective_from: '2026-01-01',
    },
    financialYearStart: '07-01',
  },
  lastPayslip: {
    id: 42,
    pay_date: '2026-07-15',
    gross: 6000,
    net: 4500,
    currency: 'AUD',
    account_id: 1,
  },
  accountsSummary: {
    count: 2,
    accounts: [
      { id: 1, name: 'Checking', institution: null },
      { id: 2, name: 'Savings', institution: null },
    ],
    totalBalance: 20000,
  },
};

describe('DashboardOrchestrator mount data', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers the host-computed aggregator from mountData over a local rebuild', async () => {
    const container = makeContainer();
    const orch = new DashboardOrchestrator(makePanelFinance(), container, {
      aggregator: HOST_AGGREGATOR,
      cardOrder: ['net-worth', 'ytd-salary', 'last-payslip', 'accounts-summary'],
    });
    await orch.init();

    await vi.waitFor(() => {
      const view = container.firstElementChild as HTMLElement & {
        aggregator: unknown;
      };
      expect(view.tagName.toLowerCase()).toBe('dashboard-view');
      expect(view.aggregator).toEqual(HOST_AGGREGATOR);
    });
  });

  it('keeps the host aggregator after a card order change remount', async () => {
    const container = makeContainer();
    const orch = new DashboardOrchestrator(makePanelFinance(), container, {
      aggregator: HOST_AGGREGATOR,
      cardOrder: ['net-worth', 'ytd-salary', 'last-payslip', 'accounts-summary'],
    });
    await orch.init();

    container.dispatchEvent(
      new CustomEvent('card-order-change', {
        detail: ['last-payslip', 'net-worth', 'ytd-salary', 'accounts-summary'],
        bubbles: true,
        composed: true,
      }),
    );
    await vi.waitFor(() => {
      const view = container.firstElementChild as HTMLElement & {
        aggregator: unknown;
      };
      expect(view.tagName.toLowerCase()).toBe('dashboard-view');
      expect(view.aggregator).toEqual(HOST_AGGREGATOR);
    });
  });

  it('falls back to a local aggregator rebuild when mountData has none', async () => {
    const container = makeContainer();
    const orch = new DashboardOrchestrator(makePanelFinance([{ id: 1, balance: 1000 }]), container, {
      cardOrder: ['net-worth', 'ytd-salary', 'last-payslip', 'accounts-summary'],
    });
    await orch.init();

    await vi.waitFor(() => {
      const view = container.firstElementChild as HTMLElement & {
        aggregator: { netWorth: { totalBalance: number | null } };
      };
      expect(view.tagName.toLowerCase()).toBe('dashboard-view');
      expect(view.aggregator.netWorth.totalBalance).toBe(1000);
    });
  });

  it('forwards financialYearStart and financeYear settings to the view', async () => {
    const container = makeContainer();
    const orch = new DashboardOrchestrator(
      makeFyFinance({
        'dashboard.financialYearStart': '01-01',
        'dashboard.financeYear': '2025-26',
      }),
      container,
      {
        cardOrder: ['net-worth', 'ytd-salary', 'last-payslip', 'accounts-summary'],
      },
    );
    await orch.init();

    await vi.waitFor(() => {
      const view = container.firstElementChild as HTMLElement & {
        financialYearStart: string;
        financeYear: string;
      };
      expect(view.tagName.toLowerCase()).toBe('dashboard-view');
      expect(view.financialYearStart).toBe('01-01');
      expect(view.financeYear).toBe('2025-26');
    });
  });

  it('passes empty financeYear to the view when no override is set', async () => {
    const container = makeContainer();
    const orch = new DashboardOrchestrator(makePanelFinance(), container, {
      cardOrder: ['net-worth', 'ytd-salary', 'last-payslip', 'accounts-summary'],
    });
    await orch.init();

    await vi.waitFor(() => {
      const view = container.firstElementChild as HTMLElement & {
        financeYear: string;
      };
      expect(view.tagName.toLowerCase()).toBe('dashboard-view');
      expect(view.financeYear).toBe('');
    });
  });
});
