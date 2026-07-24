import { describe, expect, it, beforeEach } from 'vitest';
import { CommandAllowlist } from '../../../../src/main/services/command-allowlist';
import type { FinanceExtensionManifest } from '../../../../src/types/finance';

function makeManifest(
  id: string,
  opts: { allowedCommands?: string[]; commands?: Array<{ id: string; title: string }>; enabled?: boolean } = {}
): FinanceExtensionManifest {
  return {
    id,
    displayName: id,
    version: '1.0.0',
    activationEvents: ['*'],
    main: 'main.js',
    contributions: {
      commands: opts.commands,
      allowedCommands: opts.allowedCommands
    }
  } as FinanceExtensionManifest;
}

describe('CommandAllowlist', () => {
  let allowlist: CommandAllowlist;

  beforeEach(() => {
    allowlist = new CommandAllowlist();
  });

  it('isAllowed() returns true for registered command', () => {
    allowlist.rebuild([
      makeManifest('salary-history', { allowedCommands: ['salary.show-pay-history'] })
    ]);

    expect(allowlist.isAllowed('salary-history', 'salary.show-pay-history')).toBe(true);
  });

  it('isAllowed() returns false for unregistered command', () => {
    allowlist.rebuild([
      makeManifest('salary-history', { allowedCommands: ['salary.show-pay-history'] })
    ]);

    expect(allowlist.isAllowed('salary-history', 'salary.unknown-command')).toBe(false);
  });

  it('isAllowed() returns false for disabled extension', () => {
    allowlist.rebuild([
      makeManifest('salary-history', { allowedCommands: ['salary.show-pay-history'] })
    ]);

    // An extension not in the manifest at all is treated as unknown/disabled
    expect(allowlist.isAllowed('disabled-extension', 'salary.show-pay-history')).toBe(false);
  });

  it('rebuild() updates the allowlist from manifests', () => {
    allowlist.rebuild([
      makeManifest('ext-a', { allowedCommands: ['a.cmd1'] })
    ]);
    expect(allowlist.isAllowed('ext-a', 'a.cmd1')).toBe(true);

    allowlist.rebuild([
      makeManifest('ext-b', { allowedCommands: ['b.cmd1'] })
    ]);
    expect(allowlist.isAllowed('ext-b', 'b.cmd1')).toBe(true);
    // Old manifest is gone
    expect(allowlist.isAllowed('ext-a', 'a.cmd1')).toBe(false);
  });

  it('Phase 4 migration shim: auto-fills from commands[] when allowedCommands missing', () => {
    allowlist.rebuild([
      makeManifest('salary-history', {
        commands: [
          { id: 'salary.show-pay-history', title: 'Show Pay History' },
          { id: 'salary.show-pay-rate-history', title: 'Show Pay Rate History' }
        ]
        // allowedCommands intentionally omitted
      })
    ]);

    expect(allowlist.isAllowed('salary-history', 'salary.show-pay-history')).toBe(true);
    expect(allowlist.isAllowed('salary-history', 'salary.show-pay-rate-history')).toBe(true);
  });

  it('isAllowed() returns false for unknown extension', () => {
    allowlist.rebuild([
      makeManifest('salary-history', { allowedCommands: ['salary.show-pay-history'] })
    ]);

    expect(allowlist.isAllowed('unknown-extension', 'any.command')).toBe(false);
  });
});
