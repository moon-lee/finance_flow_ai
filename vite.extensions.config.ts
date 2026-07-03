import { defineConfig } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXTENSIONS_BUNDLE_DIR,
  extensionBundleFilename
} from './src/shared/extension-constants';

/**
 * Multi-entry config: bundles each subdirectory of `extensions/` that contains
 * a `package.json` with a `financeExtension` field into a single ESM file at
 * `dist/extensions/<id>.js`. See Decision 10 and ADR-0004.
 *
 * Extensions are externalised so Node built-ins (`node:*`) and the platform's
 * shared runtime deps (`better-sqlite3`) resolve at runtime rather than being
 * bundled. Each extension's source map is preserved for production debugging.
 */
function discoverExtensionEntries(): Record<string, string> {
  const extRoot = join(process.cwd(), 'extensions');
  const entries: Record<string, string> = {};
  for (const name of readdirSync(extRoot)) {
    const dir = join(extRoot, name);
    let pkg: { name?: string; financeExtension?: { id?: string; main?: string } };
    try {
      // readFileSync + JSON.parse is required because this config runs as ESM
      // (Vite's default for `.ts` configs) and `require` is undefined. The
      // empty-catch silent-skip pattern from the previous draft also masked
      // malformed extension packages; surface those as warnings instead.
      // See [Review fix §HOST-2].
      pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    } catch (err) {
      console.warn(`[vite.extensions] skipping ${dir}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (pkg.financeExtension) {
      // Key the bundle output by the manifest's canonical id, NOT the directory
      // name, so a future divergence between folder name and `financeExtension.id`
      // cannot silently break activation. See [Review fix §HOST-3].
      const id = pkg.financeExtension.id ?? pkg.name;
      if (!id) {
        console.warn(`[vite.extensions] skipping ${dir}: package.json has neither financeExtension.id nor name`);
        continue;
      }
      if (name !== id) {
        console.warn(
          `[vite.extensions] extension folder "${name}" declares id "${id}" — ` +
          `bundling under id, but extension-loader validation may reject this. ` +
          `Rename folder to "${id}" or update financeExtension.id to match.`
        );
      }
      entries[extensionBundleFilename(id).replace(/\.js$/, '')] = join(dir, pkg.financeExtension.main ?? 'src/main.ts');
    }
  }
  return entries;
}

export default defineConfig({
  build: {
    outDir: EXTENSIONS_BUNDLE_DIR,
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: discoverExtensionEntries(),
      output: {
        entryFileNames: (chunkInfo) => `${chunkInfo.name}.js`,
        format: 'es'
      },
      external: [
        'electron',
        'node:path',
        'node:url',
        'node:fs',
        'node:module',
        'better-sqlite3'
      ]
    }
  }
});
