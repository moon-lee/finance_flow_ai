// @vitest-environment happy-dom
/**
 * Tests for `extensions/salary-history/src/ui/payslip-form.ts` (Phase 4 Task 11.1).
 *
 * Tests: renders 8 sections in order, fires `payslip-create` on
 * submit with the derived payload, recomputes the breakdown preview on
 * input change, the Validate PAYG button renders a result, honours a
 * caller-supplied `sectionOrder`, auto-fills `finance_year` from the pay
 * date (Review Finding 9), surfaces a finance_year mismatch warning,
 * and renders the hours inputs with step 0.01 so decimal hours save.
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
  _showHours: boolean;
  _rate: RateRow | null;
  _breakdown: unknown;
  editPaySlip: unknown;
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

  it('editing Previous balance flows into the saved holiday_leave_accrual_hours', async () => {
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
      previous_balance: '100',
    };
    await el.recompute();
    await el.updateComplete;

    // Simulate the user editing the Previous balance input.
    const input = el.shadowRoot.querySelector('[data-testid="input-previous_balance"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = '200';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    const newBalanceText = el.shadowRoot
      .querySelector('[data-testid="accrual-new"]')
      ?.textContent?.trim();
    // 200 - 0 + 2.92 = 202.92
    expect(newBalanceText).toContain('202.92');

    let captured: unknown = null;
    el.addEventListener('payslip-create', (e: Event) => {
      captured = (e as CustomEvent).detail;
    });
    el._onSubmit(new Event('submit'));
    const detail = captured as { input: Record<string, unknown> };
    expect(detail.input.holiday_leave_accrual_hours).toBeCloseTo(202.92, 2);
  });

  it('edit mode: New balance is the stored value (no calc) and is editable + saved verbatim', async () => {
    const el = makeEl();
    el.finance = makeMockFinance({ rates: [RATE], accounts: [{ id: 1, name: 'Primary' }] });
    el.editPaySlip = {
      id: 5,
      account_id: 1,
      pay_date: '2026-07-09',
      finance_year: '2025-26',
      gross: 423.69,
      net: 350,
      currency: 'AUD',
      shift_allowance: 0,
      base_hourly: 0,
      overtime_1_5x: 0,
      overtime_2_0x: 0,
      holiday_leave_loading: 0,
      holiday_pay: 0,
      public_holiday: 0,
      payg_withholding: 0,
      superannuation_guarantee: 0,
      personal_leave: 0,
      regular_hours: 38,
      shift_hours: 38,
      overtime_1_5_hours: 0,
      overtime_2_0_hours: 0,
      holiday_hours: 5,
      public_holiday_hours: 0,
      personal_leave_hours: 0,
      holiday_leave_accrual_hours: 423.69,
      notes: null,
    } as never;
    (el as unknown as { _prefillFromEdit: () => void })._prefillFromEdit();
    await el.loadReferenceData();
    await el.updateComplete;

    // The calc-derived "New balance" read-only line must NOT be present.
    expect(el.shadowRoot.querySelector('[data-testid="accrual-new"]')).toBeFalsy();

    // Previous balance is read-only (display only).
    const prevDisplay = el.shadowRoot.querySelector('[data-testid="display-previous_balance"]') as HTMLElement;
    expect(prevDisplay).toBeTruthy();

    // The editable New balance input carries the stored value.
    const input = el.shadowRoot.querySelector('[data-testid="input-new_balance"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('423.69');

    // Editing it changes the saved value — NOT recalculated from it.
    input.value = '500';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    let captured: unknown = null;
    el.addEventListener('payslip-edit', (e: Event) => {
      captured = (e as CustomEvent).detail;
    });
    el._onSubmit(new Event('submit'));
    const detail = captured as { id: number; input: Record<string, unknown> };
    expect(detail.id).toBe(5);
    expect(detail.input.holiday_leave_accrual_hours).toBe(500);
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
    expect(baseText).toContain('base hourly');
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
    expect(el._values.finance_year).toBe('2025-2026');
  });

  it('renders the hours inputs with step 0.01 so decimal hours save', async () => {
    const el = makeEl();
    el._showHours = true;
    await el.updateComplete;

    const fields = [
      'regular_hours',
      'shift_hours',
      'overtime_1_5_hours',
      'overtime_2_0_hours',
      'holiday_hours',
      'public_holiday_hours',
      'personal_leave_hours',
    ];
    for (const field of fields) {
      const input = el.shadowRoot.querySelector(
        `[data-testid="input-${field}"]`,
      ) as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.type).toBe('number');
      expect(input.step).toBe('0.01');
    }
  });

  it('prefills when editPaySlip arrives after connect (orchestrator late inject)', async () => {
    const el = makeEl();
    await el.updateComplete;
    // Connect happened with no editPaySlip; orchestrator assigns it later.
    el.editPaySlip = { pay_date: '2026-07-09', finance_year: '2025-26', gross: 423.69, net: 350 } as never;
    await el.updateComplete;
    const values = el._values as Record<string, unknown>;
    expect(values.pay_date).toBe('2026-07-09');
    expect(values.gross).toBe('423.69');
    const title = el.shadowRoot.querySelector('[data-testid="form-title"]')?.textContent?.trim();
    expect(title).toBe('Edit Payslip');
  });
});
