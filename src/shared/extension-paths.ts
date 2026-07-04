import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST_BUNDLE_DIR, HOST_BUNDLE_FILENAME } from './extension-constants';

// `import.meta.url` in the bundled output points to the file that contains
// this code. extension-paths.ts is bundled into dist/main/main.js, so
// moduleDir resolves to `dist/main/`. HOST_BUNDLE_DIR ('dist/extension-host')
// is project-root-relative (correct for the Vite config's `outDir`), so to
// resolve from moduleDir we need two `..` segments: `dist/main/` -> `dist/`
// -> project root. From there, `dist/extension-host/host.js` joins cleanly.
//
// Previously this used `app.getAppPath()`, which returns the directory of
// the running main.js (`dist/main/`) in unpackaged dev mode and produced
// `dist/main/dist/extension-host/host.js`. Then a one-`..` fix produced
// `dist/dist/extension-host/host.js` (one level short). Two `..` is correct.
const moduleDir = dirname(fileURLToPath(import.meta.url));

/**
 * Constructs the absolute path to the Extension Host bundle at runtime.
 * The resolved path is logged on startup so a misconfigured build fails loudly.
 */
export function resolveHostBundlePath(): string {
  const path = join(moduleDir, '..', '..', HOST_BUNDLE_DIR, HOST_BUNDLE_FILENAME);
  console.log(`[extension-host] bundle path resolved: ${path}`);
  return path;
}
