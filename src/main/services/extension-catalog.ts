import { discoverExtensions, type DiscoverExtensionsOptions, type DiscoveryResult } from './extension-loader';

/**
 * Phase 8 — multi-root discovery (ADR-0009).
 * The first root is the user-installable root; the last is the built-in root.
 * A user extension whose id collides with a built-in extension is rejected
 * (built-ins cannot be overridden).
 */
export function discoverExtensionsInRoots(
  roots: readonly string[],
  options: DiscoverExtensionsOptions = {}
): DiscoveryResult {
  const result: DiscoveryResult = { extensions: [], skipped: [] };
  if (roots.length === 0) return result;
  const builtinRoot = roots[roots.length - 1];
  const builtinDiscovered = discoverExtensions(builtinRoot, options);
  const builtinIds = new Set(builtinDiscovered.extensions.map((e) => e.manifest.id));
  result.extensions.push(...builtinDiscovered.extensions);
  result.skipped.push(...builtinDiscovered.skipped);
  for (let i = 0; i < roots.length - 1; i++) {
    const discovered = discoverExtensions(roots[i], options);
    for (const ext of discovered.extensions) {
      if (builtinIds.has(ext.manifest.id)) {
        result.skipped.push({ directory: ext.directory, reason: `user extension id "${ext.manifest.id}" collides with a built-in extension` });
        continue;
      }
      result.extensions.push(ext);
    }
    result.skipped.push(...discovered.skipped);
  }
  return result;
}
