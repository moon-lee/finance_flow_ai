/**
 * Phase 4 Task 12 — salary-history extension entry point.
 *
 * Wires the extension to the host:
 *  1. Registers the six UI custom elements (via ./ui/index.js).
 *  2. Seeds a default rate row on first activation when the rate history
 *     is empty (Decision 16).
 *  3. Registers the two commands (Decision 17): `salary.show-pay-history`
 *     and `salary.show-pay-rate-history`.
 *
 * The `finance` API passed to `activate` is the per-extension `FinanceApi`
 * (`db` + `commands` + `ai`). Steps the plan describes as settings
 * auto-fill (`financeYear`) and the UI back-channel (Decision 12
 * subscriptions) depend on host infrastructure delivered in later tasks
 * (a settings API / the Task 14 UI-mount IPC channel) and are deliberately
 * out of scope here — the command handlers emit a `salary-history:open-view`
 * DOM event that the Task 14 mount code will listen for.
 */

import type { FinanceApi } from '../../../src/extension-host/api/index.js';
import { registerUIComponents } from './ui/index.js';
import { listAllRates, addNewRate } from './dao/pay-rate-history.js';
import { buildDefaultRateRow } from './services/pay-rate-service.js';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function openView(tag: string, finance: FinanceApi): void {
  const el = document.createElement(tag) as HTMLElement & { finance?: FinanceApi | null };
  el.finance = finance;
  window.dispatchEvent(
    new CustomEvent('salary-history:open-view', { detail: { tag, element: el } }),
  );
}

export async function activate(finance: FinanceApi): Promise<void> {
  registerUIComponents();

  // Decision 16 — seed a default current rate row if none exists.
  const rates = await listAllRates(finance);
  if (rates.length === 0) {
    await addNewRate(finance, buildDefaultRateRow(todayISO()));
  }

  // Decision 17 — two commands, one existing + one new.
  finance.commands.registerCommand(
    'salary.show-pay-history',
    'View: Pay History',
    () => openView('payslip-list', finance),
  );
  finance.commands.registerCommand(
    'salary.show-pay-rate-history',
    'View: Pay Rate History',
    () => openView('pay-rate-history-view', finance),
  );
}

export function deactivate(): void {
  // Review Finding 13 cleanup contract: unsubscribe from any ui-event
  // listeners and release the `finance` reference. Task 12 has no active
  // subscriptions yet (the ui-event back-channel arrives with the Task 14
  // UI mount); this is the hook those listeners will be torn down from.
}
