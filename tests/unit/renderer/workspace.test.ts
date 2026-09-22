// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { WorkspacePanel, type Tab } from '../../../src/renderer/components/workspace';

describe('workspace-panel', () => {
  beforeEach(() => {
    localStorage.clear();
    if (!customElements.get('workspace-panel')) customElements.define('workspace-panel', WorkspacePanel);
    if (!customElements.get('tab-bar')) customElements.define('tab-bar', class extends HTMLElement {});
  });

  const DASHBOARD = { panelId: 'panel-dashboard-dashboard-view', label: 'Dashboard' };
  const SALARY = { panelId: 'panel-salary-history-salary-history', label: 'Salary History' };

  function makeEl() {
    const el = document.createElement('workspace-panel');
    document.body.appendChild(el);
    return el as unknown as {
      _tabs: Tab[];
      _activePanelId: string;
      _addPanel: (panelId: string, label: string) => void;
      _focusPanel: (panelId: string) => void;
      _closePanel: (panelId: string) => void;
    };
  }

  it('defaults to a single Dashboard tab', () => {
    const el = makeEl();
    expect(el._tabs).toEqual([DASHBOARD]);
    expect(el._activePanelId).toBe(DASHBOARD.panelId);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('adds a second view as a flat tab (no split node)', () => {
    const el = makeEl();
    el._addPanel(SALARY.panelId, SALARY.label);
    expect(el._tabs).toEqual([DASHBOARD, SALARY]);
    expect(el._activePanelId).toBe(SALARY.panelId);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('does not duplicate a tab when the same panel is added again', () => {
    const el = makeEl();
    el._addPanel(SALARY.panelId, SALARY.label);
    el._addPanel(SALARY.panelId, SALARY.label);
    expect(el._tabs).toEqual([DASHBOARD, SALARY]);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('focuses an existing panel and updates activePanelId', () => {
    const el = makeEl();
    el._addPanel(SALARY.panelId, SALARY.label);
    el._focusPanel(DASHBOARD.panelId);
    expect(el._activePanelId).toBe(DASHBOARD.panelId);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('ignores focusing a panel that is not open', () => {
    const el = makeEl();
    el._focusPanel(SALARY.panelId);
    expect(el._activePanelId).toBe(DASHBOARD.panelId);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('closes a tab, removing it from the list and refocusing the neighbour', () => {
    const el = makeEl();
    el._addPanel(SALARY.panelId, SALARY.label);
    el._closePanel(SALARY.panelId);
    expect(el._tabs).toEqual([DASHBOARD]);
    expect(el._activePanelId).toBe(DASHBOARD.panelId);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('closes the active tab and falls back to the last remaining tab', () => {
    const el = makeEl();
    el._addPanel(SALARY.panelId, SALARY.label);
    el._closePanel(DASHBOARD.panelId);
    expect(el._tabs).toEqual([SALARY]);
    expect(el._activePanelId).toBe(SALARY.panelId);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('empties the workspace when the last tab is closed', () => {
    const el = makeEl();
    el._closePanel(DASHBOARD.panelId);
    expect(el._tabs).toEqual([]);
    expect(el._activePanelId).toBe('');
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('persists tabs and activePanelId to localStorage', async () => {
    const el = makeEl();
    el._addPanel(SALARY.panelId, SALARY.label);
    await new Promise((r) => setTimeout(r, 600));
    const raw = localStorage.getItem('core.workspace.layout');
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw!) as { version: number; tabs: Tab[]; activePanelId: string };
    expect(saved.version).toBe(1);
    expect(saved.tabs).toEqual([DASHBOARD, SALARY]);
    expect(saved.activePanelId).toBe(SALARY.panelId);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('restores tabs and activePanelId from localStorage', () => {
    const saved = { version: 1, tabs: [DASHBOARD, SALARY], activePanelId: SALARY.panelId };
    localStorage.setItem('core.workspace.layout', JSON.stringify(saved));
    const el = makeEl();
    expect(el._tabs).toEqual([DASHBOARD, SALARY]);
    expect(el._activePanelId).toBe(SALARY.panelId);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('restores a legacy single-tab layout', () => {
    localStorage.setItem(
      'core.workspace.layout',
      JSON.stringify({ type: 'tab', panelId: DASHBOARD.panelId, label: DASHBOARD.label })
    );
    const el = makeEl();
    expect(el._tabs).toEqual([DASHBOARD]);
    expect(el._activePanelId).toBe(DASHBOARD.panelId);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('renders the flat tab list without a split pane', async () => {
    const el = document.createElement('workspace-panel') as WorkspacePanel;
    document.body.appendChild(el);
    await el.updateComplete;
    const shadow = el.shadowRoot as unknown as {
      querySelector: (sel: string) => (HTMLElement & { tabs?: Tab[] }) | null;
    } | null;
    expect(shadow?.querySelector('tab-bar')?.tabs).toEqual([DASHBOARD]);
    expect(shadow?.querySelector('split-pane')).toBeNull();
    document.body.removeChild(el);
  });

  it('does not open tabs for contributed views until their panel mounts', async () => {
    (window as unknown as { financeShell: unknown }).financeShell = {
      extensions: {
        list: async () => ({
          views: [
            { extensionId: 'dashboard', view: { id: 'dashboard-view', name: 'Dashboard' } },
            { extensionId: 'salary-history', view: { id: 'payslip-list', name: 'Pay History' } },
          ],
          commands: [],
          navigation: [],
        }),
      },
    };
    const el = makeEl();
    await new Promise((r) => setTimeout(r, 0));
    expect(el._tabs).toEqual([DASHBOARD]);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('resolves the Salary History color for internal pay-rate panels', () => {
    const el = makeEl() as unknown as {
      _extensionIdToColor: Map<string, string>;
      _colorForPanelId: (panelId: string) => string | undefined;
    };
    el._extensionIdToColor.set('salary-history', '#F59E0B');
    expect(el._colorForPanelId('panel-salary-history-pay-rate-history-view')).toBe('#F59E0B');
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('keeps the restored activePanelId when tabs are re-activated', async () => {
    // Saved layout has 2 tabs; the ACTIVE tab is the first one (Dashboard).
    const saved = {
      version: 1,
      tabs: [DASHBOARD, SALARY],
      activePanelId: DASHBOARD.panelId,
    };
    localStorage.setItem('core.workspace.layout', JSON.stringify(saved));

    // Simulate Main: each activateView mounts a panel and emits panel:mounted,
    // which fires the workspace's onMounted listener -> _onPanelMounted.
    const mounted = new Map<string, (panelId: string) => void>();
    const views = [
      { extensionId: 'dashboard', view: { id: 'dashboard-view', name: 'Dashboard' } },
      { extensionId: 'salary-history', view: { id: 'salary-history', name: 'Salary History' } },
    ];
    (window as unknown as { financeShell: unknown }).financeShell = {
      extensions: {
        list: async () => ({ views, commands: [], navigation: [] }),
        activateView: vi.fn(async (viewId: string) => {
          const ext = views.find((v) => v.view.id === viewId);
          if (ext) {
            const panelId = `panel-${ext.extensionId}-${ext.view.id}`;
            mounted.get(panelId)?.(panelId);
          }
          return { activated: true };
        }),
      },
      panel: {
        onMounted: (cb: (panelId: string) => void) => {
          mounted.set('panel-dashboard-dashboard-view', cb);
          mounted.set('panel-salary-history-salary-history', cb);
          return () => mounted.clear();
        },
        show: vi.fn(),
        resize: vi.fn(),
        list: async () => [],
      },
    };

    const el = makeEl() as unknown as {
      _tabs: Tab[];
      _activePanelId: string;
      _activateRestoredTabs: () => Promise<void>;
    };
    expect(el._tabs).toEqual([DASHBOARD, SALARY]);
    expect(el._activePanelId).toBe(DASHBOARD.panelId);

    await el._activateRestoredTabs();
    // After both panels mounted, the active tab must still be the restored one.
    expect(el._activePanelId).toBe(DASHBOARD.panelId);

    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('restores the second tab as active even when the first tab auto-mounts onStartup', async () => {
    // Saved layout has 2 tabs; the ACTIVE tab is the SECOND one (Salary History).
    const saved = {
      version: 1,
      tabs: [DASHBOARD, SALARY],
      activePanelId: SALARY.panelId,
    };
    localStorage.setItem('core.workspace.layout', JSON.stringify(saved));

    const mounted = new Map<string, (panelId: string) => void>();
    const views = [
      { extensionId: 'dashboard', view: { id: 'dashboard-view', name: 'Dashboard' } },
      { extensionId: 'salary-history', view: { id: 'salary-history', name: 'Salary History' } },
    ];
    (window as unknown as { financeShell: unknown }).financeShell = {
      extensions: {
        list: async () => ({ views, commands: [], navigation: [] }),
        activateView: vi.fn(async (viewId: string) => {
          const ext = views.find((v) => v.view.id === viewId);
          if (ext) {
            const panelId = `panel-${ext.extensionId}-${ext.view.id}`;
            mounted.get(panelId)?.(panelId);
          }
          return { activated: true };
        }),
      },
      panel: {
        onMounted: (cb: (panelId: string) => void) => {
          mounted.set('panel-dashboard-dashboard-view', cb);
          mounted.set('panel-salary-history-salary-history', cb);
          return () => mounted.clear();
        },
        show: vi.fn(),
        resize: vi.fn(),
        list: async () => [],
      },
    };

    const el = makeEl() as unknown as {
      _tabs: Tab[];
      _activePanelId: string;
      _activateRestoredTabs: () => Promise<void>;
    };
    expect(el._tabs).toEqual([DASHBOARD, SALARY]);
    expect(el._activePanelId).toBe(SALARY.panelId);

    // Dashboard activates onStartup and mounts its panel BEFORE the host
    // reports 'ready' (i.e. before _activateRestoredTabs runs). This mount
    // must not steal focus from the restored active tab.
    await mounted.get('panel-dashboard-dashboard-view')?.('panel-dashboard-dashboard-view');
    expect(el._activePanelId).toBe(SALARY.panelId);

    await el._activateRestoredTabs();
    expect(el._activePanelId).toBe(SALARY.panelId);

    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('reorders tabs on tab-reorder and keeps the active panel', () => {
    const el = makeEl() as unknown as {
      _tabs: Tab[];
      _activePanelId: string;
      _addPanel: (panelId: string, label: string) => void;
      _focusPanel: (panelId: string) => void;
      _onTabReorder: (fromPanelId: string, toPanelId: string, after: boolean) => void;
    };
    el._addPanel(SALARY.panelId, SALARY.label);
    el._focusPanel(DASHBOARD.panelId);
    el._onTabReorder(SALARY.panelId, DASHBOARD.panelId, false);
    expect(el._tabs.map((t) => t.panelId)).toEqual([SALARY.panelId, DASHBOARD.panelId]);
    expect(el._activePanelId).toBe(DASHBOARD.panelId);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('ignores reorder with unknown panel ids', () => {
    const el = makeEl() as unknown as {
      _tabs: Tab[];
      _onTabReorder: (fromPanelId: string, toPanelId: string, after: boolean) => void;
    };
    el._onTabReorder('panel-missing', DASHBOARD.panelId, false);
    expect(el._tabs).toEqual([DASHBOARD]);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('moves a tab with tab-move direction', () => {
    const el = makeEl() as unknown as {
      _tabs: Tab[];
      _addPanel: (panelId: string, label: string) => void;
      _onTabMove: (panelId: string, dir: -1 | 1) => void;
    };
    el._addPanel(SALARY.panelId, SALARY.label);
    el._onTabMove(DASHBOARD.panelId, 1);
    expect(el._tabs.map((t) => t.panelId)).toEqual([SALARY.panelId, DASHBOARD.panelId]);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });
});
