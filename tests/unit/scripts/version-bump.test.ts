import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// Loaded natively via file URL (bypasses Vite's module graph, which rewrites
// relative `.mjs` imports to a Windows path Node cannot resolve).
const { bumpVersion } = await import(
  pathToFileURL(join(process.cwd(), 'scripts', 'version-bump.mjs')).href
);

describe('bumpVersion (dev build counter: A.B.C, C 0-99, B 0-9)', () => {
  it('increments the patch by 1', () => {
    expect(bumpVersion('1.0.0')).toBe('1.0.1');
  });

  it('stays in the two-digit patch range at 98 -> 99', () => {
    expect(bumpVersion('1.0.98')).toBe('1.0.99');
  });

  it('wraps patch 99 -> 0 and rolls the minor up by 1', () => {
    expect(bumpVersion('1.0.99')).toBe('1.1.0');
  });

  it('wraps minor 9 -> 0 and rolls the major up by 1', () => {
    expect(bumpVersion('1.9.99')).toBe('2.0.0');
  });

  it('handles low and high majors', () => {
    expect(bumpVersion('0.0.99')).toBe('0.1.0');
    expect(bumpVersion('12.9.99')).toBe('13.0.0');
  });

  it('does not wrap minor until patch exceeds 99', () => {
    expect(bumpVersion('0.9.98')).toBe('0.9.99');
  });

  it('throws on malformed input', () => {
    for (const version of ['', '1.0', 'v1.0.0', '1.0.0.0', '1.0.x', '1.0.abc', '1,0.5']) {
      expect(() => bumpVersion(version)).toThrow();
    }
  });
});