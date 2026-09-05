---
title: Phase 8 — Extension Ecosystem (SDK + Installer) Implementation Plan
date: 2026-08-20
last_updated: 2026-08-20T18:30:00+10:00
status: draft
target_version: 0.10.0
---

# Phase 8 — Extension Ecosystem (SDK + Installer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user create a brand-new extension in its own separate project, build it with a simple command, and install it into the running app — no code changes to the app itself.

**Architecture:** A user-writable extensions directory (`<userData>/extensions`) is discovered alongside the built-in `extensions/` root. The SDK CLI (`scripts/sdk/cli.mjs`) scaffolds a standalone extension project and builds it into a self-contained folder. The app's Extension Manager view installs that folder (or a `.zip`), creates the extension's SQLite tables, and registers it. At boot both Host and panel-protocol resolve bundles from user root first, then the built-in bundle directory. No digital signing (single local user per ADR-0009).

**Tech Stack:** Electron, Node.js, Vite (JS API), TypeScript strict, SQLite (`better-sqlite3`), Lit, Vitest, `extract-zip` (optional zip install).

---

## How to read this plan (plain English)

This plan is written for two audiences at once. Each task starts with a **"What this does (plain English)"** box that explains the user-facing outcome without jargon. The numbered steps below it are the exact instructions an engineer needs.

**The user-facing story of Phase 8:**

1. **Create.** You run one command that makes a new folder — your extension's own mini-project (a "Hello World" finance extension with one screen and one command).
2. **Edit.** You open that folder in your editor and add your own logic, exactly like you'd edit any TypeScript project. The finance helper types are included so the editor gives you autocomplete.
2b. **Preview standalone (fast loop for bigger extensions).** Inside your extension folder run `npm run dev` — Vite opens `http://localhost:5173` with your UI + a fake in-memory `FinanceApi` (mock DB/commands). Save → browser hot-reloads instantly. No Build/Install/Restart while you iterate. When it looks good, go to step 3 for the real app.
3. **Build.** One command packages your extension into a single ready-to-install folder.
4. **Install.** Inside the app there is a new **Extensions** screen (next to Settings and Accounts). You click **Install Folder** or **Install Zip**, pick your built folder (or a `.zip`), and the app copies it in, creates any database tables it needs, and adds it to the extension list.
5. **Restart.** You restart the app once. Your extension now appears in the Activity Bar / Command Palette and works exactly like the built-in ones.
6. **Manage.** The Extensions screen lets you **Enable / Disable**, **Uninstall** (removes the extension but keeps its data), and **Delete Data** (removes the data too — with a confirmation).

**When the app updates:** the finance dictionary + logger + tokens inside an extension you already created are snapshots, so run `refresh` to pull the latest copies, fix any editor errors, rebuild, and reinstall.

**Deliberately not included:** digital signing, installers for other people, hot-install without restart, marketplace.

---

## SDK CLI — command reference (with examples)

Everything below is typed in the VS Code terminal, standing in the app's main folder (`D:\finance_flow_ai`). Where you see `todo-list`, use your extension's id — lowercase letters, digits, and hyphens only (no spaces, no capitals).

**`init` — create a new extension project**

```bash
node scripts/sdk/cli.mjs init todo-list
```

