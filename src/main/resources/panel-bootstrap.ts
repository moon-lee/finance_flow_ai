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
 *   6. Listens for `panel:mount-update` / `panel:navigate` and re-dispatches
 *      them as DOM CustomEvents for the Orchestrator.
 *
 * Account creation is owned by the Orchestrator, which calls the Core-owned
 * `financeShell.accounts.create` bridge on `account-create` and navigates on
 * success. A bootstrap-level listener would insert a second row for the same
 * submit, so it is intentionally not registered here.
 */

import type { FinanceApi } from '../../types/finance';
import type { PanelFinanceShellApi } from '../../types/finance-shell';
import { darkenHex, isThemeColor } from '../../shared/theme-color';

declare const financeShell: PanelFinanceShellApi;

function getPanelCallerInfo(): { file: string; line: number } | null {
  const stack = new Error().stack;
  if (!stack) return null;
  const lines = stack.split('\n').slice(2);
  for (const line of lines) {
    const match = line.match(/\(([^)]+):(\d+):\d+\)/);
    if (!match) continue;
    const fullPath = match[1];
    if (fullPath.endsWith('panel-bootstrap.ts')) continue;
    const file = fullPath.split(/[\\/]/).pop() ?? fullPath;
    return { file, line: parseInt(match[2], 10) };
  }
  return null;
}

const panelLogger = {
  log: (message: string, ...args: unknown[]) => {
    const callerInfo = getPanelCallerInfo();
    const suffix = callerInfo ? `  ${callerInfo.file}:${callerInfo.line}` : '';
    console.log(`[panel] ${message}${suffix}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    const callerInfo = getPanelCallerInfo();
    const suffix = callerInfo ? `  ${callerInfo.file}:${callerInfo.line}` : '';
    console.warn(`[panel] ${message}${suffix}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    const callerInfo = getPanelCallerInfo();
    const suffix = callerInfo ? `  ${callerInfo.file}:${callerInfo.line}` : '';
    console.error(`[panel] ${message}${suffix}`, ...args);
  },
};

interface PanelPayload {
  extensionId: string;
  viewId: string;
  mountData?: Record<string, unknown>;
  themeColor?: string;
}

/**
 * Events dispatched by extension components that must be forwarded to Main
 * via `extensions:ui-event`. The list covers all events the salary-history
 * extension's UI components emit (per its manifest's `allowedUiEvents`).
 */
const FORWARDED_EVENTS = [
  'payslip-add-request',
  'payslip-create',
  'payslip-edit-request',
  'payslip-edit',
  'payslip-cancel',
  'payslip-delete',
  'rate-edit-request',
  'rate-view-request',
  'rate-add-request',
  'rate-create',
  'rate-edit',
  'rate-form-cancel',
  'section-order-change',
];

/** Per-extension unmount callback lists keyed by extensionId. */
const unmountCallbacks = new Map<string, Array<() => Promise<void>>>();

/**
 * Build a minimal FinanceApi from the panel preload's financeShell bridge.
 * The extension's `activate(finance)` uses this to access the database
 * (via readTable/writeTable IPC), settings, and account creation.
 */
function createPanelFinanceApi(extensionId: string): FinanceApi {
  const noop = () => {};
  const noopAsync = async <T = unknown>(): Promise<T | null> => null;
  const cbs = unmountCallbacks.get(extensionId) ?? [];
  unmountCallbacks.set(extensionId, cbs);

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
        update: async (where: Record<string, unknown>, payload: Record<string, unknown>) => {
          const res = await financeShell.extensions.writeTable({ op: 'update', extensionId, table: name, payload, where }) as { affected: number };
          return res.affected ?? 0;
        },
        delete: async (query: Record<string, unknown>) => {
          const res = await financeShell.extensions.writeTable({ op: 'delete', extensionId, table: name, where: query }) as { affected: number };
          return res.affected ?? 0;
        },
      }),
    },
    commands: { registerCommand: noop, execute: noopAsync },
    ai: { registerTool: noop },
    services: { register: noop, unregister: noop, invoke: noopAsync },
    settings: financeShell.settings,
    ui: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      requestMount: async (_viewId: string, _mountData?: object) => {
        panelLogger.warn(`[panel] requestMount: ${_viewId} — panel already mounted, ignoring`);
      },
      // Todo auto-refresh (Option A) — panels never push; the Host does.
      // Present (as a warn) so panel-side `finance.ui.pushData?.()` calls
      // typecheck against the canonical `UiApi` without crashing at runtime.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      pushData: async (_viewId: string, _mountData?: object) => {
        panelLogger.warn(`[panel] pushData: ${_viewId} — panels cannot push, ignoring`);
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      navigatePanel: async (_view: string, _mountData?: object) => {
        financeShell.extensions.uiEvent(extensionId, `navigate:${_view}`, {});
      },
      setDirty: (dirty: boolean) => {
        financeShell.extensions.setDirty(extensionId, dirty);
      },
      autoSaveDraft: async () => {
        await financeShell.extensions.autoSaveDraft(extensionId);
      },
      onBeforeUnmount: (callback: () => Promise<void>) => {
        cbs.push(callback);
      },
    },
  };

  return finance;
}

