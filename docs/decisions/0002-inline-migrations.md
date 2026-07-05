# ADR-0002: Inline Migration Runner Instead of Umzug

**Status:** Accepted
**Date:** 2026-06-20 (created); 2026-07-05 (Phase 4 evaluation addendum per Plan Amendment 1)
**Context:** Phase 2 — Core Database & Settings Backbone (`docs/superpowers/plans/2026-06-20-phase2-database-settings-backbone.md`); Phase 4 evaluation addendum per `docs/superpowers/plans/2026-07-04-phase4-shared-financial-data-salary-history.md` Decision 8.

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

- **More than ~10 migrations accumulate** (revised from the original "more than three" by the Phase 4 evaluation addendum below — the inline runner remains readable up to roughly 10 simple DDL statements; above that, the migration list becomes hard to scan at a glance and the indirection layer of a real runner pays for itself).
- **An extension needs to ship a migration independent of Core releases.** *(unchanged — this remains the load-bearing trigger, expected to fire at Phase 8 with marketplace extensions.)*
- A production user requires DB downgrade support.
- Multi-version compatibility (e.g. user on v1.2, app installs v1.5) becomes a requirement.

## Phase 4 evaluation addendum (2026-07-05)

Phase 4 takes the migration count from 2 → **4** (`001-init-infrastructure`, `002-extension-crash-tracking`, `003-shared-accounts`, `004-salary-history-pay-slips`). This is one over the original "more than three" trigger but well below the revised "~10" threshold.

None of the triggers above are *actually* tripped at 4 migrations:

- **4 migrations are still trivially manageable as inline code.** Each is ~30 lines of DDL.
- **No extension needs to ship a migration independently.** Phase 4's single extension (salary-history) ships with Core. Phase 8 (marketplace) is the realistic trigger for this.
- **No production user needs DB downgrade support.**
- **No multi-version compatibility requirement.**

**Decision: stay inline. Re-evaluate at Phase 8** when the extension-shipped-migrations trigger fires.

This addendum is a minor amendment to ADR-0002, not a new ADR. The threshold language in the trigger list above is revised from "more than three" to "more than ~10" to reflect this evaluation; the "extension ships its own migration" trigger is unchanged and remains the load-bearing criterion.

## Related

- Plan section: *Decision 1: Inline Migrations Instead of Umzug* (Phase 2 plan)
- Phase 4 plan: *Decision 7* (Phase 4 adds two new migrations, total 4) and *Decision 8* (threshold softly crossed, stay inline)
- Plan Amendment 1 (2026-07-05): `docs/superpowers/plans/2026-07-04-phase4-shared-financial-data-salary-history.md` Plan Amendment 1 header (deductions removed; migration count 5 → 4)
- Code: `src/main/services/database-service.ts`
- Migration: `src/main/services/infrastructure-migration.ts`