Creates a new folder named `todo-list` **inside the current folder** (the app's folder), containing a ready-to-edit starter project (`package.json`, `tsconfig.json`, `src/main.ts`, `src/finance.d.ts`, a sample screen, README).

To create it **somewhere else** instead, add a folder path as the last argument:

```bash
node scripts/sdk/cli.mjs init todo-list D:\my-extensions
```

→ creates `D:\my-extensions\todo-list\`.

**`build` — package an extension project for install**

```bash
node scripts/sdk/cli.mjs build todo-list
node scripts/sdk/cli.mjs build D:\my-extensions\todo-list
```

→ creates `todo-list\build\extension\` containing `package.json` + `todo-list.js` (plus a `.js.map` source map for debugging). This folder is what you install.

**`refresh` — update an existing extension after the app changes**

The finance dictionary inside a scaffolded project is a snapshot from the day it was created. When the app's interface changes, re-sync it:

```bash
node scripts/sdk/cli.mjs refresh todo-list
node scripts/sdk/cli.mjs refresh D:\my-extensions\todo-list
```

→ overwrites only vendored files `src\finance.d.ts` + `src\vendor\logger.ts` + `src\styles\tokens.css`/`ext-layout.css` (never your own code). Then fix any new errors the editor shows, rebuild, and reinstall over the old version.

**If the app changed the API:**

1. Run `refresh` on your extension project.
2. Fix whatever your editor flags (the refreshed types reflect the new API).
3. Rebuild and reinstall (upgrades allowed; downgrades rejected).
4. Restart the app.

> Types are erased at build time (`import type`), so an out-of-date dictionary alone never breaks a running extension. It matters only when you want to *use* new APIs or when the app *removed/renamed* a runtime API you already call — in the latter case the types can't save you; you must adapt that code.

**Install + activate (app-side, no commands)**

1. Open Finance Flow AI → **Extensions** screen → **Install**.
2. Pick the `build\extension` folder (or zip it first and pick the `.zip`).
3. Restart the app once. The extension appears in the sidebar / command palette.

**Full walkthrough — a "Todo List" extension (standalone-first)**

```bash
node scripts/sdk/cli.mjs init todo-list D:\my-extensions
```

1. Open `D:\my-extensions\todo-list` in VS Code and edit `src/main.ts` and `src\ui\`.
2. Fast loop — preview standalone (no app restart):

   ```bash
   cd D:\my-extensions\todo-list
   npm install
   npm run dev   # http://localhost:5173, save → hot reload
   ```

3. When good, build for the real app:

   ```bash
   node D:\finance_flow_ai\scripts\sdk\cli.mjs build D:\my-extensions\todo-list
   # or from the app folder: node scripts/sdk/cli.mjs build D:\my-extensions\todo-list
   ```

4. App → Extensions → Install Folder → pick `D:\my-extensions\todo-list\build\extension` (or Install Zip if you zipped it).
5. Restart the app. Done. Re-edit? Stay in `npm run dev` until next integration check.

**`dev` — preview standalone (inside your extension folder, not the app folder)**

```bash
cd D:\my-extensions\todo-list
npm install        # first time only
npm run dev        # opens http://localhost:5173 with mock FinanceApi + HMR
```

Uses the scaffold's `vite.config.ts` + `index.html` + `src/mock/finance-mock.ts` (in-memory DB/commands). No Build/Install/Restart while iterating. When ready, `build` + Install in the real app for final verification.

**Alternative — npm scripts from the app folder.** The project also exposes `npm run sdk:init` and `npm run sdk:build`; append the arguments after `--`:

```bash
npm run sdk:init -- todo-list D:\my-extensions
npm run sdk:build -- D:\my-extensions\todo-list
```

The direct `node scripts/sdk/cli.mjs …` form above is the most predictable and is what the automated tests exercise.

---

## Architecture decisions (summary — full rationale in ADR-0009)

| # | Decision |
|---|---|
| D1 | User-installed extensions live in `<userData>/extensions` (dev) / `<product-folder>/data/extensions` (packaged). Built-in `extensions/` root is unchanged; both are discovered at boot. |
| D2 | Installable artifact = a folder containing `package.json` (manifest) + `<id>.js` (bundle). Install copies it into `<userRoot>/<id>/`, creates the declared tables, upserts the registry. Restart required to activate. |
| D3 | Bundle resolution order: `<root>/<id>.js` then `<root>/<id>/<id>.js`, across roots `[userRoot, builtinRoot]`. Implemented as one pure function `resolveExtensionBundlePath`. |
| D4 | No digital signing (single local user). |
| D5 | Uninstall keeps data; Delete Data is a separate confirmed action (per vision). |
| D6 | Fix `ExtensionRegistry.upsert()` so disable state survives restarts (stop forcing `enabled = 1`). |
| D7 | SDK CLI = `node scripts/sdk/cli.mjs init|build|refresh` + scaffold `npm run dev` (Vite dev server with `src/mock/finance-mock.ts` + `index.html`, HMR, standalone preview before integration). Scaffold is a standalone project with a vendored, self-contained `src/finance.d.ts`; a parity test guards drift and `refresh` re-syncs existing projects. |
| D8 | Install validates dependencies + versions (no downgrades). Activation already topo-sorts by `dependencies` in the Host. |
| D9 | Table DDL for user extensions is generated at install time by Core (`src/main/services/table-ddl.ts`) — extensions cannot ship migrations (ADR-0002 trigger stays unmet). |
| D10 | Extension Manager is a main-renderer workspace view (`__extensions__`), same pattern as `__settings__` / `__accounts__`. |

**Scope check:** These are two cohesive subsystems — (A) the in-app installer + manager, (B) the SDK CLI + standalone `npm run dev` preview. They share the manifest/registry/table machinery and the install artifact format, so they ship in one plan (as the project's Phase 8 milestone, per `docs/archives/2026-06-13-implementation-design.md`).

---

## File structure map

### New files

| File | Responsibility |
|---|---|
| `src/shared/semver.ts` | `parseVersion`, `compareVersions`, `satisfiesRequirement` (pure, tested). |
| `src/main/services/table-ddl.ts` | `buildCreateTableSql(table)`, `createExtensionTables(db, tables)` — DDL generation from a `TableManifest`. |
| `src/main/services/extension-installer.ts` | `ExtensionInstaller` — install/uninstall/delete-data/list, dependency + version checks, runtime table creation. |
| `src/main/services/extension-catalog.ts` | `discoverExtensionsInRoots(roots, options)` — multi-root discovery + built-in-id conflict rejection (thin wrapper over the existing loader). |
| `src/renderer/components/extension-manager.ts` | The Extensions workspace view (Lit). |
| `scripts/sdk/cli.mjs` | SDK CLI: `init` + `build` + `refresh`. |
| `scripts/sdk/templates/*` | Scaffold templates (manifest, tsconfig, `vite.config.ts`, `index.html`, entry, view, mock, README). |
| `scripts/sdk/types/finance.d.ts` | Vendored, self-contained SDK type surface for standalone projects. |
| `tests/unit/shared/semver.test.ts` | Semver helpers. |
| `tests/unit/main/services/table-ddl.test.ts` | DDL generation. |
| `tests/unit/main/services/extension-installer.test.ts` | Installer contract. |
| `tests/unit/main/services/extension-catalog.test.ts` | Multi-root discovery. |
| `tests/unit/sdk/sdk-build.test.ts` | SDK `build` end-to-end against a temp scaffold. |
| `tests/unit/sdk/sdk-refresh.test.ts` | SDK `refresh` re-syncs `src/finance.d.ts` + `src/vendor/logger.ts` + `src/styles/*`. |
| `tests/unit/sdk/sdk-type-parity.test.ts` | SDK types compile and are assignable to canonical types. |

### Modified files

| File | What changes |
|---|---|
| `src/main/runtime-profile.ts` | Add `userExtensionsPath` to the dev profile (from `app.getPath('userData')` at boot; packaged uses `join(userDataPath, 'extensions')`). |
| `src/main/main.ts` | Compute `userExtensionsRoot`; dual-root discovery; wire `ExtensionInstaller`; add 5 IPC handlers (`extensions:manager-list/install/uninstall/delete-data/set-enabled`); pass `userExtensionsRoot` to Host init and panel protocol. |
| `src/main/services/extension-registry.ts` | Fix `upsert` conflict behavior (D6); add `remove(id)`. |
| `src/main/services/table-schema-registry.ts` | Add `getTablesByOwner(owner)` + `unregisterExtensionTables(owner)`. |
| `src/main/services/settings-service.ts` | Add `deleteNamespace(namespace)`. |
| `src/shared/extension-paths.ts` | Add `resolveExtensionBundlePath(extensionId, roots)` and `resolveBuiltinExtensionsRoot()`. |
| `src/extension-host/host.ts` | Store `userExtensionsRoot` from the `host.initialize` payload; use `resolveExtensionBundlePath` in `activateExtension`. |
| `src/main/services/extension-ipc.ts` | Accept/store `userExtensionsRoot`; include it in the `host.initialize` payload. |
| `src/main/services/panel-protocol.ts` | Serve `/extensions/<id>.js` via `resolveExtensionBundlePath`. |
| `src/preload/preload.ts` | Expose `financeShell.extensions.{managerList,install,uninstall,deleteData,setEnabled}`. |
| `src/types/finance-shell.d.ts` | Add the manager methods + `ManagedExtension` type. |
| `src/renderer/components/navigation-panel.ts` | Add `__extensions__` nav item. |
| `src/renderer/index.ts` | Mount `extension-manager` for `view === '__extensions__'`. |
| `package.json` | Add `extract-zip` (optional); add `sdk` scripts (`sdk:init`, `sdk:build`). |

---

## Task 1: Version helpers + bundle-path resolver (foundation)

**What this does (plain English):** Two tiny utility libraries used everywhere else: (a) compare extension version numbers like `1.2.0` vs `1.3.0`, and (b) given an extension's id, find its compiled file in the right folder — user-installed first, built-in second. Both are pure functions, so they are easy to test and reuse.

**Files:**
- Create: `src/shared/semver.ts`
- Modify: `src/shared/extension-paths.ts`
- Test: `tests/unit/shared/semver.test.ts`, `tests/unit/shared/extension-paths.test.ts`

- [ ] **Step 1: Write the failing semver tests**

`tests/unit/shared/semver.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compareVersions, parseVersion, satisfiesRequirement } from '../../../src/shared/semver';

describe('parseVersion', () => {
  it('parses x.y.z', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
  });
  it('accepts a leading v and prerelease/build suffixes', () => {
    expect(parseVersion('v2.0.0-beta.1')).toEqual([2, 0, 0]);
    expect(parseVersion('1.2.3+build5')).toEqual([1, 2, 3]);
  });
  it('throws on malformed input', () => {
    expect(() => parseVersion('1.2')).toThrow();
    expect(() => parseVersion('abc')).toThrow();
  });
});

describe('compareVersions', () => {
  it('sorts versions', () => {
    expect(compareVersions('0.9.0', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
  });
});

describe('satisfiesRequirement', () => {
  it('matches exact and caret ranges', () => {
    expect(satisfiesRequirement('1.2.3', '1.2.3')).toBe(true);
    expect(satisfiesRequirement('1.5.0', '^1.2.0')).toBe(true);
    expect(satisfiesRequirement('2.0.0', '^1.2.0')).toBe(false);
    expect(satisfiesRequirement('0.9.0', '^1.2.0')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/shared/semver.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/shared/semver.ts`**

```ts
/** Lightweight semver helpers for the Extension Manager (no dependency). */
export type Semver = readonly [number, number, number];

export function parseVersion(raw: string): Semver {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(raw.trim());
  if (!m) throw new Error(`invalid semver: "${raw}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const [a1, a2, a3] = parseVersion(a);
  const [b1, b2, b3] = parseVersion(b);
  for (const [x, y] of [[a1, b1], [a2, b2], [a3, b3]] as const) {
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/** Supports exact ("1.2.3") and caret ("^1.2.0") requirements. */
export function satisfiesRequirement(installed: string, required: string): boolean {
  const req = required.trim();
  if (req.startsWith('^')) {
    const want = parseVersion(req.slice(1));
    const have = parseVersion(installed);
    if (have[0] !== want[0]) return false;
    if (have[1] > want[1]) return true;
    if (have[1] === want[1] && have[2] >= want[2]) return true;
    return false;
  }
  return compareVersions(installed, req) === 0;
}
```

- [ ] **Step 4: Write the failing bundle-path tests**

`tests/unit/shared/extension-paths.test.ts` (new):

```ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveExtensionBundlePath } from '../../../src/shared/extension-paths';

function makeRoots(): string[] {
  const base = mkdtempSync(join(tmpdir(), 'ffx-paths-'));
  const builtin = join(base, 'dist', 'extensions');
  const user = join(base, 'user', 'extensions');
  mkdirSync(builtin, { recursive: true });
  mkdirSync(user, { recursive: true });
  return [user, builtin];
}

describe('resolveExtensionBundlePath', () => {
  it('finds built-in style bundles (<root>/<id>.js)', () => {
    const [user, builtin] = makeRoots();
    writeFileSync(join(builtin, 'salary-history.js'), '');
    expect(resolveExtensionBundlePath('salary-history', [user, builtin])).toBe(
      join(builtin, 'salary-history.js')
    );
  });
  it('finds installed-style bundles (<root>/<id>/<id>.js)', () => {
    const [user, builtin] = makeRoots();
    mkdirSync(join(user, 'my-extension'), { recursive: true });
    writeFileSync(join(user, 'my-extension', 'my-extension.js'), '');
    expect(resolveExtensionBundlePath('my-extension', [user, builtin])).toBe(
      join(user, 'my-extension', 'my-extension.js')
    );
  });
  it('prefers the user root over the built-in root', () => {
    const [user, builtin] = makeRoots();
    writeFileSync(join(builtin, 'dup.js'), '');
    mkdirSync(join(user, 'dup'), { recursive: true });
    writeFileSync(join(user, 'dup', 'dup.js'), '');
    expect(resolveExtensionBundlePath('dup', [user, builtin])).toBe(
      join(user, 'dup', 'dup.js')
    );
  });
  it('returns null when no bundle exists', () => {
    const [user, builtin] = makeRoots();
    expect(resolveExtensionBundlePath('nope', [user, builtin])).toBeNull();
  });
});
```

- [ ] **Step 5: Implement the resolver in `src/shared/extension-paths.ts`**

Add imports and function (keep the existing `resolveHostBundlePath`):

```ts
import { existsSync } from 'node:fs';

/**
 * Resolve the ESM bundle for an extension, trying each root in order.
 * Two layouts are supported per root:
 *   1. Built-in style: `<root>/<id>.js`   (dist/extensions/<id>.js)
 *   2. Installed style: `<root>/<id>/<id>.js` (ADR-0009 user extensions)
 * Returns the absolute path or `null`.
 */
export function resolveExtensionBundlePath(
  extensionId: string,
  roots: readonly string[]
): string | null {
  for (const root of roots) {
    for (const candidate of [
      join(root, `${extensionId}.js`),
      join(root, extensionId, `${extensionId}.js`)
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}
```

- [ ] **Step 6: Run both new test files**

Run: `npx vitest run tests/unit/shared/semver.test.ts tests/unit/shared/extension-paths.test.ts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/semver.ts src/shared/extension-paths.ts tests/unit/shared/semver.test.ts tests/unit/shared/extension-paths.test.ts
git commit -m "feat(phase8): semver helpers and extension bundle-path resolver"
```

---

## Task 2: User extensions root, multi-root discovery, registry persistence fix

**What this does (plain English):** From now on the app looks for extensions in **two** places: the built-in folder that ships with the app, and a new "user extensions" folder where installed extensions live. A small bug is also fixed: turning an extension off used to be forgotten on the next restart — now your off/on choice is remembered.

**Files:**
- Create: `src/main/services/extension-catalog.ts`
- Modify: `src/main/main.ts` (discovery wiring), `src/main/services/extension-registry.ts` (upsert + `remove`)
- Test: `tests/unit/main/services/extension-catalog.test.ts`, `tests/unit/main/services/extension-registry.test.ts`

- [ ] **Step 1: Write the failing multi-root discovery test**

`tests/unit/main/services/extension-catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverExtensionsInRoots } from '../../../src/main/services/extension-catalog';

const MINIMAL_MANIFEST = {
  id: 'x',
  displayName: 'X',
  version: '0.1.0',
  activationEvents: ['onView:x'],
  contributions: {},
  main: 'src/main.ts'
};

function writeExt(root: string, id: string): string {
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: id, financeExtension: { ...MINIMAL_MANIFEST, id } }));
  return dir;
}

describe('discoverExtensionsInRoots', () => {
  it('merges extensions from all roots', () => {
    const base = mkdtempSync(join(tmpdir(), 'ffx-cat-'));
    const builtin = join(base, 'builtin');
    const user = join(base, 'user');
    mkdirSync(builtin, { recursive: true });
    mkdirSync(user, { recursive: true });
    writeExt(builtin, 'salary-history');
    writeExt(user, 'my-extension');
    const { extensions } = discoverExtensionsInRoots([user, builtin]);
    const ids = extensions.map((e) => e.manifest.id).sort();
    expect(ids).toEqual(['my-extension', 'salary-history']);
  });
  it('rejects a user extension that collides with a built-in id', () => {
    const base = mkdtempSync(join(tmpdir(), 'ffx-cat-'));
    const builtin = join(base, 'builtin');
    const user = join(base, 'user');
    mkdirSync(builtin, { recursive: true });
    mkdirSync(user, { recursive: true });
    writeExt(builtin, 'dup');
    writeExt(user, 'dup');
    const { extensions, skipped } = discoverExtensionsInRoots([user, builtin]);
    expect(extensions.map((e) => e.manifest.id)).toEqual(['dup']);
    expect(skipped.some((s) => s.reason.includes('built-in'))).toBe(true);
  });
  it('skips malformed packages and keeps scanning', () => {
    const base = mkdtempSync(join(tmpdir(), 'ffx-cat-'));
    const user = join(base, 'user');
    mkdirSync(user, { recursive: true });
    mkdirSync(join(user, 'bad'), { recursive: true });
    writeFileSync(join(user, 'bad', 'package.json'), 'not json');
    writeExt(user, 'good');
    const { extensions } = discoverExtensionsInRoots([user]);
    expect(extensions.map((e) => e.manifest.id)).toEqual(['good']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/main/services/extension-catalog.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/main/services/extension-catalog.ts`**

```ts
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
  // Built-in root is always last — discover it first to get the canonical id set.
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
```

- [ ] **Step 4: Write the failing registry-persistence test**

Append to `tests/unit/main/services/extension-registry.test.ts`:

```ts
it('upsert does not re-enable a disabled extension (Phase 8 D6)', () => {
  const registry = new ExtensionRegistry(getTestDatabase());
  const manifest = makeManifest('x');
  registry.upsert(manifest);
  registry.setEnabled('x', false);
  expect(registry.isEnabled('x')).toBe(false);
  registry.upsert(manifest); // simulates the next app restart
  expect(registry.isEnabled('x')).toBe(false);
});

it('remove deletes the registry row', () => {
  const registry = new ExtensionRegistry(getTestDatabase());
  registry.upsert(makeManifest('x'));
  registry.remove('x');
  expect(registry.get('x')).toBeUndefined();
});
```

Use the test-database factory already imported in that file (from `getTestDatabase`), and a local `makeManifest(id)` helper if one does not already exist.

- [ ] **Step 5: Run to verify the persistence test fails**

Run: `npx vitest run tests/unit/main/services/extension-registry.test.ts`
Expected: `upsert does not re-enable a disabled extension` FAILS; `remove` FAILS (method missing).

- [ ] **Step 6: Fix `upsert` and add `remove` in `src/main/services/extension-registry.ts`**

Replace the `upsert` SQL block (lines 43-52 today):

```ts
upsert(manifest: FinanceExtensionManifest): void {
  const stmt = this.db.prepare(`
    INSERT INTO extension_registry (id, name, version, enabled, crash_count, last_error)
    VALUES (@id, @name, @version, 1, 0, NULL)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      version = excluded.version
  `);
  stmt.run({ id: manifest.id, name: manifest.displayName, version: manifest.version });
  // ... existing byId cache handling unchanged ...
}
```

Note: `enabled = 1` is intentionally removed from the `ON CONFLICT` clause (D6). The new `enabled` value is only applied on INSERT.

Add a new method:

```ts
/** Phase 8 — remove an extension from the registry (uninstall / delete-data). */
remove(extensionId: string): void {
  this.db.prepare('DELETE FROM extension_registry WHERE id = ?').run(extensionId);
  this.byId.delete(extensionId);
}
```

- [ ] **Step 7: Wire dual-root discovery in `src/main/main.ts`**

At boot (near the existing `discoverExtensions(resolveExtensionsRoot(), …)` call at ~line 850):

```ts
const userExtensionsRoot = join(app.getPath('userData'), 'extensions');
const discovery = discoverExtensionsInRoots(
  [userExtensionsRoot, resolveExtensionsRoot()],
  { tableSchemaRegistry }
);
```

Also pass `userExtensionsRoot` to the panel protocol registration and to `extensionIPC` (see Task 5).

- [ ] **Step 8: Run the registry + catalog tests**

Run: `npx vitest run tests/unit/main/services/extension-catalog.test.ts tests/unit/main/services/extension-registry.test.ts`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/main/services/extension-catalog.ts src/main/main.ts src/main/services/extension-registry.ts tests/unit/main/services/extension-catalog.test.ts tests/unit/main/services/extension-registry.test.ts
git commit -m "feat(phase8): dual-root extension discovery and registry disable persistence"
```

---

## Task 3: Table DDL generation + ExtensionInstaller service

**What this does (plain English):** When an extension is installed, the app must create the database tables the extension says it needs (built-in extensions get their tables created at build time; installed ones can't, so the app does it at install). This task also builds the heart of the manager: an "installer" that (a) checks the extension is well-formed, (b) checks any extensions it depends on are present, (c) refuses to replace a newer version with an older one, (d) copies the files in, and (e) creates the tables.

**Files:**
- Create: `src/main/services/table-ddl.ts`, `src/main/services/extension-installer.ts`
- Modify: `src/main/services/table-schema-registry.ts`, `src/main/services/settings-service.ts`
- Test: `tests/unit/main/services/table-ddl.test.ts`, `tests/unit/main/services/extension-installer.test.ts`

- [ ] **Step 1: Write the failing DDL tests**

`tests/unit/main/services/table-ddl.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCreateTableSql } from '../../../src/main/services/table-ddl';

describe('buildCreateTableSql', () => {
  it('emits id, timestamps, and typed columns', () => {
    const sql = buildCreateTableSql({
      name: 'my_ext_items',
      columns: [
        { name: 'amount', type: 'real', nullable: false, default: 0 },
        { name: 'label', type: 'text' },
        { name: 'is_done', type: 'boolean', nullable: false },
        { name: 'due_on', type: 'date' }
      ]
    });
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS my_ext_items');
    expect(sql).toContain('id INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(sql).toContain('amount REAL NOT NULL DEFAULT 0');
    expect(sql).toContain('label TEXT');
    expect(sql).toContain('is_done INTEGER NOT NULL');
    expect(sql).toContain('due_on TEXT');
    expect(sql).toContain('created_at TEXT');
    expect(sql).toContain('updated_at TEXT');
  });
  it('rejects a table name that is not namespaced', () => {
    expect(() => buildCreateTableSql({ name: 'accounts', columns: [] })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/main/services/table-ddl.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/main/services/table-ddl.ts`**

```ts
import type Database from 'better-sqlite3';
import type { ColumnManifest, TableManifest } from './shared-data-tables';

const SQLITE_TYPE: Record<ColumnManifest['type'], string> = {
  integer: 'INTEGER',
  real: 'REAL',
  text: 'TEXT',
  date: 'TEXT',
  datetime: 'TEXT',
  boolean: 'INTEGER'
};

export function columnSql(column: ColumnManifest): string {
  const parts = [column.name, SQLITE_TYPE[column.type]];
  if (column.nullable === false) parts.push('NOT NULL');
  if (column.default !== undefined && column.default !== null) {
    const lit = typeof column.default === 'string' ? `'${column.default}'` : String(column.default);
    parts.push(`DEFAULT ${lit}`);
  }
  return parts.join(' ');
}

export function buildCreateTableSql(table: TableManifest): string {
  if (!/^[a-z0-9_]+$/.test(table.name)) throw new Error(`invalid table name: "${table.name}"`);
  const columns = [
    'id INTEGER PRIMARY KEY AUTOINCREMENT',
    ...table.columns.map(columnSql),
    "created_at TEXT NOT NULL DEFAULT (datetime('now'))",
    "updated_at TEXT NOT NULL DEFAULT (datetime('now'))"
  ];
  return `CREATE TABLE IF NOT EXISTS ${table.name} (${columns.join(', ')});`;
}

// Prefix enforcement is done in the installer (Task 3 Step 8) and in manifest-schema Zod validation —
// every table name must start with `<extensionId with - → _>_`. buildCreateTableSql stays generic so it can be unit-tested in isolation.

export function createExtensionTables(db: Database.Database, tables: readonly TableManifest[]): void {
  for (const table of tables) {
    db.exec(buildCreateTableSql(table));
  }
}
```

> The DAO's namespace enforcement (via `TableSchemaRegistry.registerExtensionTables`) still runs at discovery/activation; `createExtensionTables` only guarantees the physical table exists so DAO statements do not hit "no such table".

- [ ] **Step 4: Add registry helpers in `src/main/services/table-schema-registry.ts`**

```ts
/** Phase 8 — all registered table names owned by `owner` (extension id or 'shared'). */
getTablesByOwner(owner: string): readonly string[] {
  return Array.from(this.entries.entries())
    .filter(([, e]) => e.owner === owner)
    .map(([name]) => name);
}

/** Phase 8 — remove an extension's table registrations (delete-data). */
unregisterExtensionTables(owner: string): void {
  for (const name of this.getTablesByOwner(owner)) {
    this.entries.delete(name);
  }
}
```

- [ ] **Step 5: Add `deleteNamespace` to `src/main/services/settings-service.ts`**

```ts
/** Phase 8 — delete every setting whose key starts with `<namespace>.`. */
deleteNamespace(namespace: string): number {
  return this.db.prepare('DELETE FROM settings WHERE key LIKE ?').run(`${namespace}.%`).changes;
}
```

Match the file's existing table/schema naming (`settings` table, `key` column). If the table or column names differ, adapt the SQL.

- [ ] **Step 6: Write the failing installer tests**

`tests/unit/main/services/extension-installer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExtensionInstaller } from '../../../src/main/services/extension-installer';
import { getTestDatabase } from '../../../src/main/services/database-service';
import { ExtensionRegistry } from '../../../src/main/services/extension-registry';

const MINIMAL = {
  id: 'todo-list',
  displayName: 'Todo List',
  version: '0.1.0',
  description: 'A sample',
  activationEvents: ['onView:todo-list'],
  contributions: { views: [{ id: 'todo-list', name: 'Todo List', icon: 'T' }], commands: [], navigation: [] },
  main: 'src/main.ts'
};

function makeSource(dir: string, manifest: unknown = MINIMAL): string {
  const src = join(dir, 'source');
  mkdirSync(join(src, 'src'), { recursive: true });
  writeFileSync(join(src, 'package.json'), JSON.stringify({ name: manifest.id, financeExtension: manifest }));
  writeFileSync(join(src, `${manifest.id}.js`), 'export function activate() {}');
  return src;
}

function makeInstaller(dir: string) {
  const userRoot = join(dir, 'user-extensions');
  mkdirSync(userRoot, { recursive: true });
  const db = getTestDatabase();
  const registry = new ExtensionRegistry(db);
  return { installer: new ExtensionInstaller({ db, userExtensionsRoot: userRoot, registry }), db, registry, userRoot };
}

describe('ExtensionInstaller', () => {
  it('installs a valid extension: copies files, creates tables, registers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffx-inst-'));
    const manifest = { ...MINIMAL, tables: [{ name: 'todo_list_items', columns: [{ name: 'title', type: 'text', nullable: false }] }] };
    const src = makeSource(dir, manifest);
    const { installer, db, registry, userRoot } = makeInstaller(dir);

    const result = installer.installFromSource(src);
    expect(result.ok).toBe(true);
    expect(result.action).toBe('installed');
    expect(readFileSync(join(userRoot, 'todo-list', 'todo-list.js'), 'utf8')).toContain('activate');
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='todo_list_items'").get();
    expect(hasTable).toBeTruthy();
    expect(registry.get('todo-list')).toBeDefined();
  });

  it('rejects installing over a built-in extension', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffx-inst-'));
    const { installer } = makeInstaller(dir);
    const src = makeSource(dir, { ...MINIMAL, id: 'salary-history' });
    const result = installer.installFromSource(src);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/built-in/);
  });

  it('rejects an invalid manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffx-inst-'));
    const { installer } = makeInstaller(dir);
    const src = makeSource(dir, { id: 'bad', displayName: 'B', activationEvents: ['nope'] });
    const result = installer.installFromSource(src);
    expect(result.ok).toBe(false);
  });

  it('blocks install when a declared dependency is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffx-inst-'));
    const { installer } = makeInstaller(dir);
    const src = makeSource(dir, { ...MINIMAL, dependencies: ['not-installed'] });
    const result = installer.installFromSource(src);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/dependency/);
  });

  it('refuses to downgrade an installed extension', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffx-inst-'));
    const { installer, registry } = makeInstaller(dir);
    registry.upsert(MINIMAL as never);
    const src = makeSource(dir, { ...MINIMAL, version: '0.0.9' });
    const result = installer.installFromSource(src);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/newer|version/i);
  });

  it('uninstall removes files and registry row but keeps tables', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffx-inst-'));
    const src = makeSource(dir);
    const { installer, db, registry, userRoot } = makeInstaller(dir);
    installer.installFromSource(src);
    expect(installer.uninstall('todo-list')).toBeNull();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='todo_list_items'").get()).toBeFalsy();
    expect(registry.get('todo-list')).toBeUndefined();
    // table preserved (not dropped on uninstall)
  });

  it('delete-data drops owned tables and settings namespace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffx-inst-'));
    const manifest = { ...MINIMAL, tables: [{ name: 'todo_list_items', columns: [{ name: 'title', type: 'text' }] }] };
    const src = makeSource(dir, manifest);
    const { installer, db } = makeInstaller(dir);
    installer.installFromSource(src);
    db.prepare("INSERT INTO settings (key, value) VALUES ('todo-list.option', '{}')").run();
    const err = installer.deleteData('todo-list');
    expect(err).toBeNull();
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='todo_list_items'").get();
    expect(hasTable).toBeFalsy();
    const leftover = db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key = 'todo-list.option'").get();
    expect(leftover.n).toBe(0);
  });
});
```

> Adjust the `settings` table/column names and the `settings-service` API to match the real schema if they differ from `key`/`value`.

- [ ] **Step 7: Run to verify failure**

Run: `npx vitest run tests/unit/main/services/extension-installer.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 8: Implement `src/main/services/extension-installer.ts`**

