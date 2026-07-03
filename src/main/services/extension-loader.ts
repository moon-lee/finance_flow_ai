import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateManifest, type ManifestValidationResult } from '../../extension-host/manifest-schema';
import type { FinanceExtensionManifest, PackageJsonFinanceExtension } from '../../types/finance';

export interface DiscoveredExtension {
  /** Absolute path to the extension's package directory. */
  directory: string;
  manifest: FinanceExtensionManifest;
  /** Whether the loader wrote/updated this row in extension_registry. */
  persisted: boolean;
}

export interface SkippedExtension {
  directory: string;
  reason: string;
}

export interface DiscoveryResult {
  extensions: DiscoveredExtension[];
  skipped: SkippedExtension[];
}

const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'dist']);

/**
 * Scan `extensionsRoot` for subdirectories whose `package.json` contains
 * a valid `financeExtension` field. Invalid manifests are skipped with a
 * warning rather than aborting the whole discovery (third-party safety).
 */
export function discoverExtensions(
  extensionsRoot: string,
  options: { logger?: (msg: string) => void } = {}
): DiscoveryResult {
  const log = options.logger ?? console.warn;
  const result: DiscoveryResult = { extensions: [], skipped: [] };

  let entries: string[];
  try {
    entries = readdirSync(extensionsRoot);
  } catch (err) {
    log(`[loader] cannot read extensions directory "${extensionsRoot}": ${err}`);
    return result;
  }

  for (const entry of entries) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const directory = resolve(extensionsRoot, entry);
    let stat;
    try {
      stat = statSync(directory);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const pkgPath = join(directory, 'package.json');
    let pkg: { name?: string; version?: string; financeExtension?: unknown };
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch {
      result.skipped.push({ directory, reason: 'package.json missing or unparseable' });
      continue;
    }

    if (!pkg.financeExtension) {
      result.skipped.push({ directory, reason: 'no financeExtension field' });
      continue;
    }

    // The package.json#name and financeExtension#id must agree. This catches
    // a rename in one file without the other.
    if (pkg.name && (pkg.financeExtension as { id?: string }).id && pkg.name !== (pkg.financeExtension as { id: string }).id) {
      result.skipped.push({ directory, reason: `package.json#name "${pkg.name}" does not match financeExtension.id "${(pkg.financeExtension as { id: string }).id}"` });
      continue;
    }

    const rawManifest: PackageJsonFinanceExtension = pkg.financeExtension as PackageJsonFinanceExtension;
    // Fall back to package.json#version if the manifest omits it.
    if (!rawManifest.version && pkg.version) rawManifest.version = pkg.version;

    const validation: ManifestValidationResult = validateManifest(rawManifest);
    if (!validation.ok) {
      result.skipped.push({ directory, reason: `invalid manifest: ${validation.errors.join('; ')}` });
      continue;
    }

    result.extensions.push({
      directory,
      manifest: validation.manifest,
      persisted: false
    });
  }

  return result;
}
