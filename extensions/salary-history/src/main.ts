/**
 * Phase 4 Task 12 — salary-history extension entry point.
 *
 * Wires the extension to the host:
 *  1. Registers the six UI custom elements (via ./ui/index.js).
 *  2. Seeds a default rate row on first activation when the rate history
 *     is empty (Decision 16).
 *  3. Registers the two commands (Decision 17): `salary.show-pay-history`
 *     and `salary.show-pay-rate-history`.
 *  4. (Task 16.1) Reads namespace-scoped settings with safe defaults.
 *
 * The `finance` API passed to `activate` is the per-extension `FinanceApi`
 * (`db` + `commands` + `ai` + optional `ui`/`settings`). The Host process
 * has no DOM, so the command handlers request a UI mount over IPC
 * (`finance.ui.requestMount`) — Main forwards it to the Renderer, which
 * dynamically imports the extension bundle and mounts the named element.
 * Direct DOM creation here would fail at runtime (Node `utilityProcess`).
 */

import { registerUIComponents } from './ui/index.js';
import { listAllRates, addNewRate } from './dao/pay-rate-history.js';
import { buildDefaultRateRow } from './services/pay-rate-service.js';
import type { FinanceApi } from 'finance';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Ask the Renderer to mount one of this extension's custom elements. The
 * Host cannot render, so this is an IPC request — not a DOM operation.
 */
function openView(finance: FinanceApi, tag: string, mountData: Record<string, unknown> = {}): void {
  void finance.ui?.requestMount(tag, mountData);
}

export async function activate(finance: FinanceApi): Promise<void> {
  registerUIComponents();

  // Decision 16 — seed a default current rate row if none exists.
  const rates = await listAllRates(finance);
  if (rates.length === 0) {
    await addNewRate(finance, buildDefaultRateRow(todayISO()));
  }

  // Task 16.1 — read extension-scoped settings (namespace-enforced by Main),
  // falling back to defaults when unset. Forwarded as mount data so the
  // Renderer can surface them (e.g. the currency selector) once the
  // components consume them.
  const defaultCurrency =
    (await finance.settings?.get('salary-history.defaultCurrency')) ?? 'AUD';
  const financialYearStart =
    (await finance.settings?.get('salary-history.financialYearStart')) ?? '07-01';
  const mountData = { defaultCurrency, financialYearStart };

  // Decision 17 — two commands, one existing + one new.
  finance.commands.registerCommand('salary.show-pay-history', 'View: Pay History', () =>
    openView(finance, 'payslip-list', mountData),
  );
  finance.commands.registerCommand('salary.show-pay-rate-history', 'View: Pay Rate History', () =>
    openView(finance, 'pay-rate-history-view', mountData),
  );
}

export function deactivate(): void {
  // Review Finding 13 cleanup contract: unsubscribe from any ui-event
  // listeners and release the `finance` reference. Task 12 has no active
  // subscriptions yet (the ui-event back-channel arrives with the Task 14
  // UI mount); this is the hook those listeners will be torn down from.
}
