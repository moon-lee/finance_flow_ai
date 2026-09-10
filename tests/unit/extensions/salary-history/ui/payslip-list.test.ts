// @vitest-environment happy-dom
/**
 * Tests for `extensions/salary-history/src/ui/payslip-list.ts` (Phase 4 Task 11.2).
 *
 * 5 tests: renders the table, the YTD footer reflects the aggregate,
 * the overtime-1.5-hours chip renders beside the overtime-1.5x chip,
 * the Edit button dispatches `payslip-edit-request`, and the Delete
 * button dispatches `payslip-delete`.
 */

import { describe, expect, it } from 'vitest';
import '../../../../../extensions/salary-history/src/ui/payslip-list';
import type { PaySlip } from '../../../../../extensions/salary-history/src/dao/pay-slips';
import type { UiEl } from './test-types';

interface ListEl extends UiEl {
  payslips: PaySlip[];
  referenceDate: string;
  financialYearStart: string;
}

function makeEl(): ListEl {
  const el = document.createElement('payslip-list') as unknown as ListEl;
  document.body.appendChild(el as unknown as Node);
  return el;
}

const SLIPS: PaySlip[] = [
  {
    id: 1,
    account_id: 1,
    pay_period_start: '2026-01-01',
    pay_period_end: '2026-01-15',
    pay_date: '2026-01-20',
    finance_year: '2025-26',
    gross: 100,
    net: 80,
    currency: 'AUD',
    shift_allowance: 0,
    base_hourly: 100,
    overtime_1_5x: 0,
    overtime_2_0x: 0,
    holiday_leave_loading: 0,
    holiday_pay: 0,
    public_holiday: 0,
    payg_withholding: 20,
    superannuation_guarantee: 12,
    personal_leave: 0,
    regular_hours: 38,
    shift_hours: 38,
    overtime_1_5_hours: 2.5,
    overtime_2_0_hours: 0,
    holiday_hours: 0,
    public_holiday_hours: 0,
    personal_leave_hours: 0,
    holiday_leave_accrual_hours: 0,
    notes: null,
  },
  {
    id: 2,
    account_id: 1,
    pay_period_start: '2026-02-01',
    pay_period_end: '2026-02-15',
    pay_date: '2026-02-20',
    finance_year: '2025-26',
    gross: 200,
    net: 160,
    currency: 'AUD',
    shift_allowance: 0,
    base_hourly: 200,
    overtime_1_5x: 0,
    overtime_2_0x: 0,
    holiday_leave_loading: 0,
    holiday_pay: 0,
    public_holiday: 0,
    payg_withholding: 40,
    superannuation_guarantee: 24,
    personal_leave: 0,
    regular_hours: 38,
    shift_hours: 38,
    overtime_1_5_hours: 0,
    overtime_2_0_hours: 0,
    holiday_hours: 0,
    public_holiday_hours: 0,
    personal_leave_hours: 0,
    holiday_leave_accrual_hours: 0,
    notes: null,
  },
];

describe('PayslipList (Task 11.2)', () => {
  it('uses the extension accent for the YTD footer and info-note code', () => {
    const elementClass = customElements.get('payslip-list') as typeof import('../../../../../extensions/salary-history/src/ui/payslip-list').PayslipList | undefined;
    const styles = String(elementClass?.styles ?? '');
    expect(styles).toContain('border-top: 2px solid var(--ff-accent)');
    expect(styles).toContain('color: var(--ff-accent, #007acc)');
    expect(styles).not.toContain('border-top: 2px solid var(--ff-teal)');
    expect(styles).not.toContain('color: var(--ff-teal, #4ec9b0)');
  });

  it('renders the payslip table', async () => {
    const el = makeEl();
    el.payslips = SLIPS;
    await el.updateComplete;
    const rows = el.shadowRoot.querySelectorAll('[data-testid="payslip-row"]');
    expect(rows.length).toBe(2);
  });

  it('YTD footer reflects the aggregate for the active FY', async () => {
    const el = makeEl();
    el.payslips = SLIPS;
    el.referenceDate = '2026-03-01';
    el.financialYearStart = '07-01';
    await el.updateComplete;
    const footer = el.shadowRoot.querySelector('[data-testid="ytd-footer"]').textContent;
    // Gross/Net live in the KPI header (not duplicated in the footer).
    expect(el.shadowRoot.querySelector('[data-testid="kpi-gross"]').textContent).toContain('300.00');
    expect(el.shadowRoot.querySelector('[data-testid="kpi-net"]').textContent).toContain('240.00');
    // Footer chips show PAYG (60.00) + SG (36.00); Gross/Net must NOT appear.
    expect(footer).toContain('60.00');
    expect(footer).toContain('36.00');
    expect(footer).not.toContain('300.00');
    expect(footer).not.toContain('240.00');
  });

  it('renders the overtime-1.5 hours chip beside the overtime-1.5x chip', async () => {
    const el = makeEl();
    el.payslips = [
      { ...SLIPS[0], overtime_1_5x: 50, overtime_1_5_hours: 3 },
      { ...SLIPS[1], overtime_1_5x: 50, overtime_1_5_hours: 2 },
    ];
    el.referenceDate = '2026-03-01';
    el.financialYearStart = '07-01';
    await el.updateComplete;

    const moneyChip = el.shadowRoot.querySelector('[data-testid="ytd-chip-overtime-1-5"]');
    const hoursChip = el.shadowRoot.querySelector('[data-testid="ytd-chip-overtime-1-5-hours"]');
    expect(moneyChip).toBeTruthy();
    expect(hoursChip).toBeTruthy();
    expect(moneyChip.textContent).toContain('100.00');
    expect(hoursChip.textContent).toContain('5.00h');

    // Hours chip sits directly after the money chip in the breakdown row.
    const chips = Array.from(el.shadowRoot.querySelectorAll('[data-testid^="ytd-chip-"]'));
    const moneyIdx = chips.findIndex((c) => (c as HTMLElement).dataset.testid === 'ytd-chip-overtime-1-5');
    const hoursIdx = chips.findIndex((c) => (c as HTMLElement).dataset.testid === 'ytd-chip-overtime-1-5-hours');
    expect(hoursIdx).toBe(moneyIdx + 1);
  });

  it('Edit button dispatches payslip-edit-request', async () => {
    const el = makeEl();
    el.payslips = SLIPS;
    await el.updateComplete;
    let captured: unknown = null;
    el.addEventListener('payslip-edit-request', (e: Event) => {
      captured = (e as CustomEvent).detail;
    });
    el.shadowRoot.querySelector('[data-testid="edit-1"]').click();
    expect(captured).toBeTruthy();
    expect((captured as { id: number }).id).toBe(1);
  });

  it('Delete button dispatches payslip-delete', async () => {
    const el = makeEl();
    el.payslips = SLIPS;
    (globalThis as { confirm?: () => boolean }).confirm = () => true;
    await el.updateComplete;
    let captured: unknown = null;
    el.addEventListener('payslip-delete', (e: Event) => {
      captured = (e as CustomEvent).detail;
    });
    el.shadowRoot.querySelector('[data-testid="delete-2"]').click();
    expect(captured).toBeTruthy();
    expect((captured as { id: number }).id).toBe(2);
  });
});
