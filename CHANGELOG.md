---
version: 0.3.1
created: 2026-06-14
last_updated: 2026-06-21T11:44:00+10:00
---

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- ADR-0002 documenting the inline migration runner decision (`docs/decisions/0002-inline-migrations.md`)
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
