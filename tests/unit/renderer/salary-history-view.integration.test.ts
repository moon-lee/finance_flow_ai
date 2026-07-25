// @vitest-environment happy-dom
/**
 * Integration regression test for the salary-history Orchestrator.
 * Reproduces the double-mount bug: clicking "Edit" on a rate row must open
 * `rate-row-form` pre-filled from the stored row (not a blank add form).
 *
 * The UI custom elements are registered from source; the Orchestrator
 * manages navigation and DAO access directly.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { PayRateHistoryView } from '../../../extensions/salary-history/src/ui/pay-rate-history-view';
import { RateRowForm } from '../../../extensions/salary-history/src/ui/rate-row-form';
import { Orchestrator } from '../../../extensions/salary-history/src/orchestrator';

const ROW = {
  id: 5,
  effective_from: '2025-07-01',
  effective_to: null,
  base_hourly_rate: 40,
  standard_hours_per_week: 38,
  shift_allowance_multiplier: 0.15,
  shift_allowance_hours_per_week: 38,
  overtime_1_5_multiplier: 1.5,
  overtime_2_0_multiplier: 2.0,
  superannuation_rate: 0.12,
  holiday_leave_loading_rate: 0.175,
  accrual_rate_per_week: 2.92,
  notes: null,
};

function tick(ms = 30): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(pred: () => boolean, timeoutMs = 3000, step = 10): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await tick(step);
  }
}

function createMockFinance() {
  const store = { salary_history_rate_history: [ROW] };
  return {
    db: {
      table: (name: string) => ({
        find: async () => ((store as Record<string, unknown[]>)[name] ?? []),
        findOne: async (query: Record<string, unknown>) => {
          const rows = (store as Record<string, unknown[]>)[name] ?? [];
          return rows.find((x) => (x as { id: number }).id === query.id) ?? null;
        },
        count: async () => 0,
        insert: async () => ({}),
        update: async () => 1,
        delete: async () => 1,
      }),
    },
    settings: { get: async () => undefined, set: async () => {} },
    commands: { registerCommand: () => {}, execute: async () => null },
  } as unknown as import('finance').FinanceApi;
}

describe('salary-history Orchestrator', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    if (!customElements.get('pay-rate-history-view')) customElements.define('pay-rate-history-view', PayRateHistoryView);
    if (!customElements.get('rate-row-form')) customElements.define('rate-row-form', RateRowForm);
    container = document.createElement('div');
    document.body.appendChild(container);
    (window as unknown as { financeShell: unknown }).financeShell = {
      accounts: { create: async () => ({ id: 1 }) },
      extensions: {
        list: async () => ({ views: [], commands: [] }),
        readTable: async () => ({ rows: [] }),
        writeTable: async () => ({ affected: 1, row: null }),
      },
      settings: { get: async () => undefined, set: async () => {} },
    };
  });

  it('edit opens rate-row-form pre-filled from the stored row', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const finance = createMockFinance();
    const orch = new Orchestrator(finance, container, {});
    await orch.init();

    // Start on the rate history view.
    const view = document.createElement('pay-rate-history-view');
    container.replaceChildren(view);
    await waitFor(() => (view as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot?.querySelector('[data-testid]') !== null, 3000);

    // Simulate the edit button click by dispatching the event.
    container.dispatchEvent(new CustomEvent('rate-edit-request', {
      detail: { id: ROW.id },
      bubbles: true,
      composed: true,
    }));

    // Orchestrator fetches the row and mounts rate-row-form.
    await waitFor(() => {
      const child = container.firstElementChild;
      return child !== null && child.localName === 'rate-row-form';
    }, 3000);

    const form = container.firstElementChild as HTMLElement;
    const shadow = form.shadowRoot as ShadowRoot;
    const input = shadow.querySelector('[data-testid="input-base_hourly_rate"]') as HTMLInputElement | null;
    expect(input, 'base_hourly_rate input present').toBeTruthy();
    expect(input!.value, 'edit form pre-fills base_hourly_rate').toBe('40');
    const title = shadow.querySelector('[data-testid="rate-form-title"]');
    expect(title?.textContent?.trim(), 'edit mode title is Update Rate').toBe('Update Rate');
    const submit = shadow.querySelector('[data-testid="rate-submit"]');
    expect(submit?.textContent?.trim(), 'edit mode submit button is Update Rate').toBe('Update Rate');
    expect(errSpy.mock.calls.length, 'no mount errors').toBe(0);
    errSpy.mockRestore();
    orch.destroy();
  });
});
