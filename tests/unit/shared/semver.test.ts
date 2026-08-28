import { describe, expect, it } from 'vitest';
import { compareVersions, parseVersion, satisfiesRequirement } from '../../../src/shared/semver';

describe('parseVersion', () => {
  it('parses x.y.z', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
  });
  it('accepts a leading v and prerelease/build suffixes', () => {
    expect(parseVersion('v2.0.0-beta.1')).toEqual([2, 0, 0]);
    expect(parseVersion('1.2.3+build5')).toEqual([1, 2, 3]);
  });
  it('throws on malformed input', () => {
    expect(() => parseVersion('1.2')).toThrow();
    expect(() => parseVersion('abc')).toThrow();
  });
});

describe('compareVersions', () => {
  it('sorts versions', () => {
    expect(compareVersions('0.9.0', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
  });
});

describe('satisfiesRequirement', () => {
  it('matches exact and caret ranges', () => {
    expect(satisfiesRequirement('1.2.3', '1.2.3')).toBe(true);
    expect(satisfiesRequirement('1.5.0', '^1.2.0')).toBe(true);
    expect(satisfiesRequirement('2.0.0', '^1.2.0')).toBe(false);
    expect(satisfiesRequirement('0.9.0', '^1.2.0')).toBe(false);
  });
});
