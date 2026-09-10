// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { ActivityBar } from '../../../src/renderer/components/activity-bar';

describe('ActivityBar extension icons', () => {
  it('renders image assets and legacy glyphs separately', async () => {
    if (!customElements.get('activity-bar')) customElements.define('activity-bar', ActivityBar);
    const element = document.createElement('activity-bar') as ActivityBar & {
      views: Array<{ id: string; name: string; icon: string; iconUrl?: string }>;
    };
    element.views = [
      { id: 'asset-view', name: 'Asset', icon: 'assets/icon.svg', iconUrl: 'finance-shell://extensions/demo/assets/icon.svg' },
      { id: 'legacy-view', name: 'Legacy', icon: 'L' },
    ];
    element.activeView = 'asset-view';
    document.body.appendChild(element);
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('img[data-view-id="asset-view"]')?.getAttribute('src'))
      .toBe('finance-shell://extensions/demo/assets/icon.svg');
    expect(element.shadowRoot?.querySelector('button[data-view-id="legacy-view"]')?.textContent?.trim()).toBe('L');
    document.body.removeChild(element);
  });

  it('renders the built-in Settings gear image', async () => {
    if (!customElements.get('activity-bar')) customElements.define('activity-bar', ActivityBar);
    const element = document.createElement('activity-bar') as ActivityBar;
    document.body.appendChild(element);
    await element.updateComplete;
    const settings = element.shadowRoot?.querySelector('button.settings img');
    expect(settings?.getAttribute('src')).toBe('./icons/settings.svg');
    document.body.removeChild(element);
  });
});
