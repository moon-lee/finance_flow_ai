/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import { validateManifest } from '../../extension-host/manifest-schema';
import type { FinanceExtensionManifest } from '../../types/finance';
import { compareVersions } from '../../shared/semver';
import { createExtensionTables } from './table-ddl';
import { ExtensionRegistry } from './extension-registry';
import { getSettingsService } from './settings-service';

export interface InstallOutcome {
  ok: true;
  id: string;
  version: string;
  action: 'installed' | 'updated' | 'no-change';
  requiresRestart: true;
}
export interface InstallError {
  ok: false;
  reason: string;
}

export interface InstallerDeps {
  db: Database.Database;
  userExtensionsRoot: string;
  registry: ExtensionRegistry;
}

const COPY_SKIP = new Set(['node_modules', '.git', 'dist']);

export class ExtensionInstaller {
  constructor(private readonly deps: InstallerDeps) {}

  private builtinIds(): ReadonlySet<string> {
    return this.deps.registry.builtinIds;
  }

  async installFromSource(sourcePath: string): Promise<InstallOutcome | InstallError> {
    const abs = resolve(sourcePath);
    if (!existsSync(abs)) return { ok: false, reason: `source path does not exist: ${abs}` };
    let workingDir = abs;
    let tempCleanup: string | undefined;
    if (abs.toLowerCase().endsWith('.zip')) {
      const mod: any = await import('extract-zip');
      const extract = mod.default ?? mod.extract ?? mod;
      workingDir = mkdtempSync(join(tmpdir(), 'ffx-extract-'));
      tempCleanup = workingDir;
      try {
        await extract(abs, { dir: workingDir });
      } catch (err) {
        rmSync(workingDir, { recursive: true, force: true });
        return { ok: false, reason: `could not extract zip: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    const result = this.installFromFolder(workingDir);
    if (tempCleanup) rmSync(tempCleanup, { recursive: true, force: true });
    return result;
  }

  private installFromFolder(folder: string): InstallOutcome | InstallError {
    const abs = folder;

    let pkg: { name?: string; financeExtension?: unknown };
    try {
      pkg = JSON.parse(readFileSync(join(abs, 'package.json'), 'utf8'));
    } catch {
      return { ok: false, reason: 'source has no readable package.json' };
    }
    const raw = pkg.financeExtension as never;
    const validation = validateManifest(raw);
    if (!validation.ok) return { ok: false, reason: `invalid manifest: ${validation.errors.join('; ')}` };
    const manifest = validation.manifest;

    if (this.builtinIds().has(manifest.id)) {
      return { ok: false, reason: `"${manifest.id}" is a built-in extension and cannot be installed over` };
    }

    const requiredPrefix = `${manifest.id.replace(/-/g, '_')}_`;
    for (const table of manifest.tables ?? []) {
      if (!table.name.startsWith(requiredPrefix)) {
        return { ok: false, reason: `table "${table.name}" must start with "${requiredPrefix}" (namespaced to extension "${manifest.id}")` };
      }
    }

    const missing = (manifest.dependencies ?? []).filter((dep) => !this.deps.registry.get(dep));
    if (missing.length > 0) {
      return { ok: false, reason: `missing dependencies: ${missing.join(', ')}` };
    }

    const existing = this.deps.registry.get(manifest.id);
    if (existing) {
      const cmp = compareVersions(manifest.version, existing.version);
      if (cmp === -1) {
        return { ok: false, reason: `a newer version (${existing.version}) is already installed` };
      }
    }

    const destDir = join(this.deps.userExtensionsRoot, manifest.id);
    mkdirSync(destDir, { recursive: true });
    for (const entry of readdirSync(abs)) {
      if (COPY_SKIP.has(entry)) continue;
      cpSync(join(abs, entry), join(destDir, entry), { recursive: true });
    }

    createExtensionTables(this.deps.db, manifest.tables ?? []);

    this.deps.registry.upsert(manifest);
    const action = existing ? (compareVersions(manifest.version, existing.version) === 0 ? 'no-change' : 'updated') : 'installed';
    return { ok: true, id: manifest.id, version: manifest.version, action, requiresRestart: true };
  }

  uninstall(id: string): InstallError | null {
    if (this.builtinIds().has(id)) return { ok: false, reason: `"${id}" is a built-in extension and cannot be uninstalled` };
    const dir = join(this.deps.userExtensionsRoot, id);
    if (!existsSync(dir)) return { ok: false, reason: `extension "${id}" is not installed in the user extensions folder` };
    rmSync(dir, { recursive: true, force: true });
    this.deps.registry.remove(id);
    return null;
  }

  deleteData(id: string): InstallError | null {
    const prefix = `${id.replace(/-/g, '_')}_`;
    const tables = this.deps.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?")
      .all(`${prefix}%`) as Array<{ name: string }>;
    for (const { name } of tables) {
      this.deps.db.exec(`DROP TABLE IF EXISTS ${name}`);
    }
    getSettingsService().deleteNamespace(id);
    this.deps.registry.remove(id);
    return null;
  }
}
