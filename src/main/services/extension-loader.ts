import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateManifest, type ManifestValidationResult } from '../../extension-host/manifest-schema';
import type { FinanceExtensionManifest, PackageJsonFinanceExtension } from '../../types/finance';
import type { TableSchemaRegistry } from './table-schema-registry';

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
export interface DiscoverExtensionsOptions {
  logger?: (msg: string) => void;
  /**
   * Optional schema registry. When provided, the loader registers each
   * discovered extension's `tables[]` declarations as soon as the manifest
   * passes Zod validation. This guarantees that extension-owned tables are
   * known to the DAO service before the Extension Host can activate the
   * extension. If registration throws (e.g. namespace prefix violation),
   * the extension is skipped with the error surfaced as the skip reason.
   */
  tableSchemaRegistry?: TableSchemaRegistry;
}

export function discoverExtensions(
  extensionsRoot: string,
  options: DiscoverExtensionsOptions = {}
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

    // Phase 5 Task 1 — auto-fill missing Phase 4 manifest fields so older
    // extensions remain loadable. We backfill `allowedCommands` from the
    // declared `commands[]` (all commands are allowed by default if the
    // extension does not opt into allowlisting) and `allowedUiEvents` from
    // an empty array (no ui-events allowed by default unless listed).
    const manifest = validation.manifest;
    if (!manifest.contributions.allowedCommands && manifest.contributions.commands) {
      manifest.contributions.allowedCommands = manifest.contributions.commands.map(c => c.id);
      console.warn(`[loader] auto-filled allowedCommands for "${manifest.id}" from commands[]`);
    }
    if (!manifest.contributions.allowedUiEvents) {
      manifest.contributions.allowedUiEvents = [];
    }

    // Phase 4 Task 9.1 — register extension-owned tables with the schema
    // registry immediately after manifest validation succeeds. The DAO
    // service cannot process reads/writes for a table that has not been
    // registered, so doing this during discovery (before the Host starts)
    // removes a race between extension activation and DAO readiness.
    // If the manifest's tables[] violates registry rules (prefix mismatch,
    // shared-table claim, duplicate), the extension is skipped rather than
    // allowed to crash at runtime.
    if (options.tableSchemaRegistry) {
      try {
        options.tableSchemaRegistry.registerExtensionTables(
          validation.manifest.id,
          validation.manifest.tables ?? []
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.skipped.push({ directory, reason: `invalid tables[]: ${message}` });
        continue;
      }
    }

    result.extensions.push({
      directory,
      manifest: validation.manifest,
      persisted: false
    });
  }

  return result;
}
