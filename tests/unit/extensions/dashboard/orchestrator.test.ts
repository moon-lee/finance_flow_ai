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

/** Panel-style finance: services.invoke resolves null. */
function makePanelFinance(): FinanceApi {
  return {
    db: {
      table: vi.fn().mockReturnValue({ find: vi.fn().mockResolvedValue([]) }),
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
  ytdSalary: {
    summary: {
      gross: 60000,
      net: 45000,
      payg: 12000,
      count: 12,
    },
    financialYearStart: '07-01',
  },
  todos: {
    total: 5,
    active: 2,
    done: 3,
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
      cardOrder: ['pay-summary', 'todo-summary'],
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
      cardOrder: ['pay-summary', 'todo-summary'],
    });
    await orch.init();

    container.dispatchEvent(
      new CustomEvent('card-order-change', {
        detail: ['todo-summary', 'pay-summary'],
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
    const orch = new DashboardOrchestrator(makePanelFinance(), container, {
      cardOrder: ['pay-summary', 'todo-summary'],
    });
    await orch.init();

    await vi.waitFor(() => {
      const view = container.firstElementChild as HTMLElement & {
        aggregator: { ytdSalary: { summary: unknown }; todos: unknown };
      };
      expect(view.tagName.toLowerCase()).toBe('dashboard-view');
      // Panel invoke resolves null → both cards degrade to null placeholders.
      expect(view.aggregator.ytdSalary.summary).toBeNull();
      expect(view.aggregator.todos).toEqual({ total: null, active: null, done: null });
    });
  });

  it('forwards financialYearStart and financialYearCurrent settings to the view', async () => {
    const container = makeContainer();
    const orch = new DashboardOrchestrator(
      makeFyFinance({
        'core.financialYear.start': '01-01',
        'core.financialYear.current': '2025-2026',
      }),
      container,
      {
        cardOrder: ['pay-summary', 'todo-summary'],
      },
    );
    await orch.init();

    await vi.waitFor(() => {
      const view = container.firstElementChild as HTMLElement & {
        financialYearStart: string;
        financialYearCurrent: string;
      };
      expect(view.tagName.toLowerCase()).toBe('dashboard-view');
      expect(view.financialYearStart).toBe('01-01');
      expect(view.financialYearCurrent).toBe('2025-2026');
    });
  });

  it('passes empty financialYearCurrent to the view when no override is set', async () => {
    const container = makeContainer();
    const orch = new DashboardOrchestrator(makePanelFinance(), container, {
      cardOrder: ['pay-summary', 'todo-summary'],
    });
    await orch.init();

    await vi.waitFor(() => {
      const view = container.firstElementChild as HTMLElement & {
        financialYearCurrent: string;
      };
      expect(view.tagName.toLowerCase()).toBe('dashboard-view');
      expect(view.financialYearCurrent).toBe('');
    });
  });

  it('pay-summary card points at the single salary view', async () => {
    const container = makeContainer();
    const orch = new DashboardOrchestrator(makePanelFinance(), container, {});
    const sources = (
      orch as unknown as {
        _CARD_SOURCES?: Record<string, { viewId: string; commandId: string }>;
      }
    )._CARD_SOURCES;
    expect(sources?.['pay-summary']?.viewId).toBe('salary');
    expect(sources?.['pay-summary']?.commandId).toBe('salary.show-pay-history');
  });
});