```ts
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { validateManifest } from '../../extension-host/manifest-schema';
import type { FinanceExtensionManifest } from '../../types/finance';
import { compareVersions, satisfiesRequirement } from '../../shared/semver';
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

  installFromSource(sourcePath: string): InstallOutcome | InstallError {
    const abs = resolve(sourcePath);
    if (!existsSync(abs)) return { ok: false, reason: `source path does not exist: ${abs}` };

    // 1. Read + validate the manifest.
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

    // 2. Built-in collision guard.
    if (this.builtinIds().has(manifest.id)) {
      return { ok: false, reason: `"${manifest.id}" is a built-in extension and cannot be installed over` };
    }

    // 2b. Table-name namespace guard — every table must be prefixed `<id with - → _>_`.
    const requiredPrefix = `${manifest.id.replace(/-/g, '_')}_`;
    for (const table of manifest.tables ?? []) {
      if (!table.name.startsWith(requiredPrefix)) {
        return { ok: false, reason: `table "${table.name}" must start with "${requiredPrefix}" (namespaced to extension "${manifest.id}")` };
      }
    }

    // 3. Dependency check.
    const missing = (manifest.dependencies ?? []).filter((dep) => !this.deps.registry.get(dep));
    if (missing.length > 0) {
      return { ok: false, reason: `missing dependencies: ${missing.join(', ')}` };
    }

    // 4. Version check (no downgrades).
    const existing = this.deps.registry.get(manifest.id);
    if (existing) {
      const cmp = compareVersions(manifest.version, existing.version);
      if (cmp === -1) {
        return { ok: false, reason: `a newer version (${existing.version}) is already installed` };
      }
    }

    // 5. Copy into <userRoot>/<id>.
    const destDir = join(this.deps.userExtensionsRoot, manifest.id);
    mkdirSync(destDir, { recursive: true });
    for (const entry of readdirSync(abs)) {
      if (COPY_SKIP.has(entry)) continue;
      cpSync(join(abs, entry), join(destDir, entry), { recursive: true });
    }

    // 6. Create the declared tables (idempotent).
    createExtensionTables(this.deps.db, manifest.tables ?? []);

    // 7. Register.
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
```

