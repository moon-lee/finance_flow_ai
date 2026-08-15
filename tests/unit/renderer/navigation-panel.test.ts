// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { NavigationPanel, type NavItem } from '../../../src/renderer/components/navigation-panel';

describe('NavigationPanel', () => {
  beforeEach(() => {
    if (!customElements.get('navigation-panel')) {
      customElements.define('navigation-panel', NavigationPanel);
    }
  });

  function createPanel(): NavigationPanel {
    const el = document.createElement('navigation-panel') as NavigationPanel;
    document.body.appendChild(el);
    return el;
  }

  it('renders navigation items grouped by group label', async () => {
    const panel = createPanel();
    const items: NavItem[] = [
      { extensionId: 'salary-history', id: 'pay-history', label: 'Pay History', command: 'salary.show-pay-history', group: 'Salary' },
      { extensionId: 'salary-history', id: 'rate-history', label: 'Rate History', command: 'salary.show-pay-rate-history', group: 'Salary' },
      { extensionId: 'salary-history', id: 'settings', label: 'Settings', command: 'salary.settings', group: 'Config' }
    ];
    panel.setNavigation(items);
    await panel.updateComplete;

    const sections = panel.shadowRoot!.querySelectorAll('.nav-section');
    // 2 group sections + 1 built-in "Recent" section
    expect(sections.length).toBe(3);

    const titles = panel.shadowRoot!.querySelectorAll('.nav-group-label');
    const titleTexts = Array.from(titles).map(t => t.textContent);
    expect(titleTexts).toContain('Salary');
    expect(titleTexts).toContain('Config');
    expect(titleTexts).toContain('Recent');

    const navLabels = Array.from(panel.shadowRoot!.querySelectorAll('.nav-item')).map(n => n.textContent?.replace(/\s+/g, ' ').trim());
    expect(navLabels).toContain('H Pay History');
    expect(navLabels).toContain('R Rate History');
    expect(navLabels).toContain('S Settings');

    document.body.removeChild(panel);
  });

  it('click dispatches command-selected event', async () => {
    const panel = createPanel();
    const items: NavItem[] = [
      { extensionId: 'salary-history', id: 'pay-history', label: 'Pay History', command: 'salary.show-pay-history', group: 'Salary' }
    ];
    panel.setNavigation(items);
    await panel.updateComplete;

    let receivedDetail: unknown = null;
    panel.addEventListener('command-selected', ((e: CustomEvent) => {
      receivedDetail = e.detail;
    }) as EventListener);

    const navItem = panel.shadowRoot!.querySelector('[data-testid="nav-pay-history"]') as HTMLElement;
    navItem.click();

    expect(receivedDetail).toEqual({ command: 'salary.show-pay-history', extensionCommand: true });

    document.body.removeChild(panel);
  });

  it('active extension switch re-renders items', async () => {
    const panel = createPanel();

    // Set first extension
    panel.setNavigation([
      { extensionId: 'salary-history', id: 'pay-history', label: 'Pay History', command: 'salary.show-pay-history', group: 'Salary' }
    ]);
    await panel.updateComplete;

    let navItems = panel.shadowRoot!.querySelectorAll('.nav-item');
    // 1 nav item + 1 "No recent items"
    expect(navItems.length).toBe(2);

    // Switch to different extension
    panel.setNavigation([
      { extensionId: 'budget', id: 'budget-overview', label: 'Budget Overview', command: 'budget.showOverview', group: 'Budget' }
    ]);
    await panel.updateComplete;

    navItems = panel.shadowRoot!.querySelectorAll('.nav-item');
    expect(navItems.length).toBe(2);
    const labels = Array.from(navItems).map(n => n.textContent?.replace(/\s+/g, ' ').trim());
    expect(labels).toContain('O Budget Overview');
    expect(labels).not.toContain('H Pay History');

    document.body.removeChild(panel);
  });

  it('missing extension shows "no items" or empty state', async () => {
    const panel = createPanel();
    // Set empty navigation
    panel.setNavigation([]);
    await panel.updateComplete;

    const navItems = panel.shadowRoot!.querySelectorAll('.nav-item');
    // Only "No recent items" should be present
    expect(navItems.length).toBe(1);
    expect(navItems[0].textContent).toBe('No recent items');

    document.body.removeChild(panel);
  });

  it('built-in Settings group renders App Preferences item', async () => {
    const panel = createPanel();
    panel.setView('__settings__');
    await panel.updateComplete;

    const navItems = panel.shadowRoot!.querySelectorAll('.nav-item');
    const labels = Array.from(navItems).map(n => n.textContent?.replace(/\s+/g, ' ').trim());
    expect(labels).toContain('P App Preferences');
    expect(labels).not.toContain('Settings');

    document.body.removeChild(panel);
  });

  it('clicking App Preferences nav item dispatches view-changed with __settings__', async () => {
    const panel = createPanel();
    panel.setView('__settings__');
    await panel.updateComplete;

    let receivedDetail: unknown = null;
    panel.addEventListener('view-changed', ((e: CustomEvent) => {
      receivedDetail = e.detail;
    }) as EventListener);

    const navItem = panel.shadowRoot!.querySelector('[data-testid="nav-app-preferences"]') as HTMLElement;
    navItem.click();

    expect(receivedDetail).toEqual({ view: '__settings__', source: 'core' });

    document.body.removeChild(panel);
  });

  it('_onNav dispatches view-changed for __settings__ command', async () => {
    const panel = createPanel();
    panel.setView('__settings__');
    await panel.updateComplete;

    let receivedDetail: unknown = null;
    panel.addEventListener('view-changed', ((e: CustomEvent) => {
      receivedDetail = e.detail;
    }) as EventListener);

    const navItem = panel.shadowRoot!.querySelector('[data-testid="nav-app-preferences"]') as HTMLElement;
    navItem.click();

    expect(receivedDetail).toEqual({ view: '__settings__', source: 'core' });

    document.body.removeChild(panel);
  });
});
