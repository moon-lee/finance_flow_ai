/**
 * Build-time and runtime constants shared by the Vite configs (host + extensions
 * bundlers) and the IPC transport. Keeping these in `src/shared/` lets the Vite
 * configs import them without dragging in any Electron runtime types — Vite runs
 * the configs as ESM Node scripts, where `import { app } from 'electron'` would
 * fail because Electron's runtime isn't available during the build.
 *
 * If you change a path here, both the Vite bundlers and the IPC transport pick
 * up the change automatically. Do not duplicate these strings elsewhere.
 */

/** Output directory for the Extension Host bundle (`dist/extension-host/`). */
export const HOST_BUNDLE_DIR = 'dist/extension-host';

/** Filename of the Extension Host bundle inside `HOST_BUNDLE_DIR`. */
export const HOST_BUNDLE_FILENAME = 'host.js';

/** Output directory for per-extension ESM bundles (`dist/extensions/`). */
export const EXTENSIONS_BUNDLE_DIR = 'dist/extensions';

/** Builds the bundle filename for a given extension id. One file per extension. */
export function extensionBundleFilename(extensionId: string): string {
  return `${extensionId}.js`;
}
