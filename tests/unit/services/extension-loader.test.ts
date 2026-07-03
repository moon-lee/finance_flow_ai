import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverExtensions } from '../../../src/main/services/extension-loader';

describe('discoverExtensions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'finance-ext-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers a single valid extension', () => {
    const extDir = join(tmpDir, 'salary-history');
    mkdirSync(extDir);
    writeFileSync(join(extDir, 'package.json'), JSON.stringify({
      name: 'salary-history',
      version: '0.1.0',
      financeExtension: {
        id: 'salary-history',
        displayName: 'Salary History',
        version: '0.1.0',
        activationEvents: ['onView:salary-history'],
        contributions: {
          views: [{ id: 'salary-history', name: 'Salary', icon: 'P' }],
          commands: [{ id: 'salary.show-pay-history', title: 'View: Pay History' }]
        },
        main: 'src/main.ts'
      }
    }));

    const result = discoverExtensions(tmpDir, { logger: () => {} });
    expect(result.extensions).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    expect(result.extensions[0].manifest.id).toBe('salary-history');
    // Falls back to package.json#version when manifest omits it.
    expect(result.extensions[0].manifest.version).toBe('0.1.0');
  });

  it('skips directories without a financeExtension field', () => {
    const extDir = join(tmpDir, 'plain-package');
    mkdirSync(extDir);
    writeFileSync(join(extDir, 'package.json'), JSON.stringify({ name: 'plain-package', version: '1.0.0' }));

    const result = discoverExtensions(tmpDir, { logger: () => {} });
    expect(result.extensions).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('no financeExtension');
  });

  it('skips extensions with mismatched name and id', () => {
    const extDir = join(tmpDir, 'mismatch');
    mkdirSync(extDir);
    writeFileSync(join(extDir, 'package.json'), JSON.stringify({
      name: 'mismatch',
      version: '0.1.0',
      financeExtension: {
        id: 'different-id',
        displayName: 'Mismatch',
        version: '0.1.0',
        activationEvents: ['*'],
        contributions: {},
        main: 'src/main.ts'
      }
    }));

    const result = discoverExtensions(tmpDir, { logger: () => {} });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('does not match');
  });

  it('skips extensions with invalid manifest and reports errors', () => {
    const extDir = join(tmpDir, 'bad-manifest');
    mkdirSync(extDir);
    writeFileSync(join(extDir, 'package.json'), JSON.stringify({
      name: 'bad-manifest',
      financeExtension: {
        // name and id match so the loader's pre-check passes; the empty
        // activationEvents array then triggers Zod validation rejection.
        id: 'bad-manifest',
        displayName: 'X',
        activationEvents: [],
        contributions: {},
        main: ''
      }
    }));

    const result = discoverExtensions(tmpDir, { logger: () => {} });
    expect(result.extensions).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('invalid manifest');
  });

  it('skips node_modules and dist directories', () => {
    const skipDir = join(tmpDir, 'node_modules');
    mkdirSync(skipDir);
    writeFileSync(join(skipDir, 'package.json'), '{}');

    const distDir = join(tmpDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'package.json'), '{}');

    const result = discoverExtensions(tmpDir, { logger: () => {} });
    expect(result.extensions).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('returns empty result when extensions root does not exist', () => {
    const result = discoverExtensions(join(tmpDir, 'does-not-exist'), { logger: () => {} });
    expect(result.extensions).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });
});
