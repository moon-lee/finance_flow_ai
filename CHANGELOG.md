---
version: 0.5.0
created: 2026-06-14
last_updated: 2026-07-02T00:50:00+10:00
---

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Phase 3 plan review** (`docs/phase3-plan-review.md`, ~16 KB) — read-only review of `docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md`. Findings: 3 must-fix, 6 should-fix, 6 consider (optional polish). All must-fix and should-fix items applied to the plan (see Changed below).

### Changed
- **Phase 3 plan review integration** (`docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md`, frontmatter `status: draft → draft — review feedback integrated`). 9 fixes from `docs/phase3-plan-review.md` annotated inline with `[Review fix §N.M]` tags for traceability. No version bump — plan was already at 0.5.0 and the deliverable scope is unchanged.
  - **Must-fix §2.1** (Task 8, Test Unit 5): Extension Host crash recovery — added `onHostStatus()` lifecycle events, `crashed` flag, `restartPromise` guard, and `ensureRunning()` re-spawn on next `request()`. Test Unit 5 expanded to verify both shell survival AND transparent re-spawn (new PID after kill). `extensions:host-status` notifications forwarded to renderer for status-bar UI.
  - **Must-fix §2.2** (Task 10): Replaced `void extensionIPC.start(extensionRegistry.list())` with `.catch((err) => console.error(...))` so startup failures log cleanly instead of becoming unhandled promise rejections.
  - **Must-fix §2.3** (Tasks 5, 10): Added `extensions:execute-command` IPC handler in Main + `extension.executeCommand` switch case in Host (delegating to existing `commands.execute` stub). Proves the IPC channel exists end-to-end; Phase 5 swaps stub for real execution.
  - **Should-fix §3.1** (Tasks 3, 5, 8, 15; File Structure): Moved `src/extension-host/json-rpc.ts` → `src/shared/json-rpc.ts`. Main, Host, and the unit test now import from the shared location. File Structure diagram updated.
  - **Should-fix §3.2** (Task 12): `src/types/finance-shell.d.ts` now imports `ManifestViewContribution` and `ManifestCommandContribution` from `./finance` instead of redeclaring them. Eliminates latent drift risk if canonical shapes evolve.
  - **Should-fix §3.3** (Task 13): Command Palette gets an `@input` filter handler — typing narrows the list to commands whose `label` contains the query (case-insensitive). Empty result shows "No matching commands". Keyboard navigation is bounded by filtered list length.
  - **Should-fix §3.4** (Task 16): E2E test "Clicking the salary-history view button activates the extension" replaced with "View activation via IPC returns activated=true after the host runs". Uses `page.evaluate(() => window.financeShell.extensions.activateView(...))` instead of coupling to Phase 1's undocumented `#navigation-panel .nav-title` DOM.
  - **Should-fix §3.5** (Task 10, Test Unit 6): Added `console.log(`[main] database path: ${dbPath}`)` to Main boot block. Test Unit 6 now references this logged path instead of a hard-coded `%APPDATA%/Finance Flow AI/finance.db` (which was Windows-only and undocumented).
  - **Should-fix §3.6** (Task 8, File Structure, Task 5): New `src/shared/extension-paths.ts` exports `HOST_BUNDLE_DIR`, `HOST_BUNDLE_FILENAME`, and `resolveHostBundlePath()` (with startup logging). `vite.extension-host.config.ts` imports `HOST_BUNDLE_DIR` for its `outDir`; `extension-ipc.ts` calls `resolveHostBundlePath()`. Single source of truth for the build layout.
  - **Self-Review Checklist §8** (added): 9 verification items, one per fix, with concrete checks (grep patterns, file existence, manual test steps). Executor must tick all before declaring Phase 3 complete.
