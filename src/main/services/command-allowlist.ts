import type { FinanceExtensionManifest } from '../../types/finance';

export class CommandAllowlist {
  private readonly table = new Map<string, Set<string>>();

  rebuild(manifests: FinanceExtensionManifest[]): void {
    this.table.clear();
    for (const manifest of manifests) {
      const allowed = new Set(manifest.contributions.allowedCommands ?? []);
      // Backfill: if an older manifest omitted allowedCommands, allow its own commands.
      if (allowed.size === 0 && manifest.contributions.commands) {
        for (const c of manifest.contributions.commands) allowed.add(c.id);
      }
      this.table.set(manifest.id, allowed);
    }
  }

  isAllowed(extensionId: string, commandId: string): boolean {
    const allowed = this.table.get(extensionId);
    if (!allowed) return false;
    return allowed.has(commandId);
  }
}
