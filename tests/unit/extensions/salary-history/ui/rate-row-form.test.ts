// @vitest-environment happy-dom
/**
 * Tests for `extensions/salary-history/src/ui/rate-row-form.ts` (Phase 4 Task 11.5).
 *
 * 4 tests: the form renders immediately (no confirm panel), new rates default
 * `effective_from` to today, invalid input surfaces validation errors and
 * blocks dispatch, and a valid submit dispatches `rate-edit` / `rate-create`.
 */

import { describe, expect, it } from 'vitest';
import { RateRowForm } from '../../../../../extensions/salary-history/src/ui/rate-row-form';
import type { RateRow } from '../../../../../extensions/salary-history/src/dao/pay-rate-history';
import type { UiEl } from './test-types';

interface RateFormEl extends UiEl {
  rate: RateRow | null;
  confirmDelete: boolean;
  replaceMode: boolean;
  rateError: string | null;
  _values: { fields: Record<string, string> };
  _errors: readonly string[];
  _deleteMode: boolean;
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
  notes: null,
};

function todayISO(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

describe('RateRowForm (Task 11.5)', () => {
  it('uses the extension accent for info-note code', () => {
    const styles = String(RateRowForm.styles);
    expect(styles).toMatch(/\.info-note code\s*\{\s*color: var\(--ff-accent, #007acc\);/);
    expect(styles).not.toMatch(/\.info-note code\s*\{\s*color: var\(--ff-teal, #4ec9b0\);/);
  });

  it('renders the form fields immediately with no confirm panel', async () => {
    const el = makeEl();
    el.rate = CURRENT;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[data-testid="confirm-panel"]')).toBeFalsy();
    expect(el.shadowRoot.querySelector('[data-testid="rate-submit"]')).toBeTruthy();
    // Edit mode keeps the existing effective_from, not today.
    expect(el._values.fields.effective_from).toBe('2025-07-01');
  });

  it('new rates default effective_from to today', async () => {
    const el = makeEl();
    el.rate = null;
    await el.updateComplete;
    expect(el._values.fields.effective_from).toBe(todayISO());
  });

  it('invalid input surfaces validation errors and blocks dispatch', async () => {
    const el = makeEl();
    el.rate = CURRENT;
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

    let fired = false;
    el.addEventListener('rate-create', () => {
      fired = true;
    });
    el._onSubmit(new Event('submit'));
    await el.updateComplete;
    expect(fired).toBe(true);
  });

  it('opening in delete-confirm mode (list Delete) cancels back to the list', async () => {
    const el = makeEl();
    el.rate = CURRENT;
    el.confirmDelete = true;
    await el.updateComplete;
    expect(el._deleteMode).toBe(true);
    expect(el.shadowRoot.querySelector('[data-testid="delete-confirm"]')).toBeTruthy();

    let cancelled = false;
    el.addEventListener('rate-form-cancel', () => {
      cancelled = true;
    });
    (el.shadowRoot.querySelector('[data-testid="rate-delete-cancel"]') as HTMLElement).click();
    await el.updateComplete;
    expect(cancelled).toBe(true);
  });

  it('surfaces the "active rate already exists" banner when rateError is set', async () => {
    const el = makeEl();
    el.rate = CURRENT;
    el.rateError =
      'A current rate (end date empty) already exists. Only one current rate is allowed — edit the existing current rate, or give this row an end date.';
    await el.updateComplete;
    const banner = el.shadowRoot.querySelector('[data-testid="rate-error-banner"]') as HTMLElement;
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('already exists');
    expect(banner.textContent).toContain('Only one current rate is allowed');
  });

  it('replace mode shows "Replace Current Rate" title and defaults effective_from to today', async () => {
    const el = makeEl();
    el.rate = CURRENT;
    el.replaceMode = true;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[data-testid="rate-form-title"]').textContent).toBe('Replace Current Rate');
    // Replace starts from today, not the old rate's effective_from.
    expect(el._values.fields.effective_from).toBe(todayISO());
    expect(el._values.fields.effective_to).toBe('');
    // Rate numbers are pre-filled from the current row.
    expect(el._values.fields.base_hourly_rate).toBe('40');
  });

  it('replace mode submit dispatches rate-replace with the old row id', async () => {
    const el = makeEl();
    el.rate = CURRENT;
    el.replaceMode = true;
    await el.updateComplete;

    let captured: unknown = null;
    el.addEventListener('rate-replace', (e: Event) => {
      captured = (e as CustomEvent).detail;
    });
    el._onSubmit(new Event('submit'));
    await el.updateComplete;
    expect(captured).toBeTruthy();
    const detail = captured as { id: number; input: { base_hourly_rate: number } };
    expect(detail.id).toBe(2);
    expect(detail.input.base_hourly_rate).toBe(40);
  });

  it('rebuilds field defaults when rate arrives after connect (orchestrator late inject)', async () => {
    const el = makeEl();
    await el.updateComplete;
    // Connect happened with no rate (add defaults); orchestrator assigns the row later.
    expect(el._values.fields.effective_from).toBe(todayISO());
    el.rate = CURRENT;
    await el.updateComplete;
    expect(el._values.fields.effective_from).toBe('2025-07-01');
    expect(el._values.fields.base_hourly_rate).toBe('40');
  });
});
