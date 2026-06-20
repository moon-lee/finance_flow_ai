# ADR-0002: Inline Migration Runner Instead of Umzug

**Status:** Accepted
**Date:** 2026-06-20
**Context:** Phase 2 — Core Database & Settings Backbone (`docs/superpowers/plans/2026-06-20-phase2-database-settings-backbone.md`)

## Context

`docs/project_vision.md:83` declares **Umzug** as the chosen database migration runner. Phase 2 introduces the initial database layer with exactly one migration (the `settings` and `extension_registry` tables). Adopting Umzug at this stage would add a dependency, configuration overhead, and an indirection layer for a single `CREATE TABLE` statement.

## Decision

Use a typed inline migration runner in `src/main/services/database-service.ts`. Migrations are registered via `registerMigration({ name, up })` and applied in order at `initializeDatabase()` time. The `migration_log` table records applied migration names so re-runs are idempotent.

The `down` rollback callback is intentionally omitted from the `Migration` interface — Phase 2 has no rollback requirement, and removing it keeps the surface area honest (the runner never invokes `down`).

## Consequences

- Zero new dependencies for Phase 2.
- `down` rollback is not available; if a future migration must be reverted, the user must delete the DB or run a manual SQL recovery.
- `initializeDatabase()` includes a corrupt-DB recovery path that renames the bad file to `<path>.corrupt-<timestamp>` and starts fresh — this is simpler than a formal migration framework but adequate for the single-migration case.

## Revisit triggers

Adopt Umzug (or an equivalent) when **any** of the following becomes true:

- More than three migrations accumulate.
- An extension needs to ship a migration independent of Core releases.
- A production user requires DB downgrade support.
- Multi-version compatibility (e.g. user on v1.2, app installs v1.5) becomes a requirement.

## Related

- Plan section: *Decision 1: Inline Migrations Instead of Umzug*
- Code: `src/main/services/database-service.ts`
- Migration: `src/main/services/infrastructure-migration.ts` (`001-init-infrastructure`)