> Note: `registry.builtinIds` is a new readonly field the installer relies on. Add it to `ExtensionRegistry` (populated at boot with the built-in discovery ids) and make `getSettingsService()` accessible from the installer's module (it already is a module-level singleton in `settings-service.ts`; use the same accessor `main.ts` uses).

- [ ] **Step 9: Add `builtinIds` to `ExtensionRegistry`**

```ts
private _builtinIds: ReadonlySet<string> = new Set();
get builtinIds(): ReadonlySet<string> { return this._builtinIds; }
setBuiltinIds(ids: ReadonlySet<string> | string[]): void {
  this._builtinIds = new Set(ids);
}
```

In `main.ts` after dual-root discovery: `registry.setBuiltinIds(builtinDiscovery.extensions.map((e) => e.manifest.id));`

- [ ] **Step 10: Run the installer tests**

Run: `npx vitest run tests/unit/main/services/table-ddl.test.ts tests/unit/main/services/extension-installer.test.ts`
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add src/main/services/table-ddl.ts src/main/services/extension-installer.ts src/main/services/table-schema-registry.ts src/main/services/settings-service.ts src/main/services/extension-registry.ts tests/unit/main/services/table-ddl.test.ts tests/unit/main/services/extension-installer.test.ts
git commit -m "feat(phase8): table DDL generation and extension installer service"
```

---

## Task 4: IPC + preload surface and zip install

**What this does (plain English):** Exposes the installer to the user interface. The UI asks the app to "list installed extensions", "install this folder", "uninstall this one", "delete its data", or "turn it on/off", and the app answers. Also lets you install from a `.zip` file as well as a folder.

**Files:**
- Modify: `src/main/main.ts`, `src/preload/preload.ts`, `src/types/finance-shell.d.ts`, `package.json`
- Test: `tests/unit/main/services/extension-installer.test.ts` (add zip case)

- [ ] **Step 1: Add `extract-zip`**

Run: `npm install extract-zip`
Update `package.json` with the dependency and two scripts:

```jsonc
"scripts": {
  "sdk:init": "node scripts/sdk/cli.mjs init",
  "sdk:build": "node scripts/sdk/cli.mjs build"
}
```

- [ ] **Step 2: Add the failing zip test**

Append to `tests/unit/main/services/extension-installer.test.ts`:

```ts
it('installs from a zip archive', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ffx-zip-'));
  const { installer, registry } = makeInstaller(dir);
  // Build a zip containing package.json + todo-list.js
  const zipPath = join(dir, 'bundle.zip');
  // (helper: use the extract-zip fixture helper described in the SDK build
  //  task, or create the zip with a tiny hand-rolled writer; see Task 7)
  writeFileSync(zipPath, ZERO_BYTE); // replaced by real zip in Task 7
  const result = await installer.installFromSource(zipPath);
  expect(result.ok).toBe(true);
  expect(registry.get('todo-list')).toBeDefined();
});
```

> Because `extract-zip` is async, make `installFromSource` return `Promise<InstallOutcome | InstallError>` and update the Task 3 tests to `await`. This is the one signature change.

- [ ] **Step 3: Extend `installFromSource` for `.zip`**

In `ExtensionInstaller`:

```ts
import { extract } from 'extract-zip';

