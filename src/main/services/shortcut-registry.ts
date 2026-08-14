import { WebContents } from 'electron';
import { getSettings, setSetting } from './settings-service';
import type { FinanceExtensionManifest } from '../../types/finance';

export interface ShortcutEntry {
  commandId: string;
  extensionId: string;
  accelerator: string;
}

const CORE_SHORTCUTS: ShortcutEntry[] = [
  { commandId: 'core.toggle-command-palette', extensionId: 'core', accelerator: 'Ctrl+Shift+P' },
  { commandId: 'core.toggle-ai', extensionId: 'core', accelerator: 'Ctrl+Shift+J' },
  { commandId: 'core.close-palette', extensionId: 'core', accelerator: 'Escape' },
];

export function toAccelerator(input: Electron.Input): string {
  const parts: string[] = [];
  if (input.control) parts.push('Ctrl');
  if (input.shift) parts.push('Shift');
  if (input.alt) parts.push('Alt');
  if (input.meta) parts.push('Cmd');
  if (input.key) {
    const key = input.key.length === 1 ? input.key.toUpperCase() : input.key;
    parts.push(key);
  }
  return parts.join('+');
}

export class ShortcutRegistry {
  private byAccelerator = new Map<string, ShortcutEntry>();
  private byCommand = new Map<string, ShortcutEntry>();

  build(manifests: FinanceExtensionManifest[]): void {
    this.byAccelerator.clear();
    this.byCommand.clear();

    const customShortcuts = getSettings('core');

    for (const manifest of manifests) {
      for (const command of manifest.contributions.commands ?? []) {
        if (!command.keybinding) continue;
        const accelerator = this.resolveAccelerator(command.keybinding, manifest.id, command.id, customShortcuts);
        const entry: ShortcutEntry = { commandId: command.id, extensionId: manifest.id, accelerator };
        this.byAccelerator.set(accelerator, entry);
        this.byCommand.set(`${manifest.id}:${command.id}`, entry);
      }
    }

    for (const entry of CORE_SHORTCUTS) {
      this.byAccelerator.set(entry.accelerator, entry);
      this.byCommand.set(`${entry.extensionId}:${entry.commandId}`, entry);
    }
  }

  private resolveAccelerator(defaultAccel: string, extensionId: string, commandId: string, customShortcuts: Record<string, unknown>): string {
    const key = `core.shortcuts.${extensionId}.${commandId}`;
    const custom = customShortcuts[key];
    if (typeof custom === 'string' && custom.trim()) return custom;
    return defaultAccel;
  }

  getCommandForAccelerator(accelerator: string): ShortcutEntry | undefined {
    return this.byAccelerator.get(accelerator);
  }

  list(): ShortcutEntry[] {
    return Array.from(this.byAccelerator.values());
  }

  update(extensionId: string, commandId: string, newAccelerator: string): void {
    const key = `${extensionId}:${commandId}`;
    const existing = this.byCommand.get(key);
    if (!existing || existing.extensionId === 'core') return;

    if (existing.accelerator) {
      this.byAccelerator.delete(existing.accelerator);
    }

    if (!newAccelerator.trim()) {
      setSetting(`core.shortcuts.${extensionId}.${commandId}`, '');
      existing.accelerator = '';
      return;
    }

    setSetting(`core.shortcuts.${extensionId}.${commandId}`, newAccelerator);
    existing.accelerator = newAccelerator;
    this.byAccelerator.set(newAccelerator, existing);
  }

  reset(extensionId?: string): void {
    if (extensionId) {
      if (extensionId === 'core') return;
      for (const [, entry] of this.byCommand) {
        if (entry.extensionId === extensionId) {
          setSetting(`core.shortcuts.${entry.extensionId}.${entry.commandId}`, '');
        }
      }
    } else {
      for (const entry of this.byCommand.values()) {
        if (entry.extensionId === 'core') continue;
        setSetting(`core.shortcuts.${entry.extensionId}.${entry.commandId}`, '');
      }
    }
  }

  attachToWebContents(webContents: WebContents, onMatch: (accelerator: string) => void): void {
    webContents.on('before-input-event', (_event, input) => {
      if (input.type !== 'keyDown') return;
      const accelerator = toAccelerator(input);
      const entry = this.byAccelerator.get(accelerator);
      if (entry) {
        onMatch(accelerator);
      }
    });
  }
}
