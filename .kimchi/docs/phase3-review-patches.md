# Phase 3 Plan Review — Proposed Patches

Companion to the review of `docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md`.
Each patch is a drop-in replacement for the cited lines. No patch has been applied to
the plan yet — review and apply at your discretion.

---

## Patch 1 (High #1) — Cache module reference for shutdown

**File:** `src/extension-host/host.ts`
**Replaces:** lines ~1118–1135 (activation) and ~1136–1158 (shutdown handler)

### Before (activation)

```typescript
    const extModule = await import(url.pathToFileURL(entryPath).href);
    if (typeof extModule?.activate === 'function') {
      await extModule.activate(finance);
    }
    ext.moduleUrl = entryPath;
    notify('extension.activated', { extensionId, reason });
    console.log(`[host] activated "${extensionId}" via "${reason}" (loaded from ${entryPath})`);
    return true;
```

### After (activation)

```typescript
    const extModule = await import(url.pathToFileURL(entryPath).href);
    if (typeof extModule?.activate === 'function') {
      await extModule.activate(finance);
    }
    // Cache both the on-disk path AND the live module reference so the shutdown
    // handler can call `deactivate()` without re-loading (require() of an ESM
    // bundle throws ERR_REQUIRE_ESM). See [Review fix §HOST-1].
    ext.moduleUrl = entryPath;
    ext.module = extModule;
    notify('extension.activated', { extensionId, reason });
    console.log(`[host] activated "${extensionId}" via "${reason}" (loaded from ${entryPath})`);
    return true;
```

### Before (shutdown handler inside `handleNotification`)

```typescript
    for (const [id, ext] of activeExtensions) {
      if (ext.moduleUrl) {
        try {
          const { createRequire } = await import('node:module');
          const requireFromHere = createRequire(import.meta.url);
          const extModule = requireFromHere(ext.moduleUrl);
          if (typeof extModule?.deactivate === 'function') {
            await extModule.deactivate();
          }
        } catch (err) {
          console.error(`[host] failed to deactivate "${id}":`, err);
        }
      }
    }
```

### After (shutdown handler)

```typescript
    for (const [id, ext] of activeExtensions) {
      // Reuse the module reference cached at activation; do NOT re-load via
      // require() — the bundle is ESM and require() will throw ERR_REQUIRE_ESM.
      if (ext.module && typeof ext.module.deactivate === 'function') {
        try {
          await ext.module.deactivate();
        } catch (err) {
          console.error(`[host] failed to deactivate "${id}":`, err);
        }
      }
    }
```

### Type addition (near `DiscoveredExtension`-style type or inline at the `activeExtensions` declaration)

```typescript
interface ActiveExtension {
  moduleUrl?: string;
  module?: { activate?: (finance: unknown) => unknown; deactivate?: () => unknown };
}
```

