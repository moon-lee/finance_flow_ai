// @vitest-environment happy-dom
/**
 * Tests for `extensions/salary-history/src/ui/reorder-sections-modal.ts` (Phase 4 Task 11.6).
 *
 * 4 tests: renders the 8 sections with up/down controls, Save dispatches
 * `section-order-change` with an 8-element array (Review Finding 6:
 * singular string[], not double-encoded), the JSON round-trip keeps 8
 * entries, and Reset restores the canonical 8-section order.
 */

import { describe, expect, it } from 'vitest';
import '../../../../../extensions/salary-history/src/ui/reorder-sections-modal';
import { CANONICAL_SECTION_ORDER } from '../../../../../extensions/salary-history/src/ui/payslip-form';
import type { UiEl } from './test-types';

interface ReorderEl extends UiEl {
  _order: string[];
}

function makeEl(): ReorderEl {
  const el = document.createElement('reorder-sections-modal') as unknown as ReorderEl;
  document.body.appendChild(el as unknown as Node);
  return el;
}

describe('ReorderSectionsModal (Task 11.6)', () => {
  it('renders the 8 sections with up/down controls', async () => {
    const el = makeEl();
    await el.updateComplete;
    const items = el.shadowRoot.querySelectorAll('[data-testid="section-item"]');
    expect(items.length).toBe(8);
    expect(el.shadowRoot.querySelectorAll('[data-testid^="up-"]').length).toBe(8);
    expect(el.shadowRoot.querySelectorAll('[data-testid^="down-"]').length).toBe(8);
  });

  it('Save dispatches section-order-change with an 8-element singular array', async () => {
    const el = makeEl();
    await el.updateComplete;
    let captured: unknown = null;
    el.addEventListener('section-order-change', (e: Event) => {
      captured = (e as CustomEvent).detail;
    });
    el.shadowRoot.querySelector('[data-testid="save"]').click();
    expect(captured).toBeTruthy();
    const order = captured as string[];
    expect(Array.isArray(order)).toBe(true);
    expect(order.length).toBe(8);
    expect(order).toEqual([...CANONICAL_SECTION_ORDER]);
    expect(typeof order[0]).toBe('string');
  });

  it('JSON round-trip keeps the 8 entries (no double-encoding)', async () => {
    const el = makeEl();
    await el.updateComplete;
    let captured: string[] | null = null;
    el.addEventListener('section-order-change', (e: Event) => {
      captured = (e as CustomEvent).detail as string[];
    });
    el.shadowRoot.querySelector('[data-testid="save"]').click();
    const round = JSON.parse(JSON.stringify(captured!));
    expect(round.length).toBe(8);
    expect(round[0]).toBe('period');
  });

  it('Reset restores the canonical 8-section order', async () => {
    const el = makeEl();
    await el.updateComplete;
    el.shadowRoot.querySelector('[data-testid="down-period"]').click();
    await el.updateComplete;
    expect(el._order[0]).not.toBe('period');

    el.shadowRoot.querySelector('[data-testid="reset"]').click();
    await el.updateComplete;
    expect(el._order).toEqual([...CANONICAL_SECTION_ORDER]);
  });
});
