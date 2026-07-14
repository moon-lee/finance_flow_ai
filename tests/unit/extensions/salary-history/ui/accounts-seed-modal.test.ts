// @vitest-environment happy-dom
/**
 * Tests for `extensions/salary-history/src/ui/accounts-seed-modal.ts` (Phase 4 Task 11.3).
 *
 * 3 tests: renders with a name input, the Create button dispatches
 * `account-create` with name + institution, and the Skip button
 * dispatches `account-seed-skip`.
 */

import { describe, expect, it } from 'vitest';
import '../../../../../extensions/salary-history/src/ui/accounts-seed-modal';
import type { UiEl } from './test-types';

interface SeedEl extends UiEl {
  open: boolean;
}

function makeEl(): SeedEl {
  const el = document.createElement('accounts-seed-modal') as unknown as SeedEl;
  el.open = true;
  document.body.appendChild(el as unknown as Node);
  return el;
}

describe('AccountsSeedModal (Task 11.3)', () => {
  it('renders a name input and institution input', async () => {
    const el = makeEl();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[data-testid="input-name"]')).toBeTruthy();
    expect(el.shadowRoot.querySelector('[data-testid="input-institution"]')).toBeTruthy();
  });

  it('Create dispatches account-create with name + institution', async () => {
    const el = makeEl();
    await el.updateComplete;
    const name = el.shadowRoot.querySelector('[data-testid="input-name"]') as HTMLInputElement;
    const inst = el.shadowRoot.querySelector('[data-testid="input-institution"]') as HTMLInputElement;
    name.value = 'Primary Cheque';
    inst.value = 'CBA';
    name.dispatchEvent(new Event('input'));
    inst.dispatchEvent(new Event('input'));
    await el.updateComplete;

    let captured: unknown = null;
    el.addEventListener('account-create', (e: Event) => {
      captured = (e as CustomEvent).detail;
    });
    el.shadowRoot.querySelector('[data-testid="seed-create"]').click();
    expect(captured).toBeTruthy();
    const detail = captured as { name: string; institution: string };
    expect(detail.name).toBe('Primary Cheque');
    expect(detail.institution).toBe('CBA');
  });

  it('Skip dispatches account-seed-skip', async () => {
    const el = makeEl();
    await el.updateComplete;
    let fired = false;
    el.addEventListener('account-seed-skip', () => {
      fired = true;
    });
    el.shadowRoot.querySelector('[data-testid="seed-skip"]').click();
    expect(fired).toBe(true);
  });
});
