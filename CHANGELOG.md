---
version: 0.4.0
created: 2026-06-14
last_updated: 2026-06-21T16:10:00+10:00
---

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

## [0.4.1] - 2026-06-21

### Fixed
- **Data-loss bug in corrupt-DB recovery** (`src/main/services/database-service.ts`): `initializeDatabase` previously caught *any* failure during `openDatabaseWithPragmas` (native-module ABI mismatch, permission denied, file locked by another process) and treated the database file as corrupt — renaming it to `.corrupt-<ts>` and starting fresh. That destroyed valid user data whenever the compiled `better-sqlite3` binary's `NODE_MODULE_VERSION` did not match the running runtime (a common situation when switching between `npm test` and `npm start`, since vitest runs under Node and Electron runs under Electron's Node).
  - The catch now only wraps the integrity check (`PRAGMA quick_check`). Open failures propagate to the caller with the real error. Recovery runs only when quick_check returns anything other than `ok`, which is the actual corruption signal.
  - Renamed `recoverUnreadableDatabase` → `renameCorruptDatabase` to reflect the narrower trigger condition. The function no longer tries to re-open the file inline — it renames and lets the caller (`initializeDatabase`) re-open against the new path.
  - Added `_setDatabaseConstructorForTesting(ctor)` injection point so the unit suite can simulate native-module failures without rebuilding the binary. Used by the new regression test below.
- **Regression test** (`tests/unit/services/database-service.test.ts`): `does not rename on open failure (no silent data loss)` injects a stub constructor that throws `Simulated ABI mismatch` on `new Ctor(path)` and asserts that `initializeDatabase` propagates the error and leaves the original file untouched (no `.corrupt-*` sibling created).

### Notes
- This bug was discovered the same day Phase 2 was released (2026-06-21) when a user ran `npm start` after `npm rebuild better-sqlite3` for unit tests had switched the native binary back to Node's ABI. The valid DB from the prior successful run was renamed to `finance.db.corrupt-<ts>` on first Electron launch, then the recovery's own re-open also failed (still ABI mismatch) so no fresh DB was created. The DB was restored from the `.corrupt-*` artifact before this fix landed.
- `better-sqlite3` is currently compiled for the **Electron** ABI in this checkout (post-`npm run rebuild`). Running `npm rebuild better-sqlite3` will switch it back to the Node ABI for the vitest suite — remember to run `npm run rebuild` before launching Electron again.
- **Automated ABI switch in npm scripts** (`package.json`): the manual `npm rebuild better-sqlite3` ↔ `npm run rebuild` dance above is now gone. `scripts.test:unit` prepends `npm run rebuild:test` (recompiles `better-sqlite3` for the Node ABI that vitest uses). `scripts.start` prepends `npm run rebuild` (recompiles for the Electron ABI that the app uses). Both rebuilds use `--force` on the electron-rebuild side because electron-rebuild's "is already built" cache was silently no-op-ing on this WSL/Windows setup — the symptom was that `electron-rebuild` reported "Rebuild Complete" without actually swapping the binary's ABI. `scripts.rebuild:test = npm rebuild better-sqlite3` is the Node-side equivalent and is the script `test:unit` chains into.

### Fixed
- **Userdata path mismatch in dev mode** (`src/main/main.ts` + `package.json`): `app.getPath('userData')` was resolving to `%APPDATA%/Electron/` for `npm start` (unpackaged dev launches) instead of the production path `%APPDATA%/Finance Flow AI/` documented in the Phase 2 plan. `productName` in `package.json` is only honoured for packaged builds; for unpackaged dev we now also call `app.setName('Finance Flow AI')` immediately after the imports so the userData path is identical in both modes. Verified post-fix: `electron dist/main/main.js` creates `Cache/`, `GPUCache/`, `Local Storage/`, and `finance.db` under `%APPDATA%/Finance Flow AI/`. The existing DB (previously orphaned at `%APPDATA%/Electron/finance.db` after a prior run) was moved to the new path; schema and migration log preserved.

## [0.4.0] - 2026-06-21

