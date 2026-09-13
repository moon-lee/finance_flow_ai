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
import { ExtensionLogger } from 'finance-logger';
import './styles/ext-tokens.css';
import { createPublicPayAdapter } from './services/public-pay-adapter.js';
import type { SalaryOrchestrator } from './ui/salary-orchestrator.js';

const logger = new ExtensionLogger('salary-history');

let _orchestrator: SalaryOrchestrator | null = null;

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
 * Ask the Renderer to mount the single `salary` panel. The Host cannot
 * render, so this is an IPC request — not a DOM operation. The target
 * child rides in `mountData.view`; settings are re-read fresh per command
 * so Host-context mounts carry current defaults.
 */
function openView(childTag: string): () => Promise<void> {
  return async () => {
    const finance = _registeredFinance;
    if (!finance) return;
    let financialYearStart = '07-01';
    let financialYearCurrent = '';
    let defaultCurrency = 'AUD';
    try {
      const s = await finance.settings?.get('core.financialYear.start');
      if (typeof s === 'string') financialYearStart = s;
    } catch { /* default */ }
    try {
      const c = await finance.settings?.get('core.financialYear.current');
      if (typeof c === 'string') financialYearCurrent = c;
    } catch { /* default */ }
    try {
      const d = await finance.settings?.get('core.defaultCurrency');
      if (typeof d === 'string') defaultCurrency = d;
    } catch { /* default */ }
    // Single panel identity ('salary' -> tab always "Salary"); target child rides in mountData.view.
    await finance.ui?.requestMount('salary', {
      view: childTag,
      defaultCurrency,
      financialYearStart,
      financialYearCurrent,
    });
  };
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
 * @param ctx  Optional mount context from the Host (via panel:init IPC:
 *               `{ viewId, ...mountData }`). Used in the panel renderer
 *               context; the Host context derives its own mountData from
 *               settings.
 */
export async function activate(
  finance: FinanceApi,
  ctx: { viewId?: string } & Record<string, unknown> = {}
): Promise<void> {
  // Capture the finance reference so deactivate() can use it as a fallback
  // when called without arguments (Task 7.3 — _registeredFinance bug fix).
  _registeredFinance = finance;

  const defaultCurrency =
    (await finance.settings?.get('core.defaultCurrency')) ?? 'AUD';
  const financialYearStart =
    (await finance.settings?.get('core.financialYear.start')) ?? '07-01';
  const financialYearCurrent =
    (await finance.settings?.get('core.financialYear.current')) ?? '';
   const settingsMountData = { defaultCurrency, financialYearStart, financialYearCurrent };
  logger.info('activate', { defaultCurrency, financialYearStart, financialYearCurrent });

   // Register public pay service + commands in ALL contexts.
   const payAdapter = createPublicPayAdapter(finance);
   finance.services?.register('pay', payAdapter as unknown as DomainServiceImpl);

    finance.commands.registerCommand('salary.show-pay-history', 'View: Pay History', (..._args: unknown[]) => {
      return openView('payslip-list')().catch((e) =>
         logger.error('openPayHistory failed', e),
      );
    });
    finance.commands.registerCommand('salary.show-pay-rate-history', 'View: Pay Rate History', (..._args: unknown[]) => {
      logger.info('mounting pay-rate-history-view');
      return openView('pay-rate-history-view')().catch((e) =>
         logger.error('requestMount pay-rate-history-view failed', e),
      );
    });

    // Panel renderer context — create the Orchestrator for direct DOM rendering.
    // Distinguished from the Host (Node) context by the presence of the panel's
    // `<div id="app">` container element. The Host has no DOM; happy-dom test
    // environments define HTMLElement but lack the panel's DOM structure.
    // The Orchestrator is dynamic-imported so the Host bundle stays DOM-free
    // (no top-level ui/orchestrator import); mirrors mortgage/src/main.ts.
    if (typeof window !== 'undefined') await import('./ui/index.js');
    if (ctx.viewId && typeof document !== 'undefined') {
      const app = document.getElementById('app');
      if (app) {
        const { SalaryOrchestrator } = await import('./ui/salary-orchestrator.js');
        const el = document.createElement('salary-orchestrator') as unknown as SalaryOrchestrator;
        void SalaryOrchestrator;
        app.innerHTML = '';
        app.appendChild(el as unknown as Node);
        const baseData = { viewId: ctx.viewId, ...(ctx as Record<string, unknown>) };
        queueMicrotask(() => void el.init(finance, baseData));
        setTimeout(() => {
          if ((el as unknown as { finance: unknown }).finance == null) void el.setFinance(finance);
        }, 50);
        app.addEventListener('mount-update', (e: Event) => {
          const detail = (e as CustomEvent).detail as Record<string, unknown>;
          void el.init(finance, { ...baseData, ...(detail ?? {}) });
        });
        _orchestrator = el;
      }
      return;
    }

  // Host context (Node) — open views via IPC.
}

let _registeredFinance: FinanceApi | null = null;

export function deactivate(finance?: FinanceApi): void {
  _orchestrator = null;

  const api = finance ?? _registeredFinance;
  if (api) {
    try {
      api.services?.unregister('pay');
    } catch (err) {
      logger.error('failed to unregister pay service:', err);
    }
  }
}
