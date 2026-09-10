import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('electron', () => ({
  protocol: { handle: vi.fn() },
}));

import {
  extensionAssetMime,
  parseExtensionAssetPath,
  resolveExtensionAssetPath,
  serveExtensionIconAsset,
} from '../../../../src/main/services/panel-protocol';
import { buildExtensionIconUrl } from '../../../../src/shared/extension-icon';

describe('extension icon asset protocol', () => {
  it('parses validated icon asset paths', () => {
    expect(parseExtensionAssetPath('salary-history/assets/icon.svg')).toEqual({
      extensionId: 'salary-history',
      assetPath: 'assets/icon.svg',
    });
    expect(parseExtensionAssetPath('todo-list/icons/todo.png')).toEqual({
      extensionId: 'todo-list',
      assetPath: 'icons/todo.png',
    });
  });

  it('rejects traversal, absolute, protocol, and unsupported paths', () => {
    for (const bad of [
      'salary-history/../package.json',
      'salary-history//package.json',
      'salary-history/%2e%2e/package.json',
      'salary-history/assets/icon.js',
      'salary-history/assets/icon.svg?x=1',
      'salary-history/assets/icon.svg#frag',
      'salary-history',
      '/icon.svg',
      'https://example/icon.svg',
      'Salary-History/assets/icon.svg',
    ]) {
      expect(parseExtensionAssetPath(bad)).toBeNull();
    }
    expect(parseExtensionAssetPath('salary-history.js')).toBeNull();
  });

  it('maps icon MIME types', () => {
    expect(extensionAssetMime('assets/icon.svg')).toBe('image/svg+xml');
    expect(extensionAssetMime('assets/icon.png')).toBe('image/png');
    expect(extensionAssetMime('assets/icon.js')).toBeNull();
  });

  it('builds renderer icon URLs only for asset paths', () => {
    expect(buildExtensionIconUrl('demo', 'assets/icon.svg')).toBe(
      'finance-shell://extensions/demo/assets/icon.svg'
    );
    expect(buildExtensionIconUrl('demo', 'L')).toBeUndefined();
    expect(buildExtensionIconUrl('demo', '../icon.svg')).toBeUndefined();
  });
});

describe('serveExtensionIconAsset', () => {
  let tmpRoot: string;
  let userRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'ff-icon-proto-'));
    userRoot = join(tmpRoot, 'user');
    mkdirSync(join(userRoot, 'todo-list', 'assets'), { recursive: true });
    writeFileSync(join(userRoot, 'todo-list', 'assets', 'icon.svg'), '<svg/>');
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('serves a declared SVG icon with image/svg+xml', async () => {
    const response = await serveExtensionIconAsset('todo-list/assets/icon.svg', [userRoot]);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/svg+xml');
  });

  it('rejects traversal and JavaScript asset requests', async () => {
    expect((await serveExtensionIconAsset('todo-list/../package.json', [userRoot])).status).not.toBe(200);
    expect((await serveExtensionIconAsset('todo-list/assets/icon.js', [userRoot])).status).not.toBe(200);
    expect(resolveExtensionAssetPath('todo-list', 'assets/icon.svg', [userRoot])).toContain('icon.svg');
  });
});
