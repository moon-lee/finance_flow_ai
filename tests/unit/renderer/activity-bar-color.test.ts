// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { ActivityBar } from '../../../src/renderer/components/activity-bar';

describe('ActivityBar extension colors', () => {
  it('applies no extension color background to Activity Bar buttons', async () => {
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
    expect(activeButton?.getAttribute('style')).toBe(null);
    expect(inactiveButton?.getAttribute('style')).toBe(null);
  });
});
