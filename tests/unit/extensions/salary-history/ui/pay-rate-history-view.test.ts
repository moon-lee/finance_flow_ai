// @vitest-environment happy-dom
/**
 * Tests for `extensions/salary-history/src/ui/pay-rate-history-view.ts` (Phase 4 Task 11.4).
 *
 * 4 tests: renders the rate rows sorted DESC, marks the open-ended row
 * as Current, the Add button dispatches `rate-add-request`, and a
 * history row exposes a View action while the current row exposes Edit.
 */

import { describe, expect, it } from 'vitest';
import '../../../../../extensions/salary-history/src/ui/pay-rate-history-view';
import type { RateRow } from '../../../../../extensions/salary-history/src/dao/pay-rate-history';
import type { UiEl } from './test-types';

interface RateViewEl extends UiEl {
  rates: RateRow[];
}

function makeEl(): RateViewEl {
  const el = document.createElement('pay-rate-history-view') as unknown as RateViewEl;
  document.body.appendChild(el as unknown as Node);
  return el;
}

const RATES: RateRow[] = [
  {
    id: 1,
    effective_from: '2024-07-01',
    effective_to: '2025-06-30',
    base_hourly_rate: 38,
    standard_hours_per_week: 38,
    shift_allowance_multiplier: 0.15,
    shift_allowance_hours_per_week: 38,
    overtime_1_5_multiplier: 1.5,
    overtime_2_0_multiplier: 2.0,
    superannuation_rate: 0.11,
    holiday_leave_loading_rate: 0.175,
    accrual_rate_per_week: 2.92,
    starting_holiday_leave_balance: 0,
    notes: null,
  },
  {
    id: 2,
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
    starting_holiday_leave_balance: 20,
    notes: null,
  },
];

describe('PayRateHistoryView (Task 11.4)', () => {
  // The component renders rows in the order provided (load() sorts DESC
  // from the DB); feed a DESC-sorted copy so the newest rate is first.
  const DESC = RATES.slice().sort((a, b) =>
    a.effective_from < b.effective_from ? 1 : a.effective_from > b.effective_from ? -1 : 0,
  );

  it('renders rate rows sorted effective_from DESC', async () => {
    const el = makeEl();
    el.rates = DESC;
    await el.updateComplete;
    const rows = Array.from(el.shadowRoot.querySelectorAll('[data-testid="rate-row"]'));
    expect(rows.length).toBe(2);
    expect((rows[0] as HTMLElement).getAttribute('data-id')).toBe('2');
  });

  it('marks the open-ended row as Current', async () => {
    const el = makeEl();
    el.rates = DESC;
    await el.updateComplete;
    const badge = el.shadowRoot.querySelector('[data-testid="rate-badge"]');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('Current');
    const currentRow = badge.closest('[data-testid="rate-row"]') as HTMLElement;
    expect(currentRow.getAttribute('data-id')).toBe('2');
  });

  it('Add button dispatches rate-add-request', async () => {
    const el = makeEl();
    el.rates = RATES;
    await el.updateComplete;
    let fired = false;
    el.addEventListener('rate-add-request', () => {
      fired = true;
    });
    el.shadowRoot.querySelector('[data-testid="add-rate"]').click();
    expect(fired).toBe(true);
  });

  it('history row exposes View, current row exposes Edit', async () => {
    const el = makeEl();
    el.rates = RATES;
    await el.updateComplete;
    const historyRow = el.shadowRoot.querySelector('[data-id="1"]') as HTMLElement;
    const currentRow = el.shadowRoot.querySelector('[data-id="2"]') as HTMLElement;
    expect(historyRow.querySelector('[data-testid="rate-view"]')).toBeTruthy();
    expect(currentRow.querySelector('[data-testid="rate-edit"]')).toBeTruthy();

    let viewId: unknown = null;
    el.addEventListener('rate-view-request', (e: Event) => {
      viewId = (e as CustomEvent).detail.id;
    });
    (historyRow.querySelector('[data-testid="rate-view"]') as HTMLElement).click();
    expect(viewId).toBe(1);
  });
});
