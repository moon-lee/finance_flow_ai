// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { OverlayCoordinator } from '../../../src/renderer/overlay-coordinator';

function createCoordinator(): OverlayCoordinator {
  (window as unknown as { financeShell: { panel: { hideForOverlay: () => void; restoreAfterOverlay: () => void } } }).financeShell = {
    panel: {
      hideForOverlay: () => {},
      restoreAfterOverlay: () => {}
    }
  };
  return new OverlayCoordinator();
}

describe('OverlayCoordinator', () => {
  it('showOverlay increments ref count and hides panels on first show', () => {
    const coordinator = createCoordinator();
    const hideSpy = vi.fn();
    (window as unknown as { financeShell: { panel: { hideForOverlay: () => void; restoreAfterOverlay: () => void } } }).financeShell.panel.hideForOverlay = hideSpy;

    coordinator.showOverlay('command-palette');

    expect(coordinator.getOverlayCount()).toBe(1);
    expect(coordinator.isActive()).toBe(true);
    expect(hideSpy).toHaveBeenCalledTimes(1);
  });

  it('showOverlay with second id increments count without re-hiding panels', () => {
    const coordinator = createCoordinator();
    const hideSpy = vi.fn();
    (window as unknown as { financeShell: { panel: { hideForOverlay: () => void; restoreAfterOverlay: () => void } } }).financeShell.panel.hideForOverlay = hideSpy;

    coordinator.showOverlay('command-palette');
    hideSpy.mockClear();
    coordinator.showOverlay('shortcuts');

    expect(coordinator.getOverlayCount()).toBe(2);
    expect(hideSpy).not.toHaveBeenCalled();
  });

  it('hideOverlay decrements ref count and restores panels on last hide', () => {
    const coordinator = createCoordinator();
    const restoreSpy = vi.fn();
    (window as unknown as { financeShell: { panel: { hideForOverlay: () => void; restoreAfterOverlay: () => void } } }).financeShell.panel.restoreAfterOverlay = restoreSpy;

    coordinator.showOverlay('command-palette');
    coordinator.showOverlay('shortcuts');
    restoreSpy.mockClear();
    coordinator.hideOverlay('command-palette');

    expect(coordinator.getOverlayCount()).toBe(1);
    expect(restoreSpy).not.toHaveBeenCalled();
  });

  it('hideOverlay restores panels when count reaches 0', () => {
    const coordinator = createCoordinator();
    const restoreSpy = vi.fn();
    (window as unknown as { financeShell: { panel: { hideForOverlay: () => void; restoreAfterOverlay: () => void } } }).financeShell.panel.restoreAfterOverlay = restoreSpy;

    coordinator.showOverlay('command-palette');
    coordinator.hideOverlay('command-palette');

    expect(coordinator.getOverlayCount()).toBe(0);
    expect(coordinator.isActive()).toBe(false);
    expect(restoreSpy).toHaveBeenCalledTimes(1);
  });

  it('getOverlayCount returns current ref count', () => {
    const coordinator = createCoordinator();

    expect(coordinator.getOverlayCount()).toBe(0);
    coordinator.showOverlay('command-palette');
    expect(coordinator.getOverlayCount()).toBe(1);
    coordinator.showOverlay('shortcuts');
    expect(coordinator.getOverlayCount()).toBe(2);
    coordinator.hideOverlay('command-palette');
    expect(coordinator.getOverlayCount()).toBe(1);
    coordinator.hideOverlay('shortcuts');
    expect(coordinator.getOverlayCount()).toBe(0);
  });

  it('isActive returns false when no overlays are open', () => {
    const coordinator = createCoordinator();

    expect(coordinator.isActive()).toBe(false);
    coordinator.showOverlay('command-palette');
    coordinator.hideOverlay('command-palette');
    expect(coordinator.isActive()).toBe(false);
  });

  it('isActive returns true when at least one overlay is open', () => {
    const coordinator = createCoordinator();

    coordinator.showOverlay('command-palette');
    expect(coordinator.isActive()).toBe(true);
  });

  it('double hideOverlay for same id does not crash or go negative', () => {
    const coordinator = createCoordinator();

    coordinator.showOverlay('command-palette');
    coordinator.hideOverlay('command-palette');
    coordinator.hideOverlay('command-palette');

    expect(coordinator.getOverlayCount()).toBe(0);
    expect(coordinator.isActive()).toBe(false);
  });

  it('hideOverlay with unknown id is handled safely', () => {
    const coordinator = createCoordinator();

    expect(() => coordinator.hideOverlay('unknown')).not.toThrow();
    expect(coordinator.getOverlayCount()).toBe(0);
    expect(coordinator.isActive()).toBe(false);
  });
});
