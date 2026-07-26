/**
 * Phase 5 panel renderer bootstrap.
 *
 * Served at `finance-shell://panel/<extensionId>/bootstrap.js` (compiled to dist/resources/).
 * Runs inside the WebContentsView panel renderer process:
 *
 *   1. Subscribes to `panel:init` (cached payload if event already fired).
 *   2. Dynamically imports the extension bundle.
 *   3. Builds a FinanceApi wrapper from financeShell.
 *   4. Calls `activate(finance)` — the extension detects the panel context
 *      and creates the Orchestrator which owns navigation and DOM lifecycle.
 *   5. Forwards DOM CustomEvents back to Main via `financeShell.extensions.uiEvent()`.
 *   6. Handles Core-owned events (e.g. `account-create`) via IPC.
 */

import type { FinanceApi } from '../../types/finance';
import type { PanelFinanceShellApi } from '../../types/finance-shell';

declare const financeShell: PanelFinanceShellApi;

interface PanelPayload {
  extensionId: string;
  viewId: string;
  mountData?: Record<string, unknown>;
}

/**
 * Events dispatched by extension components that must be forwarded to Main
 * via `extensions:ui-event`. The list covers all events the salary-history
 * extension's UI components emit (per its manifest's `allowedUiEvents`).
 */
const FORWARDED_EVENTS = [
  'account-seed-skip',
  'account-seed-cancel',
  'payslip-add-request',
  'payslip-create',
  'payslip-edit-request',
  'payslip-edit',
  'payslip-cancel',
  'payslip-delete',
  'rate-add-request',
  'rate-edit-request',
  'rate-view-request',
  'rate-create',
  'rate-edit',
  'rate-form-cancel',
  'section-order-change',
];

/**
 * Build a minimal FinanceApi from the panel preload's financeShell bridge.
 * The extension's `activate(finance)` uses this to access the database
 * (via readTable/writeTable IPC), settings, and account creation.
 */
function createPanelFinanceApi(extensionId: string): FinanceApi {
  const noop = () => {};
  const noopAsync = async <T = unknown>(): Promise<T | null> => null;

  const finance: FinanceApi = {
    db: {
      table: (name: string) => ({
        find: async (query?: Record<string, unknown>) => {
          const res = await financeShell.extensions.readTable({ op: 'find', extensionId, table: name, query: query ?? {} }) as { rows: Record<string, unknown>[] };
          return res.rows ?? [];
        },
        findOne: async (query: Record<string, unknown>) => {
          const res = await financeShell.extensions.readTable({ op: 'findOne', extensionId, table: name, query }) as { row: Record<string, unknown> | null };
          return res.row ?? null;
        },
        count: async (query?: Record<string, unknown>) => {
          const res = await financeShell.extensions.readTable({ op: 'count', extensionId, table: name, query: query ?? {} }) as { count: number };
          return res.count ?? 0;
        },
        insert: async (payload: Record<string, unknown>) => {
          const res = await financeShell.extensions.writeTable({ op: 'insert', extensionId, table: name, payload }) as { row: unknown };
          return (res.row ?? {}) as Record<string, unknown>;
        },
        update: async (payload: Record<string, unknown>, query: Record<string, unknown>) => {
          const res = await financeShell.extensions.writeTable({ op: 'update', extensionId, table: name, payload, query }) as { affected: number };
          return res.affected ?? 0;
        },
        delete: async (query: Record<string, unknown>) => {
          const res = await financeShell.extensions.writeTable({ op: 'delete', extensionId, table: name, query }) as { affected: number };
          return res.affected ?? 0;
        },
      }),
    },
    commands: { registerCommand: noop, execute: noopAsync },
    ai: { registerTool: noop },
    services: { register: noop, unregister: noop, invoke: noopAsync },
    settings: financeShell.settings,
  };

  return finance;
}

async function mountPanelComponent(payload: PanelPayload): Promise<void> {
  const { extensionId, viewId, mountData } = payload;
  console.log('[panel bootstrap] mountPanelComponent', { extensionId, viewId, hasMountData: !!mountData });
  const bundleUrl = `finance-shell://extensions/${extensionId}.js`;

  try {
    console.log('[panel bootstrap] importing bundle:', bundleUrl);
    const bundle = await import(bundleUrl);
    console.log('[panel bootstrap] bundle imported:', extensionId);

    const app = document.getElementById('app');
    if (!app) {
      console.error('[panel bootstrap] #app element not found in panel template');
      return;
    }

    // --- Event forwarding to Main ---
    for (const eventName of FORWARDED_EVENTS) {
      app.addEventListener(eventName, ((e: Event) => {
        const detail = (e as CustomEvent).detail;
        console.log('[panel bootstrap] forwarding UI event:', eventName);
        financeShell.extensions.uiEvent(extensionId, eventName, detail);
      }) as EventListener);
    }

    // --- Core-owned event: account-create ---
    app.addEventListener('account-create', (async (e: Event) => {
      const detail = (e as CustomEvent).detail as { name: string; institution: string | null } | undefined;
      if (!detail || typeof detail.name !== 'string' || detail.name.trim() === '') return;
      try {
        await financeShell.accounts.create({
          name: detail.name.trim(),
          institution: detail.institution ?? null,
        });
      } catch (err) {
        console.error('[panel bootstrap] account-create failed:', err);
      }
    }) as EventListener);

    // --- Activate the extension ---
    console.log('[panel bootstrap] creating FinanceApi and calling activate for', extensionId);
    const finance = createPanelFinanceApi(extensionId);
    
    if (typeof bundle.registerUIComponents === "function") {
      await bundle.registerUIComponents();
    } else {
      console.warn(`[panel bootstrap] ${extensionId} does not implement registerUIComponents`);
    }
    
    console.log('[panel bootstrap] calling activate for', extensionId);
    await bundle.activate(finance, { viewId, ...(mountData ?? {}) });
    console.log('[panel bootstrap] activate completed for', extensionId);

    // --- Panel navigation from Host ---
    financeShell.onNavigate((payload: unknown) => {
      const { view, mountData: navMountData } = payload as { view: string; mountData?: Record<string, unknown> };
      console.log('[panel bootstrap] received panel:navigate', { view });
      const app = document.getElementById('app');
      if (app) {
        app.dispatchEvent(new CustomEvent('host-navigate', { detail: { view, mountData: navMountData } }));
      }
    });
  } catch (err) {
    console.error('[panel bootstrap] failed to mount component:', err);
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = '<p style="color:#ff6b6b;padding:1rem;">Panel failed to load. See console for details.</p>';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[panel bootstrap] DOMContentLoaded');
  financeShell.onPanelInit(async (payload: unknown) => {
    console.log('[panel bootstrap] received panel:init', payload);
    await mountPanelComponent(payload as PanelPayload);
  });
});