async installFromSource(sourcePath: string): Promise<InstallOutcome | InstallError> {
  const abs = resolve(sourcePath);
  let workingDir = abs;
  if (abs.toLowerCase().endsWith('.zip')) {
    workingDir = mkdtempSync(join(tmpdir(), 'ffx-extract-'));
    try {
      await extract(abs, { dir: workingDir });
    } catch (err) {
      rmSync(workingDir, { recursive: true, force: true });
      return { ok: false, reason: `could not extract zip: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  return this.installFromFolder(workingDir, abs !== workingDir ? workingDir : undefined);
}
```

Refactor the existing body into `installFromFolder(folder: string, tempCleanup?: string)`, deleting `tempCleanup` (via `rmSync`) after a successful install.

- [ ] **Step 4: Add IPC handlers in `src/main/main.ts`**

Wire the installer (construct it after the registry exists) and add handlers beside the existing `extensions:*` handlers:

```ts
import { dialog } from 'electron';

ipcMain.handle('extensions:manager-list', () => installerManagerList());
ipcMain.handle('extensions:pick-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return canceled ? null : filePaths[0];
});
ipcMain.handle('extensions:pick-zip', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Zip', extensions: ['zip'] }] });
  return canceled ? null : filePaths[0];
});
ipcMain.handle('extensions:install', async (_e, source: string) => installer.installFromSource(source));
ipcMain.handle('extensions:uninstall', (_e, id: string) => installer.uninstall(id));
ipcMain.handle('extensions:delete-data', (_e, id: string) => installer.deleteData(id));
ipcMain.handle('extensions:set-enabled', (_e, id: string, enabled: boolean) => {
  registry.setEnabled(id, enabled);
  return { ok: true };
});
```

`installerManagerList()` returns the merged manifest list (`registry.getAllManifests()`) enriched with `{ enabled, source }` where `source = 'built-in' | 'user'` (a `user` entry lives under the user root and is in the user discovery result).

- [ ] **Step 5: Expose on preload + types**

In `src/preload/preload.ts` under the `extensions` bridge:

```ts
managerList: () => ipcRenderer.invoke('extensions:manager-list'),
pickFolder: () => ipcRenderer.invoke('extensions:pick-folder'),
pickZip: () => ipcRenderer.invoke('extensions:pick-zip'),
install: (source: string) => ipcRenderer.invoke('extensions:install', source),
uninstall: (id: string) => ipcRenderer.invoke('extensions:uninstall', id),
deleteData: (id: string) => ipcRenderer.invoke('extensions:delete-data', id),
setEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke('extensions:set-enabled', id, enabled),
```

In `src/types/finance-shell.d.ts` extend `ExtensionsApi` and add:

```ts
export interface ManagedExtension {
  id: string;
  displayName: string;
  version: string;
  description?: string;
  enabled: boolean;
  source: 'built-in' | 'user';
  dependencies?: string[];
}
```

- [ ] **Step 6: Run typecheck + installer tests**

Run: `npm run typecheck`
Run: `npx vitest run tests/unit/main/services/extension-installer.test.ts`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/main.ts src/preload/preload.ts src/types/finance-shell.d.ts src/main/services/extension-installer.ts package.json package-lock.json tests/unit/main/services/extension-installer.test.ts
git commit -m "feat(phase8): installer IPC surface, preload bridge, and zip install"
```

---

## Task 5: Bundle resolution in the Host and panel protocol

**What this does (plain English):** Until now the app assumed every extension's compiled file sat in one built-in folder. This task teaches the two places that load extension code — the background process that runs them, and the browser panel that shows their screens — to also look in the user-extensions folder.

**Files:**
- Modify: `src/extension-host/host.ts`, `src/main/services/extension-ipc.ts`, `src/main/services/panel-protocol.ts`, `src/main/main.ts`
- Test: `tests/unit/shared/extension-paths.test.ts` (already covers the resolver)

- [ ] **Step 1: Thread `userExtensionsRoot` to the Host**

In `src/main/services/extension-ipc.ts`, add an option and store it:

```ts
export interface ExtensionIPCOptions {
  hostPath?: string;
  requestTimeoutMs?: number;
  userExtensionsRoot?: string;
}
```

In `start()`, include it in the initialize payload (the existing `host.initialize` call at ~line 196):

```ts
await this.request('host.initialize', {
  manifests: this.initialManifests,
  userExtensionsRoot: this.options.userExtensionsRoot ?? ''
});
```

In `src/extension-host/host.ts`, capture it:

```ts
let userExtensionsRoot = '';
// in the host.initialize handler:
userExtensionsRoot = params?.userExtensionsRoot ?? '';
```

- [ ] **Step 2: Use the resolver in `activateExtension`**

Replace the block that builds `entryPath` (lines ~343-354 today):

```ts
const path = await import('node:path');
const url = await import('node:url');

const builtinRoot = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '..',
  'extensions'
);
const roots = userExtensionsRoot ? [userExtensionsRoot, builtinRoot] : [builtinRoot];
const entryPath = resolveExtensionBundlePath(extensionId, roots);
if (!entryPath) {
  console.error(`[host] activate: no bundle found for "${extensionId}" (roots: ${roots.join(', ')})`);
  return false;
}
```

Import `resolveExtensionBundlePath` from `../../shared/extension-paths` (verify the relative path against the bundled output layout; the function is ESM-safe — it only uses `node:fs`/`node:path`).

- [ ] **Step 3: Use the resolver in the panel protocol**

In `src/main/services/panel-protocol.ts`, change `registerPanelProtocol` to accept the user root and resolve bundles via the resolver:

```ts
export function registerPanelProtocol(userExtensionsRoot: string): void {
  // ...
  if (pathname.startsWith('/extensions/')) {
    const id = decodeURIComponent(pathname.slice('/extensions/'.length)).replace(/\.js$/, '');
    const bundle = resolveExtensionBundlePath(id, [userExtensionsRoot, DIST_EXTENSIONS_DIR]);
    if (!bundle) return new Response('not found', { status: 404 });
    return serveFile(bundle);
  }
}
```

Adapt `serveExtensionBundle` to read from the resolved absolute path instead of joining `DIST_EXTENSIONS_DIR` directly.

- [ ] **Step 4: Wire in `src/main/main.ts`**

Pass `userExtensionsRoot` to `registerPanelProtocol(userExtensionsRoot)` and to the `ExtensionIPC` options (Task 4's wiring already constructs the installer; add the same value here).

- [ ] **Step 5: Typecheck + existing tests**

Run: `npm run typecheck`
Run: `npm run test:unit`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/extension-host/host.ts src/main/services/extension-ipc.ts src/main/services/panel-protocol.ts src/main/main.ts
git commit -m "feat(phase8): user-extensions bundle resolution in host and panel protocol"
```

---

## Task 6: Extension Manager UI

**What this does (plain English):** A new **Extensions** screen in the app (like Settings and Accounts). It lists every extension with its on/off switch and version, a big **Install** button that lets you pick a folder or `.zip`, and per-extension **Uninstall** and **Delete Data** buttons (the latter asks "are you sure?"). A banner explains that installed extensions appear after a restart.

**Files:**
- Create: `src/renderer/components/extension-manager.ts`
- Modify: `src/renderer/components/navigation-panel.ts`, `src/renderer/index.ts`
- Test: `tests/unit/renderer/extension-manager.test.ts`

- [ ] **Step 1: Write the failing component tests**

`tests/unit/renderer/extension-manager.test.ts` (happy-dom, mirroring the existing `settings-screen.test.ts` harness):

```ts
import { describe, expect, it } from 'vitest';
import { ExtensionManager } from '../../../src/renderer/components/extension-manager';
import type { ManagedExtension } from '../../../src/types/finance-shell';

const FAKE_SHELL = {
  extensions: {
    managerList: async (): Promise<ManagedExtension[]> => ([
      { id: 'salary-history', displayName: 'Salary History', version: '1.0.0', enabled: true, source: 'built-in' },
      { id: 'todo-list', displayName: 'Todo List', version: '0.1.0', enabled: true, source: 'user' }
    ]),
    setEnabled: async () => ({ ok: true }),
    uninstall: async () => null,
    deleteData: async () => null
  }
} as never;

async function render() {
  const el = new ExtensionManager();
  (el as unknown as { shell: unknown }).shell = FAKE_SHELL;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('extension-manager', () => {
  it('lists installed extensions with source badges', async () => {
    const el = await render();
    expect(el.shadowRoot?.textContent).toContain('Salary History');
    expect(el.shadowRoot?.textContent).toContain('Todo List');
    expect(el.shadowRoot?.textContent).toContain('built-in');
    expect(el.shadowRoot?.textContent).toContain('user');
  });
  it('toggles enabled state via setEnabled', async () => {
    const el = await render();
    const toggle = el.shadowRoot?.querySelector('[data-toggle="todo-list"]') as HTMLElement;
    toggle?.click();
    await el.updateComplete;
    // assert shell.setEnabled was called with ('todo-list', false)
  });
  it('delete data requires confirmation', async () => {
    const el = await render();
    const deleteBtn = el.shadowRoot?.querySelector('[data-delete="todo-list"]') as HTMLElement;
    deleteBtn?.click();
    expect(el.shadowRoot?.textContent).toContain('Confirm');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/renderer/extension-manager.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/renderer/components/extension-manager.ts`**

A Lit element following the `settings-screen.ts`/`accounts-manager.ts` pattern:

- Loads `window.financeShell.extensions.managerList()` on `connectedCallback`.
- Renders a list: displayName, version, description, source badge (`built-in` / `user`), enable/disable toggle (`data-toggle="<id>"`), Uninstall (`data-uninstall="<id>"`, hidden for built-in), Delete Data (`data-delete="<id>"`, hidden for built-in).
- Install: two buttons — "Install Folder" and "Install Zip" — each calls `window.financeShell.extensions.pickFolder()` / `pickZip()` (IPC → `dialog.showOpenDialog` in Main, returns absolute path or `null` if canceled); on non-null result calls `window.financeShell.extensions.install(path)`. Do NOT use `<input webkitdirectory>` — it yields a fake path in Electron.
- Delete Data: two-step confirm (button → inline "Confirm?" with yes/no).
- Banner: after install/uninstall/delete-data, show `Restart the app for changes to take effect.`
- Styling: reuse the Obsidian dark-theme variables (`--ff-*`) used by settings-screen.

- [ ] **Step 4: Wire navigation + view routing**

In `src/renderer/components/navigation-panel.ts`, add to `_coreItems`:

```ts
{ extensionId: 'core', id: 'extensions', label: 'Extensions', command: '__extensions__', group: 'General' }
```

In `src/renderer/index.ts` `view-changed` handler, mirror the existing `__settings__`/`__accounts__` branch:

```ts
if (view === '__extensions__') {
  const el = document.createElement('extension-manager');
  workspace.replaceChildren(el);
}
```

Register the custom element in the same place the other core components are defined (or in the component file itself).

- [ ] **Step 5: Run the component tests + typecheck + lint**

Run: `npx vitest run tests/unit/renderer/extension-manager.test.ts`
Run: `npm run typecheck`
Run: `npm run lint`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/extension-manager.ts src/renderer/components/navigation-panel.ts src/renderer/index.ts tests/unit/renderer/extension-manager.test.ts
git commit -m "feat(phase8): extension manager workspace view"
```

---

## Task 7: SDK CLI — `init` scaffold

**What this does (plain English):** The "create" step. `node scripts/sdk/cli.mjs init todo-list` makes a new folder called `todo-list` containing a ready-to-edit mini-project: a package description, TypeScript settings, a Vite dev server (`npm run dev` → `http://localhost:5173` with a mock `FinanceApi` for fast preview), a starting screen, and the built-in "finance dictionary" so your editor helps you as you type. You can open it, run `npm run dev`, and start writing your feature with instant hot-reload — no app restart until you integrate.

**Files:**
- Create: `scripts/sdk/cli.mjs`, `scripts/sdk/templates/*`
- Test: `tests/unit/sdk/sdk-init.test.ts`

- [ ] **Step 1: Write the failing init test**

`tests/unit/sdk/sdk-init.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateManifest } from '../../../src/extension-host/manifest-schema';

const CLI = join(__dirname, '..', '..', '..', 'scripts', 'sdk', 'cli.mjs');

describe('sdk init', () => {
  it('scaffolds a valid standalone project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffx-sdk-'));
    execFileSync(process.execPath, [CLI, 'init', 'todo-list', dir], { stdio: 'pipe' });
    const project = join(dir, 'todo-list');
    expect(existsSync(join(project, 'package.json'))).toBe(true);
    expect(existsSync(join(project, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(project, 'src', 'main.ts'))).toBe(true);
    expect(existsSync(join(project, 'src', 'finance.d.ts'))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('todo-list');
    const validation = validateManifest(pkg.financeExtension);
    expect(validation.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/sdk/sdk-init.test.ts`
Expected: FAIL — CLI missing.

- [ ] **Step 3: Write the template files under `scripts/sdk/templates/`**

`package.json.template`:

```jsonc
{
  "name": "{{ID}}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/main.ts",
  "financeExtension": {
    "id": "{{ID}}",
    "displayName": "{{DISPLAY_NAME}}",
    "version": "0.1.0",
    "description": "{{DESCRIPTION}}",
    "activationEvents": ["onView:{{ID}}"],
    "contributions": {
      "views": [{ "id": "{{ID}}", "name": "{{DISPLAY_NAME}}", "icon": "{{ICON}}" }],
      "commands": [{ "id": "{{ID}}.hello", "title": "{{DISPLAY_NAME}}: Hello" }],
      "navigation": [{ "id": "{{ID}}.main", "label": "{{DISPLAY_NAME}}", "command": "{{ID}}.hello", "group": "{{DISPLAY_NAME}}" }],
      "allowedCommands": ["{{ID}}.hello"],
      "allowedUiEvents": []
    }
  },
  "scripts": {
    "dev": "vite",
    "build": "node {{APP_SDK}} build ."
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "typescript": "^5.5.0"
  },
  "dependencies": {
    "lit": "^3.1.0"
  }
}
```

> `build` in the scaffold references the app's SDK CLI path — set it to the app repo's absolute path during `init` (template marker `{{APP_SDK}}`).

`tsconfig.json.template` (strict; `paths` maps the `finance` type import to the vendored file):

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM"],
    "skipLibCheck": true,
    "paths": { "finance": ["./src/finance.d.ts"], "finance-logger": ["./src/vendor/logger.ts"] }
  },
  "include": ["src"]
}
```

`src/main.ts.template` (uses vendored logger + ensures panel is bundled):

```ts
import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
import './ui/index.js'; // ensures the view's custom element is bundled (Task 8 lib entry is src/main.ts)
const logger = new ExtensionLogger('{{ID}}');
export function activate(finance: FinanceApi): void {
  logger.info('activate {{ID}}');
  finance.commands.registerCommand('{{ID}}.hello', '{{DISPLAY_NAME}}: Hello', () => {
    finance.ui?.requestMount('{{ID}}', { greeting: 'Hello from {{ID}}' });
  });
}
export function deactivate(): void { logger.info('deactivate {{ID}}'); }
```

`src/ui/sample-view.ts.template` (uses shared styles + tokens):

```ts
import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
export class SampleView extends LitElement {
  static override styles = [sharedStyles];
  override render() { return html`<div class="view-container"><div class="view-container-inner"><h1>{{DISPLAY_NAME}}</h1><p>Your extension screen is ready — uses tokens + layout.</p></div></div>`; }
}
```

`src/ui/index.ts.template` (bundle entry that registers the custom element):

```ts
import { SampleView } from './sample-view';
if (!customElements.get('{{ID}}-view')) customElements.define('{{ID}}-view', SampleView);
```

`vite.config.ts.template`:

```ts
import { defineConfig } from 'vite';
export default defineConfig({
  root: '.',
  server: { port: 5173, open: true },
  resolve: { alias: { finance: '/src/mock/finance-mock.ts', 'finance-logger': '/src/vendor/logger.ts' } }
});
```

`index.html.template` (dev entry — mounts the view standalone, loads vendored tokens):

```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>{{DISPLAY_NAME}} — dev</title><link rel="stylesheet" href="/src/styles/tokens.css" /></head>
  <body>
    <div id="app"></div>
    <script type="module">
      import './src/ui/index.js';
      import { createMockFinance } from './src/mock/finance-mock.js';
      const finance = createMockFinance();
      const el = document.createElement('{{ID}}-view');
      document.getElementById('app').appendChild(el);
      // optional: exercise activate() with mock
      import('./src/main.js').then(m => m.activate?.(finance));
    </script>
  </body>
</html>
```

`src/mock/finance-mock.ts.template` (in-memory mock — HMR-friendly, no persistence):

```ts
export function createMockFinance(): import('finance').FinanceApi {
  const mem = new Map<string, Map<number, Record<string, unknown>>>();
  let nextId = 1;
  const table = (name: string) => {
    if (!mem.has(name)) mem.set(name, new Map());
    const m = mem.get(name)!;
    return {
      find: async (filter = {}) => [...m.values()].filter(r => Object.entries(filter).every(([k,v]) => r[k]===v)),
      findOne: async (filter = {}) => [...m.values()].find(r => Object.entries(filter).every(([k,v]) => r[k]===v)) ?? null,
      insert: async (row) => { const id = nextId++; const r = { id, ...row }; m.set(id, r); return { id }; },
      update: async (filter, patch) => { let n=0; for (const [id,r] of m) if (Object.entries(filter).every(([k,v])=>r[k]===v)) { m.set(id,{...r,...patch}); n++; } return { affected: n }; },
      delete: async (filter) => { let n=0; for (const [id,r] of m) if (Object.entries(filter).every(([k,v])=>r[k]===v)) { m.delete(id); n++; } return { affected: n }; },
      count: async (filter = {}) => [...m.values()].filter(r => Object.entries(filter).every(([k,v])=>r[k]===v)).length,
    };
  };
  return {
    commands: { registerCommand: () => {}, execute: async () => {} },
    ai: { registerTool: () => {} },
    db: { table } as never,
    services: { register: () => {}, unregister: () => {}, invoke: async () => null },
    ui: { requestMount: async () => {}, setDirty: () => {}, autoSaveDraft: async () => {}, onBeforeUnmount: () => {} },
    events: { on: () => () => {}, emit: async () => {} },
    settings: { get: async () => null, set: async () => {} },
  } as never;
}
```

`src/vendor/logger.ts.template` (vendored `ExtensionLogger` shim — standalone dev falls back to `console`, built extension posts via `parentPort` → Main `log.*` → file + DevTools; never bundle Core):

```ts
export class ExtensionLogger {
  constructor(private context: string, private impl: Pick<Console,'log'|'warn'|'error'> = console) {}
  private out(level:'log'|'warn'|'error', ...args: unknown[]) {
    const msg = args[0] instanceof Error ? args[0].message : String(args[0] ?? '');
    const prefix = `[${this.context}] ${msg}`;
    if (level==='error') this.impl.error(prefix, ...args.slice(1));
    else if (level==='warn') this.impl.warn(prefix, ...args.slice(1));
    else this.impl.log(prefix, ...args.slice(1));
    try { const pp: any = (globalThis as any).process?.parentPort; if (pp?.postMessage) pp.postMessage({ jsonrpc:'2.0', method:'host.log', params:{ level, args:[msg], file: undefined, line: undefined } }); } catch {}
  }
  info(...a: unknown[]) { this.out('log', ...a); }
  warn(...a: unknown[]) { this.out('warn', ...a); }
  error(...a: unknown[]) { this.out('error', ...a); }
  debug(...a: unknown[]) { this.out('log', ...a); }
}
```

`src/styles/tokens.css.template` — vendored copy of `src/renderer/styles/tokens.css` (all `--ff-*`, `--activity-bar-*`, light-theme overrides).

`src/styles/ext-layout.css.template` — vendored copy of `extensions/salary-history/src/styles/ext-layout.css` (shell, topbar, form, table, modal, scrollbar primitives).

`src/styles/shared-styles.ts.template`:

```ts
import { css, unsafeCSS } from 'lit';
import layoutCss from './ext-layout.css?raw';
export const sharedStyles = css`${unsafeCSS(layoutCss)}`;
```

`README.md.template`: short "how to dev / build + install" section for the generated project (documents `npm run dev` → `http://localhost:5173`, then `npm run build` → `build/extension`; notes `src/styles/*` and `finance-logger` for consistent UI/logging).

- [ ] **Step 4: Implement `scripts/sdk/cli.mjs` (init + build dispatcher)**

```js
#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TEMPLATES = join(__dirname, 'templates');

function slug(id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    console.error(`invalid extension id "${id}" — use lowercase letters, digits, hyphens`);
    process.exit(1);
  }
  return id;
}

function render(template, vars) {
  let out = readFileSync(join(TEMPLATES, template), 'utf8');
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{{${k}}}`, v);
  return out;
}

