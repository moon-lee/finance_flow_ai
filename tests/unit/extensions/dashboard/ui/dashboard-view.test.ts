// @vitest-environment happy-dom
/**
 * Tests for the dashboard view's financial-year label (Phase 7 Task 2.5).
 *
 * The topbar FY label is normally auto-computed from `referenceDate` +
 * `financialYearStart` (`_fyLabel`), but the `dashboard.financeYear`
 * setting provides a manual override. When `financeYear` is non-empty the
 * label uses the override (expanded from `YYYY-YY` to `YYYY-YYYY`);
 * otherwise it auto-computes.
 */

import { describe, expect, it } from 'vitest';
import '../../../../../extensions/dashboard/src/ui/dashboard-view';

interface DashboardViewEl extends HTMLElement {
  updateComplete: Promise<boolean>;
  referenceDate: string;
  financialYearStart: string;
  financeYear: string;
  _fyLabel(): string;
  _fyDisplay(fy: string): string;
}

function makeView(): DashboardViewEl {
  const el = document.createElement('dashboard-view') as unknown as DashboardViewEl;
  document.body.appendChild(el);
  el.referenceDate = '2026-01-15';
  el.financialYearStart = '07-01';
  return el;
}

describe('DashboardView financial year label (Task 2.5)', () => {
  it('normalizes a YYYY-YY financeYear override to YYYY-YYYY', async () => {
    const el = makeView();
    el.financeYear = '2025-26';
    await el.updateComplete;
    expect(el._fyLabel()).toBe('2025-2026');
  });

  it('keeps a YYYY-YYYY financeYear override unchanged', async () => {
    const el = makeView();
    el.financeYear = '2025-2026';
    await el.updateComplete;
    expect(el._fyLabel()).toBe('2025-2026');
  });

  it('renders the override in the topbar subtitle', async () => {
    const el = makeView();
    el.financeYear = '2025-26';
    await el.updateComplete;
    const text = (el.shadowRoot as ShadowRoot).textContent ?? '';
    expect(text).toContain('FY 2025-2026');
  });

  it('auto-computes when financeYear is empty', async () => {
    const el = makeView();
    el.financeYear = '';
    await el.updateComplete;
    // referenceDate 2026-01-15 + start 07-01 -> FY 2025-2026
    expect(el._fyLabel()).toBe('2025-2026');
  });

  it('updates financeYear via mount-update and normalizes', async () => {
    const el = makeView();
    await el.updateComplete;
    el.dispatchEvent(
      new CustomEvent('mount-update', {
        detail: { financeYear: '2026-27' },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    expect(el.financeYear).toBe('2026-27');
    expect(el._fyLabel()).toBe('2026-2027');
  });
});
