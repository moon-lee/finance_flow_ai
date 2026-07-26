// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { WorkspacePanel, type WorkspaceNode } from '../../../src/renderer/components/workspace';

describe('workspace-panel', () => {
  beforeEach(() => {
    localStorage.clear();
    if (!customElements.get('workspace-panel')) customElements.define('workspace-panel', WorkspacePanel);
    if (!customElements.get('tab-bar')) customElements.define('tab-bar', class extends HTMLElement {});
    if (!customElements.get('split-pane')) customElements.define('split-pane', class extends HTMLElement {});
  });

  it('defaults to a single Dashboard tab', () => {
    const el = document.createElement('workspace-panel');
    document.body.appendChild(el);
    expect((el as unknown as { _layout: WorkspaceNode })._layout).toEqual({ type: 'tab', panelId: 'panel-dashboard-dashboard-view', label: 'Dashboard' });
    document.body.removeChild(el);
  });

  it('adds a tab as a split when a second view is added', () => {
    const el = document.createElement('workspace-panel');
    document.body.appendChild(el);
    (el as unknown as { _addPanel: (panelId: string, label: string) => void })._addPanel('panel-salary-history-salary-history', 'Salary History');
    expect((el as unknown as { _layout: WorkspaceNode })._layout.type).toBe('split');
    document.body.removeChild(el);
  });

  it('focuses a panel and updates activePanelId', () => {
    const el = document.createElement('workspace-panel');
    document.body.appendChild(el);
    (el as unknown as { _focusPanel: (panelId: string) => void })._focusPanel('panel-salary-history-salary-history');
    expect((el as unknown as { _activePanelId: string })._activePanelId).toBe('panel-salary-history-salary-history');
    document.body.removeChild(el);
  });

  it('collapses a split when the last tab in a pane is closed', () => {
    const el = document.createElement('workspace-panel');
    document.body.appendChild(el);
    const addPanel = (el as unknown as { _addPanel: (panelId: string, label: string) => void })._addPanel.bind(el);
    const closePanel = (el as unknown as { _closePanel: (panelId: string) => void })._closePanel.bind(el);
    addPanel('panel-salary-history-salary-history', 'Salary History');
    expect((el as unknown as { _layout: WorkspaceNode })._layout.type).toBe('split');
    closePanel('panel-salary-history-salary-history');
    expect((el as unknown as { _layout: WorkspaceNode })._layout.type).toBe('tab');
    document.body.removeChild(el);
  });

  it('persists layout to localStorage', async () => {
    const el = document.createElement('workspace-panel');
    document.body.appendChild(el);
    const addPanel = (el as unknown as { _addPanel: (panelId: string, label: string) => void })._addPanel.bind(el);
    addPanel('panel-salary-history-salary-history', 'Salary History');
    await new Promise((r) => setTimeout(r, 600));
    const raw = localStorage.getItem('core.workspace.layout');
    expect(raw).toBeTruthy();
    document.body.removeChild(el);
  });

  it('restores layout from localStorage', () => {
    const layout = { type: 'tab', panelId: 'panel-salary-history-salary-history', label: 'Salary History' } as WorkspaceNode;
    localStorage.setItem('core.workspace.layout', JSON.stringify(layout));
    const el = document.createElement('workspace-panel');
    document.body.appendChild(el);
    expect((el as unknown as { _layout: WorkspaceNode })._layout).toEqual(layout);
    document.body.removeChild(el);
  });
});
