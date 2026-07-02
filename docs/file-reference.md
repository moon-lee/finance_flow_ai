# File Reference

## Phase 1 — Core Shell Prototype

| File | Purpose |
|------|---------|
| `src/main/main.ts` | Electron bootstrap, window creation, IPC handler |
| `src/preload/preload.ts` | Secure `contextBridge` with allowlisted `shell:get-version` |
| `src/types/finance-shell.d.ts` | Window global types for preload API |
| `src/types/finance.d.ts` | Future extension API placeholder |
| `src/renderer/index.html` | Shell layout with 5 regions + command palette |
| `src/renderer/styles/layout.css` | Obsidian dark theme, CSS grid layout |
| `src/renderer/components/activity-bar.ts` | 5-button Activity Bar with view switching |
| `src/renderer/components/navigation-panel.ts` | Context-sensitive sidebar |
| `src/renderer/components/workspace.ts` | Tab bar + placeholder content |
| `src/renderer/components/ai-panel.ts` | Collapsible AI Assistant panel |
| `src/renderer/components/command-palette.ts` | Full keyboard-navigable command palette |
| `src/renderer/index.ts` | Keybindings, IPC version display, event wiring |
| `tests/e2e/renderer-shell.spec.ts` | 6 Playwright smoke tests (optional) |
| `vite.config.ts` | Renderer dev/build config |
| `vite.main.config.ts` | Main process build config |
| `vite.preload.config.ts` | Preload build config |
| `tsconfig.json` | TypeScript strict mode config |
| `eslint.config.js` | ESLint flat config |
| `playwright.config.ts` | Playwright E2E test config |

## Phase 2 — Core Database & Settings Backbone

| File | Status | Purpose |
|------|--------|---------|
| `package.json` | modified | Add `better-sqlite3` dep, `vitest` + `@electron/rebuild` devDeps, and `test` / `test:unit` / `test:unit:watch` / `rebuild` scripts |
| `vite.main.config.ts` | modified | Externalize `better-sqlite3` so the native addon is not bundled |
| `src/main/services/database-service.ts` | new | SQLite connection (`better-sqlite3`), inline migration runner, corrupt-DB recovery |
| `src/main/services/infrastructure-migration.ts` | new | Migration `001-init-infrastructure` creating `settings` and `extension_registry` tables |
| `src/main/services/settings-service.ts` | new | Namespaced KV store over SQLite with strict `namespace.key` validation and JSON serialization |
| `src/main/main.ts` | modified | Init DB + settings on `whenReady`, restore window bounds, debounced (500 ms) window-state persistence, settings IPC handlers |
| `src/preload/preload.ts` | modified | Expose `financeShell.settings.get` / `.set` over the `contextBridge` |
| `src/types/finance-shell.d.ts` | modified | Add `SettingsApi` and `FinanceShellApi.settings` typings on `window.financeShell` |
| `src/renderer/styles/layout.css` | modified | Add `body.light-theme` CSS variable overrides plus `.status-btn` / `.version-tag` styles |
| `src/renderer/index.ts` | modified | Load persisted theme + AI-panel state on `DOMContentLoaded`, wire status-bar theme toggle |
| `vitest.config.ts` | new | Vitest config scoped to `tests/unit/**/*.test.ts` |
| `tests/unit/services/database-service.test.ts` | new | DB init, migration idempotency, WAL pragma, get-before-init guard (6 tests) |
| `tests/unit/services/settings-service.test.ts` | new | KV CRUD, namespace enforcement, `getSettings(namespace)`, JSON / `undefined` edge cases (18 tests) |
| `tests/e2e/renderer-shell.spec.ts` | modified | Add status-bar theme toggle and `light-theme` class E2E tests |

## Phase 3 — Extension Host & IPC Scaffolding (Plan Only, Not Yet Implemented)

