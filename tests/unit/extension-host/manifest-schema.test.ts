import { describe, it, expect } from 'vitest';
import { validateManifest } from '../../../src/extension-host/manifest-schema';

const validManifest = {
  id: 'salary-history',
  displayName: 'Salary History',
  version: '0.1.0',
  activationEvents: ['onView:salary-history'],
  contributions: {
    views: [{ id: 'salary-history', name: 'Salary', icon: 'P' }],
    commands: [{ id: 'salary.show-pay-history', title: 'View: Pay History' }]
  },
  main: 'src/main.ts'
};

describe('validateManifest', () => {
  it('accepts a minimal valid manifest', () => {
    const result = validateManifest(validManifest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.id).toBe('salary-history');
      expect(result.manifest.contributions.views).toHaveLength(1);
    }
  });

  it('accepts wildcard activation event', () => {
    const result = validateManifest({ ...validManifest, activationEvents: ['*'] });
    expect(result.ok).toBe(true);
  });

  it('rejects missing activationEvents', () => {
    const { activationEvents: _removed, ...rest } = validManifest;
    void _removed;
    const result = validateManifest(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('activationEvents'))).toBe(true);
    }
  });

  it('rejects empty activationEvents array', () => {
    const result = validateManifest({ ...validManifest, activationEvents: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid view id (uppercase)', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: { views: [{ id: 'SalaryHistory', name: 'Salary', icon: 'P' }] }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('view id'))).toBe(true);
  });

  it('rejects unknown manifest keys (strict mode)', () => {
    const result = validateManifest({ ...validManifest, unknownKey: 'surprise' });
    expect(result.ok).toBe(false);
  });

  it('rejects unknown contribution keys (strict mode)', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: { views: [], themes: [{ id: 'neon', label: 'Neon' }] }
    });
    expect(result.ok).toBe(false);
  });

  it('rejects enum type without enumOptions', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: {
        configuration: [{ key: 'salary-history.mode', type: 'enum', label: 'Mode' }]
      }
    });
    expect(result.ok).toBe(false);
  });

  it('accepts enum type with enumOptions', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: {
        configuration: [{
          key: 'salary-history.mode',
          type: 'enum',
          label: 'Mode',
          enumOptions: ['gross', 'net'],
          default: 'gross'
        }]
      }
    });
    expect(result.ok).toBe(true);
  });

  it('rejects semver-less version', () => {
    const result = validateManifest({ ...validManifest, version: 'latest' });
    expect(result.ok).toBe(false);
  });
});