async function mountPanelComponent(payload: PanelPayload): Promise<void> {
  const { extensionId, viewId, mountData } = payload;
  let themeColor = isThemeColor(payload.themeColor) ? payload.themeColor : undefined;
  panelLogger.log('[panel bootstrap] mountPanelComponent', { extensionId, viewId, hasMountData: !!mountData });

  const theme = await financeShell.theme.get();
  const root = document.documentElement;
  if (theme === 'light') {
    document.body.classList.add('light-theme');
    root.style.setProperty('--ff-bg-base', '#f8fafc');
    root.style.setProperty('--ff-bg-panel', '#ffffff');
    root.style.setProperty('--ff-bg-subpanel', '#f1f5f9');
    root.style.setProperty('--ff-bg-input', '#e2e8f0');
    root.style.setProperty('--ff-bg-input-hover', '#cbd5e1');
    root.style.setProperty('--ff-warning-bg', '#fef3c7');
    root.style.setProperty('--ff-warning-text', '#92400e');
    root.style.setProperty('--ff-danger-bg', '#fef2f2');
    root.style.setProperty('--ff-danger-border', '#fecaca');
    root.style.setProperty('--ff-danger-hover', '#fecaca');
    root.style.setProperty('--ff-border', '#e2e8f0');
    root.style.setProperty('--ff-text', '#1e293b');
    root.style.setProperty('--ff-text-muted', '#64748b');
    root.style.setProperty('--ff-text-strong', '#0f172a');
    root.style.setProperty('--ff-accent', '#007acc');
    root.style.setProperty('--ff-accent-hover', '#1188dd');
    root.style.setProperty('--ff-teal', '#4ec9b0');
    root.style.setProperty('--ff-teal-hover', '#5aafa0');
    root.style.setProperty('--ff-danger', '#dc2626');
  } else {
    document.body.classList.remove('light-theme');
    root.style.setProperty('--ff-bg-base', '#1e1e1e');
    root.style.setProperty('--ff-bg-panel', '#252526');
    root.style.setProperty('--ff-bg-subpanel', '#2a2a2a');
    root.style.setProperty('--ff-bg-input', '#3c3c3c');
    root.style.setProperty('--ff-bg-input-hover', '#4a4a4a');
    root.style.setProperty('--ff-warning-bg', '#3a2e0a');
    root.style.setProperty('--ff-warning-text', '#ffd866');
    root.style.setProperty('--ff-danger-bg', '#5a2a2a');
    root.style.setProperty('--ff-danger-border', '#5a2a2a');
    root.style.setProperty('--ff-danger-hover', '#7a3636');
    root.style.setProperty('--ff-border', '#3e3e3e');
    root.style.setProperty('--ff-text', '#d4d4d4');
    root.style.setProperty('--ff-text-muted', '#858585');
    root.style.setProperty('--ff-text-strong', '#ffffff');
    root.style.setProperty('--ff-accent', '#007acc');
    root.style.setProperty('--ff-accent-hover', '#1188dd');
    root.style.setProperty('--ff-teal', '#4ec9b0');
    root.style.setProperty('--ff-teal-hover', '#6fdec0');
    root.style.setProperty('--ff-danger', '#f48771');
  }

  if (themeColor) {
    root.style.setProperty('--ff-accent', themeColor);
    root.style.setProperty('--ff-accent-hover', darkenHex(themeColor));
  }

  financeShell.theme.onChange((newTheme: string) => {
    if (newTheme === 'light') {
      document.body.classList.add('light-theme');
      root.style.setProperty('--ff-bg-base', '#f8fafc');
      root.style.setProperty('--ff-bg-panel', '#ffffff');
      root.style.setProperty('--ff-bg-subpanel', '#f1f5f9');
      root.style.setProperty('--ff-bg-input', '#e2e8f0');
      root.style.setProperty('--ff-bg-input-hover', '#cbd5e1');
      root.style.setProperty('--ff-warning-bg', '#fef3c7');
      root.style.setProperty('--ff-warning-text', '#92400e');
      root.style.setProperty('--ff-danger-bg', '#fef2f2');
      root.style.setProperty('--ff-danger-border', '#fecaca');
      root.style.setProperty('--ff-danger-hover', '#fecaca');
      root.style.setProperty('--ff-border', '#e2e8f0');
      root.style.setProperty('--ff-text', '#1e293b');
      root.style.setProperty('--ff-text-muted', '#64748b');
      root.style.setProperty('--ff-text-strong', '#0f172a');
      root.style.setProperty('--ff-accent', '#007acc');
      root.style.setProperty('--ff-accent-hover', '#1188dd');
      root.style.setProperty('--ff-teal', '#4ec9b0');
      root.style.setProperty('--ff-teal-hover', '#5aafa0');
      root.style.setProperty('--ff-danger', '#dc2626');
    } else {
      document.body.classList.remove('light-theme');
      root.style.setProperty('--ff-bg-base', '#1e1e1e');
      root.style.setProperty('--ff-bg-panel', '#252526');
      root.style.setProperty('--ff-bg-subpanel', '#2a2a2a');
      root.style.setProperty('--ff-bg-input', '#3c3c3c');
      root.style.setProperty('--ff-bg-input-hover', '#4a4a4a');
      root.style.setProperty('--ff-warning-bg', '#3a2e0a');
      root.style.setProperty('--ff-warning-text', '#ffd866');
      root.style.setProperty('--ff-danger-bg', '#5a2a2a');
      root.style.setProperty('--ff-danger-border', '#5a2a2a');
      root.style.setProperty('--ff-danger-hover', '#7a3636');
      root.style.setProperty('--ff-border', '#3e3e3e');
      root.style.setProperty('--ff-text', '#d4d4d4');
      root.style.setProperty('--ff-text-muted', '#858585');
      root.style.setProperty('--ff-text-strong', '#ffffff');
      root.style.setProperty('--ff-accent', '#007acc');
      root.style.setProperty('--ff-accent-hover', '#1188dd');
      root.style.setProperty('--ff-teal', '#4ec9b0');
      root.style.setProperty('--ff-teal-hover', '#6fdec0');
      root.style.setProperty('--ff-danger', '#f48771');
    }
    if (themeColor) {
      root.style.setProperty('--ff-accent', themeColor);
      root.style.setProperty('--ff-accent-hover', darkenHex(themeColor));
    }
  });

  const bundleUrl = `finance-shell://extensions/${extensionId}.js`;
  const cssUrl = `finance-shell://extensions/${extensionId}.css`;

  try {
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = cssUrl;
    document.head.appendChild(cssLink);
    panelLogger.log('[panel bootstrap] injected CSS:', cssUrl);

    panelLogger.log('[panel bootstrap] importing bundle:', bundleUrl);
    const bundle = await import(bundleUrl);
    panelLogger.log('[panel bootstrap] bundle imported:', extensionId);

    const app = document.getElementById('app');
    if (!app) {
      panelLogger.error('[panel bootstrap] #app element not found in panel template');
      return;
    }

    // --- Event forwarding to Main ---
    for (const eventName of FORWARDED_EVENTS) {
      app.addEventListener(eventName, ((e: Event) => {
        const detail = (e as CustomEvent).detail;
        panelLogger.log('[panel bootstrap] forwarding UI event:', eventName);
        financeShell.extensions.uiEvent(extensionId, eventName, detail);
      }) as EventListener);
    }

    // --- Activate the extension ---
    panelLogger.log('[panel bootstrap] creating FinanceApi and calling activate for', extensionId);
    const finance = createPanelFinanceApi(extensionId);
    
    if (typeof bundle.registerUIComponents === "function") {
      await bundle.registerUIComponents();
    } else {
      panelLogger.warn(`[panel bootstrap] ${extensionId} does not implement registerUIComponents`);
    }
    
    panelLogger.log('[panel bootstrap] calling activate for', extensionId);
    await bundle.activate(finance, { viewId, ...(mountData ?? {}) });
    panelLogger.log('[panel bootstrap] activate completed for', extensionId);

    // --- Mount updates from Host (e.g. Dashboard refresh) ---
    financeShell.onMountUpdate((payload: unknown) => {
      const { mountData: nextMountData, themeColor: nextThemeColor } = payload as {
        mountData?: Record<string, unknown>;
        themeColor?: string;
      };
      if (isThemeColor(nextThemeColor)) {
        themeColor = nextThemeColor;
        root.style.setProperty('--ff-accent', themeColor);
        root.style.setProperty('--ff-accent-hover', darkenHex(themeColor));
      } else if (nextThemeColor === undefined) {
        themeColor = undefined;
        root.style.setProperty('--ff-accent', '#007acc');
        root.style.setProperty('--ff-accent-hover', '#1188dd');
      }
      const mountData = nextMountData;
      if (!mountData) return;
      const app = document.getElementById('app');
      if (app) {
        app.dispatchEvent(new CustomEvent('mount-update', { detail: mountData }));
      }
    });

    // --- Panel navigation from Host ---
    financeShell.onNavigate((payload: unknown) => {
      const { view, mountData: navMountData } = payload as { view: string; mountData?: Record<string, unknown> };
      panelLogger.log('[panel bootstrap] received panel:navigate', { view });
      const app = document.getElementById('app');
      if (app) {
        app.dispatchEvent(new CustomEvent('host-navigate', { detail: { view, mountData: navMountData } }));
      }
    });
  } catch (err) {
    panelLogger.error('[panel bootstrap] failed to mount component:', err);
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = '<p style="color:#ff6b6b;padding:1rem;">Panel failed to load. See console for details.</p>';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  panelLogger.log('[panel bootstrap] DOMContentLoaded');
  financeShell.onPanelInit(async (payload: unknown) => {
    panelLogger.log('[panel bootstrap] received panel:init', payload);
    await mountPanelComponent(payload as PanelPayload);
  });
});
