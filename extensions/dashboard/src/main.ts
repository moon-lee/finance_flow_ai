/**
 * Phase 5 Task 9 — Dashboard extension entry point.
 *
 * The Dashboard is the default-landing aggregator extension (Decision 2).
 * It arrives at `onStartup` activation and:
 *   1. Reads `dashboard.financialYearStart` setting.
 *   2. Calls `buildAggregator` to fetch data from `accounts` (shared table)
 *      and `finance.services.pay.*` (cross-extension contract).
 *   3. Instantiates a `DashboardOrchestrator` to own card-order state and
 *      navigation between the dashboard view and the reorder modal.
 *   4. Registers the `dashboard.refresh` command (re-runs the aggregator).
 *
 * Card order is managed extension-side via `finance.settings.get/set`
 * on the `dashboard.cardOrder` key, mirroring the salary-history
 * section-order pattern.
 */

import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
import './styles/ext-tokens.css';
import { buildAggregator, type DashboardData, type DashboardSettings } from './services/aggregator-service.js';
import { DashboardOrchestrator, CANONICAL_CARD_ORDER } from './orchestrator.js';

const logger = new ExtensionLogger('dashboard');

const DEFAULT_FINANCIAL_YEAR_START = '07-01';

export async function registerUIComponents(): Promise<void> {
  if (typeof HTMLElement === 'undefined') return;
  await import('./ui/index.js');
}

async function readSettings(finance: FinanceApi): Promise<DashboardSettings> {
  const fyRaw = await finance.settings?.get('core.financialYear.start');
  const financialYearStart =
    (typeof fyRaw === 'string' ? fyRaw : undefined) ?? DEFAULT_FINANCIAL_YEAR_START;

  const currentFyRaw = await finance.settings?.get('core.financialYear.current');
  const financialYearCurrent = typeof currentFyRaw === 'string' ? currentFyRaw : '';

  let cardOrder: (typeof CANONICAL_CARD_ORDER)[number][] = [...CANONICAL_CARD_ORDER];
  if (finance.settings) {
    const saved = await finance.settings.get('dashboard.cardOrder');
    let parsed: unknown;
    if (typeof saved === 'string') {
      try {
        parsed = JSON.parse(saved);
      } catch { /* ignore */ }
    } else {
      parsed = saved;
    }
    if (Array.isArray(parsed)) {
      const validOrder = parsed.filter(
        (id): id is typeof CANONICAL_CARD_ORDER[number] =>
          CANONICAL_CARD_ORDER.includes(id as typeof CANONICAL_CARD_ORDER[number])
      );
      if (validOrder.length > 0) {
        cardOrder = validOrder as (typeof CANONICAL_CARD_ORDER)[number][];
      }
    }
  }

  const filterRaw = await finance.settings?.get('core.financeYear.filter');
  const financeYearFilter = typeof filterRaw === 'number' && filterRaw > 0 ? filterRaw : 5;

  return { financialYearStart, financialYearCurrent, cardOrder, financeYearFilter };
}

export async function activate(finance: FinanceApi, hostMountData?: Record<string, unknown>): Promise<void> {
  const settings = await readSettings(finance);
  const aggregator = await buildAggregator(finance, settings);

  finance.commands.registerCommand('dashboard.refresh', 'View: Refresh Dashboard', async () => {
    try {
      const settings = await readSettings(finance);
      const data = await buildAggregator(finance, settings);
      finance.ui?.requestMount('dashboard-view', {
        aggregator: data,
        cardOrder: settings.cardOrder,
        financialYearCurrent: settings.financialYearCurrent,
        financialYearStart: settings.financialYearStart,
        financeYearFilter: settings.financeYearFilter,
      });
    } catch (err) {
      logger.error('refresh failed:', err);
    }
  });

  finance.commands.registerCommand('dashboard.open-net-worth-detail', 'View: Net Worth Detail', () => {
    logger.info('Net Worth Detail — placeholder for Phase 7 detail view');
  });

  if (typeof HTMLElement !== 'undefined' && document.getElementById('app')) {
    await import('./ui/index.js');
    const container = document.getElementById('app');
    if (container) {
      const orchestrator = new DashboardOrchestrator(finance, container, {
        aggregator: hostMountData?.aggregator ?? aggregator,
        cardOrder: (hostMountData?.cardOrder as string[] | undefined) ?? settings.cardOrder,
      });
      await orchestrator.init();
    }
    return;
  }

  finance.ui?.requestMount('dashboard-view', {
    aggregator,
    cardOrder: settings.cardOrder,
    financialYearCurrent: settings.financialYearCurrent,
    financialYearStart: settings.financialYearStart,
    financeYearFilter: settings.financeYearFilter,
  });
}

export function deactivate(): void {
  // No persistent subscriptions; nothing to tear down.
}