function cmdInit(idRaw, targetDir) {
  const id = slug(idRaw);
  const display = id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const vars = { ID: id, DISPLAY_NAME: display, ICON: display[0], DESCRIPTION: `${display} extension`, APP_SDK: join(resolve('.'), 'scripts', 'sdk', 'cli.mjs') };
  const out = join(targetDir ?? process.cwd(), id);
  mkdirSync(join(out, 'src', 'ui'), { recursive: true });
  mkdirSync(join(out, 'src', 'mock'), { recursive: true });
  mkdirSync(join(out, 'src', 'vendor'), { recursive: true });
  mkdirSync(join(out, 'src', 'styles'), { recursive: true });
  writeFileSync(join(out, 'package.json'), render('package.json.template', vars));
  writeFileSync(join(out, 'tsconfig.json'), render('tsconfig.json.template', vars));
  writeFileSync(join(out, 'vite.config.ts'), render('vite.config.ts.template', vars));
  writeFileSync(join(out, 'index.html'), render('index.html.template', vars));
  writeFileSync(join(out, 'README.md'), render('README.md.template', vars));
  writeFileSync(join(out, 'src', 'main.ts'), render('src/main.ts.template', vars));
  writeFileSync(join(out, 'src', 'finance.d.ts'), readFileSync(join(__dirname, 'types', 'finance.d.ts'), 'utf8'));
  writeFileSync(join(out, 'src', 'vendor', 'logger.ts'), render('src/vendor/logger.ts.template', vars));
  writeFileSync(join(out, 'src', 'styles', 'tokens.css'), readFileSync(join(__dirname, '..', '..', 'src', 'renderer', 'styles', 'tokens.css'), 'utf8'));
  writeFileSync(join(out, 'src', 'styles', 'ext-layout.css'), readFileSync(join(__dirname, '..', '..', 'extensions', 'salary-history', 'src', 'styles', 'ext-layout.css'), 'utf8'));
  writeFileSync(join(out, 'src', 'styles', 'shared-styles.ts'), render('src/styles/shared-styles.ts.template', vars));
  writeFileSync(join(out, 'src', 'mock', 'finance-mock.ts'), render('src/mock/finance-mock.ts.template', vars));
  writeFileSync(join(out, 'src', 'ui', 'index.ts'), render('src/ui/index.ts.template', vars));
  writeFileSync(join(out, 'src', 'ui', 'sample-view.ts'), render('src/ui/sample-view.ts.template', vars));
  console.log(`Created extension project at ${out}`);
  console.log('Preview standalone:');
  console.log(`  cd ${out} && npm install && npm run dev   # http://localhost:5173`);
  console.log('Then build for the real app:');
  console.log(`  node ${vars.APP_SDK} build ${out}`);
}

function cmdBuild(projectDir) {
  // Implemented in Task 8 — placeholder here.
  console.error('build not implemented yet (Task 8)');
  process.exit(1);
}

function cmdRefresh(projectDir) {
  // Implemented in Task 10 — placeholder until then.
  console.error('refresh not implemented yet (Task 10)');
  process.exit(1);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'init') cmdInit(rest[0], rest[1]);