(If the existing `activeExtensions` map already has a declared value type, just add `module?: ...` to it — don't introduce a duplicate interface.)

---

## Patch 2 (High #2) — Replace `require()` with `readFileSync` in Vite config

**File:** `vite.extensions.config.ts`
**Replaces:** lines 1938–1948 (imports) and lines 1961–1972 (the `try` block)

### Before (imports)

```typescript
import { defineConfig } from 'vite';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXTENSIONS_BUNDLE_DIR,
  extensionBundleFilename
} from './src/shared/extension-constants';
```

### After (imports)

```typescript
import { defineConfig } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXTENSIONS_BUNDLE_DIR,
  extensionBundleFilename
} from './src/shared/extension-constants';
```

### Before (try block in `discoverExtensionEntries`)

```typescript
    try {
      const pkg = require(join(dir, 'package.json'));
      if (pkg.financeExtension) {
        entries[extensionBundleFilename(name).replace(/\.js$/, '')] = join(dir, pkg.financeExtension.main);
      }
    } catch {
      // Skip non-extension directories silently; the loader's runtime validation
      // produces a proper warning for malformed extension packages.
    }
```

### After (try block — addresses Patch 3 at the same time)

```typescript
    let pkg: { name?: string; financeExtension?: { id?: string; main?: string } };
    try {
      pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    } catch (err) {
      // package.json missing or unparseable — surface a warning (not silent)
      // because this indicates a malformed extension package, not a non-extension
      // directory (which wouldn't be iterated past the dirent stat check below).
      console.warn(`[vite.extensions] skipping ${dir}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (pkg.financeExtension) {
      // Key the bundle by the manifest's canonical id, NOT the directory name,
      // so a future divergence between folder name and `financeExtension.id`
      // cannot silently break activation. See [Review fix §HOST-2].
      const id = pkg.financeExtension.id ?? pkg.name;
      if (!id) {
        console.warn(`[vite.extensions] skipping ${dir}: package.json has neither financeExtension.id nor name`);
        continue;
      }
      if (pkg.name && id !== pkg.name && id !== name) {
        console.warn(
          `[vite.extensions] extension id "${id}" differs from folder/package name "${name}" — ` +
          `bundling under id, but extension-loader validation may reject this. ` +
          `Rename folder to "${id}" or update financeExtension.id to match.`
        );
      }
      entries[extensionBundleFilename(id).replace(/\.js$/, '')] = join(dir, pkg.financeExtension.main ?? 'src/main.ts');
    }
```

> **Note on `EXTENSIONS_BUNDLE_DIR` and `extensionBundleFilename`:** unchanged. `extensionBundleFilename(id) === \`${id}.js\`` so the `.replace(/\.js$/, '')` is still needed to strip the extension before passing as a Rollup entry key.

---

## Patch 3 (Medium #1) — Key bundle output by `financeExtension.id`

This is folded into Patch 2 above. The change is in the same `try` block: the entries key is now `extensionBundleFilename(id)` where `id = pkg.financeExtension.id ?? pkg.name`, with a warning if `id !== name`.

If you prefer to keep the two patches independent, the minimal change on its own is:

```diff
-      const pkg = require(join(dir, 'package.json'));
-      if (pkg.financeExtension) {
-        entries[extensionBundleFilename(name).replace(/\.js$/, '')] = join(dir, pkg.financeExtension.main);
-      }
+      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
+      if (pkg.financeExtension) {
+        const id = pkg.financeExtension.id ?? pkg.name ?? name;
+        entries[extensionBundleFilename(id).replace(/\.js$/, '')] = join(dir, pkg.financeExtension.main ?? 'src/main.ts');
+      }
```

---

## Patch 4 (Medium #2) — Single `PaletteCommand` source

**File:** `src/renderer/index.ts`
**Replaces:** lines 2724–2725

### Before

```typescript
import type { ActivityView, PaletteCommand } from './components/activity-bar';
import type { PaletteCommand as PaletteCommandItem } from './components/command-palette';
```

### After

```typescript
import type { ActivityView } from './components/activity-bar';
import type { PaletteCommand } from './components/command-palette';
```

Then replace all uses of `PaletteCommandItem` further down in the file with `PaletteCommand` (one rename, same identifier).

**Also fix:** the note at line ~2857 currently reads:

> **Note:** `PaletteCommand` is exported from both `activity-bar.ts` and `command-palette.ts` — the `index.ts` import for `PaletteCommand` was renamed to `PaletteCommandItem` to avoid the duplicate-name collision. The shape is identical.

Replace with:

> **Note:** `PaletteCommand` is defined once, in `command-palette.ts`. `index.ts` imports it from there (alongside `ActivityView` from `activity-bar.ts`). A previous draft had a duplicate definition in `activity-bar.ts`; that was removed to keep a single source of truth.

---

## Patch 5 (Open question) — Single-call contract on `registerIpcHandlers`

**File:** `src/main/main.ts`
**Replaces:** line 2159

### Before

```typescript
    registerIpcHandlers();
    void createWindow();
```

### After

```typescript
    // SINGLE POINT OF REGISTRATION. Do not invoke registerIpcHandlers() anywhere
    // else in this file or in any module imported during bootstrap. Duplicate
    // registration would either be a no-op (Electron ipcMain.handle throws on
    // second call) or, worse, leak stale handlers across HMR reloads.
    registerIpcHandlers();
    void createWindow();
```

Add a matching checklist item to the §7 Self-Review section (somewhere near the existing "Host in-memory activation remains" item):

```markdown
- [ ] **§HOST-3 — `registerIpcHandlers()` is called exactly once.** A grep for
      `registerIpcHandlers` returns exactly one call site, on the bootstrap
      success path of `src/main/main.ts` (line ~2159). No imports of
      `registerIpcHandlers` exist outside `main.ts`.
```

---

## Applying the patches

Each patch is independent and can be applied in any order. Patches 2 and 3 share the same `try` block — apply them together (Patch 2 already includes Patch 3). Patch 1 has two parts (activation + shutdown) that must land in the same commit. Patch 4 has a follow-up doc edit (line ~2857 note). Patch 5 is comment-only.

After applying, run:

```bash
npm run typecheck
npm run lint
npm run test:unit   # manifest-schema, json-rpc, extension-loader, extension-registry
```

to confirm nothing regresses. The Vite config change (Patch 2) can also be smoke-tested by running `npm run build:extensions` against the mock `extensions/salary-history/` directory.

---

## CHANGELOG

This document is a proposed patch set, not an applied change. **No CHANGELOG entry yet** — when you decide to apply the patches, add an entry under `### Fixed` (Patches 1, 2) and `### Changed` (Patches 3, 4, 5) in `CHANGELOG.md`, citing this file as the source.
