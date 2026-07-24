import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST_BUNDLE_DIR, HOST_BUNDLE_FILENAME } from './extension-constants';

declare const __dirname: string;

// When bundled into ESM (extension-host), __dirname is undefined and
// `import.meta.url` resolves correctly at runtime because the bundle keeps
// ESM semantics. When bundled into CJS (main process), `__dirname` is
// provided by Node's CJS wrapper and `import.meta.url` collapses to `{}.url`,
// so we must prefer `__dirname`.
const moduleDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));

/**
 * Constructs the absolute path to the Extension Host bundle at runtime.
 * The resolved path is logged on startup so a misconfigured build fails loudly.
 */
export function resolveHostBundlePath(): string {
  const path = join(moduleDir, '..', '..', HOST_BUNDLE_DIR, HOST_BUNDLE_FILENAME);
  console.log(`[extension-host] bundle path resolved: ${path}`);
  return path;
}
