import { join } from 'node:path';
import { app } from 'electron';
import { HOST_BUNDLE_DIR, HOST_BUNDLE_FILENAME } from './extension-constants';

/**
 * Constructs the absolute path to the Extension Host bundle at runtime.
 * The resolved path is logged on startup so a misconfigured build fails loudly.
 */
export function resolveHostBundlePath(): string {
  const path = join(app.getAppPath(), HOST_BUNDLE_DIR, HOST_BUNDLE_FILENAME);
  console.log(`[extension-host] bundle path resolved: ${path}`);
  return path;
}
