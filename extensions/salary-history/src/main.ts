/**
 * Phase 5 Task 8 — salary-history extension entry point.
 *
 * Wires the extension to the host:
 *  1. Registers the six UI custom elements (via ./ui/index.js).
 *  2. Registers the two commands (Decision 17): `salary.show-pay-history`
 *     and `salary.show-pay-rate-history`.
 *  3. (Task 16.1) Reads namespace-scoped settings with safe defaults.
 *  4. (Phase 5) Registers the public `finance.services.pay.*` adapter
 *     so other extensions (e.g. Dashboard) can read salary data.
 *
 * The `finance` API passed to `activate` is the per-extension `FinanceApi`
 * (`db` + `commands` + `ai` + `services` + optional `ui`/`settings`).
 */

import type { FinanceApi, DomainServiceImpl } from 'finance';
import { createPublicPayAdapter } from './services/public-pay-adapter.js';
import { Orchestrator } from './orchestrator.js';

let _orchestrator: Orchestrator | null = null;

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
 * which is Core-owned per Decision 4) this skips showing the seed modal
 * (one-off setup the user can perform manually) and does nothing.
 * Otherwise it mounts the payslip list.
 */
async function openPayHistory(
  finance: FinanceApi,
  mountData: Record<string, unknown>
): Promise<void> {
  const accounts = (await finance.db.table('accounts').find({ is_active: true })) as Array<{
    id: number;
  }>;
/*   if (accounts.length === 0) {
    console.log('[salary-history] no accounts found — skipping seed modal on startup');
    return;
  } */
  console.log('[salary-history] open view payslip list on startup');
  openView(finance, 'payslip-list', mountData);
}

/**
 * Activate the extension. Called in two contexts:
 *
 * 1. **Host context** (Node, `typeof HTMLElement === 'undefined'`): register
 *    commands, the public pay adapter, and open views via IPC.
 *
 * 2. **Panel renderer context** (browser): register UI components, create
 *    the Orchestrator, and render the initial view directly in the DOM.
 *
 * @param finance  Per-extension FinanceApi surface.
 * @param hostMountData  Optional mount data from the Host (via panel:init IPC).
 *                       Used in the panel renderer context; the Host context
 *                       derives its own mountData from settings.
 */
export async function activate(
  finance: FinanceApi,
  hostMountData?: Record<string, unknown>
): Promise<void> {
  // Capture the finance reference so deactivate() can use it as a fallback
  // when called without arguments (Task 7.3 — _registeredFinance bug fix).
  _registeredFinance = finance;

  const defaultCurrency =
    (await finance.settings?.get('salary-history.defaultCurrency')) ?? 'AUD';
  const financialYearStart =
    (await finance.settings?.get('salary-history.financialYearStart')) ?? '07-01';
  const settingsMountData = { defaultCurrency, financialYearStart };
   console.log('[salary-history] activate', { defaultCurrency, financialYearStart });
  // Panel renderer context — create the Orchestrator for direct DOM rendering.
  // Distinguished from the Host (Node) context by the presence of the panel's
  // `<div id="app">` container element. The Host has no DOM; happy-dom test
  // environments define HTMLElement but lack the panel's DOM structure.
  if (typeof HTMLElement !== 'undefined' && document.getElementById('app')) {
    await registerUIComponents();
    const container = document.getElementById('app');
    if (container) {
      // Merge: Host-provided mountData takes precedence over settings-derived
      const mountData = { ...settingsMountData, ...hostMountData };
      _orchestrator = new Orchestrator(finance, container, mountData);
      await _orchestrator.init();
    }
    return;
  }

  // Host context (Node) — register commands + services, open views via IPC.
  const payAdapter = createPublicPayAdapter(finance);
  finance.services?.register('pay', payAdapter as unknown as DomainServiceImpl);

  finance.commands.registerCommand('salary.show-pay-history', 'View: Pay History', () =>
    openPayHistory(finance, settingsMountData).catch((e) =>
      console.error('[salary-history] openPayHistory failed', e),
    ),
  );
  finance.commands.registerCommand('salary.show-pay-rate-history', 'View: Pay Rate History', () => {
    console.log('[salary-history] mounting pay-rate-history-view');
    finance.ui?.requestMount('pay-rate-history-view', settingsMountData).catch((e) =>
      console.error('[salary-history] requestMount pay-rate-history-view failed', e),
    );
  });
}

let _registeredFinance: FinanceApi | null = null;

export function deactivate(finance?: FinanceApi): void {
  if (_orchestrator) {
    _orchestrator.destroy();
    _orchestrator = null;
  }

  const api = finance ?? _registeredFinance;
  if (api) {
    try {
      api.services?.unregister('pay');
    } catch (err) {
      console.error('[salary-history] failed to unregister pay service:', err);
    }
  }
}