### Added
- Phase 2: Core Database & Settings Backbone implementation (`docs/superpowers/plans/2026-06-20-phase2-database-settings-backbone.md`).
  - SQLite database connection via `better-sqlite3` in the Electron main process (WAL journal mode, `foreign_keys = ON`, `quick_check` health probe) — `src/main/services/database-service.ts`.
  - Inline migration runner with corrupt-DB recovery (renames unreadable file to `finance.db.corrupt-<timestamp>`) and `001-init-infrastructure` migration creating the `settings` and `extension_registry` tables.
  - Namespaced Settings Service (`src/main/services/settings-service.ts`): strict `namespace.key` validation, `core` namespace registered at startup, JSON-serialized values, `registerExtensionNamespace()` for Phase 4 extensions, `getSettings(namespace)` bulk reader.
  - Settings IPC bridge (`settings:get` / `settings:set`) over `contextBridge` — `src/preload/preload.ts` + `src/types/finance-shell.d.ts`.
  - Window-state persistence: 500ms debounced save on `resize`/`move`, synchronous save on `close`, off-screen restore guard via `screen.getAllDisplays()`, debounce timer cleared on `will-quit` shutdown.
  - Theme persistence: `body.light-theme` CSS class toggle, status-bar theme button with `data-action="toggle-theme"`, persisted as `core.theme`.
  - AI panel state persistence: collapsed state saved as `core.ui.aiCollapsed` with strict `=== true` guard against non-boolean truthy values.
  - Vitest unit-test infrastructure: `vitest.config.ts`, 6 database-service tests, 18 settings-service tests (24 total) under `tests/unit/services/`.
  - Playwright E2E theme-toggle tests under `tests/e2e/renderer-shell.spec.ts` (status-bar button visibility + click toggles `body.light-theme`).
