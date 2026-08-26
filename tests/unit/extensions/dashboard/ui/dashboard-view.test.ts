// @vitest-environment happy-dom
/**
 * Tests for the dashboard view's financial-year label (Phase 7 Task 2).
 *
 * The topbar FY label uses `core.financialYear.current` when set;
 * otherwise it auto-computes from `referenceDate` + `financialYearStart`.
 */

import { describe, expect, it } from 'vitest';
import '../../../../../extensions/dashboard/src/ui/dashboard-view';

interface DashboardViewEl extends HTMLElement {
  updateComplete: Promise<boolean>;
  referenceDate: string;
  financialYearStart: string;
  financialYearCurrent: string;
  financeYearFilter: number;
  _currentFyValue(): string;
  _fyDisplay(fy: string): string;
}

function makeView(): DashboardViewEl {
  const el = document.createElement('dashboard-view') as unknown as DashboardViewEl;
  document.body.appendChild(el);
  el.referenceDate = '2026-01-15';
  el.financialYearStart = '07-01';
  el.financeYearFilter = 5;
  return el;
}

describe('DashboardView financial year label (Task 2)', () => {
  it('normalizes a YYYY-YY financialYearCurrent override to YYYY-YYYY', async () => {
    const el = makeView();
    el.financialYearCurrent = '2025-26';
    await el.updateComplete;
    expect(el._currentFyValue()).toBe('2025-2026');
  });

  it('keeps a YYYY-YYYY financialYearCurrent override unchanged', async () => {
    const el = makeView();
    el.financialYearCurrent = '2025-2026';
    await el.updateComplete;
    expect(el._currentFyValue()).toBe('2025-2026');
  });

  it('renders the override in the topbar select', async () => {
    const el = makeView();
    el.financialYearCurrent = '2025-26';
    await el.updateComplete;
    const select = el.shadowRoot?.querySelector('.fy-select') as HTMLSelectElement | null;
    expect(select?.value).toBe('2025-2026');
  });

  it('auto-computes when financialYearCurrent is empty', async () => {
    const el = makeView();
    el.financialYearCurrent = '';
    await el.updateComplete;
    // referenceDate 2026-01-15 + start 07-01 -> FY 2025-2026
    expect(el._currentFyValue()).toBe('2025-2026');
  });

  it('updates financialYearCurrent via mount-update and normalizes', async () => {
    const el = makeView();
    await el.updateComplete;
    el.dispatchEvent(
      new CustomEvent('mount-update', {
        detail: { financialYearCurrent: '2026-27' },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    expect(el.financialYearCurrent).toBe('2026-27');
    expect(el._currentFyValue()).toBe('2026-2027');
  });
});
