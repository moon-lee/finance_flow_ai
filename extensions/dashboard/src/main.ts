/**
 * Phase 5 Task 9 — Dashboard extension entry point.
 *
 * The Dashboard is the default-landing aggregator extension (Decision 2).
 * It arrives at `onStartup` activation and:
 *  1. Reads `dashboard.cardOrder` and `dashboard.financialYearStart` settings.
 *  2. Calls `buildAggregator` to fetch data from `accounts` (shared table)
 *     and `finance.services.pay.*` (cross-extension contract).
 *  3. Requests a UI mount for the `dashboard-view` Lit element with the
 *     aggregator payload + settings as mount data.
 *  4. Registers the `dashboard.refresh` command (re-runs the aggregator).
 *
 * If salary-history is missing/disabled, every `finance.services.invoke`
 * call returns `null` and the cards show graceful-degradation placeholders.
 */

import type { FinanceApi } from 'finance';
import { buildAggregator, type DashboardData, type DashboardSettings } from './services/aggregator-service.js';

const DEFAULT_CARD_ORDER = ['net-worth', 'ytd-salary', 'last-payslip', 'accounts-summary'];

/**
 * Register the extension's custom elements. The Extension Host runs in a
 * Node `utilityProcess` with no DOM, so Lit components MUST NOT be loaded
 * there. The Renderer (browser) calls this once per mount and awaits it
 * before creating an element.
 */
export async function registerUIComponents(): Promise<void> {
  if (typeof HTMLElement === 'undefined') return;
  await import('./ui/index.js');
}

async function readSettings(finance: FinanceApi): Promise<DashboardSettings> {
  const cardOrderRaw = await finance.settings?.get('dashboard.cardOrder');
  const cardOrder = Array.isArray(cardOrderRaw)
    ? cardOrderRaw.filter((c): c is string => typeof c === 'string')
    : DEFAULT_CARD_ORDER;
  const fyRaw = await finance.settings?.get('dashboard.financialYearStart');
  const financialYearStart =
    (typeof fyRaw === 'string' ? fyRaw : undefined) ?? '07-01';
  return { cardOrder, financialYearStart };
}

export async function activate(finance: FinanceApi, hostMountData?: Record<string, unknown>): Promise<void> {
  const settings = await readSettings(finance);
  const aggregator = await buildAggregator(finance, settings);
  const mountData = { aggregator, cardOrder: settings.cardOrder };

  // Register commands in ALL contexts so refresh works in the panel too.
  finance.commands.registerCommand('dashboard.refresh', 'View: Refresh Dashboard', () => {
    return buildAggregator(finance, settings)
      .then((data) => {
        finance.ui?.requestMount('dashboard-view', {
          aggregator: data,
          cardOrder: settings.cardOrder
        });
      })
      .catch((err) => console.error('[dashboard] refresh failed:', err));
  });

  finance.commands.registerCommand('dashboard.open-net-worth-detail', 'View: Net Worth Detail', () => {
    console.log('[dashboard] Net Worth Detail — placeholder for Phase 7 detail view');
  });

  // Panel renderer context — mount dashboard-view directly into #app.
  // Distinguished from the Host (Node) context by the presence of the panel's
  // `<div id="app">` container element. The Host has no DOM; happy-dom test
  // environments define HTMLElement but lack the panel's DOM structure.
  if (typeof HTMLElement !== 'undefined' && document.getElementById('app')) {
    await import('./ui/index.js');
    const container = document.getElementById('app');
    if (container) {
      const el = document.createElement('dashboard-view');
      (el as unknown as Record<string, unknown>).aggregator = aggregator;
      (el as unknown as Record<string, unknown>).cardOrder = settings.cardOrder;
      container.appendChild(el);
    }
    return;
  }

  // Host context (Node) — request mount via IPC.
  finance.ui?.requestMount('dashboard-view', mountData);
}

export function deactivate(): void {
  // No persistent subscriptions; nothing to tear down.
}
