/**
 * Phase 4 Task 12 — salary-history extension entry point.
 *
 * Wires the extension to the host:
 *  1. Registers the six UI custom elements (via ./ui/index.js).
 *  2. Registers the two commands (Decision 17): `salary.show-pay-history`
 *     and `salary.show-pay-rate-history`.
 *  3. (Task 16.1) Reads namespace-scoped settings with safe defaults.
 *
 * The `finance` API passed to `activate` is the per-extension `FinanceApi`
 * (`db` + `commands` + `ai` + optional `ui`/`settings`). The Host process
 * has no DOM, so the command handlers request a UI mount over IPC
 * (`finance.ui.requestMount`) — Main forwards it to the Renderer, which
 * dynamically imports the extension bundle and mounts the named element.
 * Direct DOM creation here would fail at runtime (Node `utilityProcess`).
 */

import type { FinanceApi } from 'finance';

/**
 * Register the extension's custom elements. The Extension Host runs in a
 * Node `utilityProcess` with no DOM, so the UI components (which extend
 * `HTMLElement` / `LitElement`) MUST NOT be loaded there — importing `lit`
 * in Node throws `ReferenceError: HTMLElement is not defined`. The Renderer
 * (browser) calls this once per mount and awaits it before creating an
 * element; the Host never calls it, keeping the host bundle DOM-free. See
 * the activation crash fix in Task 17 R2.
 */
export async function registerUIComponents(): Promise<void> {
  if (typeof HTMLElement === 'undefined') return;
  await import('./ui/index.js');
}

/**
 * Ask the Renderer to mount one of this extension's custom elements. The
 * Host cannot render, so this is an IPC request — not a DOM operation.
 */
function openView(finance: FinanceApi, tag: string, mountData: Record<string, unknown> = {}): void {
  void finance.ui?.requestMount(tag, mountData);
}

/**
 * Open the primary Pay History view. On first run (empty `accounts` table,
 * which is Core-owned per Decision 4) this mounts the account seed modal so
 * the user creates their first account before the payslip form appears
 * (Task 17 TU1). Otherwise it mounts the payslip list.
 */
async function openPayHistory(
  finance: FinanceApi,
  mountData: Record<string, unknown>
): Promise<void> {
  const accounts = (await finance.db.table('accounts').find({ is_active: true })) as Array<{
    id: number;
  }>;
  if (accounts.length === 0) {
    openView(finance, 'accounts-seed-modal', mountData);
  } else {
    openView(finance, 'payslip-list', mountData);
  }
}

export async function activate(finance: FinanceApi): Promise<void> {
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
    openPayHistory(finance, mountData).catch((e) =>
      console.error('[salary-history] openPayHistory failed', e),
    ),
  );
  finance.commands.registerCommand('salary.show-pay-rate-history', 'View: Pay Rate History', () =>
    openView(finance, 'pay-rate-history-view', mountData),
  );

  // Activating the extension via its activity-bar view ("P") should open the
  // primary view, not just register commands. Mount it on activation so the
  // "P" icon is immediately usable.
  openPayHistory(finance, mountData).catch((e) =>
    console.error('[salary-history] openPayHistory (activation) failed', e),
  );
}

export function deactivate(): void {
  // Review Finding 13 cleanup contract: unsubscribe from any ui-event
  // listeners and release the `finance` reference. Task 12 has no active
  // subscriptions yet (the ui-event back-channel arrives with the Task 14
  // UI mount); this is the hook those listeners will be torn down from.
}
