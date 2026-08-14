// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import '../../../src/renderer/components/shortcuts-screen';

const originalShell = window.financeShell;

function createEl() {
  const el = document.createElement('shortcuts-screen') as unknown as {
    updateComplete: Promise<unknown>;
    shadowRoot: ShadowRoot | null;
  };
  document.body.appendChild(el as unknown as Node);
  return el;
}

async function settled(el: { updateComplete: Promise<unknown> }) {
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 50));
  await el.updateComplete;
}

describe('ShortcutsScreen', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders loading state initially', async () => {
    window.financeShell = {
      ...originalShell,
      shortcuts: {
        list: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue([]),
        reset: vi.fn().mockResolvedValue([]),
      },
    };

    const el = createEl();
    await settled(el);

    const body = el.shadowRoot?.querySelector('.shortcuts-body');
    expect(body).not.toBeNull();
  });

  it('renders shortcuts after load', async () => {
    window.financeShell = {
      ...originalShell,
      shortcuts: {
        list: vi.fn().mockResolvedValue([
          { commandId: 'ext-a.cmd1', extensionId: 'ext-a', accelerator: 'Ctrl+Shift+A' },
          { commandId: 'core.toggle-ai', extensionId: 'core', accelerator: 'Ctrl+Shift+J' },
        ]),
        update: vi.fn().mockResolvedValue([]),
        reset: vi.fn().mockResolvedValue([]),
      },
    };

    const el = createEl();
    await settled(el);

    const header = el.shadowRoot?.querySelector('.shortcuts-header h1');
    expect(header?.textContent).toBe('Keyboard Shortcuts');

    const sections = el.shadowRoot?.querySelectorAll('.shortcuts-section-header span') ?? [];
    const texts = Array.from(sections).map(s => s.textContent?.trim());
    expect(texts).toContain('ext-a');
    expect(texts).toContain('core');
  });

  it('calls financeShell.shortcuts.update when rebind is triggered', async () => {
    window.prompt = () => 'Ctrl+Alt+X';

    window.financeShell = {
      ...originalShell,
      shortcuts: {
        list: vi.fn().mockResolvedValue([
          { commandId: 'ext-a.cmd1', extensionId: 'ext-a', accelerator: 'Ctrl+Shift+A' },
        ]),
        update: vi.fn().mockResolvedValue([]),
        reset: vi.fn().mockResolvedValue([]),
      },
    };

    const el = createEl();
    await settled(el);

    const badge = el.shadowRoot?.querySelector('.shortcut-badge:not(.core)') as HTMLElement | null;
    expect(badge).not.toBeNull();
    badge?.click();
    await settled(el);

    expect(window.financeShell.shortcuts.update).toHaveBeenCalledWith('ext-a', 'ext-a.cmd1', 'Ctrl+Alt+X');
  });

  it('calls financeShell.shortcuts.reset on reset all', async () => {
    window.financeShell = {
      ...originalShell,
      shortcuts: {
        list: vi.fn().mockResolvedValue([
          { commandId: 'ext-a.cmd1', extensionId: 'ext-a', accelerator: 'Ctrl+Shift+A' },
        ]),
        update: vi.fn().mockResolvedValue([]),
        reset: vi.fn().mockResolvedValue([]),
      },
    };

    const el = createEl();
    await settled(el);

    const resetBtn = el.shadowRoot?.querySelector('.global-reset .reset-btn') as HTMLElement | null;
    expect(resetBtn).not.toBeNull();
    resetBtn?.click();
    await settled(el);

    expect(window.financeShell.shortcuts.reset).toHaveBeenCalled();
  });
});