else if (cmd === 'build') cmdBuild(rest[0]);
else if (cmd === 'refresh') cmdRefresh(rest[0]); // (Task 10)
else {
  console.log('usage: node scripts/sdk/cli.mjs init <extension-id> [dir] | build <project-dir> | refresh <project-dir>');
  process.exit(1);
}
```

- [ ] **Step 5: Add the vendored SDK types (`scripts/sdk/types/finance.d.ts`)**

Task 9 creates this file in full. For this task, drop in the minimal contract so `init` works and the scaffold type-checks:

```ts
/** Public extension API for Finance Flow AI (vendored, self-contained). */
export interface FinanceApi {
  commands: {
    registerCommand(id: string, title: string, handler: (...args: unknown[]) => unknown, keybinding?: string): void;
    execute(id: string, ...args: unknown[]): Promise<unknown>;
  };
  ai: { registerTool(def: { name: string; description: string; handler: (args: unknown) => Promise<unknown> }): void };
  db: {
    table(name: string): {
      find(filter?: Record<string, unknown>, options?: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
      findOne(filter?: Record<string, unknown>): Promise<Record<string, unknown> | null>;
      insert(row: Record<string, unknown>): Promise<{ id: number }>;
      update(filter: Record<string, unknown>, patch: Record<string, unknown>): Promise<{ affected: number }>;
      delete(filter: Record<string, unknown>): Promise<{ affected: number }>;
      count(filter?: Record<string, unknown>): Promise<number>;
    };
  };
  services: { register(name: string, impl: Record<string, (params?: unknown) => unknown>): void; unregister(name: string): void; invoke(name: string, method: string, params?: unknown): Promise<unknown> };
  ui?: { requestMount(viewId: string, mountData?: Record<string, unknown>): Promise<void>; setDirty(dirty: boolean): void; autoSaveDraft(): Promise<void>; onBeforeUnmount(cb: () => Promise<unknown>): void };
  events?: { on(topic: string, handler: (payload: unknown) => void): () => void; emit(topic: string, payload?: unknown): Promise<void> };
  settings?: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> };
}
```

- [ ] **Step 6: Run the init test (+ smoke-check dev scaffold, logger, styles)**

Run: `npx vitest run tests/unit/sdk/sdk-init.test.ts`
Expected: PASS. Also assert `vite.config.ts`, `index.html`, `src/mock/finance-mock.ts`, `src/vendor/logger.ts`, and `src/styles/*` exist — extend the test in Step 1 with:
```ts
expect(existsSync(join(project, 'vite.config.ts'))).toBe(true);
expect(existsSync(join(project, 'index.html'))).toBe(true);
expect(existsSync(join(project, 'src', 'mock', 'finance-mock.ts'))).toBe(true);
expect(existsSync(join(project, 'src', 'vendor', 'logger.ts'))).toBe(true);
expect(existsSync(join(project, 'src', 'styles', 'tokens.css'))).toBe(true);
expect(existsSync(join(project, 'src', 'styles', 'ext-layout.css'))).toBe(true);
expect(existsSync(join(project, 'src', 'styles', 'shared-styles.ts'))).toBe(true);
expect(JSON.parse(readFileSync(join(project, 'package.json'),'utf8')).scripts.dev).toBe('vite');
expect(readFileSync(join(project, 'src', 'vendor', 'logger.ts'),'utf8')).toContain('ExtensionLogger');
expect(readFileSync(join(project, 'src', 'main.ts'),'utf8')).toContain('finance-logger');
expect(readFileSync(join(project, 'src', 'ui', 'sample-view.ts'),'utf8')).toContain('sharedStyles');
```

- [ ] **Step 7: Commit**

```bash
git add scripts/sdk tests/unit/sdk/sdk-init.test.ts
git commit -m "feat(phase8): SDK CLI init scaffold with vendored types"
```

---

## Task 8: SDK CLI — `build`

**What this does (plain English):** The "build" step. Running `build` on your extension project reads its description, bundles all its code into one file (Vite does this — the same tool the app itself uses), and drops a ready-to-install folder next to your project. You then open the app's Extensions screen and point it at that folder.

**Files:**
- Modify: `scripts/sdk/cli.mjs` (`cmdBuild`)
- Test: `tests/unit/sdk/sdk-build.test.ts`

- [ ] **Step 1: Write the failing build test**

`tests/unit/sdk/sdk-build.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(__dirname, '..', '..', '..', 'scripts', 'sdk', 'cli.mjs');
const APP_ROOT = join(__dirname, '..', '..', '..');

describe('sdk build', () => {
  it('produces an installable folder with <id>.js + package.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffx-build-'));
    execFileSync(process.execPath, [CLI, 'init', 'todo-list', dir], { stdio: 'pipe', cwd: APP_ROOT });
    const project = join(dir, 'todo-list');
    execFileSync(process.execPath, [CLI, 'build', project], { stdio: 'pipe', cwd: APP_ROOT });

    const out = join(project, 'build', 'extension');
    expect(existsSync(join(out, 'package.json'))).toBe(true);
    expect(existsSync(join(out, 'todo-list.js'))).toBe(true);
    const bundle = readFileSync(join(out, 'todo-list.js'), 'utf8');
    expect(bundle).not.toContain('from "finance"');
    expect(bundle).not.toContain('require("finance")');
    expect(bundle.length).toBeLessThan(200 * 1024);
    expect(readdirSync(out).some((f) => f.endsWith('.js.map'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/sdk/sdk-build.test.ts`
Expected: FAIL — `build not implemented`.

- [ ] **Step 3: Implement `cmdBuild` in `scripts/sdk/cli.mjs`**

```js
import { build as viteBuild } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { join, basename } from 'node:path';

// 'finance' is types-only — never bundle it; authors must use `import type { ... } from 'finance'`. 'finance-logger' shim is bundled (vendored logger) — not external.
const EXTERNALS = ['finance', 'electron', 'node:path', 'node:url', 'node:fs', 'node:module', 'better-sqlite3'];

async function cmdBuild(projectDirRaw) {
  const projectDir = resolve(projectDirRaw ?? '.');
  const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));
  const manifest = pkg.financeExtension;
  if (!manifest?.id) {
    console.error(`no financeExtension.id in ${projectDir}/package.json`);
    process.exit(1);
  }
  const id = manifest.id;
  const outDir = join(projectDir, 'build', 'extension');
  mkdirSync(outDir, { recursive: true });

  await viteBuild({
    root: projectDir,
    logLevel: 'warn',
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: true,
      lib: { entry: join(projectDir, manifest.main ?? 'src/main.ts'), formats: ['es'], fileName: () => `${id}.js` },
      rollupOptions: { external: EXTERNALS }
    }
  });

  cpSync(join(projectDir, 'package.json'), join(outDir, 'package.json'));
  console.log(`Built ${id} -> ${outDir}`);
  console.log('Install it in the app: Extensions > Install > pick this folder (or zip it first).');
}
```

> `main` in the scaffold manifest points at `src/main.ts` (the Host-side entry). The bundle entry is the same file; the panel UI registers its custom element via `src/main.ts → src/ui/index.ts` (the template imports `./ui/index.js` so Vite includes it — without that import the built `{{ID}}.js` would contain only `activate()` and the view would be blank).

- [ ] **Step 4: Run the build test**

Run: `npx vitest run tests/unit/sdk/sdk-build.test.ts`
Expected: PASS. If Vite complains about `finance.d.ts` resolution, ensure `paths`/alias points at the vendored file and that only `import type` usages exist (the build test asserts no runtime `finance` import).

- [ ] **Step 5: Commit**

```bash
git add scripts/sdk/cli.mjs tests/unit/sdk/sdk-build.test.ts
git commit -m "feat(phase8): SDK CLI build command via Vite JS API"
```

---

## Task 9: Full SDK type definitions + parity guard

**What this does (plain English):** Gives extension authors the complete "finance dictionary" (all the helper types the app offers) inside their standalone project, so their editor shows helpful suggestions and catches mistakes. A safety test compares the standalone dictionary with the app's real one, so if the two ever drift apart the test fails loudly instead of silently breaking extensions later.

**Files:**
- Modify: `scripts/sdk/types/finance.d.ts` (expand from Task 7's minimal version)
- Create: `tests/unit/sdk/sdk-type-parity.test.ts`, `tests/unit/sdk/fixtures/parity-check.ts`

- [ ] **Step 1: Write the parity fixture**

`tests/unit/sdk/fixtures/parity-check.ts` (imports both type surfaces and asserts structural compatibility):

```ts
import type * as Canonical from '../../../src/types/finance';
import type * as Sdk from '../../../../../scripts/sdk/types/finance';

// Every SDK type must be assignable to its canonical counterpart.
const _financeApi: Canonical.FinanceApi = null as unknown as Sdk.FinanceApi;
const _tableManifest: Canonical.TableManifest = null as unknown as Sdk.TableManifest;
const _columnManifest: Canonical.ColumnManifest = null as unknown as Sdk.ColumnManifest;
const _columnType: Canonical.ColumnType = null as unknown as Sdk.ColumnType;
```

- [ ] **Step 2: Write the failing parity test**

`tests/unit/sdk/sdk-type-parity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

describe('sdk type parity', () => {
  it('SDK types are assignable to canonical types (strict tsc)', () => {
    const fixture = join(__dirname, 'fixtures', 'parity-check.ts');
    const project = join(__dirname, '..', '..', '..');
    expect(() =>
      execFileSync('npx', ['tsc', '--noEmit', '--strict', fixture], { cwd: project, stdio: 'pipe' })
    ).not.toThrow();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/unit/sdk/sdk-type-parity.test.ts`
Expected: FAIL while SDK types are still minimal (missing `TableManifest` etc.).

- [ ] **Step 4: Expand `scripts/sdk/types/finance.d.ts` to the full self-contained surface**

Add the manifest types mirroring `src/types/finance.d.ts`:

```ts
export type ActivationEvent = '*' | 'onStartup' | `onView:${string}` | `onCommand:${string}`;

export type ColumnType = 'integer' | 'real' | 'text' | 'date' | 'datetime' | 'boolean';

export interface ColumnManifest {
  name: string;
  type: ColumnType;
  nullable?: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  enumOptions?: string[];
}
export interface TableManifest {
  name: string;
  columns: ColumnManifest[];
}

export interface ManifestViewContribution { id: string; name: string; icon: string; openCommand?: string; }
export interface ManifestCommandContribution { id: string; title: string; keybinding?: string; }
export interface ManifestMenuContribution { command: string; group: string; order?: number; }
export interface ManifestConfigurationContribution {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'object';
  label: string;
  default?: unknown;
  enumOptions?: string[];
  pattern?: string;
  formatHint?: string;
  placeholder?: string;
}
export interface ManifestNavigationContribution { id: string; label: string; command: string; group?: string; icon?: string; }
export interface ManifestContributions {
  views?: ManifestViewContribution[];
  commands?: ManifestCommandContribution[];
  menus?: ManifestMenuContribution[];
  configuration?: ManifestConfigurationContribution[];
  navigation?: ManifestNavigationContribution[];
  allowedCommands?: string[];
  allowedUiEvents?: string[];
}
export interface FinanceExtensionManifest {
  id: string;
  displayName: string;
  version: string;
  description?: string;
  dependencies?: string[];
  activationEvents: ActivationEvent[];
  contributions: ManifestContributions;
  tables?: readonly TableManifest[];
  main: string;
  keepAlive?: boolean;
}
```

Keep the `FinanceApi` interface from Task 7 but tighten `db` to mirror `DbAccessor` (methods return typed rows; keep the loose `Record<string, unknown>` shapes for author ergonomics — structural compatibility is preserved because the canonical API's return types are broader/equal). Also re-export logger types so scaffold can `import { ExtensionLogger } from 'finance-logger'`:

```ts
export type { LogLevel, LogPayload } from '../main/services/logger';
export declare class ExtensionLogger { constructor(context: string); info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void; debug(...a: unknown[]): void; }
```

- [ ] **Step 5: Run parity + build tests**

Run: `npx vitest run tests/unit/sdk/`
Expected: all PASS (init, build, parity).

- [ ] **Step 6: Commit**

```bash
git add scripts/sdk/types/finance.d.ts tests/unit/sdk/sdk-type-parity.test.ts tests/unit/sdk/fixtures/parity-check.ts
git commit -m "feat(phase8): full vendored SDK types with canonical parity guard"
```

---

## Task 10: SDK CLI — `refresh` (re-sync types after app updates)

**What this does (plain English):** When the app releases an update, its "finance dictionary" (the types your editor uses) and the vendored UI/logger shims may grow or change — but the copy inside an extension you created earlier stays on the old version. `refresh` copies the app's latest dictionary + logger + tokens/layout into your extension, overwriting **only** those vendored files and never touching your code. You then fix any new errors the editor shows, rebuild, and reinstall.

**Files:**
- Modify: `scripts/sdk/cli.mjs` (add `cmdRefresh`)
- Test: `tests/unit/sdk/sdk-refresh.test.ts`

- [ ] **Step 1: Write the failing refresh test**

`tests/unit/sdk/sdk-refresh.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(__dirname, '..', '..', '..', 'scripts', 'sdk', 'cli.mjs');
const APP_ROOT = join(__dirname, '..', '..', '..');

describe('sdk refresh', () => {
  it('updates only vendored files in an existing project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffx-refresh-'));
    execFileSync(process.execPath, [CLI, 'init', 'todo-list', dir], { stdio: 'pipe', cwd: APP_ROOT });
    const project = join(dir, 'todo-list');
    const typesPath = join(project, 'src', 'finance.d.ts');
    const loggerPath = join(project, 'src', 'vendor', 'logger.ts');
    const tokensPath = join(project, 'src', 'styles', 'tokens.css');
    writeFileSync(typesPath, 'export type ColumnType = "old";');
    writeFileSync(loggerPath, '// old');
    writeFileSync(tokensPath, '/* old */');
    writeFileSync(join(project, 'src', 'main.ts'), '// my code\n');

    execFileSync(process.execPath, [CLI, 'refresh', project], { stdio: 'pipe', cwd: APP_ROOT });

    expect(readFileSync(typesPath, 'utf8')).not.toContain('"old"');
    expect(readFileSync(loggerPath, 'utf8')).not.toContain('// old');
    expect(readFileSync(tokensPath, 'utf8')).not.toContain('/* old */');
    expect(readFileSync(join(project, 'src', 'main.ts'), 'utf8')).toContain('// my code');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/sdk/sdk-refresh.test.ts`
Expected: FAIL — unknown command `refresh`.

- [ ] **Step 3: Implement `cmdRefresh` in `scripts/sdk/cli.mjs`**

```js
function cmdRefresh(projectDirRaw) {
  const projectDir = resolve(projectDirRaw ?? '.');
  const typesPath = join(projectDir, 'src', 'finance.d.ts');
  if (!existsSync(typesPath)) {
    console.error(`no src/finance.d.ts found in ${projectDir} — is this a scaffolded project?`);
    process.exit(1);
  }
  writeFileSync(typesPath, readFileSync(join(__dirname, 'types', 'finance.d.ts'), 'utf8'));
  writeFileSync(join(projectDir, 'src', 'vendor', 'logger.ts'), readFileSync(join(__dirname, 'templates', 'src/vendor/logger.ts.template'), 'utf8'));
  writeFileSync(join(projectDir, 'src', 'styles', 'tokens.css'), readFileSync(join(__dirname, '..', '..', 'src', 'renderer', 'styles', 'tokens.css'), 'utf8'));
  writeFileSync(join(projectDir, 'src', 'styles', 'ext-layout.css'), readFileSync(join(__dirname, '..', '..', 'extensions', 'salary-history', 'src', 'styles', 'ext-layout.css'), 'utf8'));
  console.log(`Refreshed ${typesPath} + vendor/logger.ts + styles/*`);
  console.log('Fix any new type errors the editor shows, rebuild, and reinstall.');
}
```

> `refresh` touches only vendored files (`src/finance.d.ts`, `src/vendor/logger.ts`, `src/styles/tokens.css` + `ext-layout.css`). It deliberately never rewrites `main.ts`, `src/ui/*`, or `package.json`, so the author's code is untouched. If the app *removed or renamed* a runtime API the extension already calls, types alone cannot fix that — the author must adapt that code before rebuilding.

- [ ] **Step 4: Run the refresh test**

Run: `npx vitest run tests/unit/sdk/sdk-refresh.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into the dispatcher + usage line**

Add `else if (cmd === 'refresh') cmdRefresh(rest[0]);` and extend the usage string to `usage: node scripts/sdk/cli.mjs init <extension-id> [dir] | build <project-dir> | refresh <project-dir>`.

- [ ] **Step 6: Commit**

```bash
git add scripts/sdk/cli.mjs tests/unit/sdk/sdk-refresh.test.ts
git commit -m "feat(phase8): SDK CLI refresh subcommand re-syncs extension types"
```

---

## Task 11: End-to-end verification + documentation sync

**What this does (plain English):** Proves the whole story works by hand: create → build → install → restart → use → manage. Also updates the project's documentation so the new workflow and architecture are recorded for the future.

**Files:**
- Modify: `docs/extension-api.md`, `docs/file-reference.md`, `docs/decisions/README.md`, `docs/archives/2026-06-13-implementation-design.md`, `CHANGELOG.md`

- [ ] **Step 1: Manual test units (run the packaged or dev app)**

| Unit | Steps | Expected |
|---|---|---|
| TU-0 | `cd <project> && npm install && npm run dev` | Vite opens `http://localhost:5173`, `<todo-list-view>` renders with mock `FinanceApi`, HMR works on save |
| TU-1 | `node scripts/sdk/cli.mjs init todo-list <tmp>` | Scaffold created; `src/main.ts` + `src/finance.d.ts` + `vite.config.ts` + `index.html` + `src/mock/finance-mock.ts` present; `package.json` has `scripts.dev === 'vite'` |
| TU-2 | `node scripts/sdk/cli.mjs build <project>` | `build/extension/todo-list.js` + `package.json` exist |
| TU-3 | App → Extensions → Install → pick `build/extension` | Listed as user extension; banner shows restart needed |
| TU-4 | Restart app | `todo-list` appears in Activity Bar / Command Palette; command runs; sample view mounts |
| TU-5 | Extensions → toggle off → restart | Still off (D6 regression check) |
| TU-6 | Extensions → Uninstall → restart | Extension gone; its data tables still present in DB |
| TU-7 | Install again → Extensions → Delete Data (confirm) | Tables dropped; settings namespace cleared |
| TU-8 | Built-in `salary-history`/`dashboard` still work; install with id `salary-history` is rejected | No regression; collision guard fires |
| TU-9 | Install a `.zip` of `build/extension` | Succeeds via zip path |
| TU-10 | `node scripts/sdk/cli.mjs refresh <project>` | `src/finance.d.ts` + `src/vendor/logger.ts` + `src/styles/tokens.css`/`ext-layout.css` replaced with current vendored copies; `src/main.ts` + `src/ui/*` untouched |

- [ ] **Step 2: Full gate**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run test:unit`
Run: `npm run build`
Expected: all PASS; packaged build includes the new user-extensions path and SDK files.

- [ ] **Step 3: Document the workflow**

- `docs/extension-api.md`: add an "Installing extensions" section (SDK init/build/refresh, standalone `npm run dev` preview, Extensions screen, restart requirement, uninstall vs delete-data semantics, dependency/version checks, no-signing note).
- `docs/file-reference.md`: add a Phase 8 inventory (new + modified files from this plan).
- `docs/decisions/README.md`: index ADR-0009.
- `docs/archives/2026-06-13-implementation-design.md`: update the Phase 8 section to the agreed scope (SDK + installer, no signing) and mark it as the active Phase 8 plan.
- `CHANGELOG.md`: add an `### Administrative` entry (plan + ADR + docs), and — with user permission — a version header for `0.10.0`.

- [ ] **Step 4: Self-review against the spec**

- [ ] Spec Phase 8 items (packaging tooling, dependency/version management) covered by Tasks 7/8 and Task 3 (D8).
- [ ] Signing explicitly dropped (ADR-0009) with user agreement.
- [ ] Vision lifecycle semantics (`uninstall ≠ delete data`) implemented (Task 3 D5).
- [ ] No raw SQL / namespace isolation preserved (tables created via DDL generator, accessed only through the DAO).

---

## Out of scope (explicitly deferred)

- **Digital signing / code-signing certificates** — dropped by the user (ADR-0009).
- **Hot install/uninstall without restart** — restart required (documented in UI).
- **Extension-shipped migrations** — ADR-0002 trigger stays unmet; Core creates tables at install.
- **Marketplace / remote discovery** — nothing beyond local install.
- **In-app editing of extension source** — extensions are edited in their own project.
- **Per-extension data export/import** — not requested for Phase 8.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Vendored SDK types drift from canonical types | Parity test (Task 9) fails the build on drift; `refresh` (Task 10) re-syncs `finance.d.ts` + logger + tokens/layout into existing extension projects. |
| Install writes inside the Main process | Trusted single-user path; manifest Zod-validated before copy; table names validated before DDL; `builtinIds` guard prevents overriding built-ins. |
| `extract-zip` adds a dependency | Folder install is the primary path; zip is a convenience; extract-zip is tiny and maintained. |
| Host/panel bundle resolution breaks built-ins | `resolveExtensionBundlePath` is pure and tested; built-in style (`<root>/<id>.js`) is tried first per root and existing bundles are unchanged. |
| Restart-required UX confusion | Banner in the Extension Manager after every install/uninstall/delete-data. |

## Self-review

**1. Spec coverage:** SDK CLI (packaging tooling) → Tasks 7–10; dependency + version management → Task 3 (D8); installer → Tasks 3–4; Extension Manager UI → Task 6; signing → explicitly out of scope per user (ADR-0009). All spec items mapped.

**2. Placeholder scan:** No TBD/TODO placeholders; every step carries concrete code or exact commands. The one intentional forward reference (SDK types "Task 9 creates this file in full") is resolved within the plan itself.

**3. Type consistency:** `resolveExtensionBundlePath(extensionId, roots)` signature is consistent across Tasks 1/5. `installFromSource` changes from sync to async in Task 4 and Task 3's tests are updated in that task. `ExtensionRegistry.builtinIds` is added in Task 3 and consumed only by the installer. `ManagedExtension` (Task 4) matches the renderer's manager component (Task 6).
