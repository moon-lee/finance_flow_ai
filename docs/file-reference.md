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
| `docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md` | new | Phase 3 implementation plan: 9 architecture decisions, 17 tasks, 8 manual test units, 23 new unit tests + 5 new E2E tests, Self-Review Checklist with 7 sections including explicit deferrals to Phase 5/7/8 |
| `package.json` | modified (planned) | Add `zod` runtime dependency; add `build:extension-host` and `dev:extension-host` scripts; update `build` and `start:dev` orchestration to include the Host bundle |
| `vite.extension-host.config.ts` | new (planned) | Bundle `src/extension-host/host.ts` to `dist/extension-host/host.js` as ESM (Phase 3's fourth Vite config) |
| `extensions/salary-history/package.json` | new (planned) | Mock extension manifest declaring `id: salary-history`, one view, two commands |
| `extensions/salary-history/src/main.ts` | new (planned) | Stub extension entry — registers command handlers via the parameter-injected `finance` API |
| `src/extension-host/host.ts` | new (planned) | Extension Host process entry point: lifecycle, JSON-RPC dispatch, `activateExtension()` |
| `src/shared/json-rpc.ts` | new (planned) | JSON-RPC 2.0 envelope types and helpers shared by Main and Host |
| `src/shared/extension-constants.ts` | new (planned) | Build-time and runtime constants (HOST_BUNDLE_DIR, HOST_BUNDLE_FILENAME) to isolate Vite config from Electron imports |
| `src/shared/extension-paths.ts` | new (planned) | Runtime path resolution utilities for finding the Extension Host bundle using Electron's `app` API |
| `src/extension-host/manifest-schema.ts` | new (planned) | Zod validation schemas for manifests; strict mode rejects unknown keys |
| `src/extension-host/api/db.ts` | new (planned) | `finance.db.table()` stub returning empty queryables (Phase 3 stub; Phase 4 fills in) |
| `src/extension-host/api/commands.ts` | new (planned) | `finance.commands.registerCommand()` and `.execute()` (returns `null` on missing — graceful degradation) |
| `src/extension-host/api/ai.ts` | new (planned) | `finance.ai.registerTool()` stub |
| `src/extension-host/api/index.ts` | new (planned) | Aggregate `finance` export combining the three API surfaces |
| `src/main/services/extension-loader.ts` | new (planned) | Directory scan, manifest parse, Zod validation, package.json↔manifest id cross-check |
| `src/main/services/extension-registry.ts` | new (planned) | In-memory cache backed by Phase 2's `extension_registry` table; idempotent `upsert`, `markActivated`, enable/disable, view/command aggregators |
| `src/main/services/extension-ipc.ts` | new (planned) | Electron `utilityProcess.fork()` spawn + JSON-RPC request/notify API + crash detection |
| `src/main/main.ts` | modified (planned) | Boot loader/registry/IPC before window; add `extensions:list` and `extensions:activate-view` IPC handlers; graceful Host shutdown on `will-quit` |
| `src/preload/preload.ts` | modified (planned) | Expose `financeShell.extensions.list()` and `.activateView()` |
| `src/types/finance-shell.d.ts` | modified (planned) | Add `ExtensionsApi` and `ManifestViewContribution`/`ManifestCommandContribution` interfaces |
| `src/types/finance.d.ts` | modified (planned) | Replace Phase 1 placeholder with full manifest type contract: `FinanceExtensionManifest`, `ActivationEvent`, contribution types |
| `src/renderer/components/activity-bar.ts` | modified (planned) | Render buttons dynamically from `financeShell.extensions.list()`; keep built-in Settings button |
| `src/renderer/components/command-palette.ts` | modified (planned) | Add "Extensions" group label; list extension commands under it |
| `src/renderer/index.ts` | modified (planned) | Load contributions on `DOMContentLoaded`; dispatch view activations and extension command selections |
| `playwright.electron.config.ts` | new (planned) | Electron-aware Playwright config so E2E tests run against the real Electron app (unblocks Phase 2's deferred E2E suite) |
| `tests/unit/extension-host/manifest-schema.test.ts` | new (planned) | 10 Zod validation tests (valid manifests, invalid activation events, unknown keys, enum-without-options, semver) |
| `tests/unit/extension-host/json-rpc.test.ts` | new (planned) | 7 envelope shape tests (request vs notification vs response) |
| `tests/unit/services/extension-loader.test.ts` | new (planned) | 6 discovery tests (valid manifest, skipped without field, id/name mismatch, invalid manifest, node_modules/dist skip, missing root) |
| `tests/e2e/extension-host.spec.ts` | new (planned) | 5 E2E tests under real Electron (dynamic Activity Bar, Settings button, Command Palette grouping, view activation round-trip, crash placeholder) |
