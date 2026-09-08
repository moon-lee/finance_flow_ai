/**
 * Phase 7 Task 3 — Navigation orchestrator for the dashboard extension.
 *
 * Mirrors the salary-history orchestrator pattern: owns runtime state for
 * card order, loads/saves it via finance.settings, and drives navigation
 * between the dashboard view and the reorder modal.
 */

import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
import { buildAggregator, type DashboardData, type DashboardSettings } from './services/aggregator-service.js';

const logger = new ExtensionLogger('dashboard');

export const CANONICAL_CARD_ORDER = [
  'pay-summary',
  'todo-summary',
] as const;

export type CardId = (typeof CANONICAL_CARD_ORDER)[number];

const CARD_LABELS: Record<string, string> = {
  'pay-summary': 'Pay Summary',
  'todo-summary': 'Todo Summary',
};

export class DashboardOrchestrator {
  private _finance: FinanceApi;
  private _container: HTMLElement;
  private _currentTag = '';
  private _mountData: Record<string, unknown> = {};
  private _cardOrder: string[] = [...CANONICAL_CARD_ORDER];
  private _aggregator: DashboardData | null = null;
  private _dashboardSettings: { financialYearStart: string; financialYearCurrent: string; financeYearFilter: number } = {
    financialYearStart: '07-01',
    financialYearCurrent: '',
    financeYearFilter: 5,
  };

  constructor(finance: FinanceApi, container: HTMLElement, mountData: Record<string, unknown> = {}) {
    this._finance = finance;
    this._container = container;
    this._mountData = mountData;
  }

  async init(): Promise<void> {
    const settings = await this._loadDashboardSettings();
    this._cardOrder = settings.cardOrder;
    this._dashboardSettings = { financialYearStart: settings.financialYearStart, financialYearCurrent: settings.financialYearCurrent, financeYearFilter: settings.financeYearFilter };
    this._bindEvents();
    this.navigate('dashboard-view', this._mountData);
  }

  destroy(): void {
    this._unbindEvents();
  }

  // ── Event binding ──────────────────────────────────────────────────

  private readonly _handlers = new Map<string, EventListener>();

  private _bindEvents(): void {
    const on = (name: string, handler: (e: Event) => void): void => {
      const wrapped = handler as EventListener;
      this._handlers.set(name, wrapped);
      this._container.addEventListener(name, wrapped);
    };

    on('reorder-cards', this._onReorderRequest);
    on('card-order-change', this._onCardOrderChange);
    on('card-order-cancel', this._onReorderCancel);
    on('fy-changed', this._onFyChanged);
  }

  private _unbindEvents(): void {
    for (const [name, handler] of this._handlers) {
      this._container.removeEventListener(name, handler);
    }
    this._handlers.clear();
  }

  // ── Navigation ─────────────────────────────────────────────────────

  navigate(tag: string, mountData: Record<string, unknown> = {}): void {
    this._currentTag = tag;
    this._mountData = mountData;
    void this._mountChild();
  }

  private async _mountChild(): Promise<void> {
    if (!this._currentTag) return;
    try {
      const child = document.createElement(this._currentTag);
      const childEl = child as unknown as Record<string, unknown>;

    if (this._currentTag === 'dashboard-view') {
      const settings = await this._loadDashboardSettings();
      const hostAgg = this._mountData.aggregator as DashboardData | undefined;
      this._aggregator = hostAgg ?? await buildAggregator(this._finance, settings);
      childEl.aggregator = this._aggregator;
      childEl.cardOrder = this._cardOrder;
      childEl.financialYearStart = settings.financialYearStart;
      childEl.financialYearCurrent = settings.financialYearCurrent;
      childEl.financeYearFilter = settings.financeYearFilter;
    } else if (this._currentTag === 'reorder-cards-modal') {
      childEl.cardOrder = this._cardOrder;
    }

      this._container.replaceChildren(child);
    } catch (err) {
      logger.error(`orchestrator mount failed for ${this._currentTag}:`, err);
    }
  }

