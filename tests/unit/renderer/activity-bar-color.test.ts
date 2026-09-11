// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { ActivityBar } from '../../../src/renderer/components/activity-bar';

describe('ActivityBar extension colors', () => {
  it('applies 35 percent white background with theme-mixed indicator to the active button', async () => {
    if (!customElements.get('activity-bar')) customElements.define('activity-bar', ActivityBar);
    const element = document.createElement('activity-bar') as ActivityBar;
    document.body.appendChild(element);
    element.views = [
      { id: 'dashboard', name: 'Dashboard', icon: 'D', color: '#4EC9B0' },
      { id: 'salary', name: 'Salary', icon: 'S', color: '#F59E0B' },
    ];
    element.activeView = 'salary';
    await element.updateComplete;

    const activeButton = element.shadowRoot?.querySelector('button[data-view-id="salary"]');
    const inactiveButton = element.shadowRoot?.querySelector('button[data-view-id="dashboard"]');
    expect(activeButton?.getAttribute('style')).toContain('background: rgba(255, 255, 255, 0.35)');
    expect(activeButton?.getAttribute('style')).toContain('--active-indicator: #f9c060');
    expect(inactiveButton?.getAttribute('style')).toBe('');
    document.body.removeChild(element);
  });

  it('applies white background with default indicator when the view has no color', async () => {
    if (!customElements.get('activity-bar')) customElements.define('activity-bar', ActivityBar);
    const element = document.createElement('activity-bar') as ActivityBar;
    document.body.appendChild(element);
    element.views = [
      { id: 'plain', name: 'Plain', icon: 'P' },
    ];
    element.activeView = 'plain';
    await element.updateComplete;

    const activeButton = element.shadowRoot?.querySelector('button[data-view-id="plain"]');
    expect(activeButton?.getAttribute('style')).toContain('background: rgba(255, 255, 255, 0.35)');
    expect(activeButton?.getAttribute('style')).not.toContain('--active-indicator');
    document.body.removeChild(element);
  });
});
