export class OverlayCoordinator {
  private refCount = 0;
  private activeIds = new Set<string>();

  showOverlay(id: string): void {
    if (this.activeIds.has(id)) return;
    this.activeIds.add(id);
    this.refCount += 1;
    if (this.refCount === 1) {
      window.financeShell?.panel?.hideForOverlay?.();
    }
  }

  hideOverlay(id: string): void {
    if (!this.activeIds.has(id)) return;
    this.activeIds.delete(id);
    if (this.refCount > 0) this.refCount -= 1;
    if (this.refCount === 0) {
      window.financeShell?.panel?.restoreAfterOverlay?.();
    }
  }

  getOverlayCount(): number {
    return this.refCount;
  }

  isActive(): boolean {
    return this.refCount > 0;
  }
}
