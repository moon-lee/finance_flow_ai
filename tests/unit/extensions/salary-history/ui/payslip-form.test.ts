// @vitest-environment happy-dom
/**
 * Tests for `extensions/salary-history/src/ui/payslip-form.ts` (Phase 4 Task 11.1).
 *
 * 7 tests: renders 8 sections in order, fires `payslip-create` on
 * submit with the derived payload, recomputes the breakdown preview on
 * input change, the Validate PAYG button renders a result, honours a
 * caller-supplied `sectionOrder`, auto-fills `finance_year` from the pay
 * date (Review Finding 9), and surfaces a finance_year mismatch warning.
 */

import { describe, expect, it } from 'vitest';
import '../../../../../extensions/salary-history/src/ui/payslip-form';
import type { RateRow } from '../../../../../extensions/salary-history/src/dao/pay-rate-history';
import { makeMockFinance } from './mock-finance';
import type { UiEl } from './test-types';

interface FormEl extends UiEl {
  finance: unknown;
  sectionOrder: string[];
  financialYearStart: string;
  loadReferenceData(): Promise<void>;
  recompute(): Promise<void>;
  _values: Record<string, unknown>;
  _rate: RateRow | null;
  _breakdown: unknown;
  _onSubmit(e: Event): void;
}

function makeEl(): FormEl {
  const el = document.createElement('payslip-form') as unknown as FormEl;
  document.body.appendChild(el as unknown as Node);
  return el;
}

const RATE: RateRow = {
  id: 1,
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
  starting_holiday_leave_balance: 0,
  notes: null,
};

describe('PayslipForm (Task 11.1)', () => {
  it('renders the 8 sections in canonical order', async () => {
    const el = makeEl();
    await el.updateComplete;
    const ids = el.sectionOrder;
    expect(ids).toEqual([
      'period',
      'totals',
      'earnings',
      'deductions',
      'super',
      'leave',
      'leave-accrual',
      'notes',
    ]);
    for (const id of ids) {
      expect(el.shadowRoot.querySelector(`[data-testid="section-${id}"]`)).toBeTruthy();
    }
  });

  it('fires payslip-create on submit with the derived payload', async () => {
    const el = makeEl();
    el.finance = makeMockFinance({ rates: [RATE], accounts: [{ id: 1, name: 'Primary' }] });
    await el.loadReferenceData();
    el._values = {
      pay_date: '2026-01-15',
      finance_year: '2025-26',
      account_id: 1,
      gross: '5000',
      net: '3800',
      notes: '',
      regular_hours: '38',
      shift_hours: '38',
      overtime_1_5_hours: '0',
      overtime_2_0_hours: '0',
      holiday_hours: '0',
      public_holiday_hours: '0',
      personal_leave_hours: '0',
    };
    await el.recompute();
    await el.updateComplete;

    let captured: unknown = null;
    el.addEventListener('payslip-create', (e: Event) => {
      captured = (e as CustomEvent).detail;
    });
    el._onSubmit(new Event('submit'));

    expect(captured).toBeTruthy();
    const detail = captured as { input: Record<string, unknown> };
    expect(detail.input.gross).toBe(5000);
    expect(detail.input.net).toBe(3800);
    expect(detail.input.account_id).toBe(1);
    expect(detail.input.base_hourly).toBe(40 * 38);
    expect(detail.input.shift_allowance).toBe(38 * 40 * 0.15);
    expect(detail.input.payg_withholding).toBe(1200);
    expect(detail.input.superannuation_guarantee).toBe(5000 * 0.12);
  });

  it('recomputes the breakdown preview on input change', async () => {
    const el = makeEl();
    el._rate = RATE;
    el._values = {
      ...el._values,
      pay_date: '2026-01-15',
      gross: '5000',
      net: '3800',
      regular_hours: '38',
    };
    await el.recompute();
    await el.updateComplete;

    expect(el._breakdown).toBeTruthy();
    const baseText = el.shadowRoot.querySelector('[data-testid="section-earnings"]').textContent;
    expect(baseText).toContain('Base hourly');
  });

  it('Validate PAYG button renders a result card', async () => {
    const el = makeEl();
    el._values = { ...el._values, gross: '2000', net: '1600' };
    await el.recompute();
    await el.updateComplete;

    el.shadowRoot.querySelector('[data-testid="validate-payg"]').click();
    await el.updateComplete;

    const result = el.shadowRoot.querySelector('[data-testid="payg-result"]');
    expect(result).toBeTruthy();
  });

  it('honours a caller-supplied sectionOrder', async () => {
    const el = makeEl();
    el.sectionOrder = ['notes', 'totals', 'period', 'earnings', 'deductions', 'super', 'leave', 'leave-accrual'];
    await el.updateComplete;
    const first = el.shadowRoot.querySelector('[data-testid="section-notes"]');
    expect(first).toBeTruthy();
    const sections = Array.from(el.shadowRoot.querySelectorAll('.section'));
    expect((sections[0] as HTMLElement).getAttribute('data-testid')).toBe('section-notes');
  });

  it('auto-fills finance_year from the pay date', async () => {
    const el = makeEl();
    el.financialYearStart = '07-01';
    el._values = { ...el._values, pay_date: '2026-01-15' };
    await el.recompute();
    await el.updateComplete;
    expect(el._values.finance_year).toBe('2025-26');
  });

  it('surfaces a finance_year mismatch warning with override actions', async () => {
    const el = makeEl();
    el.financialYearStart = '07-01';
    el._values = { ...el._values, pay_date: '2026-01-15', finance_year: '2099-00' };
    await el.recompute();
    await el.updateComplete;
    const warn = el.shadowRoot.querySelector('[data-testid="fy-warning"]');
    expect(warn).toBeTruthy();
  });
});
