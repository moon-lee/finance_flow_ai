---
version: 0.1.3
created: 2026-06-14
last_updated: 2026-06-14T18:06:09+10:00
---

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
