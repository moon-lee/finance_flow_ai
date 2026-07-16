// @vitest-environment happy-dom
/**
 * Integration regression test for the salary-history navigation orchestrator.
 * Reproduces the double-mount bug: clicking "Edit" on a rate row must open
 * `rate-row-form` pre-filled from the stored row (not a blank add form).
 *
 * The UI custom elements are registered from source; `bundleUrl` points at a
 * local no-op `registerUIComponents` module so the orchestrator's real
 * `mountChild` runs without pulling in the fragile pre-built bundle.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PayRateHistoryView } from '../../../extensions/salary-history/src/ui/pay-rate-history-view';
import { RateRowForm } from '../../../extensions/salary-history/src/ui/rate-row-form';
import { PayslipForm } from '../../../extensions/salary-history/src/ui/payslip-form';
import { SalaryHistoryView } from '../../../src/renderer/components/salary-history-view';

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

const NOOP_BUNDLE = pathToFileURL(path.resolve('tests/unit/renderer/noop-bundle.mjs')).href;

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

describe('salary-history-view orchestrator', () => {
  beforeEach(() => {
    // In the real renderer these elements are registered by the host bundle's
    // `registerUIComponents()`. The test environment registers them directly
    // so the orchestrator's dynamic-import mount path can be exercised without
    // the pre-built bundle.
    if (!customElements.get('salary-history-view')) customElements.define('salary-history-view', SalaryHistoryView);
    if (!customElements.get('pay-rate-history-view')) customElements.define('pay-rate-history-view', PayRateHistoryView);
    if (!customElements.get('rate-row-form')) customElements.define('rate-row-form', RateRowForm);
    const store = { salary_history_rate_history: [ROW] };
    (window as unknown as { financeShell: unknown }).financeShell = {
      extensions: {
        readTable: async ({ table, op, query }: { table: string; op: string; query: { id: number } }) => {
          const rows = (store as Record<string, unknown[]>)[table] ?? [];
          if (op === 'find') return { rows };
          if (op === 'findOne') {
            const r = rows.find((x) => (x as { id: number }).id === query.id) ?? null;
            return { row: r };
          }
          return { rows: [] };
        },
        writeTable: async () => ({ affected: 1, row: null }),
        list: async () => ({ views: [], commands: [] }),
        onUiMount: () => {},
      },
      settings: { get: async () => undefined, set: async () => {} },
    };
  });

  it('edit opens rate-row-form pre-filled from the stored row', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = document.createElement('salary-history-view') as SalaryHistoryView;
    (view as unknown as { extensionId: string }).extensionId = 'salary-history';
    (view as unknown as { bundleUrl: string }).bundleUrl = NOOP_BUNDLE;
    (view as unknown as { componentTag: string }).componentTag = 'pay-rate-history-view';
    (view as unknown as { mountData: Record<string, unknown> }).mountData = {};
    document.body.appendChild(view as unknown as Node);

    // Wait for the orchestrator to mount the list child (mounting is async:
    // updated() → mountChild() → dynamic import() → appendChild).
    await waitFor(() => view.querySelector('[data-ext-root]') !== null, 3000);
    const list = view.querySelector('[data-ext-root]') as HTMLElement;
    expect(list.localName, 'list is pay-rate-history-view').toBe('pay-rate-history-view');

    // Drive the edit flow the way the list's Edit button does: dispatch the
    // event the orchestrator listens for. (Avoids depending on the list's
    // async row rendering in the test environment.)
    list.dispatchEvent(new CustomEvent('rate-edit-request', {
      detail: { id: ROW.id },
      bubbles: true,
      composed: true,
    }));

    // Orchestrator fetches the row and mounts rate-row-form.
    await waitFor(() => {
      const root = view.querySelector('[data-ext-root]');
      return root !== null && root.localName === 'rate-row-form';
    }, 3000);

    const form = view.querySelector('[data-ext-root]') as HTMLElement;
    const input = (form.shadowRoot as ShadowRoot).querySelector('[data-testid="input-base_hourly_rate"]') as HTMLInputElement | null;
    expect(input, 'base_hourly_rate input present').toBeTruthy();
    expect(input!.value, 'edit form pre-fills base_hourly_rate').toBe('40');
    const title = (form.shadowRoot as ShadowRoot).querySelector('[data-testid="rate-form-title"]');
    expect(title?.textContent?.trim(), 'edit mode title is Update Rate').toBe('Update Rate');
    const submit = (form.shadowRoot as ShadowRoot).querySelector('[data-testid="rate-submit"]');
    expect(submit?.textContent?.trim(), 'edit mode submit button is Update Rate').toBe('Update Rate');
    expect(errSpy.mock.calls.length, 'no mount errors').toBe(0);
    errSpy.mockRestore();
  });
});