- **Phase 3 plan: three post-review observations** (`docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md`). Follow-up fixes after the initial review-integration commit (`380fada`). All changes annotated inline with `[Review observation #N — post-review]` tags. No version bump — docs-only changes, no source files touched.
  - **Observation #1** (Test Unit 5 step 6): Clarified that the visible status-bar UI ("Extensions unavailable" badge) is **deferred to Phase 4/5 polish**. Phase 3's `extensions:host-status` IPC plumbing is observable end-to-end (Main pushes to renderer webContents, DevTools can listen on the channel), but no renderer-side component consumes the status events yet. Phase 3 verification stops at "crash is observable in DevTools"; the user-facing status bar is real component work that belongs with the other deferred UI.
  - **Observation #2** (Task 5 Host `extension.executeCommand` handler): Changed bare `executeCommand(...)` call to `finance.commands.execute(...)`. The Host now exercises the same API surface extensions use — exactly one canonical path. No extra import from `./api/commands` needed. Phase 5's real execution replaces this method without touching the call site.
  - **Observation #3** (Task 8 `ExtensionIPC.handleExit()` shutdown branch): Added `this.process = null;` after clearing `this.shuttingDown`. Fixes a latent bug where after a graceful `stop()`, `isRunning()` returned `true` (the process reference still pointed at the dead `UtilityProcess`, and `this.crashed` was never set). The next `start()` early-returned without re-sending manifests, breaking the shutdown-then-start sequence and causing subsequent `request()` calls to post to a dead handle. The race between `stop()`'s null-check and `notify()` is what surfaces this; the fix makes both shutdown and crash paths converge on a consistent "not running" state.
- **AGENTS.md rule refinement** (`AGENTS.md`): removed GitNexus documentation section (was lines 36–91 pre-edit); strengthened **Rule #5 (CHANGELOG procedure)** with numbered steps, version-bump guidance per SemVer, mandatory self-verification, and explicit scope of "notable work"; strengthened **Rule #6 (session-start docs)** with numbered procedure, recursive `*.md` discovery under `docs/` and `docs/decisions/`, and mandatory self-verification. Rule #6b updated to remove the now-orphaned `impact()` reference.
- **Phase 3 plan: follow-up review refinements** (`docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md`, `docs/file-reference.md`). Integrated 5 follow-up improvements into the Phase 3 implementation plan after the second conversational review. Frontmatter `fixes_applied` and `Self-Review Checklist` updated with numbered fixes §3.7 to §3.11:
  - **§3.7 Dev Concurrency Watcher** (Task 1): Updated `scripts.dev` to watch `npm:dev:extension-host` so changes compile automatically.
  - **§3.8 Build-Time Electron Isolation** (File Structure, Tasks 5 + 8): Split constants into `src/shared/extension-constants.ts` (constants only) and runtime paths into `src/shared/extension-paths.ts`. Isolates build-time Vite config compilation from runtime Electron `app` API imports.
  - **§3.9 Activate-View Try/Catch Protection** (Task 10): Wrapped Main's `extensions:activate-view` IPC handler in `try/catch` to return graceful failure details instead of propagating unhandled promise rejections.
  - **§3.10 Host Deactivation Hook Execution** (Task 5): Updated `host.ts` to listen for JSON-RPC notifications and invoke the `deactivate()` hook of each active extension on `host.shutdown` before terminating.
  - **§3.11 Command Palette UI Polish** (Task 13): Implemented `_scrollSelectedIntoView()` in the Command Palette keyboard handler using Lit's `updateComplete` promise, ensuring selected items scroll into view during navigation.
- **Phase 3 plan: audit trail rename of follow-up fixes** (`docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md`). The §3.7–§3.11 annotations added in the previous follow-up commit were labeled `[Review fix §N.M]`, but those numbers do not exist in `docs/phase3-plan-review.md` — they were added after the review document was finalized. Renamed all 9 inline occurrences and 5 Self-Review Checklist items to `[Follow-up §N.M]` so a future agent greping the review doc for §3.7–§3.11 will not find a phantom reference. Frontmatter `fixes_applied` split into two groups: 9 review findings (with provenance pointing to the review doc) + 5 follow-ups (with provenance pointing to commit `1416e16`). The review document remains the source of truth for the original 9 findings.

## [0.5.0] - 2026-06-30

