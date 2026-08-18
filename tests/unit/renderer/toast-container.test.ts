// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import '../../../src/renderer/components/toast-container';

const originalShell = window.financeShell;

function createEl() {
  const el = document.createElement('toast-container') as unknown as {
    updateComplete: Promise<unknown>;
    shadowRoot: ShadowRoot | null;
    addEventListener: typeof HTMLElement.prototype.addEventListener;
  };
  document.body.appendChild(el as unknown as Node);
  return el;
}

async function settled(el: { updateComplete: Promise<unknown> }) {
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 50));
  await el.updateComplete;
}

async function settledFakeTimers(el: { updateComplete: Promise<unknown> }) {
  await el.updateComplete;
  vi.advanceTimersByTime(60);
  await el.updateComplete;
}

describe('ToastContainer', () => {
  let onCallbacks: Map<string, (payload: unknown) => void> = new Map();

  beforeEach(() => {
    document.body.innerHTML = '';
    onCallbacks = new Map();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function mockEvents() {
    window.financeShell = {
      ...originalShell,
      events: {
        on: (topic: string, callback: (payload: unknown) => void): (() => void) => {
          onCallbacks.set(topic, callback);
          return () => { onCallbacks.delete(topic); };
        },
        emit: vi.fn(),
      },
    };
  }

  it('renders no toasts initially', async () => {
    mockEvents();
    const el = createEl();
    await settled(el);
    const cards = el.shadowRoot?.querySelectorAll('.toast-card');
    expect(cards?.length ?? 0).toBe(0);
  });

  it('subscribes to event bus topics on connectedCallback', async () => {
    mockEvents();
    const el = createEl();
    await settled(el);
    expect(onCallbacks.has('panel.lazy-unmount')).toBe(true);
    expect(onCallbacks.has('panel.auto-save-failed')).toBe(true);
    expect(onCallbacks.has('extension.host-status')).toBe(true);
  });

  it('renders a toast when event is published', async () => {
    mockEvents();
    const el = createEl();
    await settled(el);

    const handler = onCallbacks.get('panel.lazy-unmount')!;
    handler({ panelId: 'panel-1', viewId: 'dashboard-view' });
    await settled(el);

    const cards = el.shadowRoot?.querySelectorAll('.toast-card');
    expect(cards?.length).toBe(1);
    expect(cards?.[0]?.querySelector('.toast-title')?.textContent).toBe('Panel asleep');
    expect(cards?.[0]?.querySelector('.toast-message')?.textContent).toContain('dashboard-view');
  });

  it('auto-dismisses info toast after default duration', async () => {
    vi.useFakeTimers();
    mockEvents();
    const el = createEl();
    await settledFakeTimers(el);

    const handler = onCallbacks.get('panel.lazy-unmount')!;
    handler({ panelId: 'panel-1', viewId: 'dashboard-view' });
    await settledFakeTimers(el);

    expect(el.shadowRoot?.querySelectorAll('.toast-card').length).toBe(1);

    vi.advanceTimersByTime(5000);
    await settledFakeTimers(el);

    expect(el.shadowRoot?.querySelectorAll('.toast-card').length).toBe(0);
    vi.useRealTimers();
  });

  it('auto-dismisses error toast after 5000ms and emits error-status-changed', async () => {
    vi.useFakeTimers();
    mockEvents();
    const el = createEl();
    await settledFakeTimers(el);

    const handler = onCallbacks.get('panel.auto-save-failed')!;
    handler({ panelId: 'panel-1', viewId: 'payslip-list', dirty: true });
    await settledFakeTimers(el);

    expect(el.shadowRoot?.querySelectorAll('.toast-card').length).toBe(1);
    expect(el.shadowRoot?.querySelector('.toast-title')?.textContent).toBe('Auto-save timed out');
    expect(el.shadowRoot?.querySelector('.toast-message')?.textContent).toContain('payslip-list');

    const eventHandler = vi.fn();
    el.addEventListener('error-status-changed', eventHandler as EventListener);

    vi.advanceTimersByTime(5000);
    await settledFakeTimers(el);

    expect(el.shadowRoot?.querySelectorAll('.toast-card').length).toBe(0);
    expect(eventHandler).toHaveBeenCalledTimes(1);
    expect((eventHandler.mock.calls[0]?.[0] as CustomEvent)?.detail).toEqual({
      count: 1,
      type: 'error',
      message: expect.stringContaining('payslip-list'),
    });
    vi.useRealTimers();
  });

  it('emits error count when multiple errors are dismissed', async () => {
    vi.useFakeTimers();
    mockEvents();
    const el = createEl();
    await settledFakeTimers(el);

    const handler = onCallbacks.get('panel.auto-save-failed')!;
    handler({ panelId: 'panel-1', viewId: 'payslip-list', dirty: true });
    handler({ panelId: 'panel-2', viewId: 'pay-history', dirty: true });
    await settledFakeTimers(el);

    const eventHandler = vi.fn();
    el.addEventListener('error-status-changed', eventHandler as EventListener);

    vi.advanceTimersByTime(5000);
    await settledFakeTimers(el);

    const lastCall = eventHandler.mock.calls[eventHandler.mock.calls.length - 1]?.[0] as CustomEvent | undefined;
    expect(lastCall).toBeDefined();
    expect(lastCall?.detail).toEqual({
      count: 2,
      type: 'error',
      message: expect.stringContaining('pay-history'),
    });
    vi.useRealTimers();
  });

  it('clearErrorStatus resets dismissed errors and emits event', async () => {
    vi.useFakeTimers();
    mockEvents();
    const el = createEl();
    await settledFakeTimers(el);

    const handler = onCallbacks.get('panel.auto-save-failed')!;
    handler({ panelId: 'panel-1', viewId: 'payslip-list', dirty: true });
    await settledFakeTimers(el);

    vi.advanceTimersByTime(5000);
    await settledFakeTimers(el);

    const eventHandler = vi.fn();
    el.addEventListener('error-status-changed', eventHandler as EventListener);

    (el as unknown as { clearErrorStatus: () => void }).clearErrorStatus();
    await settledFakeTimers(el);

    expect(eventHandler).toHaveBeenCalledTimes(1);
    expect((eventHandler.mock.calls[0]?.[0] as CustomEvent)?.detail).toEqual({
      count: 0,
      type: null,
      message: null,
    });
    vi.useRealTimers();
  });

  it('does not show auto-save toast for non-dirty panel', async () => {
    mockEvents();
    const el = createEl();
    await settled(el);

    const handler = onCallbacks.get('panel.auto-save-failed')!;
    handler({ panelId: 'panel-1', viewId: 'payslip-list', dirty: false });
    await settled(el);

    expect(el.shadowRoot?.querySelectorAll('.toast-card').length).toBe(0);
  });

  it('emits status-bar event for lazy-unmount info toast after auto-dismiss', async () => {
    vi.useFakeTimers();
    mockEvents();
    const el = createEl();
    await settledFakeTimers(el);

    const handler = onCallbacks.get('panel.lazy-unmount')!;
    handler({ panelId: 'panel-1', viewId: 'dashboard-view' });
    await settledFakeTimers(el);

    const eventHandler = vi.fn();
    el.addEventListener('error-status-changed', eventHandler as EventListener);

    vi.advanceTimersByTime(5000);
    await settledFakeTimers(el);

    expect(el.shadowRoot?.querySelectorAll('.toast-card').length).toBe(0);
    expect(eventHandler).toHaveBeenCalledTimes(1);
    expect((eventHandler.mock.calls[0]?.[0] as CustomEvent)?.detail).toEqual({
      count: 1,
      type: 'info',
      message: 'Panel asleep',
    });
    vi.useRealTimers();
  });

  it('stacks multiple toasts vertically', async () => {
    mockEvents();
    const el = createEl();
    await settled(el);

    const handler = onCallbacks.get('panel.lazy-unmount')!;
    handler({ panelId: 'panel-1', viewId: 'view-1' });
    handler({ panelId: 'panel-2', viewId: 'view-2' });
    await settled(el);

    const cards = el.shadowRoot?.querySelectorAll('.toast-card');
    expect(cards?.length).toBe(2);
  });

  it('dismiss button removes toast immediately', async () => {
    mockEvents();
    const el = createEl();
    await settled(el);

    const handler = onCallbacks.get('panel.lazy-unmount')!;
    handler({ panelId: 'panel-1', viewId: 'dashboard-view' });
    await settled(el);

    expect(el.shadowRoot?.querySelectorAll('.toast-card').length).toBe(1);

    const dismissBtn = el.shadowRoot?.querySelector('.toast-dismiss') as HTMLElement | null;
    expect(dismissBtn).not.toBeNull();
    dismissBtn?.click();
    await settled(el);

    expect(el.shadowRoot?.querySelectorAll('.toast-card').length).toBe(0);
  });

  it('max toasts limit prevents unbounded growth', async () => {
    mockEvents();
    const el = createEl();
    await settled(el);

    const handler = onCallbacks.get('panel.lazy-unmount')!;
    for (let i = 0; i < 12; i++) {
      handler({ panelId: `panel-${i}`, viewId: `view-${i}` });
    }
    await settled(el);

    const cards = el.shadowRoot?.querySelectorAll('.toast-card');
    expect(cards?.length).toBeLessThanOrEqual(8);
  });
});
