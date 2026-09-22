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

  it('marks extension buttons draggable but not the Settings gear', async () => {
    if (!customElements.get('activity-bar')) customElements.define('activity-bar', ActivityBar);
    const element = document.createElement('activity-bar') as ActivityBar;
    element.views = [{ id: 'a-view', name: 'A', icon: 'A' }];
    document.body.appendChild(element);
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('button[data-view-id="a-view"]')?.getAttribute('draggable')).toBe('true');
    expect(element.shadowRoot?.querySelector('button.settings')?.hasAttribute('draggable')).toBe(false);
    document.body.removeChild(element);
  });

  it('dispatches activity-move on Ctrl+ArrowDown', async () => {
    if (!customElements.get('activity-bar')) customElements.define('activity-bar', ActivityBar);
    const element = document.createElement('activity-bar') as ActivityBar;
    element.views = [
      { id: 'a-view', name: 'A', icon: 'A' },
      { id: 'b-view', name: 'B', icon: 'B' },
    ];
    document.body.appendChild(element);
    await element.updateComplete;
    const seen: unknown[] = [];
    element.addEventListener('activity-move', (e: Event) => seen.push((e as CustomEvent).detail));
    const first = element.shadowRoot?.querySelector('button[data-view-id="a-view"]') as HTMLElement | null;
    first?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, bubbles: true, composed: true }));
    expect(seen).toEqual([{ viewId: 'a-view', dir: 1 }]);
    document.body.removeChild(element);
  });

  it('sortActivityViews applies saved order, drops missing, appends new', async () => {
    const { sortActivityViews } = await import('../../../src/renderer/components/activity-bar');
    const views = [
      { id: 'a-view', name: 'A', icon: 'A' },
      { id: 'b-view', name: 'B', icon: 'B' },
      { id: 'c-view', name: 'C', icon: 'C' },
    ];
    expect(sortActivityViews(views, ['c-view', 'a-view', 'gone-view']).map((v) => v.id))
      .toEqual(['c-view', 'a-view', 'b-view']);
    expect(sortActivityViews(views, 'corrupt').map((v) => v.id))
      .toEqual(['a-view', 'b-view', 'c-view']);
  });
});
