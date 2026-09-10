// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { TabBar } from '../../../src/renderer/components/tab-bar';

describe('tab-bar', () => {
  beforeEach(() => {
    if (!customElements.get('tab-bar')) customElements.define('tab-bar', TabBar);
  });

  it('renders the provided tabs', async () => {
    const el = document.createElement('tab-bar') as TabBar;
    el.tabs = [
      { panelId: 'panel-1', label: 'Dashboard' },
      { panelId: 'panel-2', label: 'Salary' }
    ];
    document.body.appendChild(el);
    await el.updateComplete;
    const shadow = el.shadowRoot as unknown as { querySelectorAll: (sel: string) => NodeListOf<HTMLElement> } | null;
    expect(shadow?.querySelectorAll('.tab').length).toBe(2);
    document.body.removeChild(el);
  });

  it('marks the active tab', async () => {
    const el = document.createElement('tab-bar') as TabBar;
    el.tabs = [
      { panelId: 'panel-1', label: 'Dashboard' },
      { panelId: 'panel-2', label: 'Salary' }
    ];
    el.activePanelId = 'panel-2';
    document.body.appendChild(el);
    await el.updateComplete;
    const shadow = el.shadowRoot as unknown as { querySelector: (sel: string) => HTMLElement | null } | null;
    expect(shadow?.querySelector('.tab.active .tab-label')?.textContent?.trim()).toBe('Salary');
    document.body.removeChild(el);
  });

  it('applies extension color only to the active tab icon', async () => {
    const el = document.createElement('tab-bar') as TabBar;
    el.tabs = [
      { panelId: 'panel-1', label: 'Dashboard', color: '#4EC9B0' },
      { panelId: 'panel-2', label: 'Pay History', color: '#F59E0B' },
    ];
    el.activePanelId = 'panel-2';
    document.body.appendChild(el);
    await el.updateComplete;
    const icons = Array.from(el.shadowRoot!.querySelectorAll('.tab-icon'));
    expect(icons[0].getAttribute('style')).toBe('');
    expect(icons[1].getAttribute('style')).toContain('background: #F59E0B');
    document.body.removeChild(el);
  });

  it('dispatches tab-focus on click', async () => {
    const el = document.createElement('tab-bar') as TabBar;
    el.tabs = [{ panelId: 'panel-1', label: 'Dashboard' }];
    document.body.appendChild(el);
    await el.updateComplete;
    const handler = vi.fn();
    el.addEventListener('tab-focus', handler);
    const shadow = el.shadowRoot as unknown as { querySelector: (sel: string) => HTMLElement | null } | null;
    shadow?.querySelector('.tab')?.click();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ detail: { panelId: 'panel-1' } }));
    document.body.removeChild(el);
  });

  it('does not mark tabs draggable', async () => {
    const el = document.createElement('tab-bar') as TabBar;
    el.tabs = [{ panelId: 'panel-1', label: 'Dashboard' }];
    document.body.appendChild(el);
    await el.updateComplete;
    const shadow = el.shadowRoot as unknown as { querySelector: (sel: string) => HTMLElement | null } | null;
    expect(shadow?.querySelector('.tab')?.hasAttribute('draggable')).toBe(false);
    document.body.removeChild(el);
  });
});
