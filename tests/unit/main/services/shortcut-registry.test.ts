import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ShortcutRegistry, toAccelerator } from '../../../../src/main/services/shortcut-registry';
import type { FinanceExtensionManifest } from '../../../../src/types/finance';

function makeManifest(
  id: string,
  commands: Array<{ id: string; title: string; keybinding?: string }> = []
): FinanceExtensionManifest {
  return {
    id,
    displayName: id,
    version: '1.0.0',
    activationEvents: ['*'],
    main: 'main.js',
    contributions: { commands },
  } as FinanceExtensionManifest;
}

vi.mock('../../../../src/main/services/settings-service', () => ({
  getSettings: vi.fn(),
  setSetting: vi.fn(),
  getSetting: vi.fn(),
}));

import { getSettings, setSetting } from '../../../../src/main/services/settings-service';

describe('ShortcutRegistry', () => {
  let registry: ShortcutRegistry;

  beforeEach(() => {
    registry = new ShortcutRegistry();
    vi.clearAllMocks();
  });

  it('build() registers shortcuts from manifest keybindings', () => {
    (getSettings as ReturnType<typeof vi.fn>).mockReturnValue({});
    registry.build([
      makeManifest('ext-a', [{ id: 'ext-a.cmd1', title: 'Cmd 1', keybinding: 'Ctrl+Shift+A' }]),
    ]);

    const entry = registry.getCommandForAccelerator('Ctrl+Shift+A');
    expect(entry).toBeDefined();
    expect(entry?.commandId).toBe('ext-a.cmd1');
    expect(entry?.extensionId).toBe('ext-a');
  });

  it('build() includes core shortcuts', () => {
    (getSettings as ReturnType<typeof vi.fn>).mockReturnValue({});
    registry.build([]);

    expect(registry.getCommandForAccelerator('Ctrl+Shift+P')).toBeDefined();
    expect(registry.getCommandForAccelerator('Escape')).toBeDefined();
  });

  it('build() no longer registers core.toggle-ai (ai-panel removed)', () => {
    (getSettings as ReturnType<typeof vi.fn>).mockReturnValue({});
    registry.build([]);

    expect(registry.getCommandForAccelerator('Ctrl+Shift+J')).toBeUndefined();
  });

  it('build() applies custom accelerator overrides from settings', () => {
    (getSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      'core.shortcuts.ext-a.ext-a.cmd1': 'Ctrl+Alt+X',
    });
    registry.build([
      makeManifest('ext-a', [{ id: 'ext-a.cmd1', title: 'Cmd 1', keybinding: 'Ctrl+Shift+A' }]),
    ]);

    expect(registry.getCommandForAccelerator('Ctrl+Alt+X')).toBeDefined();
    expect(registry.getCommandForAccelerator('Ctrl+Shift+A')).toBeUndefined();
  });

  it('update() persists new accelerator to settings', () => {
    (getSettings as ReturnType<typeof vi.fn>).mockReturnValue({});
    registry.build([
      makeManifest('ext-a', [{ id: 'ext-a.cmd1', title: 'Cmd 1', keybinding: 'Ctrl+Shift+A' }]),
    ]);

    registry.update('ext-a', 'ext-a.cmd1', 'Ctrl+Alt+X');

    expect(setSetting).toHaveBeenCalledWith('core.shortcuts.ext-a.ext-a.cmd1', 'Ctrl+Alt+X');
    expect(registry.getCommandForAccelerator('Ctrl+Alt+X')).toBeDefined();
    expect(registry.getCommandForAccelerator('Ctrl+Shift+A')).toBeUndefined();
  });

  it('update() clears accelerator when newAccelerator is empty', () => {
    (getSettings as ReturnType<typeof vi.fn>).mockReturnValue({});
    registry.build([
      makeManifest('ext-a', [{ id: 'ext-a.cmd1', title: 'Cmd 1', keybinding: 'Ctrl+Shift+A' }]),
    ]);

    registry.update('ext-a', 'ext-a.cmd1', '');

    expect(setSetting).toHaveBeenCalledWith('core.shortcuts.ext-a.ext-a.cmd1', '');
    expect(registry.getCommandForAccelerator('Ctrl+Shift+A')).toBeUndefined();
  });

  it('reset() clears custom accelerators for an extension', () => {
    (getSettings as ReturnType<typeof vi.fn>).mockReturnValue({});
    registry.build([
      makeManifest('ext-a', [{ id: 'ext-a.cmd1', title: 'Cmd 1', keybinding: 'Ctrl+Shift+A' }]),
      makeManifest('ext-b', [{ id: 'ext-b.cmd1', title: 'Cmd 1', keybinding: 'Ctrl+Shift+B' }]),
    ]);

    registry.update('ext-a', 'ext-a.cmd1', 'Ctrl+Alt+X');
    registry.reset('ext-a');

    expect(setSetting).toHaveBeenCalledWith('core.shortcuts.ext-a.ext-a.cmd1', '');
    expect(setSetting).not.toHaveBeenCalledWith('core.shortcuts.ext-b.ext-b.cmd1', '');
  });

  it('list() returns all registered shortcuts', () => {
    (getSettings as ReturnType<typeof vi.fn>).mockReturnValue({});
    registry.build([
      makeManifest('ext-a', [{ id: 'ext-a.cmd1', title: 'Cmd 1', keybinding: 'Ctrl+Shift+A' }]),
    ]);

    const list = registry.list();
    const extA = list.find(e => e.extensionId === 'ext-a');
    const core = list.find(e => e.extensionId === 'core');
    expect(extA).toBeDefined();
    expect(core).toBeDefined();
  });
});

describe('toAccelerator', () => {
  it('converts simple key', () => {
    expect(toAccelerator({ type: 'keyDown', key: 'p', control: false, shift: false, alt: false, meta: false, code: 'KeyP', isAutoRepeat: false, isComposing: false, location: 0, modifiers: [] })).toBe('P');
  });

  it('converts Ctrl+Shift combination', () => {
    expect(toAccelerator({ type: 'keyDown', key: 'p', control: true, shift: true, alt: false, meta: false, code: 'KeyP', isAutoRepeat: false, isComposing: false, location: 0, modifiers: ['Control', 'Shift'] })).toBe('Ctrl+Shift+P');
  });

  it('converts Cmd on mac', () => {
    expect(toAccelerator({ type: 'keyDown', key: 'p', control: false, shift: false, alt: false, meta: true, code: 'KeyP', isAutoRepeat: false, isComposing: false, location: 0, modifiers: ['Meta'] })).toBe('Cmd+P');
  });

  it('lowercases single-char keys', () => {
    expect(toAccelerator({ type: 'keyDown', key: 'a', control: true, shift: false, alt: false, meta: false, code: 'KeyA', isAutoRepeat: false, isComposing: false, location: 0, modifiers: ['Control'] })).toBe('Ctrl+A');
  });
});
