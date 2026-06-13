---
version: 0.1.1
created: 2026-06-14
last_updated: 2026-06-14T04:15:30+10:00
---

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Domain Services Layer added to `docs/project_vision.md` - Core Extensions providing shared business logic (PayService, DeductionService)
- Phase 1 implementation plan v2 with fixed Electron+Vite multi-process build (`docs/superpowers/plans/2026-06-14-phase1-core-shell-v2.md`)

### Changed
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