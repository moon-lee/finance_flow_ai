import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveExtensionBundlePath } from '../../../src/shared/extension-paths';

function makeRoots(): string[] {
  const base = mkdtempSync(join(tmpdir(), 'ffx-paths-'));
  const builtin = join(base, 'dist', 'extensions');
  const user = join(base, 'user', 'extensions');
  mkdirSync(builtin, { recursive: true });
  mkdirSync(user, { recursive: true });
  return [user, builtin];
}

describe('resolveExtensionBundlePath', () => {
  it('finds built-in style bundles (<root>/<id>.js)', () => {
    const [user, builtin] = makeRoots();
    writeFileSync(join(builtin, 'salary-history.js'), '');
    expect(resolveExtensionBundlePath('salary-history', [user, builtin])).toBe(
      join(builtin, 'salary-history.js')
    );
  });
  it('finds installed-style bundles (<root>/<id>/<id>.js)', () => {
    const [user, builtin] = makeRoots();
    mkdirSync(join(user, 'my-extension'), { recursive: true });
    writeFileSync(join(user, 'my-extension', 'my-extension.js'), '');
    expect(resolveExtensionBundlePath('my-extension', [user, builtin])).toBe(
      join(user, 'my-extension', 'my-extension.js')
    );
  });
  it('prefers the user root over the built-in root', () => {
    const [user, builtin] = makeRoots();
    writeFileSync(join(builtin, 'dup.js'), '');
    mkdirSync(join(user, 'dup'), { recursive: true });
    writeFileSync(join(user, 'dup', 'dup.js'), '');
    expect(resolveExtensionBundlePath('dup', [user, builtin])).toBe(
      join(user, 'dup', 'dup.js')
    );
  });
  it('returns null when no bundle exists', () => {
    const [user, builtin] = makeRoots();
    expect(resolveExtensionBundlePath('nope', [user, builtin])).toBeNull();
  });
});
