import type { FinanceExtensionManifest } from '../../types/finance';

export class UiEventAllowlist {
  private readonly table = new Map<string, Set<string>>();

  rebuild(manifests: FinanceExtensionManifest[]): void {
    this.table.clear();
    for (const manifest of manifests) {
      this.table.set(manifest.id, new Set(manifest.contributions.allowedUiEvents ?? []));
    }
  }

  isAllowed(extensionId: string, eventName: string): boolean {
    const allowed = this.table.get(extensionId);
    if (!allowed) return false;
    return allowed.has(eventName);
  }
}
