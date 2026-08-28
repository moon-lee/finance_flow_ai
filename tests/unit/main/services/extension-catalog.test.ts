import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverExtensionsInRoots } from '../../../../src/main/services/extension-catalog';

const MINIMAL_MANIFEST = {
  id: 'x',
  displayName: 'X',
  version: '0.1.0',
  activationEvents: ['onView:x'],
  contributions: {},
  main: 'src/main.ts'
};

function writeExt(root: string, id: string): string {
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: id, financeExtension: { ...MINIMAL_MANIFEST, id } }));
  return dir;
}

describe('discoverExtensionsInRoots', () => {
  it('merges extensions from all roots', () => {
    const base = mkdtempSync(join(tmpdir(), 'ffx-cat-'));
    const builtin = join(base, 'builtin');
    const user = join(base, 'user');
    mkdirSync(builtin, { recursive: true });
    mkdirSync(user, { recursive: true });
    writeExt(builtin, 'salary-history');
    writeExt(user, 'my-extension');
    const { extensions } = discoverExtensionsInRoots([user, builtin]);
    const ids = extensions.map((e) => e.manifest.id).sort();
    expect(ids).toEqual(['my-extension', 'salary-history']);
  });
  it('rejects a user extension that collides with a built-in id', () => {
    const base = mkdtempSync(join(tmpdir(), 'ffx-cat-'));
    const builtin = join(base, 'builtin');
    const user = join(base, 'user');
    mkdirSync(builtin, { recursive: true });
    mkdirSync(user, { recursive: true });
    writeExt(builtin, 'dup');
    writeExt(user, 'dup');
    const { extensions, skipped } = discoverExtensionsInRoots([user, builtin]);
    expect(extensions.map((e) => e.manifest.id)).toEqual(['dup']);
    expect(skipped.some((s) => s.reason.includes('built-in'))).toBe(true);
  });
  it('skips malformed packages and keeps scanning', () => {
    const base = mkdtempSync(join(tmpdir(), 'ffx-cat-'));
    const user = join(base, 'user');
    mkdirSync(user, { recursive: true });
    mkdirSync(join(user, 'bad'), { recursive: true });
    writeFileSync(join(user, 'bad', 'package.json'), 'not json');
    writeExt(user, 'good');
    const { extensions } = discoverExtensionsInRoots([user]);
    expect(extensions.map((e) => e.manifest.id)).toEqual(['good']);
  });
});
