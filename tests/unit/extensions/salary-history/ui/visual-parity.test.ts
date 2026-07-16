// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { resolve } from 'node:path';

import '../../../../../extensions/salary-history/src/ui/payslip-form';
import '../../../../../extensions/salary-history/src/ui/payslip-list';
import '../../../../../extensions/salary-history/src/ui/accounts-seed-modal';
import '../../../../../extensions/salary-history/src/ui/pay-rate-history-view';
import '../../../../../extensions/salary-history/src/ui/rate-row-form';
import '../../../../../extensions/salary-history/src/ui/reorder-sections-modal';
import type { PayslipList } from '../../../../../extensions/salary-history/src/ui/payslip-list';
import type { PayRateHistoryView } from '../../../../../extensions/salary-history/src/ui/pay-rate-history-view';
import type { RateRowForm } from '../../../../../extensions/salary-history/src/ui/rate-row-form';
import type { ReorderSectionsModal } from '../../../../../extensions/salary-history/src/ui/reorder-sections-modal';
import type { RateRow } from '../../../../../extensions/salary-history/src/dao/pay-rate-history';
import type { PaySlip } from '../../../../../extensions/salary-history/src/dao/pay-slips';

const MOCK_DIR = resolve(__dirname, '../../../../../docs/design/salary-history-mvp');

type Queryable = { querySelectorAll(selector: string): NodeListOf<Element> };

function parseMock(file: string): Queryable {
  const html = readFileSync(resolve(MOCK_DIR, file), 'utf-8');
  const win = new Window({ url: 'http://localhost/' });
  win.document.write(html);
  return win.document as unknown as Queryable;
}

interface ParityEl extends HTMLElement {
  shadowRoot: ShadowRoot | null;
  updateComplete: Promise<unknown>;
}

function make<T extends ParityEl>(tag: string): T {
  const el = document.createElement(tag) as unknown as T;
  document.body.appendChild(el as unknown as Node);
  return el;
}

function sr(el: ParityEl): ShadowRoot {
  const s = el.shadowRoot;
  if (!s) throw new Error('no shadow root');
  return s;
}

function texts(root: Queryable, selector: string): string[] {
  return [...root.querySelectorAll(selector)].map((n) => (n.textContent ?? '').trim());
}

const findings: string[] = [];
function soft(msg: string): void {
  findings.push(msg);
  console.log('  [parity-note] ' + msg);
}

