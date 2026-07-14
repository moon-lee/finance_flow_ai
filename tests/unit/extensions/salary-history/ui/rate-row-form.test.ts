// @vitest-environment happy-dom
/**
 * Tests for `extensions/salary-history/src/ui/rate-row-form.ts` (Phase 4 Task 11.5).
 *
 * 3 tests: renders a confirm panel with the rate summary first, invalid
 * input surfaces validation errors, and a valid submit dispatches
 * `rate-create` (Decision 11: confirm panel first).
 */

import { describe, expect, it } from 'vitest';
import '../../../../../extensions/salary-history/src/ui/rate-row-form';
import type { RateRow } from '../../../../../extensions/salary-history/src/dao/pay-rate-history';
import type { UiEl } from './test-types';

interface RateFormEl extends UiEl {
  rate: RateRow | null;
  _values: { fields: Record<string, string> };
  _errors: readonly string[];
  _onSubmit(e: Event): void;
}

function makeEl(): RateFormEl {
  const el = document.createElement('rate-row-form') as unknown as RateFormEl;
  document.body.appendChild(el as unknown as Node);
  return el;
}

const CURRENT: RateRow = {
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
};

describe('RateRowForm (Task 11.5)', () => {
  it('shows a confirm panel before the form fields', async () => {
    const el = makeEl();
    el.rate = CURRENT;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[data-testid="confirm-add"]')).toBeTruthy();
    expect(el.shadowRoot.querySelector('[data-testid="rate-submit"]')).toBeFalsy();
    expect(el.shadowRoot.querySelector('[data-testid="confirm-panel"]').textContent).toContain('40');
  });

  it('invalid input surfaces validation errors and blocks dispatch', async () => {
    const el = makeEl();
    el.rate = CURRENT;
    await el.updateComplete;
    el.shadowRoot.querySelector('[data-testid="confirm-add"]').click();
    await el.updateComplete;

    el._values.fields.base_hourly_rate = 'not-a-number';
    await el.updateComplete;

    let fired = false;
    el.addEventListener('rate-create', () => {
      fired = true;
    });
    el._onSubmit(new Event('submit'));
    await el.updateComplete;
    expect(fired).toBe(false);
    expect(el._errors.length).toBeGreaterThan(0);
  });

  it('valid submit dispatches rate-edit with numeric fields (edit mode)', async () => {
    const el = makeEl();
    el.rate = CURRENT;
    await el.updateComplete;
    el.shadowRoot.querySelector('[data-testid="confirm-add"]').click();
    await el.updateComplete;

    let captured: unknown = null;
    el.addEventListener('rate-edit', (e: Event) => {
      captured = (e as CustomEvent).detail;
    });
    el._onSubmit(new Event('submit'));
    await el.updateComplete;
    expect(captured).toBeTruthy();
    const detail = captured as { id: number; input: { base_hourly_rate: number; superannuation_rate: number } };
    expect(detail.id).toBe(2);
    expect(detail.input.base_hourly_rate).toBe(40);
    expect(detail.input.superannuation_rate).toBe(0.12);
  });

  it('fresh add (no current rate) dispatches rate-create', async () => {
    const el = makeEl();
    el.rate = null;
    await el.updateComplete;
    el.shadowRoot.querySelector('[data-testid="confirm-add"]').click();
    await el.updateComplete;

    let fired = false;
    el.addEventListener('rate-create', () => {
      fired = true;
    });
    el._onSubmit(new Event('submit'));
    await el.updateComplete;
    expect(fired).toBe(true);
  });
});