  // ── Settings persistence ───────────────────────────────────────────

  private async _loadDashboardSettings(): Promise<DashboardSettings> {
    const fyRaw = await this._finance.settings?.get('core.financialYear.start');
    const financialYearStart =
      (typeof fyRaw === 'string' ? fyRaw : undefined) ?? '07-01';

    const currentFyRaw = await this._finance.settings?.get('core.financialYear.current');
    const financialYearCurrent = typeof currentFyRaw === 'string' ? currentFyRaw : '';

    const filterRaw = await this._finance.settings?.get('core.financeYear.filter');
    const financeYearFilter = typeof filterRaw === 'number' && filterRaw > 0 ? filterRaw : 5;

    let cardOrder: string[] = [...CANONICAL_CARD_ORDER];
    if (this._finance.settings) {
      const saved = await this._finance.settings.get('dashboard.cardOrder');
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
          cardOrder = validOrder as string[];
        }
      }
    }

    return { financialYearStart, financialYearCurrent, cardOrder, financeYearFilter };
  }

  // ── Card reorder events ────────────────────────────────────────────

  private _onReorderRequest = (): void => {
    this.navigate('reorder-cards-modal', this._mountData);
  };

  private _onCardOrderChange = async (e: Event): Promise<void> => {
    const order = (e as CustomEvent).detail as string[];
    if (!Array.isArray(order)) return;
    if (this._finance.settings) {
      try {
        await this._finance.settings.set('dashboard.cardOrder', JSON.stringify(order));
        this._cardOrder = order;
      } catch (err) {
        logger.error('failed to persist card order:', err);
      }
    }
    this.navigate('dashboard-view', this._mountData);
  };

  private _onReorderCancel = (): void => {
    this.navigate('dashboard-view', this._mountData);
  };

  private _onFyChanged = async (e: Event): Promise<void> => {
    const detail = (e as CustomEvent).detail as { financialYearCurrent: string };
    const nextFy = typeof detail?.financialYearCurrent === 'string' ? detail.financialYearCurrent.trim() : '';
    if (!nextFy) return;
    if (this._finance.settings) {
      try {
        await this._finance.settings.set('core.financialYear.current', nextFy);
      } catch (err) {
        logger.error('failed to set financialYear.current:', err);
        return;
      }
    }
    // Panel (WebContentsView) has no real pay service (services.invoke is a noop).
    // Building the aggregator locally would discard the Host-computed data and
    // never recover when switching back to a FY that has data (user reported:
    // FY2023-2024 no data -> back to 2026-2027 stays empty). In panel, ask the
    // Host to rebuild via dashboard.refresh and rely on the mount-update push.
    const panelShell = (globalThis as unknown as { financeShell?: { extensions: { executeCommand: (id: string, ...args: unknown[]) => Promise<unknown> } } }).financeShell;
    if (panelShell?.extensions?.executeCommand) {
      const child = this._container.querySelector('dashboard-view') as HTMLElement | null;
      if (child) {
        (child as unknown as Record<string, unknown>).financialYearCurrent = nextFy;
      }
      try {
        await panelShell.extensions.executeCommand('dashboard.refresh');
      } catch (err) {
        logger.error('failed to refresh dashboard after FY change:', err);
      }
      return;
    }
    const settings = await this._loadDashboardSettings();
    this._dashboardSettings = { financialYearStart: settings.financialYearStart, financialYearCurrent: settings.financialYearCurrent, financeYearFilter: settings.financeYearFilter };
    this._aggregator = await buildAggregator(this._finance, settings);
    // Keep mountData in sync so a subsequent remount (e.g. after reorder modal)
    // does not revert to a stale host-computed aggregator.
    this._mountData = { ...this._mountData, aggregator: this._aggregator };
    const child = this._container.querySelector('dashboard-view') as HTMLElement | null;
    if (child) {
      (child as unknown as Record<string, unknown>).aggregator = this._aggregator;
      (child as unknown as Record<string, unknown>).financialYearCurrent = settings.financialYearCurrent;
    }
  };
}
