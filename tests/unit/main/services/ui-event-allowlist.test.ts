import { describe, expect, it, beforeEach } from 'vitest';
import { UiEventAllowlist } from '../../../../src/main/services/ui-event-allowlist';
import type { FinanceExtensionManifest } from '../../../../src/types/finance';

function makeManifest(
  id: string,
  opts: { allowedUiEvents?: string[] } = {}
): FinanceExtensionManifest {
  return {
    id,
    displayName: id,
    version: '1.0.0',
    activationEvents: ['*'],
    main: 'main.js',
    contributions: {
      allowedUiEvents: opts.allowedUiEvents
    }
  } as FinanceExtensionManifest;
}

describe('UiEventAllowlist', () => {
  let allowlist: UiEventAllowlist;

  beforeEach(() => {
    allowlist = new UiEventAllowlist();
  });

  it('isAllowed() returns true for registered event', () => {
    allowlist.rebuild([
      makeManifest('salary-history', { allowedUiEvents: ['payslip-save', 'rate-edit-request'] })
    ]);

    expect(allowlist.isAllowed('salary-history', 'payslip-save')).toBe(true);
    expect(allowlist.isAllowed('salary-history', 'rate-edit-request')).toBe(true);
  });

  it('isAllowed() returns false for unregistered event', () => {
    allowlist.rebuild([
      makeManifest('salary-history', { allowedUiEvents: ['payslip-save'] })
    ]);

    expect(allowlist.isAllowed('salary-history', 'unknown-event')).toBe(false);
  });

  it('isAllowed() returns false for disabled extension', () => {
    allowlist.rebuild([
      makeManifest('salary-history', { allowedUiEvents: ['payslip-save'] })
    ]);

    expect(allowlist.isAllowed('disabled-ext', 'payslip-save')).toBe(false);
  });

  it('rebuild() updates from manifests', () => {
    allowlist.rebuild([
      makeManifest('ext-a', { allowedUiEvents: ['event-a'] })
    ]);
    expect(allowlist.isAllowed('ext-a', 'event-a')).toBe(true);

    allowlist.rebuild([
      makeManifest('ext-b', { allowedUiEvents: ['event-b'] })
    ]);
    expect(allowlist.isAllowed('ext-b', 'event-b')).toBe(true);
    expect(allowlist.isAllowed('ext-a', 'event-a')).toBe(false);
  });

  it('Phase 4 migration shim: empty array when allowedUiEvents missing', () => {
    allowlist.rebuild([
      makeManifest('salary-history')
      // allowedUiEvents intentionally omitted
    ]);

    expect(allowlist.isAllowed('salary-history', 'payslip-save')).toBe(false);
  });
});