### Added
- Phase 3 implementation plan drafted at `docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md` (2732 lines, 9 architecture decisions, 17 tasks, 8 manual test units, 23 new unit tests, 5 new E2E tests). Status: **draft — not yet implemented**.
  - **Manifest types and Zod validation** (`src/types/finance.d.ts` populated; replaces Phase 1 placeholder): `FinanceExtensionManifest`, `ActivationEvent`, `ManifestViewContribution`/`CommandContribution`/`MenuContribution`/`ConfigurationContribution`, `PackageJsonFinanceExtension`. Zod schema in `src/extension-host/manifest-schema.ts` rejects unknown manifest keys (strict mode), validates semver, enum types, and activation-event regex patterns.
  - **Electron `utilityProcess.fork()` Extension Host** spawned from Main on app startup as a sandboxed Node.js child process. JSON-RPC 2.0 envelopes over the MessagePort for all Main↔Host traffic (`src/extension-host/json-rpc.ts` with request/response correlation, notifications, and standard error codes).
  - **Extension Loader service** (`src/main/services/extension-loader.ts`) scans `<appRoot>/extensions/` for subdirectories with `package.json#financeExtension`; validates each manifest; cross-checks `package.json#name` matches `financeExtension.id`; skips `node_modules/`, `dist/`, and malformed manifests with a console warning.
  - **Extension Registry service** (`src/main/services/extension-registry.ts`) provides in-memory cache backed by Phase 2's `extension_registry` SQLite table; idempotent `upsert`, `markActivated`, `isEnabled`/`setEnabled`, and aggregation helpers for views and commands.
  - **Extension IPC transport** (`src/main/services/extension-ipc.ts`) spawns the Host, performs the `host.ready` handshake, exposes a typed `request<T>()`/`notify()` API with per-request timeouts and crash detection.
  - **`finance.*` API stubs** in the Host (`src/extension-host/api/`): functional `commands.registerCommand` and `commands.execute` (returns `null` on missing command — graceful degradation per `project_vision.md:46`); `db.table()` returns empty queryables; `ai.registerTool()` stores tool definitions. Phase 4 replaces DB stubs with real DAO access; Phase 6 replaces AI stubs with tool execution.
  - **Mock `extensions/salary-history/`** placeholder extension declares one view and two commands; activates on `onView:salary-history`; entry point registers command handlers via the parameter-injected `finance` API.
  - **Renderer Activity Bar rebuilt as contribution-driven Lit component** (`src/renderer/components/activity-bar.ts`); Phase 1's hardcoded `D/P/B/X` buttons removed; built-in `S` (Settings) button retained.
  - **Command Palette renders extension commands** under an "Extensions" group label (`src/renderer/components/command-palette.ts`).
  - **Preload bridge** exposes `financeShell.extensions.list()` and `financeShell.extensions.activateView()` (`src/preload/preload.ts` + `src/types/finance-shell.d.ts`).
  - **Electron-aware Playwright config** (`playwright.electron.config.ts`) so Phase 2's deferred E2E tests (which exercise `window.financeShell.settings`) and the new Phase 3 E2E tests can run against the real Electron app.
  - **23 new unit tests** (10 manifest-schema, 7 JSON-RPC envelope, 6 extension-loader) bringing the total to 48.
  - **5 new E2E tests**: dynamic Activity Bar shows extension view, Settings button always present, Command Palette lists extension commands, view activation round-trips through Host, host-crash placeholder.
  - **8 manual test units**: host spawn, dynamic Activity Bar, activation round-trip, Command Palette groups, crash isolation (kill host process), disable-via-DB, invalid manifest handling, full verification.

### Changed
- `docs/file-reference.md` updated with Phase 3 plan reference (per AGENTS.md Rule #6 discoverability).

### Notes
- Phase 3 plan reflects `project_vision.md:48` ("Direct in-process imports, shared global state, and direct database cross-writes between extensions are strictly forbidden") both architecturally (process isolation via `utilityProcess` makes in-process imports structurally impossible) and procedurally (Self-Review Checklist section 2 explicitly verifies the rule is upheld).
- Phase 3 establishes the `finance` API loading mechanism via parameter injection (`activate(finance)`); the vision's illustrative `import * as finance from 'finance'` pseudocode becomes the Phase 4+ migration target when a real multi-file extension is built. The `FinanceApi` type contract in `finance.d.ts` is unchanged across the transition.
- Self-Review Checklist section 7 documents 6 explicit deferrals (none blocking Phase 3 verification): `contributes.configuration` UI renderer → Phase 7; Extension Manager UI → Phase 8; NavigationProvider pattern → Phase 5; menu bar contribution rendering → Phase 5; canonical `import * as finance from 'finance'` → Phase 4+; cross-process event bus → Phase 5.
- The implementation design spec (`docs/superpowers/specs/2026-06-13-implementation-design.md`) was last updated 2026-06-14 and has not been refreshed since Phase 2's completion; it should be brought current after Phase 3 lands (not a Phase 3 blocker).
- ADR-0003 candidate (IPC transport choice per Decision 1) is deferred until the Phase 3 plan is approved and implementation begins.

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