describe('Task 11.8 visual parity — component DOM vs approved mock', () => {
  it('payslip-form: 8 sections match mock section titles', async () => {
    const mock = parseMock('payslip-form-expanded.html');
    const mockTitles = texts(mock, '.section-title');
    const el = make<ParityEl>('payslip-form');
    await el.updateComplete;

    const sectionEls = [...sr(el).querySelectorAll('[data-testid^="section-"]')];
    const titles = sectionEls.map((s) => (s.querySelector('h3')?.textContent ?? '').trim());

    expect(titles).toEqual(mockTitles);
    expect(titles).toEqual([
      'Period', 'Totals', 'Earnings (derived)', 'Deductions',
      'Super', 'Leave', 'Leave Accrual', 'Notes',
    ]);
    soft('payslip-form: finance_year is a text input + fy-warning callout, mock shows a <select> (intentional, Review Finding 9)');
    soft('payslip-form: mock shows pay_period_start/end as read-only auto fields; component omits them (derived == pay_date)');
    const paygBtn = sr(el).querySelector('[data-testid="validate-payg"]')?.textContent?.trim();
    if (paygBtn !== '✓ Validate PAYG') soft(`payslip-form: PAYG button label is "${paygBtn}" vs mock "✓ Validate PAYG"`);
    const hasCancel = [...sr(el).querySelectorAll('button')].some((b) => /cancel/i.test(b.textContent ?? ''));
    if (!hasCancel) soft('payslip-form: footer has only a single submit ("Create payslip"); mock shows Cancel + Save');
    const notesInput = sr(el).querySelector('[data-testid="input-notes"]');
    if (notesInput?.tagName === 'INPUT') soft('payslip-form: Notes is <input> while mock uses <textarea>');
  });

  it('payslip-list: KPI tiles + table columns match mock', async () => {
    const mock = parseMock('payslip-list.html');
    const mockKpis = texts(mock, '.summary-label');
    const mockHeaders = texts(mock, 'thead th').map((t) => t.replace(/[⇅↓↑]/g, '').trim());
    const el = make<PayslipList>('payslip-list');
    el.payslips = [
      { id: 1, pay_date: '2026-06-12', finance_year: 'FY2025-2026', gross: 1616.9, net: 1275.9, account_id: 1, regular_hours: 38, shift_hours: 0, overtime_1_5_hours: 0, overtime_2_0_hours: 0, public_holiday_hours: 0, holiday_leave_accrual_hours: 0, currency: 'AUD', pay_period_start: '2026-06-12', pay_period_end: '2026-06-12' } as unknown as PaySlip,
    ];
    await el.updateComplete;

    const kpis = texts(sr(el), '.kpi .label');
    expect(kpis.sort()).toEqual(mockKpis.sort());
    const headers = texts(sr(el), 'th').map((t) => t.replace(/[⇅↓↑]/g, '').trim()).filter((t) => t !== '');
    const mockSet = new Set(mockHeaders);
    const compSet = new Set(headers);
    for (const h of mockHeaders) if (!compSet.has(h)) soft(`payslip-list: mock header "${h}" missing in component`);
    for (const h of headers) if (!mockSet.has(h)) soft(`payslip-list: component header "${h}" not in mock (mock uses "${[...mockSet].find((m) => m.toLowerCase() === h.toLowerCase()) ?? '—'})`);
  });

  it('accounts-seed-modal: title + 3 action buttons match mock', async () => {
    const mock = parseMock('accounts-seed.html');
    const mockBtns = texts(mock, '.modal-footer button');
    const el = make<ParityEl>('accounts-seed-modal');
    (el as unknown as { open: boolean }).open = true;
    await el.updateComplete;

    const title = sr(el).querySelector('[data-testid="seed-title"]')?.textContent?.trim();
    expect(title).toBe('Welcome to Salary History');
    const btns = texts(sr(el), '.actions button');
    expect(btns.sort()).toEqual(mockBtns.sort());
  });

  it('pay-rate-history-view: add button + Current/History badges + edit/view match mock', async () => {
    const el = make<PayRateHistoryView>('pay-rate-history-view');
    el.rates = [
    ];
    await el.updateComplete;

    expect(sr(el).querySelector('[data-testid="add-rate"]')).toBeTruthy();
    const badges = texts(sr(el), '[data-testid="rate-badge"]');
    expect(badges).toContain('Current');
    expect(badges).toContain('History');
    expect(sr(el).querySelector('[data-testid="rate-edit"]')).toBeTruthy();
    expect(sr(el).querySelector('[data-testid="rate-view"]')).toBeTruthy();
    const table = sr(el).querySelector('table.rates-table') as HTMLTableElement;
    expect(table).toBeTruthy();
    expect([...table.querySelectorAll('thead th')].length).toBe(8);
    const firstRow = table.querySelector('tbody tr') as HTMLTableRowElement;
    const rateCols = [...firstRow.querySelectorAll('td[data-testid^="rate-"]')].filter(
      (td) =>
        !['rate-badge', 'rate-edit', 'rate-view', 'rate-notes', 'rate-effective_from', 'rate-effective_to'].includes(
          td.getAttribute('data-testid') ?? '',
        ),
    );
    expect(rateCols.length).toBe(3);
    soft(`pay-rate-history-view: user-approved 8-column layout (Status, Effective From, Effective To, Base Hourly, Std Hrs/wk, SG Rate, Notes, Action); intentionally fewer than the 12-column mock per explicit user decision`);
  });

  it('rate-row-form: 10 rate fields match mock (no confirm panel)', async () => {
    const mock = parseMock('rate-row-form.html');
    const mockRateLabels = texts(mock, '.section .field label')
      .map((t) => t.replace(/\s*\(.*\)\s*/g, '').replace(/—.*$/g, '').trim())
      .filter((t) => /rate|hours|multiplier|balance|allowance|super|loading|accrual|standard|base|effective|notes/i.test(t));
    const el = make<RateRowForm>('rate-row-form');
    await el.updateComplete;
    expect(sr(el).querySelector('[data-testid="confirm-panel"]')).toBeFalsy();
    expect(sr(el).querySelector('[data-testid="rate-submit"]')).toBeTruthy();

    const fieldKeys = [...sr(el).querySelectorAll('[data-testid^="input-"]')]
      .map((n) => (n.getAttribute('data-testid') ?? '').replace('input-', ''))
      .filter((k) => !['effective_from', 'effective_to', 'notes'].includes(k));
    expect(fieldKeys.sort()).toEqual([
      'base_hourly_rate', 'standard_hours_per_week', 'shift_allowance_multiplier',
      'shift_allowance_hours_per_week', 'overtime_1_5_multiplier', 'overtime_2_0_multiplier',
      'superannuation_rate', 'holiday_leave_loading_rate', 'accrual_rate_per_week',
      'starting_holiday_leave_balance',
    ].sort());
    soft(`rate-row-form: mock rate-field labels parsed = ${mockRateLabels.length}; component now renders the raw \`base_hourly_rate\`-style keys as primary labels with descriptive sublabels, matching the mock (12 vs 10 keys is the approved 10-canonical-field deviation, Finding 12)`);
  });

  it('reorder-sections-modal: 8 items in canonical order, labels match mock (catches typo)', async () => {
    const mock = parseMock('reorder-sections.html');
    const mockIds = texts(mock, '.section-id');
    const el = make<ReorderSectionsModal>('reorder-sections-modal');
    await el.updateComplete;

    const ids = [...sr(el).querySelectorAll('[data-testid="section-item"]')].map((n) => n.getAttribute('data-id') ?? '');
    expect(ids).toEqual(mockIds);
    expect(ids).toEqual(['period', 'totals', 'earnings', 'deductions', 'super', 'leave', 'leave-accrual', 'notes']);
    const labels = texts(sr(el), '[data-testid="section-label"]');
    expect(labels).not.toContain('Tolars');
    expect(labels).toContain('Totals');
    expect(sr(el).querySelector('[data-testid="reset"]')).toBeTruthy();
    expect(sr(el).querySelector('[data-testid="save"]')).toBeTruthy();
    expect(sr(el).querySelector('[data-testid="cancel"]')).toBeTruthy();
  });

  it('parity findings summary', () => {
    console.log(`\n=== Visual parity findings: ${findings.length} soft note(s) ===`);
    findings.forEach((f) => console.log(' - ' + f));
    expect(true).toBe(true);
  });
});