| File | Status | Purpose |
|------|--------|---------|
| `docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md` | new | Phase 3 implementation plan: 10 architecture decisions, 17 tasks, 8 manual test units, 23+ new unit tests + 5 new E2E tests, Self-Review Checklist with 8 sections including explicit deferrals to Phase 5/7/8 |
| `docs/extension-api.md` | new | Canonical extension author API reference: manifest schema, activation events, `finance.*` surface, lifecycle hooks, loading mechanism, error handling, security model, working example. Phase 3 skeleton with stubs flagged for `finance.db.*` and `finance.ai.*`. |
| `docs/decisions/0004-extension-entry-bundling.md` | new | ADR-0004 documenting Decision 10: extension entries bundled at build time to `dist/extensions/<id>.js` and loaded via dynamic `import()`. Resolves the `.ts` extension-entry loader gap that would have broken Phase 3's end-to-end proof. |
| `package.json` | modified (planned) | Add `zod` runtime dependency; add `concurrently`, `wait-on`, `nodemon`, `cross-env` to `devDependencies`; add `build:extension-host`, `build:extensions`, `dev:extension-host`, `dev:extensions` scripts; move `electron-rebuild --force` from `start` to `postinstall`; update `build` and `start:dev` orchestration |
| `vite.extension-host.config.ts` | new (planned) | Bundle `src/extension-host/host.ts` to `dist/extension-host/host.js` as ESM (Phase 3's fourth Vite config) |
| `vite.extensions.config.ts` | new (planned) | Multi-entry config that bundles each subdirectory of `extensions/` containing a `financeExtension` field to `dist/extensions/<id>.js` (Phase 3's fifth Vite config; per ADR-0004 and Decision 10) |
| `extensions/salary-history/package.json` | new (planned) | Mock extension manifest declaring `id: salary-history`, one view, two commands |
| `extensions/salary-history/src/main.ts` | new (planned) | Stub extension entry (TypeScript source) — registers command handlers via the parameter-injected `finance` API |
| `src/extension-host/host.ts` | modified (planned) | Extension Host process entry point: lifecycle, JSON-RPC dispatch, `activateExtension()` loads bundled extensions from `dist/extensions/<id>.js` via dynamic `import()` (per ADR-0004; was `createRequire` on `.ts` source) |
| `src/shared/json-rpc.ts` | new (planned) | JSON-RPC 2.0 envelope types and helpers shared by Main and Host |
| `src/shared/extension-constants.ts` | modified (planned) | Build-time and runtime constants: `HOST_BUNDLE_DIR`, `HOST_BUNDLE_FILENAME`, `EXTENSIONS_BUNDLE_DIR`, `extensionBundleFilename()` — isolates Vite config from Electron imports |
| `src/shared/extension-paths.ts` | modified (planned) | Runtime path resolution utilities: `resolveHostBundlePath()` and `resolveExtensionBundlePath(id)` using Electron's `app` API |
| `src/extension-host/manifest-schema.ts` | new (planned) | Zod validation schemas for manifests; strict mode rejects unknown keys |
| `src/extension-host/api/db.ts` | new (planned) | `finance.db.table()` stub returning empty queryables (Phase 3 stub; Phase 4 fills in) |
| `src/extension-host/api/commands.ts` | new (planned) | `finance.commands.registerCommand()` and `.execute()` (returns `null` on missing — graceful degradation) |
| `src/extension-host/api/ai.ts` | new (planned) | `finance.ai.registerTool()` stub |
| `src/extension-host/api/index.ts` | new (planned) | Aggregate `finance` export combining the three API surfaces |
| `src/main/services/extension-loader.ts` | new (planned) | Directory scan, manifest parse, Zod validation, package.json↔manifest id cross-check |
| `src/main/services/extension-registry.ts` | modified (planned) | In-memory cache backed by Phase 2's `extension_registry` table; idempotent `upsert`, `markActivated`, enable/disable, view/command aggregators; **new** `recordCrash(id, error)` and `clearCrashes(id)` methods with auto-disable at `AUTO_DISABLE_CRASH_THRESHOLD = 3`; `crash_count` and `last_error` columns added via `002-extension-crash-tracking` migration |
| `src/main/services/extension-ipc.ts` | modified (planned) | Electron `utilityProcess.fork()` spawn + JSON-RPC request/notify API + crash detection + re-spawn on next interaction |
| `src/main/services/infrastructure-migration.ts` | modified (planned) | New `002-extension-crash-tracking` migration adds `crash_count` and `last_error` columns to `extension_registry` via `ALTER TABLE` |
| `src/main/main.ts` | modified (planned) | Boot loader/registry/IPC before window; add `extensions:list`, `extensions:activate-view`, `extensions:execute-command` IPC handlers; `activate-view` handler calls `recordCrash()` on failure and forwards `extension-auto-disabled` host-status; graceful Host shutdown on `will-quit` |
| `src/preload/preload.ts` | modified (planned) | Expose `financeShell.extensions.list()`, `.activateView()`, and `.executeCommand(commandId, ...args)` |
| `src/types/finance-shell.d.ts` | modified (planned) | Add `ExtensionsApi` with `list()`, `activateView()`, `executeCommand()`; imports `ManifestViewContribution`/`ManifestCommandContribution` from `./finance` (no redeclaration) |
| `src/types/finance.d.ts` | modified (planned) | Replace Phase 1 placeholder with full manifest type contract: `FinanceExtensionManifest`, `ActivationEvent`, contribution types |
| `src/renderer/components/activity-bar.ts` | modified (planned) | Render buttons dynamically from `financeShell.extensions.list()`; keep built-in Settings button |
| `src/renderer/components/command-palette.ts` | modified (planned) | Add "Extensions" group label; list extension commands under it; `@input` filter handler |
| `src/renderer/index.ts` | modified (planned) | Load contributions on `DOMContentLoaded`; dispatch view activations; `command-selected` handler calls `executeCommand()` for extension commands (replaces Phase 3 placeholder `console.log`) |
| `playwright.electron.config.ts` | new (planned) | Electron-aware Playwright config so E2E tests run against the real Electron app (unblocks Phase 2's deferred E2E suite) |
| `tests/unit/extension-host/manifest-schema.test.ts` | new (planned) | 10 Zod validation tests (valid manifests, invalid activation events, unknown keys, enum-without-options, semver) |
| `tests/unit/extension-host/json-rpc.test.ts` | new (planned) | 7 envelope shape tests (request vs notification vs response) |
| `tests/unit/services/extension-loader.test.ts` | new (planned) | 6 discovery tests (valid manifest, skipped without field, id/name mismatch, invalid manifest, node_modules/dist skip, missing root) |
| `tests/unit/services/extension-registry.test.ts` | new (planned) | 8 unit tests for `ExtensionRegistry` covering idempotent `upsert`, `list` filtering, `markActivated` persistence, `setEnabled` toggle, `recordCrash` increment + auto-disable at threshold, `clearCrashes` reset — belt-and-suspenders for the registry's load-bearing behaviour |
| `tests/e2e/extension-host.spec.ts` | new (planned) | 5 E2E tests under real Electron (dynamic Activity Bar, Settings button, Command Palette grouping, view activation via IPC contract, crash placeholder) |