- npm scripts: `test`, `test:unit`, `test:unit:watch`, `rebuild` (recompiles `better-sqlite3` for Electron's Node ABI; use after `NODE_MODULE_VERSION` mismatch).

### Changed
- Electron main process (`src/main/main.ts`) rewritten to initialize DB + settings on `whenReady`, persist window bounds, debounce window-state saves, register settings IPC handlers, wrap startup in try/catch with `dialog.showErrorBox` on fatal errors, and shut down persistence on `will-quit`.
- Vite main build (`vite.main.config.ts`) externalizes `better-sqlite3` and `node:fs` (native module + Node built-ins).
- Preload bridge exposes `financeShell.settings.get`/`.set` via `contextBridge`.
- Renderer (`src/renderer/index.ts`) loads persisted theme + AI panel state on `DOMContentLoaded`, wires status-bar theme toggle.
- `layout.css` adds `body.light-theme` overrides and `.status-btn` / `.version-tag` styles.
- `eslint.config.js` ignores `.gitnexus/**` (generated GitNexus tool file; was failing lint with `no-undef` on Node globals from a CommonJS runner that the TypeScript-aware ESLint config could not parse).

### Notes
- Manual verification of theme / AI-panel / window-bounds persistence across restarts (Phase 2 plan Test Units 2-6) requires GUI interaction on Windows. Confirmed in this session: the Electron process boots cleanly, creates `finance.db` at the Electron userData path with all 3 infrastructure tables and the `001-init-infrastructure` migration logged, and the WAL journal mode is active. Theme/AI panel/window-bounds manual restarts are left to a Windows GUI session.
- The Phase 2 E2E tests in `tests/e2e/renderer-shell.spec.ts` exercise `window.financeShell.settings` IPC which only exists in the Electron context; the existing `playwright.config.ts` only launches the Vite renderer. Running `npm run test:e2e` would require either an Electron-aware Playwright setup (Phase 3) or stubbing the bridge for browser-only runs. Tests are kept in the suite so they activate when that wiring lands.

## [0.3.1] - 2026-06-21

### Added
- ADR-0002 documenting the inline migration runner decision (`docs/decisions/0002-inline-migrations.md`).
- Phase 2 file reference table in `docs/file-reference.md` documenting the planned new and modified files for the Core Database & Settings Backbone milestone (8 modified, 6 new), sourced from `docs/superpowers/plans/2026-06-20-phase2-database-settings-backbone.md`.

### Changed
- Phase 2 implementation plan review corrections (`docs/superpowers/plans/2026-06-20-phase2-database-settings-backbone.md`): aligned migration shape with ADR-0002, made migrations transactional, narrowed corrupt-DB recovery to open/health-check failures, clarified settings namespace isolation boundaries, surfaced settings write failures through IPC, corrected unit-test totals, and deferred custom database path selection behind a future bootstrap config hook.
- AGENTS.md Key Requirement #6 (`Read project context before implementation`) reworded to make the two trigger points explicit: at session start and before writing or modifying implementation code. Adds a re-read reminder to prevent stale-plan drift when a plan/spec is updated mid-session.
- Phase 2 implementation plan (`docs/superpowers/plans/2026-06-20-phase2-database-settings-backbone.md`): applied review pass covering 16 items.
  - **Bug-prevention fixes:** debounced window-state save now cancelled on close (prevents post-shutdown timer firing); corrupt-DB recovery in `initializeDatabase` (renames bad file to `.corrupt-<timestamp>`); off-screen restore guard via `screen.getAllDisplays()`; `getDatabase()` also guards on `db.open`.
  - **Test infrastructure:** `test:unit` script rebuilds `better-sqlite3` for Node ABI before Vitest; E2E suite resets persisted settings in `beforeEach` to avoid test-order flake.
  - **Type safety:** renderer `applyTheme` and `core.ui.aiCollapsed` no longer rely on unchecked IPC casts; IPC handlers wrap service calls in try/catch with `console.error` logging.
  - **API hygiene:** `Migration` interface slimmed to `{ name, up }` (the `down` callback was defined but never invoked); test fixtures and infrastructure migration updated to match.
  - **Documentation:** corrected unit-test count (17, not 20); fixed `project_vision.md` line citation (`55` → `49-53`); added Agent completion note to Self-Review Checklist; theme toggle button now carries `data-action="toggle-theme"` and E2E selectors target it specifically.
- Phase 2 implementation plan (`docs/superpowers/plans/2026-06-20-phase2-database-settings-backbone.md`): applied second review pass.
  - **Error handling:** `app.whenReady()` now wraps `initializeDatabase`/`initializeSettings`/`createWindow` in `try/catch` with `dialog.showErrorBox` and graceful `app.quit()` on fatal startup errors.
  - **CHANGELOG compliance:** added Task 13 instructing implementers to update `CHANGELOG.md` per AGENTS.md Rule 5 after completing Phase 2.
  - **Scripts clarity:** Task 1 Step 2's JSON block now shows only the 4 additive scripts (`test`, `test:unit`, `test:unit:watch`, `rebuild`) instead of a misleading full-scripts snapshot.
- Phase 2 implementation plan (`docs/superpowers/plans/2026-06-20-phase2-database-settings-backbone.md`): removed Task 13 (standalone CHANGELOG update task). CHANGELOG compliance is now documented in the Self-Review Checklist as a final aggregate commit performed after all implementation tasks complete, rather than as a separate intermediate task.
- Phase 2 implementation plan (`docs/superpowers/plans/2026-06-20-phase2-database-settings-backbone.md`): aligned `getSetting()` and `getSettings()` JSON parse failure semantics, added malformed-JSON coverage for `getSettings()`, and made window-state shutdown clear the debounced timer on `will-quit` before closing settings/database.

## [0.3.0] - 2026-06-20

### Added
- Phase 2 implementation plan for Core Database & Settings Backbone (`docs/superpowers/plans/2026-06-20-phase2-database-settings-backbone.md`)
  - Architecture decisions: inline migrations, JSON-serialized settings KV, debounced window state, CSS class theming, strict namespace enforcement
  - Task breakdown: SQLite via better-sqlite3, Settings Service with `registerExtensionNamespace` validation, window state persistence, light/dark theme toggle, 20 unit tests, E2E theme toggle test
  - Namespace enforcement at the storage layer: `core.*` prefix for all core settings, `registerExtensionNamespace()` for Phase 4 extension adoption

### Changed
- Tightened the Phase 2 plan with stricter namespace validation, JSON serialization guards, unused import cleanup, and corrected unit test count.

## [0.2.0] - 2026-06-14

### Added
- Phase 1: Bootable Electron app with VS Code-inspired shell layout
- Electron main process with secure preload bridge (`contextBridge`, `contextIsolation`, `sandbox`)
- Lit web components: Activity Bar, Navigation Panel, Workspace, AI Panel, Command Palette
- Obsidian dark theme with Outfit font, glassmorphism Command Palette, custom scrollbars
- Keyboard shortcuts: `Ctrl+Shift+P` (Command Palette), `Ctrl+J` (AI Panel toggle), `Escape` (close)
- Activity Bar navigation switching Navigation Panel context (Dashboard, Salary, Budget, Tax, Settings)
- Version display in Status Bar via IPC bridge (`shell:get-version`)
- AI Panel collapse/restore with animated grid transition
- Click-away dismiss for Command Palette
- Playwright E2E smoke tests (6 tests: layout, commands, keyboard, navigation)
- Separate Vite builds for main, preload, and renderer processes
- Dev mode with concurrent watchers and Vite hot-reload

### Changed

## [0.1.3] - 2026-06-14

### Added
- Added development timeline estimation and phase risk/complexity breakdowns to `docs/superpowers/specs/2026-06-13-implementation-design.md`.

### Changed

## [0.1.2] - 2026-06-14

### Added
- Domain Services Layer added to `docs/project_vision.md` - Core Extensions providing shared business logic (PayService, DeductionService)
- Phase 1 implementation plan v2 with fixed Electron+Vite multi-process build (`docs/superpowers/plans/2026-06-14-phase1-core-shell-v2.md`)

### Changed
- Integrated premium visual styling (Outfit font, obsidian dark theme, glassmorphism, transitions) and dev-loop enhancements (nodemon watch auto-restart, keyboard arrow navigation for command palette) into the Phase 1 implementation plan (`docs/superpowers/plans/2026-06-14-phase1-core-shell-v2.md`).
- Patched Phase 1 implementation plan with explicit Electron main/preload/renderer builds, safer preload API, dev/start scripts, renderer smoke tests, and manual Electron verification steps.
- Updated Phase 1 implementation plan (`docs/superpowers/plans/2026-06-14-phase1-core-shell-v2.md`) with the following enhancements:
  - Enabled auto-focus for the Command Palette input on open.
  - Implemented optional chaining for `window.financeShell` calls to ensure browser compatibility in tests.
  - Integrated the `getVersion` API to display the application version in the Status Bar.
  - Added click-away functionality to close the Command Palette.
  - Implemented interactive Activity Bar buttons to dynamically switch Navigation Panel content.
  - Ensured `"useDefineForClassFields": false` is set in `tsconfig.json` for Lit decorators.
  - Added 8 manual test units as the primary verification method, with Playwright E2E tests kept as optional (`npm run test:e2e`).
- Fixed Activity Bar and Navigation Panel in Phase 1 plan to reflect "Salary History" (first extension) instead of "Transactions" (moved to Future Extensions)
- Reordered phases: Salary History extension now Phase 4 (was Transactions), Transactions moved to Phase 5 then to Future Extensions
- Fixed extension numbering in Initial Extensions list (removed duplicate numbering)
- Updated Domain Services to reflect Salary History focus (PayService, DeductionService vs TransactionService)

## [0.1.0] - 2026-06-14

### Added
- Implementation design specification (`docs/superpowers/specs/2026-06-13-implementation-design.md`)
- Phase 1 implementation plan for Core Shell Prototype (`docs/superpowers/plans/2026-06-13-phase1-core-shell.md`)
- CHANGELOG.md with Keep a Changelog format specification

### Changed
- Moved `project_vision.md` to `docs/project_vision.md`
- Moved `vision_review.md` to `docs/vision_review.md`
- Added Rule 5 to AGENTS.md requiring changelog updates after completing work
- Added Rule 6 to AGENTS.md requiring reading project vision and plans before implementation
