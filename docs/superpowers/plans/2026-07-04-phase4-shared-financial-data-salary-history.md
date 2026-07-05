---
title: Phase 4 - Shared Financial Data & The First Extension (Salary History)
date: 2026-07-04
amended: 2026-07-05 (Plan Amendment 1 — Remove Deductions; Plan Amendment 2 — Extend Pay Slip Schema; Plan Amendment 3 — Calculation Model, Rate History, Reorderable Form, FY Column, Second View; Plan Amendment 4 — UI Design Finalization)
status: draft — Plan Amendments 1, 2, 3 & 4 applied
target_version: 0.7.0
spec_source: docs/superpowers/specs/2026-06-13-implementation-design.md (Phase 4 section, lines 121–128)
vision_alignment:
  - project_vision.md:332-337 (Phase 4 roadmap entry)
  - project_vision.md:46 (strict namespace isolation)
  - project_vision.md:48 (Do Not Break Other Extensions)
  - project_vision.md:78 (JSON-RPC transport — Phase 3 ADR-0003)
  - project_vision.md:264-284 (Data Architecture / Shared Financial Data boundary)
  - project_vision.md:131-152 (Secure Extension API — `finance.db.table()` contract)
carries_forward_from_phase3:
  # Items explicitly deferred to Phase 4 by the Phase 3 plan's Self-Review §7.
  # See docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md §7.
  - deferral: "finance.db.table() stub → real DAO with namespaced access"
  - deferral: "Canonical import pattern for multi-file extensions (Decision 9 of Phase 3)"
  # Phase 3 manual tests whose behaviour this phase depends on.
depends_on_test_units:
  - phase3 TU1 — Activity Bar activates extension on click
  - phase3 TU3 — Navigation Panel view-id mapping (uses static stop-gap map; see Decision 11)
  - phase3 TU4 — Extension Host stdout mirrored to Renderer DevTools
  - phase3 TU5 — Crash isolation and re-spawn on next interaction
  - phase3 TU6 — Hot-disable contract (registry excludes disabled; Host retains activation)
prerequisite_decisions:
  - ADR-0002 (inline migrations) — revisit in Decision 8 (migration count crosses 3)
  - ADR-0003 (utilityProcess + JSON-RPC 2.0) — protocol expanded in Decision 6
  - ADR-0004 (build-time extension entry bundling) — exercises multi-file bundling in Decision 9
---

# Phase 4 — Shared Financial Data & The First Extension (Salary History)

> ## Plan Amendment 1 (2026-07-05) — Remove Deductions
>
> **Status:** Applied. Plan remains `draft`; not yet implemented.
>
> **Summary.** The `salary_history_deductions` table, `DeductionService`, deductions UI, related DAO wrapper, and all associated tests are removed from Phase 4. The "deductions" concept is reserved for the future Tax extension (Phase 5+), which already plans to own a "deduction records ledger" per `project_vision.md:526`.
>
> **Rationale.**
> - The Phase 4 deliverable in `project_vision.md:559` is *"a functional salary history UI with persistent storage"* — CRUD for payslips. The deductions sub-view was a plan-level expansion beyond the vision's wording.
> - The implementation design spec describes DeductionService as *"for work-related expense tracking"* (line 73, tax-style). The Phase 4 plan's table semantics (PAYG withholding line items per payslip — "union fees", "income tax", "superannuation contribution") drifted from that framing. Removing deductions returns the concept to clean Tax-extension ownership.
> - Aggregations (year-to-date gross/net, total PAYG) are the real cross-extension value, not raw deduction rows. PayService covers these as an internal helper; `finance.services.*` is Phase 5 work where the API gets designed from the consumer side (Cash Flow / Dashboard).
> - Naming: "deductions" is overloaded in the vision (PAYG-withholding line items vs tax-claim expenses). Reserving the word for the Tax extension's claim-tracking table prevents a Phase 5 naming collision.
>
> **Migration count.** 5 → 4 (drops migration `005-salary-history-deductions`). ADR-0002's threshold evaluation is easier at 4 than at 5 — well below the original "more than three" trigger.
>
> **Cross-doc updates.**
> - `CHANGELOG.md` — Administrative entry under `[0.6.0]` (no version bump; plan-level work only)
> - `docs/file-reference.md` — Phase 4 section: drop 5 planned files; update descriptions of 4 affected files
> - `docs/decisions/0002-inline-migrations.md` — Phase 4 evaluation addendum updated to reflect 4 migrations
>
> **Sections amended.** Inline `[Plan Amendment 1]` markers are placed at every section that changed (frontmatter, Goal, Deliverable, Decisions 3 / 5 / 7 / 8 / 10, File Structure, Out-of-Scope table, Self-Review §2 / §4 / §7, Tasks 5.5 / 10 / 11 / 12 / 14 / 15 / 17 / 19, Test Plan, manifest example). Code-level test counts revised from ~95 → ~79 unit tests.
>
> **What this amendment does NOT change.** The DAO architecture (`DAOService`, `TableSchemaRegistry`, `shared-data-tables.ts`), namespace enforcement, Zod schema generation, JSON-RPC `extension.readTable` / `extension.writeTable` protocol, multi-file extension structure (Decision 9 / 10), type-only SDK import (`import type { FinanceApi } from 'finance'`), Lit workspace-area mount (Decision 11), UI event IPC channel (Decision 12), settings namespace (Decision 13), and the Phase 4 Self-Review Checklist are all unchanged in spirit. Only the deductions-specific deliverables are removed.

---

> ## Plan Amendment 2 (2026-07-05) — Extend Pay Slip Schema
>
> **Status:** Applied. Plan remains `draft`; not yet implemented.
>
> **Summary.** Eleven new columns are added to the `salary_history_pay_slips` table to capture the per-payslip breakdowns the user's xlsx already tracks. This reverses the "lost on import" gap from Plan Amendment 1 for 7 of the xlsx columns and adds 4 forward-tracking columns.
>
> **New columns** (all `real`, `nullable: false`, `default: 0`, `min: 0`):
>
> | Schema column | User's name | Unit | xlsx source |
> |---|---|---|---|
> | `shift_allowance` | Shift Allowance | $ per pay | "Shift Allowance" (cumulative → per-payslip delta) |
> | `base_hourly` | Base hourly | $ per pay | "Base Hourly" (cumulative → per-payslip delta) |
> | `overtime_1_5x` | Overtime (1.5x) | $ per pay | "OT(1.5)" (cumulative → per-payslip delta) |
> | `overtime_2_0x` | Overtime (2.0x) | $ per pay | "OT(2)" (cumulative → per-payslip delta) |
> | `personal_leave_hours` | Personal Leave | hours per pay | (none — future tracking; xlsx has only generic "Leave" balance) |
> | `holiday_leave_loading` | Holiday Leave Loading | $ per pay | "HLL" (cumulative → per-payslip delta) |
> | `holiday_pay` | Holiday Pay | $ per pay | (none — future tracking) |
> | `public_holiday` | Public Holiday | $ per pay | (none — future tracking) |
> | `payg_withholding` | PAYG Withholding | $ per pay | "Tax" (cumulative → per-payslip delta) |
> | `holiday_leave_accrual_hours` | Holiday Leave Accrual | hours per pay | (none — future tracking; typo "Accurual" corrected in schema) |
> | `superannuation_guarantee` | Superannuation Guarantee | $ per pay | "Super" (cumulative → per-payslip delta) |
>
> **Rationale.**
> - **Closes the "lost on import" gap** from Plan Amendment 1: PAYG Withholding (was "Tax" in xlsx), Superannuation Guarantee (was "Super"), Holiday Leave Loading (was "HLL"), Shift Allowance, Base hourly, Overtime 1.5x/2.0x are all now first-class columns.
> - **Adds forward-tracking** for fields the user wants to start capturing but doesn't currently track in the xlsx: Personal Leave, Holiday Pay, Public Holiday, Holiday Leave Accrual. These default to 0 so the import of existing xlsx data works without populating them.
>
> **Design assumptions (please confirm).**
> 1. **All amounts are per-payslip deltas**, not cumulative balances. The xlsx stores cumulative values (running totals); the import script converts via `delta_t = cumulative_t − cumulative_{t-1}` (with first row's delta = cumulative value). This is the normalized schema design.
> 2. **Units:** `personal_leave_hours` and `holiday_leave_accrual_hours` are hours; all others are dollars. Holiday Pay and Public Holiday default to dollars — matches Australian payroll convention (penalty rates, holiday rates paid as $). If you track these as hours instead, say so and I'll flip them.
> 3. **Typo correction:** Your message spelled "Accurual"; the schema column is `holiday_leave_accrual_hours` (correct spelling).
> 4. **`payg_withholding` is the column name** for what your xlsx calls "Tax". PAYG (Pay As You Go) is the Australian term for income tax withheld at source. This is per-payslip tax, which is different from year-end tax reconciliation (still the Tax extension's job in Phase 5+).
> 5. **No validation rule** that `gross = sum(breakdowns + base) + ...` — that's business logic that could go in `PayService.validatePayslipInput` later but isn't required for the schema.
>
> **Migration impact.** Migration `004-salary-history-pay-slips` grows from 11 columns to 22 columns. No new migration is needed — the table didn't exist before Phase 4 ships, so this is just an expansion of the planned migration. If Phase 4 had shipped before this amendment, a follow-up `006-add-pay-slip-breakdowns` migration would have been needed; that's a non-issue while the plan is still draft.
>
> **Cross-doc updates.**
> - `CHANGELOG.md` — Administrative entry under `[0.6.0]` (no version bump; plan-level work only)
> - `docs/file-reference.md` — Phase 4 section: update the manifest description to mention the 11 breakdown columns
> - `docs/superpowers/plans/2026-07-04-phase4-shared-financial-data-salary-history.md` — Decision 3 manifest example updated inline; Self-Review §2 updated to reference the breakdown columns
>
> **What this amendment does NOT change.** Plan Amendment 1's removals stay in place (`salary_history_deductions` table still removed, `DeductionService` still removed, `salary.show-deductions` command still gone). Phase 4's architecture (DAO, namespace enforcement, JSON-RPC, multi-file extension, etc.) is unchanged. The "lost on import" mapping table from earlier would now show that 7 of the 10 previously-lost columns have a schema home; the 4 forward-tracking columns (Personal Leave, Holiday Pay, Public Holiday, Holiday Leave Accrual) remain "lost on import" since the xlsx doesn't track them, but will be populated going forward via the salary-history form.

---

> ## Plan Amendment 4 (2026-07-05) — UI Design Finalization
>
> **Status:** Applied. Plan remains `draft`; not yet implemented.
>
> **Summary.** Eight HTML/CSS mockups were built at `docs/design/salary-history-mvp/` to validate the UI design before Task 11 implementation. The mocks surfaced one design correction (gross/net must be user inputs in a dedicated Totals section, not derived) and several layout decisions captured in **Decision 18** below. The mocks are the visual contract for Task 11 implementation; any deviation during implementation must be reviewed against the mock directory.
>
> **Mocks delivered:**
>
> | File | Purpose | Component |
> |---|---|---|
> | `index.html` | Navigation between all 8 mocks | — |
> | `payslip-form-collapsed.html` | Default state — minimal entry (date + gross + net) | `payslip-form.ts` |
> | `payslip-form-expanded.html` | "This week was different" toggle on — 6 hour inputs + 2 leave fields visible | `payslip-form.ts` |
> | `payslip-form-reconciled.html` | Inline amber warning banner when sum-of-earnings ≠ gross; offers "Verify hours", "Add bonus line", "Accept mismatch", "Cancel" actions | `payslip-form.ts` |
> | `payslip-list.html` | Paginated table + YTD summary footer (YTD Gross, YTD Net, YTD PAYG, YTD SG) | `payslip-list.ts` |
> | `pay-rate-history.html` | Rate rows list (newest first) with "Current" badge on the row with `effective_to IS NULL`; Edit only on current row, View on history | `pay-rate-history-view.ts` |
> | `rate-row-form.html` | Add/edit rate row form with confirmation panel ("Adding this rate will close the current rate") | `rate-row-form.ts` |
> | `reorder-sections.html` | Modal with up/down arrows for the 7 form section IDs (period, totals, earnings, deductions, super, leave, notes); persisted via `salary-history.sectionOrder` | `reorder-sections-modal.ts` |
> | `accounts-seed.html` | First-run modal: name + optional institution, Create / Skip / Cancel; shows only when `accounts` table is empty | `accounts-seed-modal.ts` |
>
> **Design correction surfaced by the mocks:** The initial form mock (payslip-form-collapsed v1) implicitly derived gross/net from the breakdowns. The user's design intent — *"Just user input new record: pay_date, gross, net"* — required a dedicated **Totals** section between Period and Earnings where gross/net are explicit user inputs. All mocks rebuilt with the Totals section. Net effect: the form has 7 visible sections (Period → Totals → Earnings → Deductions → Super → Leave → Notes), not 6. `sectionOrder` default updated accordingly.
>
> **Visual review checklist (run before Task 11 implementation):**
> - [ ] User has approved all 8 mocks (recorded as Plan Amendment 4)
> - [ ] Section order matches `salary-history.sectionOrder` default: `["period","totals","earnings","deductions","super","leave","notes"]`
> - [ ] Reconciliation warning threshold = `paygToleranceDollars` setting (default 5.00)
> - [ ] PAYG validation triggers on user button click (not on every keystroke)
> - [ ] Dark theme uses inline-CSS-equivalent tokens in shadow DOM (the mocks use `rgb(...)`-equivalent literals; the real Lit components should use CSS custom properties defined in `:host` for consistency)
>
> **Cross-doc updates:**
> - `CHANGELOG.md` — Administrative entry under `[0.6.0]` (no version bump; plan-level work only)
> - `docs/file-reference.md` — Phase 4 section: add a `docs/design/` subdirectory row pointing to the mock index, with the Plan Amendment 4 banner noting the design has been pre-approved
> - This plan — Decision 18 added below; Task 11 references the mocks; Self-Review §2 + §5 updated to mention the visual review step
>
> **What this amendment does NOT change.** Decisions 1-17 unchanged. Plan Amendment 1's removals, Amendment 2's column additions, and Amendment 3's calculation model all stand. The mocks are a pre-implementation design artifact — no architectural decisions flipped.

---

> ## Plan Amendment 3 (2026-07-05) — Calculation Model, Rate History, Reorderable Form, FY Column, Second View
>
> **Status:** Applied. Plan remains `draft`; not yet implemented.
>
> **Summary.** Phase 4's salary-history extension is extended with: (a) a derivation-first calculation model where per-payslip inputs are minimal (pay_date + gross + net, with optional hours); (b) a new `salary_history_rate_history` table holding effective-dated rate rows; (c) a `payg-calc.ts` validation module that wraps the user's ATO weekly tax function for sanity-checking the derived PAYG; (d) reorderable form sections persisted via the settings table; (e) a `finance_year` column on `salary_history_pay_slips` plus a settings-backed default; (f) a second command and view, `salary.show-pay-rate-history`, for editing rate rows.
>
> **Decisions added:** Decision 14 (Calculation Model), Decision 15 (Reorderable Form Sections), Decision 16 (Rate History as a First-Class Table), Decision 17 (Two Commands / Two Views).
>
> **Schema changes:**
>
> | Change | Table | Detail |
> |---|---|---|
> | +1 column | `salary_history_pay_slips` | `finance_year text not null` — stores "FY2025-2026"; defaulting from settings (auto-computed from current date at app boot) |
> | +6 columns | `salary_history_pay_slips` | `regular_hours`, `shift_hours`, `overtime_1_5_hours`, `overtime_2_0_hours`, `holiday_hours`, `public_holiday_hours` — all `real not null default 0 min 0` |
> | +1 table | `salary_history_rate_history` | 13 columns: temporal anchor (id, effective_from, effective_to) + 7 rates (base_hourly_rate, standard_hours_per_week, shift_allowance_multiplier, overtime_1_5_multiplier, overtime_2_0_multiplier, superannuation_rate, holiday_leave_loading_rate) + notes + 2 timestamps |
> | +1 setting | (settings) | `salary-history.financeYear` — text, no hardcoded default; auto-computed from current date + `financialYearStart` at boot |
>
> **Column count totals:**
> - `salary_history_pay_slips`: 11 → 22 (Amendment 2) → **29** (Amendment 3)
> - `salary_history_rate_history`: **NEW**, 13 columns
> - Phase 4 migrations: 2 → **3** (`003-shared-accounts`, `004-salary-history-pay-slips`, `005-salary-history-rate-history`)
> - Total Core migrations: 4 → **5** (still well under ADR-0002's revised ~10 threshold)
>
> **Design rationale (high level):**
>
> 1. **Calculation Model inverts CRUD-first.** Instead of asking the user to type every breakdown field, the form captures only `pay_date`, `gross`, `net` (plus optional hours for non-standard weeks). All 9 monetary breakdowns are derived from `salary_history_rate_history` rows effective at the payslip's `pay_date`. The user's xlsx confirms this matches reality: the breakdown fields were already computed values, not user-entered facts.
> 2. **PAYG = gross − net. Always.** No tax-table lookup in the write path. A `[Validate PAYG]` button runs the user's ATO weekly function (`CALCULATE_TAX_WITHHELD_26_27`) and compares to the derived value; mismatch > `paygToleranceDollars` (default $5) shows a warning. This validates both directions: net matches gross AND gross is in a sensible bracket.
> 3. **Rate history as a first-class table** because rates have effective dates — settings JSON can't represent that cleanly. One row at a time has `effective_to = NULL` (current); adding a new rate row atomically closes the previous one. Past payslips always compute with their era's rates.
> 4. **Reorderable form sections** let the user put their most-used section first (gross/net users vs leave-heavy users). Persisted via `salary-history.sectionOrder` settings key (array of section IDs).
> 5. **`finance_year` column** on every payslip row enables FY-scoped aggregation queries without recomputing from `pay_date` every time. Set from `settings.salary-history.financeYear` (auto-computed default) but overridable per row.
> 6. **Second view / second command** — `salary.show-pay-rate-history` for managing rate rows. Command Palette only (Activity Bar stays at one `P` button); the rate history is an admin surface, not daily-use.
>
> **Hybrid xlsx import.** The user's existing 50 rows import directly: `pay_date`, `gross`, `net`, the 9 monetary breakdowns, and `personal_leave_hours` + `holiday_leave_accrual_hours` are stored as captured. The 6 new hour fields stay at 0 for historical rows (xlsx didn't have explicit hour counts). New entries use the derivation model.
>
> **Cross-doc updates.**
> - `CHANGELOG.md` — Administrative entry under `[0.6.0]` (no version bump; plan-level work only)
> - `docs/file-reference.md` — Phase 4 inventory: Plan Amendment 3 banner; plan row description extended; new file rows for `pay-rate-service.ts`, `payg-calc.ts`, `payg-brackets.ts`, `pay-rate-history-view.ts`, `rate-row-form.ts`, `reorder-sections-modal.ts` and their tests; `extensions/salary-history/package.json` description updated for new table + commands + settings
> - `docs/superpowers/plans/2026-07-04-phase4-shared-financial-data-salary-history.md` — Frontmatter + Amendment 3 header (this section); Decisions 14-17 added; Decisions 7 & 8 updated for the new migration count; File Structure diagram updated for new files; Tasks 4 / 10 / 11 / 12 updated for the new work; Test Plan + Self-Review updated
>
> **What this amendment does NOT change.** Decisions 1-13 from the original plan and Amendment 1 stand as written. The DAO architecture, namespace enforcement, Zod schema generation, JSON-RPC `extension.readTable` / `extension.writeTable` protocol, multi-file extension structure (Decisions 9 / 10), type-only SDK import, Lit workspace-area mount (Decision 11), UI event IPC channel (Decision 12), and base settings namespace (Decision 13) are unchanged. Amendment 1's removals stand. Amendment 2's breakdown columns stay (now treated as derived rather than user-entered).

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Complete this milestone and wait for review before starting Phase 5.
>
> **Goal reminder:** Phase 4 ships the **first fully-functional extension** (Salary History) backed by **persistent SQLite storage**. It also turns the Phase 3 `finance.db.table()` *stub* into a real DAO with strict namespace enforcement, and proves the Shared Financial Data / Extension-owned boundary with the Accounts table. Phase 4 does **not** ship WebviewPanels (Phase 5), the AI Assistant (Phase 6), or `finance.services.*` cross-extension Domain Services (Phase 5 — see Decision 5).
>
> **Open questions inherited from Phase 3** (must be resolved by the executor):
> 1. **Canonical import pattern for multi-file extensions** — Decision 9 of Phase 3 deferred this. Salary History is the first multi-file extension. Resolution in Decision 9 below.
> 2. **`finance.services.*` Domain Service contract** — the spec lists PayService as a Phase 4 deliverable, but `finance.services.*` is a cross-extension API the platform doesn't support yet. Resolution in Decision 5 (PayService is an internal helper for Phase 4; `finance.services.*` is Phase 5 work where the API gets designed from the consumer side).
>
> ~~**Original item 2 (deleted by Plan Amendment 1):** spec places `PayService` / `DeductionService` in Phase 4...~~ DeductionService is removed from Phase 4 entirely (see Plan Amendment 1 above). The deductions concept now belongs to the Phase 5+ Tax extension.

---

## Goal

Make the Salary History extension fully functional: users can create a payslip, edit it, and view their salary history, with every write/read round-tripping through a real, namespaced DAO into the local SQLite database. This proves the Shared Financial Data architecture end-to-end and turns the Phase 3 mock extension into the platform's first real citizen.

**Architecture:** The Main process remains the sole SQLite owner (per `project_vision.md:99`). The Extension Host gains a new `extension.readTable` / `extension.writeTable` JSON-RPC pair that proxies to a real DAO in Main. The DAO enforces two boundaries structurally: (a) extensions may only access tables whose names match `<extensionId>_*` OR are on an explicit **Shared Financial Data allowlist** (Phase 4 ships `accounts`); (b) raw SQL is impossible — every call goes through typed accessors (`.find`, `.insert`, `.update`, `.delete`, `.findOne`, `.count`) backed by a parameterized SQL builder. The Salary History extension reads `accounts` (shared) and writes `salary_history_pay_slips` (extension-owned). All UI renders inside the workspace area as Lit elements mounted by the renderer (Phase 5 will replace this with proper WebviewPanels — see Decision 11).

> `[Plan Amendment 1]` Original Goal mentioned tracking deductions and writing to `salary_history_deductions`; both removed.

**Tech Stack:** everything Phase 3 ships, plus: Zod (DAO input validation, already a dependency), `better-sqlite3` prepared statements (already a dependency, used more heavily), Lit (renderer components for payslip form / history list / accounts seed modal), Vitest (unit), Playwright Electron (E2E — still gated by the Phase 3 environmental blocker).

> `[Plan Amendment 1]` Lit component list no longer mentions "deduction list".

---

## Deliverable

A bootable Electron app that, when the user clicks the `P` Activity Bar icon (Salary History view), shows:

1. A **payslip entry form** (Lit component) — fields: pay period start/end, gross pay, pay date, account (dropdown sourced from `accounts`), notes. Submit writes to `salary_history_pay_slips` via `finance.db.table('salary_history_pay_slips').insert({...})`.
2. A **salary history list** — paginated table of past payslips, sorted by pay_date DESC. Edit and Delete actions per row. Year-to-date gross / net / count summary footer (computed by `PayService.aggregateYearToDate()`).
3. A **Shared Accounts seed** — on first activation, if the `accounts` table is empty, the extension prompts the user to create one (modal form) or auto-seeds a default "Primary Salary Account". This proves Phase 4's read access to Shared Financial Data.
4. **Persistence verified** — every write survives an app restart (data round-trips through SQLite → settings → restart → render). Manual Test Unit 4 walks this loop.

Users can also reach the same UI from the Command Palette's `salary.show-pay-history` command.

> `[Plan Amendment 1]` Deliverable item #3 (deductions sub-view) removed; renumbered. New item #2 gains a YTD summary footer using `PayService.aggregateYearToDate()`. The Command Palette drops the `salary.show-deductions` command — there is no deductions sub-view to show.

---

## Out of Scope (Explicit Deferrals)

| Deferred | Target Phase | Why deferred |
|----------|--------------|--------------|
| `WebviewPanel` iframe rendering for extensions | Phase 5 | Phase 4 mounts UI as Lit elements in the workspace area (Decision 11) |
| `finance.services.*` cross-extension Domain Services | Phase 5 | PayService is a Phase 4 internal helper (Decision 5); the cross-extension contract lands when a second consumer needs it |
| NavigationProvider data-driven sidebar | Phase 5 | Phase 3 uses a static id→name map; Phase 4 extends it for salary-history view ids but does not replace it |
| AI tools for Salary History (`finance.ai.registerTool` wiring) | Phase 6 | Phase 4's `ai.registerTool` is still a no-op stub; the salary-history tool registration comes with the AI Assistant |
| Typed DAO generation from manifest schemas | Phase 7+ | `.table('name')` access is sufficient; auto-typed accessors are future polish |
| `import * as finance from 'finance'` canonical import | **Phase 4+** (resolved this phase — see Decision 9) | Salary History is the first multi-file extension; the loader contract must be locked here |
| Per-extension command allowlist on Main (Phase 3 review §3.7) | Phase 5 | Renderer can still drive arbitrary command execution in Phase 4 |
| ESM-friendly source maps in production bundles | Phase 7 | Vite emits sourcemaps by default in dev; production minification stripping is Phase 7 |
| Umzug migration runner adoption | **Phase 4+** (revisit — see Decision 8) | ADR-0002 says "more than 3 migrations" is a trigger; Phase 4 lands at 4 (Decision 7) — one over the trigger but well within the inline runner's sweet spot |
| Phase 2 deferred E2E suite still gated | unchanged | Playwright-electron environmental blocker (Phase 3 final status); tracked separately |

---

## Architecture Decisions

### Decision 1: Shared Financial Data Boundary — Allowlist + Strict Prefix Enforcement

**Choice:** The DAO enforces two table-access rules **structurally** (no runtime check the extension could bypass):

1. **Shared Financial Data allowlist.** Tables explicitly shared across extensions are enumerated in a new constant `SHARED_FINANCIAL_DATA_TABLES: readonly string[]` in `src/main/services/shared-data-tables.ts`. Phase 4 ships `['accounts']` in the allowlist. Extensions may `.find` / `.count` (read-only) against allowlisted tables.
2. **Extension namespace prefix.** All other access requires the table name to start with `<extensionId>_`. So `salary-history` can access `salary_history_pay_slips`, but cannot reach `budget_items`, `tax_deductions`, or any other extension's tables. The DAO **throws** `TableAccessDeniedError` if the extension tries to read or write a table it does not own.

**Reasoning:** `project_vision.md:48` mandates: *"One extension must never perform write/update queries directly on another extension's tables"* and *"Cross-extension table access is structurally impossible"*. The simplest structural enforcement is a per-extension table-name filter at the DAO layer — the SQL builder literally cannot emit `INSERT/UPDATE/DELETE` for a table the calling extension does not own. Reading shared data is opt-in via the allowlist (Phase 4 only ships `accounts`); adding more shared tables is a Core decision, not an extension one.

**Why an allowlist for shared data, not a namespace rule for shared tables:** Shared Financial Data is *Platform-owned* (`project_vision.md:131` — "Shared Financial Data (Platform-owned): Accounts, Transactions, Categories, Assets, Liabilities"). Extensions are guests reading it. Treating shared tables as extension-prefixed (`shared_accounts`) would muddy ownership — they aren't owned by an extension. A separate allowlist makes the ownership explicit.

**Alternatives considered:**

- **`ext_<id>_<table>` prefix everywhere** (e.g. `ext_salary_history_pay_slips`). Vision Issue #12 rejected the `ext_` prefix as redundant given the DAO path enforces isolation. Same reasoning applies — let the DAO enforce, don't duplicate in the name.
- **Manifest-declared shared reads.** Each extension declares which shared tables it needs in `financeExtension.contributes.dataAccess`; Core compiles a per-extension ACL at load time. More flexible, more complex. Defer to Phase 5 when Dashboard needs to read many shared tables and the manifest story has more readers.
- **Hand-rolled permission layer on top of `finance.db.table()`.** Means every extension call goes through a permission gate — performance cost + indirection. The DAO-level enforcement is the same end result with no extra layer.

**Trade-off:** Adding new shared tables (e.g. `transactions`) requires editing `SHARED_FINANCIAL_DATA_TABLES` in Core. That is the correct cost — "what is shared financial data" is a platform-level decision, not an extension-level one.

**Revisit triggers:**
- More than 10 shared tables (the constant becomes unwieldy; consider a `core.financialData` manifest block per table).
- An extension needs row-level access control (e.g. "Tax can only read salary_history_pay_slips for tax year X"). Out of scope today; flag in a future ADR.

---

### Decision 2: DAO API Shape — `finance.db.table(name).find/insert/update/delete/findOne/count`

**Choice:** Replace Phase 3's empty-queryable stub (`src/extension-host/api/db.ts`) with a real DAO surface backed by `better-sqlite3` prepared statements. The shape (locked here, do not change without an ADR):

```ts
finance.db.table('salary_history_pay_slips')
    .find({ pay_date: { $gte: '2026-01-01' }, account_id: 1 })     // query object
    .find({ $or: [{ notes: { $like: '%bonus%' } }, { gross: { $gt: 5000 } }] })  // boolean operators
    .findOne({ id: 7 })                                            // single row or null
    .insert({ pay_period_start: '2026-01-01', gross: 5000, ... }) // returns inserted row with id
    .update({ id: 7 }, { gross: 5200 })                            // returns affected row count
    .delete({ id: 7 })                                             // returns affected row count
    .count({ account_id: 1 })                                      // integer
```

Every method validates the table name (Decision 1) and the row payload (Zod schema generated from the table's column types in the DAO registry — see Decision 3). Results return **plain serialisable objects** — no `Date` objects, no `BigInt`, no nested buffers. Dates round-trip as ISO-8601 strings; integers and reals stay native. This is enforced by a `serializeRow()` helper so cross-process JSON-RPC cannot crash on non-serialisable types.

**Reasoning:** Vision Issue #1 / #3 / #28 hammered on raw-SQL access being a security hole. The DAO must be typed, structural, and refuse unsafe operations. Vision Issue #28 settled on `finance.db.table('name')` for the first release (typed DAO generation is future polish). Phase 4 is the first release.

**Query operators supported in Phase 4:**

| Operator | Meaning | Example |
|----------|---------|---------|
| (no operator) | exact equality | `{ account_id: 1 }` |
| `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte` | comparison | `{ gross: { $gte: 5000 } }` |
| `$like`, `$nlike` | SQL `LIKE` / `NOT LIKE` (escape user input) | `{ notes: { $like: '%bonus%' } }` |
| `$in`, `$nin` | SQL `IN` / `NOT IN` | `{ id: { $in: [1, 2, 3] } }` |
| `$isNull`, `$notNull` | null checks | `{ notes: { $isNull: true } }` |
| `$or` (top-level only) | boolean OR across sibling conditions | `{ $or: [{ ... }, { ... }] }` |

**Operators deliberately deferred:** `$and` (use multiple keys; `$and` adds no power for Phase 4 query shapes), `$join` (cross-table joins are a Phase 5+ capability for Dashboard aggregation), `$orderBy` / `$limit` / `$offset` (`.find()` returns ordered by primary key DESC by default; explicit sort/paginate comes with Phase 5's Dashboard extension). `$raw` is **never** supported — it is the entire reason the DAO exists.

**Alternatives considered:**

- **Knex-style query builder.** Powerful, but a 200KB dependency for six operators is overkill. Hand-rolled is ~150 lines.
- **Drizzle / Prisma.** Generate DAOs from a schema; requires a build step and typed-schema generation. Out of scope per Vision Issue #28.
- **Single `.query(sql, params)` method.** Raw SQL is exactly what we said no to. Rejected.
- **ORM-style `.belongsTo()` / `.hasMany()` relations.** Cross-table relations are a Phase 5+ Dashboard concern.

**Trade-off:** Hand-rolled query operators mean we own the SQL injection surface (every user-supplied value passes through `?` parameter binding). The win is zero new dependencies and total control over the SQL emitted.

---

### Decision 3: DAO Registry — Zod Schemas Generated from Table Manifest

**Choice:** Every extension table is declared in the extension's manifest under a new optional `financeExtension.tables` block. The DAO registry reads this at extension load time, generates a Zod schema per table, and validates every insert/update payload against it before SQL is emitted.

```jsonc
// extensions/salary-history/package.json
"financeExtension": {
  "tables": [
    {
      "name": "salary_history_pay_slips",
      "columns": [
        { "name": "id",                          "type": "integer", "primary": true, "autoIncrement": true },
        { "name": "account_id",                  "type": "integer", "nullable": false, "references": "accounts.id" },
        { "name": "pay_period_start",            "type": "date",    "nullable": false },
        { "name": "pay_period_end",              "type": "date",    "nullable": false },
        { "name": "pay_date",                    "type": "date",    "nullable": false, "index": true },
        { "name": "gross",                       "type": "real",    "nullable": false, "min": 0 },
        { "name": "net",                         "type": "real",    "nullable": false, "min": 0 },
        { "name": "currency",                    "type": "text",    "nullable": false, "default": "AUD" },
        { "name": "shift_allowance",             "type": "real",    "nullable": false, "default": 0, "min": 0 },
        { "name": "base_hourly",                 "type": "real",    "nullable": false, "default": 0, "min": 0 },
        { "name": "overtime_1_5x",               "type": "real",    "nullable": false, "default": 0, "min": 0 },
        { "name": "overtime_2_0x",               "type": "real",    "nullable": false, "default": 0, "min": 0 },
        { "name": "holiday_leave_loading",       "type": "real",    "nullable": false, "default": 0, "min": 0 },
        { "name": "holiday_pay",                 "type": "real",    "nullable": false, "default": 0, "min": 0 },
        { "name": "public_holiday",              "type": "real",    "nullable": false, "default": 0, "min": 0 },
        { "name": "payg_withholding",            "type": "real",    "nullable": false, "default": 0, "min": 0 },
        { "name": "superannuation_guarantee",    "type": "real",    "nullable": false, "default": 0, "min": 0 },
        { "name": "personal_leave_hours",        "type": "real",    "nullable": false, "default": 0, "min": 0 },
        { "name": "holiday_leave_accrual_hours", "type": "real",    "nullable": false, "default": 0, "min": 0 },
        { "name": "notes",                       "type": "text",    "nullable": true },
        { "name": "created_at",                  "type": "datetime","nullable": false, "default": "now" },
        { "name": "updated_at",                  "type": "datetime","nullable": false, "default": "now" }
      ]
    }
  ]
}
```

> `[Plan Amendment 1]` Manifest example no longer includes the `salary_history_deductions` table entry.

> `[Plan Amendment 2]` Manifest example now includes 11 breakdown columns for per-payslip amounts (`shift_allowance`, `base_hourly`, `overtime_1_5x`, `overtime_2_0x`, `holiday_leave_loading`, `holiday_pay`, `public_holiday`, `payg_withholding`, `superannuation_guarantee`) and per-payslip hours (`personal_leave_hours`, `holiday_leave_accrual_hours`). All 11 are `real`, `nullable: false`, `default: 0`, `min: 0`. Total columns: 11 → 22. See Plan Amendment 2 header for full rationale and design assumptions.

> `[Plan Amendment 1]` Manifest example no longer includes the `salary_history_deductions` table entry.

The Zod schema is generated by `buildColumnZodSchema(column)` in `src/shared/dao-schema.ts` (shared by Host and Main). Validators per type:

| Column type | Zod schema |
|-------------|------------|
| `integer` | `z.number().int()` |
| `real` | `z.number()` |
| `text` | `z.string()` |
| `date` | `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` (ISO date) |
| `datetime` | `z.string().datetime()` (ISO-8601 with time) |
| `boolean` | `z.boolean()` |

`nullable: true` adds `.nullable()`. `min` / `max` add `.min()` / `.max()`. `default` is applied client-side before SQL (not by SQLite — keeps the DAO layer portable).

**Column design — normalized per-payslip (Plan Amendment 2).** The Phase 4 `salary_history_pay_slips` table captures per-payslip breakdown amounts (`shift_allowance`, `base_hourly`, `overtime_1_5x`, `overtime_2_0x`, `holiday_leave_loading`, `holiday_pay`, `public_holiday`, `payg_withholding`, `superannuation_guarantee`) and per-payslip hours (`personal_leave_hours`, `holiday_leave_accrual_hours`) as first-class columns rather than as a separate deductions table or as cumulative balance columns. The normalized design means each row's earnings breakdowns sum toward its `gross`, and `gross − payg_withholding = net` (with `superannuation_guarantee` paid on top, not deducted from net). Per-period aggregates like YTD gross, total PAYG, total super are computed on demand via `PayService.aggregateYearToDate()` rather than stored — the user's xlsx shows cumulative values, but the import script converts them to per-payslip deltas via `delta_t = cumulative_t − cumulative_{t-1}` before insertion. See Plan Amendment 2 header above for the full column rationale and design assumptions.

**Reasoning:** Validating at the boundary means the SQL builder never has to defensively re-check. The vision mandates Zod for runtime type-safety (`project_vision.md:83`); generating Zod schemas from a declarative table manifest keeps the contract in one place — the manifest.

**Why declarative in the manifest, not a separate SQL file:** SQLite DDL would mean two sources of truth (the manifest for validation, the SQL for the schema). Generating both from the manifest keeps them in sync. Migrations are still SQL (Decision 7); the manifest describes runtime validation, migrations describe schema evolution.

**Alternatives considered:**

- **Zod schemas hand-written per extension.** Repetitive, drift-prone.
- **JSON Schema + Ajv.** Vision reserves Ajv for settings schemas, not table schemas. Two validators, two mental models.
- **TypeScript types only, no runtime validation.** Vision's "schema-validated APIs" principle is violated.

**Trade-off:** The manifest grows by ~30 lines per table. Extension authors accept that cost for the schema-bound DAO safety net.

---

### Decision 4: Shared Accounts Schema Lives in Core, Not in an Extension

**Choice:** The `accounts` table is owned by **Core** — its manifest is hard-coded in `src/main/services/shared-data-tables.ts` alongside the `SHARED_FINANCIAL_DATA_TABLES` constant. The Phase 4 migration `003-shared-accounts` creates the table; Core's migration runner applies it on startup. Salary History **reads** accounts via the DAO (allowlisted) but **cannot write to them** — the DAO blocks writes to any table outside an extension's own namespace prefix.

```ts
// Phase 4 ships this minimal accounts schema. Phase 5 may extend (account_type, opening_balance, etc.).
{
  name: 'accounts',
  columns: [
    { name: 'id',            type: 'integer', primary: true, autoIncrement: true },
    { name: 'name',          type: 'text',    nullable: false },
    { name: 'institution',   type: 'text',    nullable: true },
    { name: 'is_active',     type: 'boolean', nullable: false, default: true },
    { name: 'created_at',    type: 'datetime',nullable: false, default: 'now' }
  ]
}
```

**Reasoning:** Vision Issue #23 established the Shared Financial Data layer (Platform-owned canonical records). Accounts is the first such record Phase 4 needs. Vision says: *"Extensions may read these but may not modify them directly"* (`project_vision.md:264`). The implementation design spec explicitly lists Accounts as Shared Financial Data (`docs/superpowers/specs/2026-06-13-implementation-design.md` line 122). Putting the schema in Core means a future "Accounts" Core Extension (Phase 5+) can take over the write surface with no schema migration.

**Alternatives considered:**

- **Salary History owns `accounts`.** Wrong per the vision. Extensions don't own Shared Financial Data.
- **A dedicated "Accounts" Core Extension owns it now.** Phase 5 work — over-engineering for one table with two columns.
- **Make accounts private to salary-history.** Defeats the Shared Financial Data architecture; Phase 5 Dashboard would have to re-fetch from each extension's private copy.

**Trade-off:** A future Accounts extension needs to know the schema. The constant in Core is the single source of truth — the Accounts extension reads from there, doesn't redeclare.

---

### Decision 5: PayService Is an Internal Phase 4 Helper (Not `finance.services.*`)

**Choice:** PayService (payslip validation, net/gross reconciliation, pay-period math, year-to-date aggregation) lives as a plain TypeScript module inside the salary-history extension:

```
extensions/salary-history/
  src/
    services/
      pay-service.ts           # validatePayslipInput(), calculateNetFromGross(), aggregateYearToDate()
    dao/
      pay-slips.ts             # thin wrapper around finance.db.table('salary_history_pay_slips')
    ui/
      payslip-form.ts          # Lit element
      payslip-list.ts          # Lit element
      accounts-seed-modal.ts   # Lit element
    main.ts                    # entry: activate() wires DAO → services → UI → finance.commands.registerCommand
```

> `[Plan Amendment 1]` Directory tree no longer includes `deduction-service.ts`, `dao/deductions.ts`, or `ui/deductions-view.ts`.

The `finance.services.*` cross-extension contract **does not exist** in Phase 4 — the spec lists PayService as a Phase 4 deliverable but `finance.services.*` is a Phase 5 architectural decision (introduces the "Core Extensions as Services" pattern from `project_vision.md:107-117`). Phase 4 keeps PayService internal so the extension can demonstrate the use cases (validation, aggregation) without prematurely locking a cross-extension contract.

**Reasoning:** The Phase 3 handoff doc (`docs/phase3-handoff.md` "What Was NOT Decided" #4) flagged Domain Services ownership as unresolved. Prematurely exposing `finance.services.pay.validatePayslip()` when no second consumer exists means we ship an API that may need to change the moment a Budget extension wants to call it. Phase 4 ships the **value** (working validation + aggregation) without the **lock-in** (cross-extension surface).

**When does PayService graduate to `finance.services.*`?** Phase 5 introduction criteria:
- A second extension (likely Budget) wants to call `pay.getYearToDate(incomeType)` for budget forecasting.
- Dashboard wants `pay.getLatestPayslip()` for the Net Worth view.
- Cash Flow wants `pay.getMonthlySeries(financialYear)` for forecast charts.
- The interface has stabilised through internal use.

**Phase 5 design note (added by Plan Amendment 1):** The first version of `finance.services.pay.*` will be **designed from the consumer side** — by what Phase 5's Cash Flow / Dashboard / Budget actually need to call — not derived from PayService's current internal surface. PayService's internals are throwaway; the public API gets shaped by Phase 5's call sites. This avoids two failure modes: (a) shipping an internal-shape API that Phase 5 consumers find awkward; (b) over-investing in the current `aggregateYearToDate(payslips, financialYearStart)` signature when Phase 5 consumers will want aggregations at the database layer, not on pre-fetched JS lists.

**Alternatives considered:**

- **Ship `finance.services.pay.*` now.** Premature cross-extension surface. Rejected.
- **Skip PayService entirely.** Spec requires it for Phase 4 (validation + aggregation are user-visible in the salary-history UI). Rejected.
- **PayService lives in Core as a Core Extension.** Same problem as above (Core Extensions are Phase 5 architecture).

**Trade-off:** Salary History has to maintain PayService. That's the correct cost — it's domain logic for the salary-history domain. The risk that the internal surface diverges from what `finance.services.pay.*` eventually becomes is mitigated by the Phase 5 design note above.

> `[Plan Amendment 1]` Originally Decision 5 covered PayService + DeductionService. DeductionService and `salary_history_deductions` are removed entirely; the deductions concept belongs to the Phase 5+ Tax extension per `project_vision.md:526` (*"deduction records ledger"*).

---

### Decision 6: JSON-RPC Protocol — New `extension.readTable` / `extension.writeTable` Methods

**Choice:** Extend the Phase 3 JSON-RPC envelope with two new request methods (no notification variants — these are all request/response):

| Method | Request | Response |
|--------|---------|----------|
| `extension.readTable` | `{ table: string, op: 'find' \| 'findOne' \| 'count', query: object }` | `{ rows: object[] }` / `{ row: object \| null }` / `{ count: number }` |
| `extension.writeTable` | `{ table: string, op: 'insert' \| 'update' \| 'delete', payload: object, where?: object }` | `{ row?: object, affected: number }` |

Error codes (added to `src/shared/json-rpc.ts`):

| Code | Meaning |
|------|---------|
| `TableNotFound` (-32010) | Table does not exist in the schema registry |
| `TableAccessDenied` (-32011) | Extension cannot access this table (Decision 1) |
| `ValidationFailed` (-32012) | Zod validation rejected the payload |
| `SharedTableReadOnly` (-32013) | Extension tried to write to a shared-data table |

Method names use the same `extension.*` namespace as Phase 3's `extension.executeCommand`. Method enumeration lives in `src/shared/json-rpc-methods.ts` (new) and is imported by both Main and Host.

**Reasoning:** JSON-RPC over MessagePort (ADR-0003) is the right transport; we just expand the method catalogue. Splitting read/write into two methods (vs one `dbCall` method) keeps the audit log clearer and matches VS Code's extension host protocol structure.

**Alternatives considered:**

- **Single `extension.dbCall` method.** Tighter but loses the read/write distinction in audit logs.
- **Streaming results.** `.find()` in Phase 4 returns up to a hard cap of 1,000 rows; streaming is Phase 5+ Dashboard work.
- **Transaction support.** Out of scope — extensions cannot begin transactions in Phase 4. Atomicity is per-call.

**Trade-off:** Two RPC methods to maintain. Worth it for the audit log clarity.

---

### Decision 7: Phase 4 Adds Two New Migrations (Total Reaches 4)

**Choice:** Two new inline migrations:

| # | Name | Adds |
|---|------|------|
| `003-shared-accounts` | `accounts` table (Decision 4) |
| `004-salary-history-pay-slips` | `salary_history_pay_slips` table |

Total: 4 migrations (`001-init-infrastructure`, `002-extension-crash-tracking`, `003-shared-accounts`, `004-salary-history-pay-slips`).

**Reasoning:** ADR-0002 says "more than three migrations" is a trigger to revisit the inline runner. With deductions removed, Phase 4 lands at 4 migrations — one over the trigger but well within the "all Core-owned, all simple DDL" sweet spot. Decision 8 evaluates the runner choice and resolves to stay inline.

> `[Plan Amendment 1]` Originally Decision 7 added three migrations including `005-salary-history-deductions`. That migration is removed; total goes 5 → 4.

**Migration runner behaviour:** unchanged from Phase 2 — registered via `registerMigration({ name, up })`, applied in order at `initializeDatabase()` time, recorded in `migration_log`. Each Phase 4 migration declares its table DDL inline (no separate SQL files). The `down` callback remains intentionally absent per ADR-0002.

**Alternatives considered:**

- **One migration per extension.** Future-proof for extension-shipped migrations, but Phase 4's two extensions are bundled — Core still ships the migrations.
- **Squash into one `003-phase4-shared-and-extension` migration.** Loses the per-table audit trail.

**Trade-off:** Five migrations is just over the ADR-0002 trigger threshold. Decision 8 handles it.

---

### Decision 8: Keep Inline Migration Runner (Threshold Softly Crossed)

**Choice:** Continue using inline migrations per ADR-0002. Phase 4 takes us from 2 to 5 migrations — two over the original "more than three" trigger, well under the revised "~10" threshold. The threshold is **not** a hard rule; it is a signal to *evaluate*. The evaluation:

| Question | Answer |
|----------|--------|
| Are 5 migrations unmanageable as inline code? | No — each is ~30 lines of DDL. |
| Does an extension need to ship its own migration independently? | Not yet — Phase 4's one extension (salary-history) ships with Core. Phase 8 (marketplace) is when extensions need independent migrations. |
| Does a production user need DB downgrade support? | No. |
| Is multi-version compatibility a requirement? | No. |

None of ADR-0002's triggers are *actually* tripped at 5 migrations. The threshold language ("more than three") is conservative; "five, all simple DDL, all Core-owned" is still well within the inline runner's sweet spot. The "real" trigger (extension-shipped migrations) lands in Phase 8. Decision: stay inline. **Re-evaluate when extension-shipped migrations become a Phase 8 requirement.**

**Reasoning:** Switching to Umzug now would be YAGNI. The inline runner is ~80 lines and the cost of switching is real (every migration would have to be re-expressed as an Umzug-compatible file). Wait until the trigger fires.

**Action:** Update ADR-0002's "Revisit triggers" section to reflect Phase 4's evaluation:

> *Phase 4 evaluation (2026-07-05, post-Plan Amendment 3): 5 migrations (2 → 5). All Core-owned, all simple DDL. Re-evaluate at Phase 8 (extension-shipped migrations) per the original "extension needs to ship a migration independent of Core releases" trigger. Threshold language loosened from "more than three" to "more than ~10, OR an extension ships its own migration".*

This is a minor ADR amendment, not a new ADR. Recorded in `docs/decisions/0002-inline-migrations.md` as an addendum.

> `[Plan Amendment 1]` Originally Decision 8 evaluated 5 migrations ("Document the Threshold Crossing"). With deductions removed by Amendment 1, Phase 4 went to 4 — title softened to "Threshold Softly Crossed".

> `[Plan Amendment 3]` Decision 8 now evaluates 5 migrations again — `005-salary-history-rate-history` adds a third new Phase 4 migration. Total still well under the revised "~10" threshold. No threshold-language change needed.

---

### Decision 9: Multi-File Extension Authoring — `finance` as a TypeScript Type-Only Import

**Choice:** Phase 3 established `activate(finance)` parameter injection as the runtime contract (Decision 9 of Phase 3). Phase 4 extends this for **multi-file TypeScript** extensions by publishing a type-only SDK:

```ts
// extensions/salary-history/src/main.ts
import type { FinanceApi } from 'finance';   // ← type-only import, erased at compile time

export async function activate(finance: FinanceApi): Promise<void> {
  const { db, commands } = finance;
  // ... real salary-history code ...
}
```

Implementation:

1. **`finance.d.ts` becomes a real published type package.** The current `src/types/finance.d.ts` is the canonical type declaration. Add a `tsconfig.paths` entry (`"finance": ["./src/types/finance.d.ts"]`) so the extension's TypeScript compilation can resolve `import type { FinanceApi } from 'finance'`. The `vite.extensions.config.ts` build configures `tsconfigPath` so Vite's TS compiler uses the same path mapping.
2. **Type-only imports are erased.** Because the import is `import type`, no runtime `require()` / `import()` resolves the `'finance'` specifier at bundle time. The bundle stays clean — no phantom `finance` module shipped with the extension.
3. **Runtime stays parameter injection.** The Extension Host still calls `activate(finance)` where `finance` is the runtime API object. No module-loader hooks, no Node resolver games.

```ts
// Why this works:
// - "import type" is a TypeScript-only construct. tsc + esbuild strip it.
// - At runtime, the bundle has zero reference to "finance" — the parameter is the only API surface.
// - The type import gives extension authors IntelliSense and compile-time errors without bundling cost.
```

**Reasoning:** Phase 3 Decision 9 explicitly deferred this to "the first multi-file extension" — that extension is Salary History. The handoff doc (`docs/phase3-handoff.md` "Open Questions for Future Phases" #1) listed three options: (a) Node loader hook, (b) Vite alias, (c) SDK package. Option (c) with a *type-only* SDK is the cleanest:

- No Node loader hook (no `register()` call at startup, no `process.versions.node` magic).
- No Vite alias runtime hack (the alias resolves at TS compile, not at JS runtime).
- Extension authors get full type safety across files (`finance.db.table('X').find(...)` is typed end-to-end).
- Bundle output stays clean — `finance.d.ts` is compile-time only.

**Verification:** A simple grep test — `grep -r "from 'finance'" dist/extensions/` should return **zero** matches (type-only imports must be stripped from the bundle). Add this as a unit test in `tests/unit/build/extensions-bundle.test.ts`.

**Alternatives considered:**

- **Node loader hook (`register('finance', ...)`).** Runtime cost on every Host cold start; couples the Host to a custom loader; obscures what's running. Rejected.
- **Vite alias to a JS stub that re-exports the parameter.** Defeats the point — at runtime the parameter IS the API; aliasing to a JS module that exports `null` would break.
- **No SDK at all — pure parameter injection forever.** Works but extension authors writing multi-file extensions must re-declare the `FinanceApi` type in every file. That's the original Phase 3 problem we deferred. Rejected.

**Trade-off:** One new path-mapping in `tsconfig.json` (and matching Vite config). Tiny cost.

---

### Decision 10: Salary History Extension Becomes a Multi-File Structure

**Choice:** Replace the Phase 3 single-file stub (`extensions/salary-history/src/main.ts`, ~30 lines) with the multi-file structure shown in Decision 5. The Vite bundling pipeline (`vite.extensions.config.ts` per ADR-0004) already supports multi-file via `rollupOptions.input` — the config picks up all `.ts` files under `extensions/salary-history/src/` as one entry chunk.

**Reasoning:** Salary History is non-trivial enough to warrant separation: DAO (data access), services (business logic), UI (renderer code), and the entry point. Putting it all in one file is the kind of code smell that breeds 1000-line `main.ts` files by Phase 8. Multi-file proves the bundling infrastructure handles real extensions.

**Alternatives considered:**

- **Keep single file with internal modules.** Vite doesn't split the output, so internal modules aren't separately importable — this is just code organisation, not architectural structure. The DAO/service/UI split is real and benefits from separate files.
- **Two separate extensions (Payslips, Accounts).** Over-fragmented; each would need its own manifest, activation, IPC overhead. Rejected.

**Trade-off:** More files to navigate. Offset by clearer ownership boundaries.

> `[Plan Amendment 1]` Originally Decision 10 listed "Three separate extensions (Payslips, Deductions, Accounts)" as a rejected alternative. With deductions removed from Phase 4, the alternative becomes "Two separate extensions (Payslips, Accounts)". The multi-file decision is unchanged.

---

### Decision 11: Phase 4 UI Mounts as Lit Elements in the Workspace Area (Stop-Gap for Phase 5 Webviews)

**Choice:** Phase 4 renders the Salary History UI (payslip form, list) as Lit elements mounted directly into the renderer DOM inside the workspace area. There is **no iframe**, no separate process — the Lit element runs in the same renderer process as the rest of the shell. The renderer's "active view" switch (`src/renderer/index.ts`) mounts/unmounts the salary-history Lit element when the user activates the view.

> `[Plan Amendment 1]` Decision 11 wording no longer mentions deductions UI.

```ts
// src/renderer/views/salary-history-view.ts (NEW)
import { LitElement, html } from 'lit';

export class SalaryHistoryView extends LitElement {
  // ... payslip form, list, YTD summary footer ...
}

// src/renderer/index.ts
if (view === 'salary-history') {
  workspace.replaceChildren(document.createElement('salary-history-view'));
}
```

The extension's `src/ui/*` Lit elements are **shared source files** — bundled once as part of the extension's bundle, then imported by the renderer via a new IPC handshake that asks the extension for its UI assets.

**Reasoning:** WebviewPanels are a Phase 5 deliverable (`project_vision.md:241`). Phase 4 cannot ship UI without rendering somewhere. The cheapest viable option is direct mounting, which is also the only option that does not require a new IPC contract for sandboxed iframe creation.

**Security note:** Phase 4's direct-mount approach is acceptable because the UI code is bundled at build time (ADR-0004) — there is no runtime untrusted code from a third-party marketplace. The renderer is still safe (extensions cannot run arbitrary JS in the renderer). When the marketplace ships (Phase 8), WebviewPanels with proper sandboxing become mandatory.

**Alternatives considered:**

- **Render into the navigation panel.** Too cramped for a form + list.
- **Skip UI entirely; users enter payslips via SQL.** Violates the user-visible deliverable.
- **Roll WebviewPanels into Phase 4.** Scope creep — Phase 5 already owns split-screen + tabs + webviews. Combining them makes Phase 4 too large.

**Trade-off:** Phase 4's UI is not sandboxed. Phase 5 will replace this mechanism with proper WebviewPanels. The Lit elements themselves port unchanged.

---

### Decision 12: Renderer Cannot Drive `executeCommand` for Phase 4 Mutations; New Direct IPC for Extension UI

**Choice:** Phase 4 introduces a new IPC channel pair — `extensions:ui-mount` (Main → Renderer push) and `extensions:ui-event` (Renderer → Main push) — that lets an extension's UI emit domain events (e.g. "payslip form submitted with payload X") without going through the command-execution path.

```ts
// Renderer (the Lit element)
this.dispatchEvent(new CustomEvent('payslip-create', {
  detail: { account_id: 1, gross: 5000, pay_date: '2026-01-15' },
  bubbles: true, composed: true
}));

// Workspace index.ts catches it:
workspace.addEventListener('payslip-create', (e) => {
  window.financeShell.extensions.dispatchEvent('salary-history', 'payslip-create', e.detail);
});

// Main receives via 'extensions:ui-event' and routes to the Host's writeTable RPC.
```

This is the renderer→extension writeback channel. The existing `executeCommand` path (Phase 3) remains for keyboard-palette-driven commands; the new `ui-event` path is for in-UI mutations.

**Reasoning:** The Phase 3 review (`docs/phase3-plan-review.md` §3.7) flagged the "renderer can drive any command" concern as Phase 5 hardening. Phase 4 needs a writeback channel for the form anyway — we introduce the dedicated channel now so Phase 5 can add the per-extension allowlist on top of an already-narrowed surface.

**Alternatives considered:**

- **Reuse `executeCommand` for UI events.** Conflates "user invoked a command via keyboard" with "UI form submitted". Audit log noise.
- **Direct WebviewPanel IPC.** Phase 5 work; Phase 4 doesn't have webviews.

**Trade-off:** One new IPC channel pair. The audit log gets a clear separation between keyboard-driven and UI-driven extension activity.

---

### Decision 13: Phase 4 Adds the Salary-History Settings Namespace

**Choice:** Salary History registers settings via `financeExtension.contributes.configuration`:

```jsonc
{
  "configuration": {
    "title": "Salary History",
    "properties": {
      "salary-history.defaultCurrency": {
        "type": "string",
        "default": "AUD",
        "enum": ["AUD", "USD", "EUR", "GBP", "NZD", "CAD"]
      },
      "salary-history.financialYearStart": {
        "type": "string",
        "default": "07-01",
        "description": "MM-DD; financial year start month and day"
      },
      "salary-history.paygToleranceDollars": {
        "type": "number",
        "default": 5.00,
        "description": "Max acceptable $ difference between derived PAYG (gross - net) and ATO weekly tax estimate before warning"
      },
      "salary-history.paygTaxYear": {
        "type": "string",
        "default": "2026-2027",
        "description": "ATO weekly tax table year; bracketed tables keyed by this value"
      },
      "salary-history.financeYear": {
        "type": "string",
        "description": "Default FY label (e.g. FY2025-2026) pre-filled in new payslip forms; auto-computed from current date + financialYearStart at app boot if unset"
      },
      "salary-history.sectionOrder": {
        "type": "array",
        "default": ["period", "earnings", "deductions", "super", "leave", "notes"],
        "description": "Form section render order; editable via [Reorder Sections] modal (Decision 15)"
      }
    }
  }
}
```

> `[Plan Amendment 3]` `paygToleranceDollars`, `paygTaxYear`, `financeYear`, and `sectionOrder` are added. `defaultCurrency` and `financialYearStart` are unchanged from the original.

Phase 4 **does not** render the generic settings UI (that is Phase 7 work per Phase 3 Self-Review §7). The settings are persisted and retrievable via `finance.settings.get('salary-history.financeYear')` so the extension can read them at activation, but the Settings Activity Bar button still shows the Phase 1 hardcoded "App Preferences / Manage Extensions" placeholder. The payslip form's `[ Reorder Sections ]` button is the only Phase 4 settings UI.

**Reasoning:** Proves the settings-namespacing mechanism (`project_vision.md:46` — settings keys prefixed with extension id) works end-to-end with a real extension. Phase 7 will add the UI on top.

**Alternatives considered:**

- **Skip settings entirely.** Cheaper but defers proving the namespacing enforcement.
- **Ship the settings UI now.** Phase 7 work; too much scope.

**Trade-off:** Settings are persisted but no UI (except the reorder modal). Acceptable for Phase 4.

### Decision 14: Calculation Model — Minimal Inputs, Derived Breakdown (Plan Amendment 3)

**Choice:** Per-payslip inputs are minimal: `pay_date`, `gross`, `net`. All 9 monetary breakdown fields and `payg_withholding` are derived by `PayService.calculatePaySlipBreakdown(pay_date, gross, net, hours?, rateRow, settings)`. PAYG validation is user-triggered via a `[ Validate PAYG ]` button that calls `payg-calc.ts` and displays the result inline.

**Form structure:**
- **Always-visible:** `pay_date`, `finance_year`, `gross`, `net`, `pay_period_start`, `pay_period_end`, `account`, `notes`
- **Collapsed by default:** "This week was different" toggle → 6 hour fields (`regular_hours`, `shift_hours`, `overtime_1_5_hours`, `overtime_2_0_hours`, `holiday_hours`, `public_holiday_hours`)
- **Read-only preview:** 9 derived monetary breakdowns + reconciliation warnings
- **Inline:** `payg_withholding` (derived from gross − net), `superannuation_guarantee` (derived from gross × rate)
- **Button:** `[ Validate PAYG ]` (inline in Deductions section; see Decision 14 rationale below)

**Calculation formulas:**

```ts
// Lookup rate row effective at payslip's pay_date
function calculatePaySlipBreakdown(
  payDate: string,
  gross: number,
  net: number,
  hours: PaySlipHours | null,    // null = use defaults
  rateRow: RateRow,
  settings: Settings
): PaySlipBreakdown {
  const h = hours ?? {
    regular_hours: rateRow.standard_hours_per_week,
    shift_hours: 0,
    overtime_1_5_hours: 0,
    overtime_2_0_hours: 0,
    holiday_hours: 0,
    public_holiday_hours: 0,
  };
  return {
    base_hourly:           h.regular_hours         * rateRow.base_hourly_rate,
    shift_allowance:       h.shift_hours           * rateRow.base_hourly_rate * rateRow.shift_allowance_multiplier,
    overtime_1_5x:         h.overtime_1_5_hours    * rateRow.base_hourly_rate * rateRow.overtime_1_5_multiplier,
    overtime_2_0x:         h.overtime_2_0_hours    * rateRow.base_hourly_rate * rateRow.overtime_2_0_multiplier,
    holiday_pay:           h.holiday_hours         * rateRow.base_hourly_rate,
    holiday_leave_loading: h.holiday_hours         * rateRow.base_hourly_rate * rateRow.holiday_leave_loading_rate,
    public_holiday:        h.public_holiday_hours  * rateRow.base_hourly_rate,
    payg_withholding:      Math.max(0, gross - net),
    superannuation_guarantee: gross * rateRow.superannuation_rate,
  };
}
```

**Reconciliation (inline warnings, non-blocking):**
- Sum of earnings (base + shift + OT1.5 + OT2.0 + holiday_pay + holiday_leave_loading + public_holiday) vs `gross` → warn if `|Δ| > settings.paygToleranceDollars`
- Derived PAYG vs ATO estimate (via `[ Validate PAYG ]` button) → warn if `|Δ| > settings.paygToleranceDollars`

**Override rules:**
- Each breakdown field can be user-overridden (write directly to the column); the override value is stored as-is and not re-derived on subsequent reads.
- If user overrides `payg_withholding` or `superannuation_guarantee`, the column stores the override value, not the derived value. This is how the xlsx's historical 50 rows import (their breakdown values are preserved exactly).

**Reasoning:** This inverts the CRUD-first design toward a derivation-first design. The user's xlsx tracks 50 weekly payslips where the breakdown fields are derived values (rate × hours), not user-entered facts. By making the form minimal (3 inputs), the user enters the facts they actually know (what the payslip shows) and the system derives everything else. This minimizes data-entry error, keeps the breakdown consistent with the rates, and matches the way the user works.

**Alternatives considered:**
- **Full CRUD entry of all 22 fields** — rejected. Too many fields, error-prone, doesn't match the user's mental model.
- **Hybrid entry with all fields visible** — rejected. Clutters the form.
- **Auto-calculate `payg_withholding` from `CALCULATE_TAX_WITHHELD_26_27(gross)` instead of `gross − net`** — rejected. PAYG = gross − net is the canonical Australian payroll relationship (assuming no other deductions like salary sacrifice, HELP debt, child support garnishee). The ATO function is used for **validation only**.

**Trade-off:** The form requires an accurate rate_history row effective at the `pay_date`. If the user enters a back-dated payslip without first creating a rate row for that era, the calculations use the current rate (wrong historical fidelity). Mitigations: (a) user can override individual breakdown fields to fix the row in the short term; (b) user adds a historical rate row in the rate history view (Decision 17) for the long term; (c) the `[ Validate PAYG ]` button flags obvious rate-period mismatches.

### Decision 15: Reorderable Form Sections (Plan Amendment 3)

**Choice:** The form sections can be reordered by the user. The order is persisted via the `salary-history.sectionOrder` settings key (JSON array of section IDs). Default order: `["period", "earnings", "deductions", "super", "leave", "notes"]`.

**Section IDs and contents:**

| Section ID | Fields rendered |
|---|---|
| `period` | `pay_date`, `finance_year`, `pay_period_start`, `pay_period_end`, `account` |
| `earnings` | (read-only preview) `base_hourly`, `shift_allowance`, `overtime_1_5x`, `overtime_2_0x`, `holiday_pay`, `holiday_leave_loading`, `public_holiday` |
| `deductions` | (read-only) `payg_withholding` + `[ Validate PAYG ]` button + result display |
| `super` | (read-only) `superannuation_guarantee` |
| `leave` | (collapsed by default) 6 hour fields under "this week was different" toggle; `personal_leave_hours`; `holiday_leave_accrual_hours` |
| `notes` | `notes` (free text) |

**Implementation:**
- `salary-history.sectionOrder` settings key (already in Decision 13's configuration)
- Form component reads the setting on mount; falls back to the default if unset
- `[ Reorder Sections ]` button in the form header → opens `reorder-sections-modal.ts` (new)
- Modal shows up/down arrows per section; user reorders; on save, writes back via `finance.settings.set('salary-history.sectionOrder', JSON.stringify(newOrder))`
- Settings table namespace enforcement (already enforced by Phase 2's SettingsService) ensures only salary-history can read/write this key

**Reasoning:** Different users have different workflows. Some start with pay date; others want to start with gross/net; others want leave first (if they're filling in leave-heavy weeks). Reordering puts the most-used section first without forcing one workflow on everyone.

**Alternatives considered:**
- **Hardcoded layout** — rejected. Doesn't accommodate different workflows.
- **Drag-and-drop reorder** — deferred to Phase 7+. Up/down arrows are sufficient for Phase 4 and avoid pulling in a drag-drop library.
- **Per-account section ordering** — rejected for Phase 4. Settings table is single-user for now; multi-account ordering is a Phase 7+ concern.

**Trade-off:** Per-user only (settings table is single-user in Phase 4). Multi-user / multi-account ordering is a future enhancement.

### Decision 16: Rate History as a First-Class Table (Plan Amendment 3)

**Choice:** A new `salary_history_rate_history` table holds effective-dated rate rows. Only one row has `effective_to = NULL` at any time (the current rate). The calc engine queries this table via `PayRateService.getRateForDate(pay_date)` to find the rate row effective at a given `pay_date`.

**Schema (13 columns):**

```jsonc
{
  "name": "salary_history_rate_history",
  "columns": [
    { "name": "id",                        "type": "integer", "primary": true, "autoIncrement": true },
    { "name": "effective_from",            "type": "date",    "nullable": false, "index": true },
    { "name": "effective_to",              "type": "date",    "nullable": true },
    { "name": "base_hourly_rate",          "type": "real",    "nullable": false, "min": 0 },
    { "name": "standard_hours_per_week",   "type": "real",    "nullable": false, "min": 0, "default": 38 },
    { "name": "shift_allowance_multiplier","type": "real",    "nullable": false, "min": 0, "default": 0.15 },
    { "name": "overtime_1_5_multiplier",   "type": "real",    "nullable": false, "default": 1.5 },
    { "name": "overtime_2_0_multiplier",   "type": "real",    "nullable": false, "default": 2.0 },
    { "name": "superannuation_rate",       "type": "real",    "nullable": false, "default": 0.12 },
    { "name": "holiday_leave_loading_rate","type": "real",    "nullable": false, "default": 0.175 },
    { "name": "notes",                     "type": "text",    "nullable": true },
    { "name": "created_at",                "type": "datetime","nullable": false, "default": "now" },
    { "name": "updated_at",                "type": "datetime","nullable": false, "default": "now" }
  ]
}
```

**Temporal pattern:**
- Adding a new rate row automatically closes the previous current row (sets its `effective_to` to the new row's `effective_from`)
- Lookup query: `SELECT * FROM salary_history_rate_history WHERE effective_from <= :pay_date ORDER BY effective_from DESC LIMIT 1`
- Historical payslips always compute with their era's rates (the rate row that was current at the time)

**DAO service (`PayRateService`):**
- `getRateForDate(pay_date)` — returns the rate row effective at that date
- `getCurrentRate()` — returns the row with `effective_to IS NULL`
- `listAllRates()` — returns all rate rows ordered by `effective_from DESC` (for the rate history view)
- `addNewRate(rate)` — atomically closes the previous current row + inserts the new one (single SQLite transaction)
- `editCurrentRate(rate)` — updates the current row in place (no effective date change)

**Validation rules (`validateRateRow`):**
- `effective_from < effective_to` if both set
- All 7 rate columns ≥ 0
- `superannuation_rate ≤ 1` (sanity; SG above 100% is nonsense)
- Notes ≤ 1000 chars

**Reasoning:** Rates have effective dates — first-class temporal data; settings (JSON) can't represent that cleanly. SQL queries like "what was the rate on 2025-08-15?" become trivial. Audit trail: "when did the hourly rate change from $32 to $35?" DAO namespace enforcement (Decision 1) applies — only salary-history can write to this table.

**Alternatives considered:**
- **Settings blob with effective dates as JSON** — rejected. Query complexity; harder to validate.
- **Versioned settings** — deferred to Phase 5+.
- **Hardcoded rates** — rejected. Rates change with raises; the user's xlsx already shows pay varying significantly across 50 weeks (~$1,500/wk to ~$2,100/wk), implying either rate changes or OT-heavy weeks.

**Migration:** `005-salary-history-rate-history` (new). Migration count: 2 → 3 Phase 4 migrations; total Core 4 → 5. ADR-0002 threshold still well under the revised "~10" trigger.

### Decision 17: Two Commands / Two Views (Plan Amendment 3)

**Choice:** The salary-history extension registers two commands:

| Command ID | Title | View |
|---|---|---|
| `salary.show-pay-history` | `View: Pay History` | `salary-history-view.ts` (existing, enhanced) |
| `salary.show-pay-rate-history` | `View: Pay Rate History` | `pay-rate-history-view.ts` (new) |

Both commands are registered via `financeExtension.contributes.commands`. The Activity Bar stays at one `P` button (pay history). The rate history view is reached via Command Palette only (`Ctrl+Shift+P`).

**Extension manifest commands block:**

```jsonc
"contributes": {
  "commands": [
    { "id": "salary.show-pay-history",       "title": "View: Pay History",        "keybinding": "Ctrl+Shift+H" },
    { "id": "salary.show-pay-rate-history", "title": "View: Pay Rate History",  "keybinding": "Ctrl+Shift+R" }
  ]
}
```

**`pay-rate-history-view.ts` UI:**
- List of all rate rows (newest first), showing: `effective_from`, `effective_to`, all 7 rate columns, `notes`
- "Current" badge on the row with `effective_to IS NULL`
- `[ Add New Rate ]` button → `rate-row-form.ts` (add mode)
- Per-row: `[ Edit ]` (only for the current row, in-place) + `[ View History ]` (read-only history rows)
- Confirmation on add: "Adding this rate will close the current rate (effective_to = ...) — confirm?"

**Why Command Palette only for the second view:**
- The rate history view is an admin/settings surface, not daily-use
- Two Activity Bar buttons crowd the bar
- Discoverability via `Ctrl+Shift+P` (or the `Ctrl+Shift+R` keybinding) is sufficient for an admin surface
- The `Ctrl+Shift+R` keybinding gives keyboard-driven access without taking Activity Bar real estate

**Alternatives considered:**
- **Two Activity Bar buttons (e.g., `P` for pay history, `R` for rate history)** — rejected. Crowds the bar; needs an icon choice; pay history is the primary view; rate history is admin.
- **Sub-nav inside the pay history view** — rejected. Extra clicks; not discoverable.
- **Settings menu (Phase 7+)** — would be a better long-term home; Phase 4 defers this.

**Trade-off:** Users must know to look in the Command Palette (or hit `Ctrl+Shift+R`) for rate history. Phase 7+ might surface it in a settings menu or a dedicated Activity Bar entry.

### Decision 18: UI Design Finalization — Mocks Pre-Approve the Visual Contract (Plan Amendment 4)

**Choice:** The visual design for all 6 UI components is pre-approved via 8 static HTML/CSS mockups at `docs/design/salary-history-mvp/`. Task 11 implementation must match the mocks; any deviation is a design review. The mocks surfaced one structural correction — gross/net must be **user inputs** in a dedicated Totals section, not derived — and that correction is captured here.

**Form structure (final, 7 sections):**

| # | Section | Always visible? | Inputs | Derived from |
|---|---|---|---|---|
| 1 | **Period** | yes | `pay_date`, `finance_year` (dropdown, auto-prefilled), `account` | `pay_period_start/end` auto-derived from `pay_date` |
| 2 | **Totals** (NEW per Amendment 4) | yes | `gross` ($), `net` ($) | nothing — these are the 2 of the 3 minimal inputs |
| 3 | **Earnings (derived)** | yes | — | rate row × hours; 7 monetary fields |
| 4 | **Deductions** | yes | — | `payg_withholding` = gross − net; `[ Validate PAYG ]` button calls `payg-calc.validatePayg` |
| 5 | **Super** | yes | — | `superannuation_guarantee` = gross × sg_rate |
| 6 | **Leave** | collapsed by default | toggle "This week was different" reveals 6 hour inputs + 2 leave fields | — |
| 7 | **Notes** | yes | free text | — |

**Total user inputs:** 7 (pay_date, finance_year, account, gross, net, hours-on-demand, notes) — but only 3 are required: `pay_date`, `gross`, `net`.

**Section order** (`salary-history.sectionOrder` setting, default): `["period","totals","earnings","deductions","super","leave","notes"]`. Updated from Amendment 3's `["period","earnings","deductions","super","leave","notes"]` — the Totals section is now between Period and Earnings.

**Reconciliation warning (inline, non-blocking):**
- Computed inline as: `sum_earnings = base_hourly + shift_allowance + overtime_1_5x + overtime_2_0x + holiday_pay + holiday_leave_loading + public_holiday`
- Triggered when `|gross − sum_earnings| > paygToleranceDollars` (default $5.00)
- Displayed as an **amber callout banner** above the Earnings section, showing the full breakdown + Δ
- Offers 4 actions: "Verify hours below ↴" (scroll to Leave section), "Add bonus line" (future `other_earnings` column — not in Phase 4), "Accept mismatch" (save as-is), "Cancel"
- Acknowledged that 3 of 4 actions are stubs in Phase 4 — the **functional** action is "Verify hours" (scroll + let user edit hours). The other three buttons are reserved for future enhancements.

**PAYG validation flow:**
- User clicks `[ Validate PAYG ]` button (not auto-triggered on every keystroke — explicit action)
- `payg-calc.validatePayg(gross, net, taxYear, paygToleranceDollars)` returns `{ derivedPayg, atoEstimate, difference, tolerance, withinTolerance, taxYear }`
- Result displayed inline below the button as a green/red result card
- Green (`withinTolerance`): "✓ PAYG within tolerance" + Δ detail
- Red (out of tolerance): "⚠ PAYG differs from ATO estimate" + Δ detail + suggestion to check the entered net

**Rate history view (`pay-rate-history-view.ts`):**
- List of all rate rows ordered `effective_from DESC`
- Each row: Status badge ("Current" if `effective_to IS NULL`, else "History"), `effective_from`, `effective_to`, all 7 rate columns, `notes`, Actions
- Current row has green left border; history rows neutral
- Actions per row:
  - **Current row:** `[ Edit ]` only (in-place edit)
  - **History rows:** `[ View ]` only (read-only)
- `[ + Add New Rate ]` button in topbar opens `rate-row-form.ts` with a confirmation panel:
  > "Adding this rate will close the current rate. The current rate (effective from X) will have its effective_to set to Y. Historical payslips keep using the closed rate; new payslips from Y onward use the new rate."
- Confirmation flow: Confirm & Save | Cancel

**Rate row form (`rate-row-form.ts`):**
- Form fields: `effective_from`, `effective_to` (optional, leave blank for open-ended current), the 7 rate columns, `notes`
- Pre-fills from current rate (Amendment 4 adds this UX nicety: the form loads with current rate values, user edits only what changed)
- Validation via `PayRateService.validateRateRow` (Decision 16):
  - `effective_from < effective_to` if both set
  - All 7 rates ≥ 0
  - `SG ≤ 1` (sanity)
- Visual cue for changed fields: amber border on the field label

**Reorder sections modal (`reorder-sections-modal.ts`):**
- Backdrop + centered modal
- List of 7 section IDs with up/down arrow buttons per row
- First row: ▲ disabled (already first), ▼ enabled
- Last row: ▲ enabled, ▼ disabled
- First row gets green left border; last row gets purple left border
- "Reset to default" button restores `["period","totals","earnings","deductions","super","leave","notes"]`
- Save writes JSON-encoded array to `salary-history.sectionOrder` via `finance.settings.set(...)`

**Accounts seed modal (`accounts-seed-modal.ts`):**
- Triggered on first activation when `accounts` table is empty
- Modal with welcome icon, title "Welcome to Salary History", intro text, form fields
- Form fields: `account.name` (required, default "Primary Salary"), `account.institution` (optional)
- 3 actions:
  - **Skip for now** — dismiss; user can create accounts later from the Accounts section
  - **Cancel** — dismiss; modal reappears on next activation (one-shot gate)
  - **Create Account** — inserts row into `accounts` table with `is_active=true`, then opens the payslip form

**Dark theme consistency:**
- All mocks use the Obsidian dark palette: page `#1e1e1e`, panel `#252526`, border `#3e3e3e`, text `#d4d4d4`, accent `#007acc`, success `#4ec9b0`, warning `#cca700`, destructive `#f48771`
- Lit components should use CSS custom properties defined in `:host` to apply the same tokens inside shadow DOM (mocks use literals because they're not shadow-DOM isolated)

**Visual review checklist (run before Task 11 implementation):**
- [ ] User has approved all 8 mocks (recorded as Plan Amendment 4 — done)
- [ ] Section order default updated to include `totals`: `["period","totals","earnings","deductions","super","leave","notes"]`
- [ ] Reconciliation warning threshold = `paygToleranceDollars` setting (default $5.00)
- [ ] PAYG validation triggers on user button click (not on every keystroke)
- [ ] All 6 UI components reference the mocks for their visual implementation
- [ ] Shadow DOM uses CSS custom properties for the dark theme tokens (not hard-coded literals)
- [ ] Form layout is mobile-friendly at ≥768px width (mockups assume desktop ≥960px; mobile is Phase 7+)

**Alternatives considered:**
- **Skip the mocks, design during implementation.** Rejected — the user explicitly asked for a "moment to see UI design" before Task 11, which is the right discipline. Catching layout issues in HTML is much cheaper than catching them after Lit components are written.
- **Single combined HTML page with all views as collapsible sections.** Rejected — separate files per view make them reviewable individually, diffable, and reusable in implementation references.
- **Use a real component library (Storybook, Histoire).** Deferred to Phase 7+ — Phase 4 just needs static previews; a full component library is over-investment.

**Trade-off:** The mocks are a snapshot at the time of design. If implementation discovers a layout issue that wasn't visible in HTML (e.g. Lit reactivity edge case, browser-specific CSS quirk), the implementation must surface the issue back here rather than silently deviate. The mocks remain the canonical visual contract until Task 11 ships.

> `[Plan Amendment 4]` Decisions 1-17 unchanged. Plan Amendment 1's removals, Amendment 2's column additions, and Amendment 3's calculation model all stand. The mocks are a pre-implementation design artifact — no architectural decisions flipped.

---

## File Structure

```
finance-flow-ai/
|-- docs/
|   `-- superpowers/
|       `-- plans/
|           `-- 2026-07-04-phase4-shared-financial-data-salary-history.md   ← this file
|-- src/
|   |-- main/
|   |   |-- main.ts                              (modified) — boot migrations 003-005, wire new IPC handlers
|   |   `-- services/
|   |       |-- database-service.ts              (modified) — register 003-005 in the inline migration list
|   |       |-- infrastructure-migration.ts      (modified) — append migration bodies 003/004/005
|   |       |-- shared-data-tables.ts            (new) — SHARED_FINANCIAL_DATA_TABLES constant + accounts manifest
|   |       |-- table-schema-registry.ts         (new) — loads extension `tables[]` manifests, generates Zod schemas
|   |       |-- dao-service.ts                   (new) — find/findOne/insert/update/delete/count, namespace enforcement, prepared statements
|   |       |-- extension-ipc.ts                 (modified) — handle `extension.readTable` / `extension.writeTable` requests
|   |       `-- extension-loader.ts              (modified) — load extension `tables[]` into TableSchemaRegistry on activation
|   |-- extension-host/
|   |   |-- host.ts                              (modified) — readTable / writeTable RPC dispatch
|   |   `-- api/
|   |       |-- db.ts                            (modified) — replace Phase 3 stub with real DAO calls
|   |       `-- index.ts                         (modified) — surface readTable / writeTable on the API
|   |-- preload/
|   |   `-- preload.ts                           (modified) — expose extensions.uiEvent(name, detail) + extensions.onUiMount(callback)
|   |-- renderer/
|   |   |-- index.ts                             (modified) — mount/unmount extension views, route ui-event to IPC
|   |   `-- views/
|   |       `-- salary-history-view.ts           (new) — Lit element that hosts the extension's UI bundle
|   |-- shared/
|   |   |-- extension-constants.ts               (modified) — add new path constants for the DAO service module
|   |   |-- json-rpc.ts                          (modified) — add TableNotFound / TableAccessDenied / ValidationFailed / SharedTableReadOnly error codes
|   |   |-- json-rpc-methods.ts                  (new) — extension.readTable / extension.writeTable method-name constants
|   |   `-- dao-schema.ts                        (new) — buildColumnZodSchema(), serializeRow(), SUPPORTED_COLUMN_TYPES
|   `-- types/
|       |-- finance.d.ts                         (modified) — FinanceApi.db is now TableAccessor (not empty stub)
|       `-- finance-shell.d.ts                   (modified) — ExtensionsApi.uiEvent / onUiMount; remove phase3 placeholder
|-- extensions/
|   `-- salary-history/
|       |-- package.json                         (modified) — adds tables[] (2 entries: salary_history_pay_slips with 29 columns + salary_history_rate_history with 13 columns), configuration[] (6 keys: defaultCurrency, financialYearStart, paygToleranceDollars, paygTaxYear, financeYear, sectionOrder), commands[] (2 entries: salary.show-pay-history, salary.show-pay-rate-history), financeExtension.main
|       `-- src/
|           |-- main.ts                          (modified) — real activate() implementation; mounts UI, wires both commands (salary.show-pay-history, salary.show-pay-rate-history)
|           |-- services/
|           |   |-- pay-service.ts               (new) — validatePayslipInput, calculatePaySlipBreakdown, aggregateYearToDate, validateFinanceYear (extended per Amendment 3)
|           |   |-- pay-rate-service.ts           (new) — getRateForDate, getCurrentRate, listAllRates, addNewRate, editCurrentRate; DAO wrapper for salary_history_rate_history (Decision 16)
|           |   |-- payg-calc.ts                  (new) — validatePayg(gross, net, taxYear, tolerance) returning PaygValidationResult; wraps CALCULATE_TAX_WITHHELD_26_27 (Decision 14)
|           |   `-- payg-brackets.ts               (new) — getBracketsForYear(year) returning ATO weekly tax brackets for FY 2026-2027 + future years
|           |-- dao/
|           |   |-- pay-slips.ts                 (new) — typed wrapper around finance.db.table('salary_history_pay_slips') with 29 columns
|           |   `-- pay-rate-history.ts           (new) — typed wrapper around finance.db.table('salary_history_rate_history') with 13 columns
|           `-- ui/
|               |-- payslip-form.ts              (new) — Lit element; minimal entry (date + gross + net) + collapsible hours toggle + derived breakdown preview + [Validate PAYG] button (Decision 14)
|               |-- payslip-list.ts              (new) — Lit element; paginated table + YTD summary footer
|               |-- accounts-seed-modal.ts       (new) — Lit element; first-run account creation
|               |-- pay-rate-history-view.ts     (new) — Lit element; rate history list view (current + history rows); reached via salary.show-pay-rate-history command (Decision 17)
|               |-- rate-row-form.ts             (new) — Lit element; add/edit a rate row form (Decision 17)
|               `-- reorder-sections-modal.ts    (new) — Lit element; modal with up/down arrows to reorder form sections; persists via salary-history.sectionOrder setting (Decision 15)
|-- tests/
|   |-- unit/
|   |   |-- main/services/
|   |   |   |-- dao-service.test.ts              (new) — namespace enforcement (10 tests)
|   |   |   |-- shared-data-tables.test.ts       (new) — constant + accounts manifest (4 tests)
|   |   |   `-- table-schema-registry.test.ts    (new) — Zod schema generation per column type (12 tests)
|   |   |-- shared/
|   |   |   |-- dao-schema.test.ts               (new) — buildColumnZodSchema, serializeRow (10 tests)
|   |   |   `-- json-rpc-methods.test.ts         (new) — method-name constants (3 tests)
|   |   `-- extensions-build/
|   |       `-- extensions-bundle.test.ts        (new) — grep assertion: no `from 'finance'` in built dist/ (3 tests, see Decision 9)
|   |-- unit/extension-host/api/
|   |   `-- db.test.ts                           (new) — DAO surface from the Host's perspective (8 tests, stub Main)
|   |-- unit/extensions/salary-history/
|   |   |-- pay-service.test.ts                  (new) — validation + breakdown calculation + aggregation (16 tests; +4 for new breakdown + finance_year validation paths from Amendment 3)
|   |   |-- pay-rate-service.test.ts             (new) — DAO CRUD + temporal logic (addNewRate closes previous current row; getRateForDate temporal lookup) (10 tests)
|   |   |-- payg-calc.test.ts                    (new) — bracket boundaries + tolerance validation + edge cases (zero, negative, mid-bracket) (12 tests)
|   |   |-- payg-brackets.test.ts                (new) — year lookup; unknown year throws; FY 2026-2027 returns 9 brackets (4 tests)
|   |   `-- dao/
|   |       |-- pay-slips.test.ts                (new) — integration with DAO stub (12 tests; +4 for new hour/finance_year columns)
|   |       `-- pay-rate-history.test.ts         (new) — rate_history DAO integration (insert + temporal close + getRateForDate) (6 tests)
|   `-- e2e/
|       `-- salary-history.spec.ts               (new) — 6 E2E tests under Playwright-electron (still gated by Phase 3 env blocker)
|-- docs/decisions/
|   `-- 0002-inline-migrations.md                (modified) — Phase 4 evaluation addendum (Decision 8)
|-- docs/file-reference.md                       (modified) — Phase 4 section added
|-- CHANGELOG.md                                 (modified) — Phase 4 plan entry under `### Administrative`
`-- package.json                                 (modified) — none (no new runtime deps; Phase 4 uses existing better-sqlite3, zod, lit)
```

**Net new runtime code:** ~1,900 lines (DAO + registry + PayService + PayRateService + PAYG validation + 6 UI components; +500 from Amendment 3). **Net new test code:** ~750 lines (~119 new unit tests; +40 from Amendment 3, ~16 removed from the original ~95 total). **Modified code:** ~300 lines across existing files (IPC expansion, migration registration, type contract expansion, multi-file extension setup).

> `[Plan Amendment 1]` Removed files: `extensions/salary-history/src/services/deduction-service.ts`, `extensions/salary-history/src/dao/deductions.ts`, `extensions/salary-history/src/ui/deductions-view.ts`, `tests/unit/extensions/salary-history/deduction-service.test.ts`, and (a pre-existing inconsistency in the original File Structure diagram now resolved) the implied `tests/unit/extensions/salary-history/dao/deductions.test.ts` from the Test Plan table. Migration count updates: 003/004/005 → 003/004 (see Decision 7). Extension `main.ts` no longer wires the `salary.show-deductions` command (see Deliverable). Extension `package.json` `tables[]` block has a single entry instead of two. `payslip-list.ts` gains a YTD summary footer (replaces the deductions sub-view in the Deliverable's user-visible surface).

> `[Plan Amendment 2]` `salary_history_pay_slips` columns: 11 → 22 (11 monetary breakdown columns added). The original Phase 4 plan's column count of 11 is preserved; the 11 added are the breakdown columns from the user's xlsx.

> `[Plan Amendment 3]` Added 6 files: `extensions/salary-history/src/services/pay-rate-service.ts`, `extensions/salary-history/src/services/payg-calc.ts`, `extensions/salary-history/src/services/payg-brackets.ts`, `extensions/salary-history/src/ui/pay-rate-history-view.ts`, `extensions/salary-history/src/ui/rate-row-form.ts`, `extensions/salary-history/src/ui/reorder-sections-modal.ts` (plus matching test files for each new service). Added 1 DAO wrapper: `extensions/salary-history/src/dao/pay-rate-history.ts` (matching `pay-slips.ts` pattern for the new rate_history table). Added 1 migration body `005-salary-history-rate-history`. Migration count: 003/004 → 003/004/005 (see Decision 7). `salary_history_pay_slips` columns: 22 → 29 (+6 hour columns + `finance_year`). `salary_history_rate_history`: NEW table with 13 columns (Decision 16). Two commands: `salary.show-pay-history` (existing) + `salary.show-pay-rate-history` (new, Decision 17). Settings: 4 new keys added (Decision 13 update): `paygToleranceDollars`, `paygTaxYear`, `financeYear`, `sectionOrder`. The Activity Bar stays at one `P` button; the rate history view is reached via Command Palette (`Ctrl+Shift+R`).

> `[Plan Amendment 1]` Removed files: `extensions/salary-history/src/services/deduction-service.ts`, `extensions/salary-history/src/dao/deductions.ts`, `extensions/salary-history/src/ui/deductions-view.ts`, `tests/unit/extensions/salary-history/deduction-service.test.ts`, and (a pre-existing inconsistency in the original File Structure diagram now resolved) the implied `tests/unit/extensions/salary-history/dao/deductions.test.ts` from the Test Plan table. Migration count updates: 003/004/005 → 003/004 (see Decision 7). Extension `main.ts` no longer wires the `salary.show-deductions` command (see Deliverable). Extension `package.json` `tables[]` block has a single entry instead of two. `payslip-list.ts` gains a YTD summary footer (replaces the deductions sub-view in the Deliverable's user-visible surface).

---

## Tasks

### Task 1: Define Shared Financial Data constant + accounts manifest

**Files:** `src/main/services/shared-data-tables.ts` (new), `tests/unit/main/services/shared-data-tables.test.ts` (new)

**Steps:**

- [ ] 1.1 Create `shared-data-tables.ts` exporting:
  - `SHARED_FINANCIAL_DATA_TABLES: readonly ['accounts']` as a `const` tuple.
  - `SHARED_TABLE_MANIFESTS: readonly TableManifest[]` containing the Phase 4 accounts schema (per Decision 4).
  - `TableManifest` / `ColumnManifest` TypeScript interfaces (will be shared with extensions' `tables[]` block).
- [ ] 1.2 Add unit tests:
  - Constant value test (Phase 4 = `['accounts']`).
  - `SHARED_TABLE_MANIFESTS` contains `accounts` with the documented columns.
  - All required columns (`id`, `name`, `is_active`, `created_at`) present with correct types.
  - No extensions prefix on shared tables (they are not namespaced).

**Verification:** `npm run test:unit -- shared-data-tables.test.ts` → 4 tests pass. `npm run typecheck` exit 0.

---

### Task 2: Generate Zod schemas from TableManifest

**Files:** `src/shared/dao-schema.ts` (new), `tests/unit/shared/dao-schema.test.ts` (new)

**Steps:**

- [ ] 2.1 Implement `buildColumnZodSchema(column: ColumnManifest): z.ZodTypeAny` per the type table in Decision 3. Apply `nullable()`, `min`, `max`, `default` as declared.
- [ ] 2.2 Implement `buildTableZodSchema(table: TableManifest): { insert: z.ZodObject<...>, update: z.ZodObject<...> }` — insert schema rejects `id` / `created_at` / `updated_at` (auto-generated); update schema accepts any subset of user-mutable columns.
- [ ] 2.3 Implement `serializeRow(row: unknown): Record<string, JsonValue>` — converts SQLite `Date` objects to ISO-8601 strings, asserts no `BigInt` / `Buffer` / `undefined` slip through.
- [ ] 2.4 Export `SUPPORTED_COLUMN_TYPES: readonly ['integer', 'real', 'text', 'date', 'datetime', 'boolean']`.
- [ ] 2.5 Add unit tests covering all 6 column types, nullable variants, min/max constraints, default values, and `serializeRow` edge cases (Date, BigInt rejection, nested object).

**Verification:** `npm run test:unit -- dao-schema.test.ts` → 10 tests pass.

---

### Task 3: Implement TableSchemaRegistry

**Files:** `src/main/services/table-schema-registry.ts` (new), `tests/unit/main/services/table-schema-registry.test.ts` (new)

**Steps:**

- [ ] 3.1 Implement `TableSchemaRegistry` class with:
  - `registerExtensionTables(extensionId: string, tables: TableManifest[]): void` — registers tables; throws if a table name is already registered (idempotency check) or does not match `<extensionId>_*` prefix.
  - `registerSharedTables(manifests: readonly TableManifest[]): void` — registers shared tables; throws on duplicates.
  - `getInsertSchema(table: string): z.ZodObject<...>` / `getUpdateSchema(table: string): z.ZodObject<...>`.
  - `getColumnNames(table: string): readonly string[]`.
  - `isSharedTable(table: string): boolean`.
  - `getOwnerExtension(table: string): string | 'shared'` — returns the owning extension id or `'shared'`.
- [ ] 3.2 Add unit tests:
  - Extension registers tables; second registration of same table throws.
  - Table name not matching `<extensionId>_*` throws.
  - Shared table registration succeeds.
  - `getOwnerExtension` returns correct owner.
  - Schema lookup for unknown table throws.
  - 12 total tests.

**Verification:** `npm run test:unit -- table-schema-registry.test.ts` → 12 tests pass.

---

### Task 4: Register Phase 4 migrations

**Files:** `src/main/services/infrastructure-migration.ts` (modified), `src/main/services/database-service.ts` (modified)

**Steps:**

- [ ] 4.1 Append three new migration bodies to `infrastructure-migration.ts`:
  - `003-shared-accounts` — `CREATE TABLE accounts (...)`.
  - `004-salary-history-pay-slips` — `CREATE TABLE salary_history_pay_slips (...)` with FK to `accounts.id`. Includes all 29 columns per Decision 14 (4 identity/period + 1 finance_year + 3 totals + 9 monetary breakdowns + 6 hour inputs + 2 leave + notes + 2 timestamps).
  - `005-salary-history-rate-history` — `CREATE TABLE salary_history_rate_history (...)` with 13 columns per Decision 16.
- [ ] 4.2 Register all three in `database-service.ts`'s migration list (in order, after `002-extension-crash-tracking`).
- [ ] 4.3 Manual smoke test: delete the user's `finance.db`, boot the app, confirm all 5 migrations apply, open the DB in a SQLite browser and confirm the three new tables exist with the correct columns and indexes.

**Verification:** `npm run test:unit -- database-service.test.ts` still passes (idempotency). Add 3 new tests asserting each migration body runs without error on a fresh DB.

---

### Task 5: Implement DAOService (read/write enforcement)

**Files:** `src/main/services/dao-service.ts` (new), `tests/unit/main/services/dao-service.test.ts` (new)

**Steps:**

- [ ] 5.1 Implement `DAOService` class with constructor `(db: Database, registry: TableSchemaRegistry)`. Methods:
  - `find<T>(callerExtensionId: string, table: string, query: object, options?: { limit?: number; offset?: number }): T[]` — uses prepared statements; throws `TableAccessDenied` if `callerExtensionId` does not own the table (and it's not shared).
  - `findOne<T>(callerExtensionId: string, table: string, query: object): T | null`
  - `count(callerExtensionId: string, table: string, query: object): number`
  - `insert<T>(callerExtensionId: string, table: string, payload: object): T` — validates against insert schema, returns inserted row with `id` / `created_at` / `updated_at` populated.
  - `update(callerExtensionId: string, table: string, where: object, payload: object): number` — validates payload against update schema, auto-updates `updated_at`.
  - `delete(callerExtensionId: string, table: string, where: object): number`
- [ ] 5.2 Implement the query operator translator (`compileQuery(table: string, query: object): { sql: string, params: unknown[] }`) supporting all 7 operators from Decision 2.
- [ ] 5.3 Implement namespace enforcement: `callerExtensionId === tableOwner || isSharedTable(table)`. Otherwise throw `TableAccessDenied` (JSON-RPC error code -32011).
- [ ] 5.4 Implement shared-table read-only enforcement: if `isSharedTable(table)` and the op is `insert`/`update`/`delete`, throw `SharedTableReadOnly` (-32013). `find`/`findOne`/`count` allowed.
- [ ] 5.5 Add unit tests:
  - Namespace enforcement: extension X cannot read extension Y's table.
  - Shared table: extension can read but not write.
  - Operator coverage: $eq, $gt, $like, $in, $isNull, $or.
  - Validation failure: invalid payload throws `ValidationFailed`.
  - Insert returns row with generated id + timestamps.
  - Update affects correct row count, updates `updated_at`.
  - Delete returns affected count.
  - SQL injection attempt via `$like` parameter is parameterised (not concatenated).
  - 10 tests minimum.

**Verification:** `npm run test:unit -- dao-service.test.ts` → 10+ tests pass.

---

### Task 6: Wire DAO into ExtensionIPC + JSON-RPC protocol

**Files:** `src/shared/json-rpc-methods.ts` (new), `src/shared/json-rpc.ts` (modified), `src/main/services/extension-ipc.ts` (modified), `src/extension-host/host.ts` (modified), `tests/unit/shared/json-rpc-methods.test.ts` (new)

**Steps:**

- [ ] 6.1 Create `json-rpc-methods.ts` with constants:
  ```ts
  export const RPC_METHOD = {
    ExtensionReadTable: 'extension.readTable',
    ExtensionWriteTable: 'extension.writeTable',
    // ... existing Phase 3 methods ...
  } as const;
  ```
- [ ] 6.2 Add 4 new error codes to `json-rpc.ts`: `TableNotFound`, `TableAccessDenied`, `ValidationFailed`, `SharedTableReadOnly` per Decision 6.
- [ ] 6.3 In `extension-ipc.ts`, add `setDAOService(dao: DAOService)` method. Add handlers for the two new RPC methods that:
  - Parse the request payload.
  - Validate the table name (via `TableSchemaRegistry`).
  - Dispatch to `DAOService` with the caller extension's id (extracted from the RPC context).
  - Return serialised rows.
- [ ] 6.4 In `extension-host/host.ts`, add handlers for the same two RPC methods that proxy through to Main (Phase 3's pattern for `extension.executeCommand`).
- [ ] 6.5 Add unit tests for `json-rpc-methods.ts` (3 tests) and JSON-RPC envelope shape for new error codes (4 tests added to existing `json-rpc.test.ts`).

**Verification:** `npm run test:unit -- json-rpc` → existing tests still pass; new tests pass.

---

### Task 7: Replace `finance.db.table()` stub with real DAO

**Files:** `src/extension-host/api/db.ts` (modified), `src/extension-host/api/index.ts` (modified), `tests/unit/extension-host/api/db.test.ts` (new)

**Steps:**

- [ ] 7.1 Replace the empty-queryable stub in `db.ts` with a real implementation that:
  - On instantiation, the Host receives the extension's id (from the activation context).
  - `finance.db.table(name)` returns a `TableAccessor` object whose methods (`find`, `insert`, etc.) call `extension.readTable` / `extension.writeTable` RPCs and return the results.
  - All methods are `async` (cross-process RPC).
- [ ] 7.2 Update `api/index.ts` so the `db` surface reflects the real implementation.
- [ ] 7.3 Add unit tests:
  - `table('foo').find({})` calls the right RPC method with the right payload.
  - `table('foo').insert({...})` validates input client-side before sending RPC.
  - `table('foo').findOne({})` returns null when the RPC returns null.
  - Error responses (`TableAccessDenied`, `ValidationFailed`) propagate as typed errors.
  - 8 tests minimum, stubbing the RPC layer.

**Verification:** `npm run test:unit -- db.test.ts` → 8 tests pass.

---

### Task 8: Add table manifest to `FinanceExtensionManifest` type contract

**Files:** `src/types/finance.d.ts` (modified), `src/extension-host/manifest-schema.ts` (modified), `tests/unit/extension-host/manifest-schema.test.ts` (modified)

**Steps:**

- [ ] 8.1 Add `TableManifest`, `ColumnManifest` types to `finance.d.ts` per Decision 3.
- [ ] 8.2 Extend `FinanceExtensionManifest` with optional `tables?: readonly TableManifest[]` and `configuration?: ConfigurationManifest` (already declared as stub; flesh out per Decision 13).
- [ ] 8.3 Update Zod schema in `manifest-schema.ts` to validate `tables[]` and `configuration` shapes.
- [ ] 8.4 Add 5 new unit tests for table manifest validation (valid manifest, missing required columns, invalid column type, invalid default, no prefix match).

**Verification:** `npm run test:unit -- manifest-schema.test.ts` → existing 10 + 5 new tests pass.

---

### Task 9: Extension Loader registers tables on activation

**Files:** `src/main/services/extension-loader.ts` (modified), `src/main/main.ts` (modified)

**Steps:**

- [ ] 9.1 In `extension-loader.ts`, when an extension is activated, call `tableSchemaRegistry.registerExtensionTables(extensionId, manifest.tables ?? [])`.
- [ ] 9.2 In `main.ts`, instantiate `TableSchemaRegistry` + `DAOService` before the boot sequence, register shared tables from `shared-data-tables.ts`.
- [ ] 9.3 Pass `DAOService` to `extension-ipc.ts` via the new `setDAOService` method (Task 6).
- [ ] 9.4 Manual test: start the app with a malformed `tables[]` block in the salary-history manifest; confirm the loader skips the extension with the existing "invalid manifest" warning (Zod validation), not a runtime crash.

**Verification:** App boots, salary-history extension loads, no console warnings.

---

### Task 10: Build the salary-history extension's DAO + service layer

**Files:** `extensions/salary-history/src/dao/pay-slips.ts` (new), `extensions/salary-history/src/dao/pay-rate-history.ts` (new), `extensions/salary-history/src/services/pay-service.ts` (new), `extensions/salary-history/src/services/pay-rate-service.ts` (new), `extensions/salary-history/src/services/payg-calc.ts` (new), `extensions/salary-history/src/services/payg-brackets.ts` (new), `tests/unit/extensions/salary-history/*.test.ts` (new)

**Steps:**

- [ ] 10.1 Implement `dao/pay-slips.ts`:
  - `listPaySlips(finance, { from?, to?, accountId?, financeYear? }): Promise<PaySlip[]>` (added `financeYear` filter per Amendment 3)
  - `createPaySlip(finance, input: PaySlipInput): Promise<PaySlip>` (validates via PayService)
  - `updatePaySlip(finance, id: number, patch: Partial<PaySlipInput>): Promise<void>`
  - `deletePaySlip(finance, id: number): Promise<void>`
  - `PaySlipInput` type includes all 29 columns per Decision 14: id, account_id, pay_period_start, pay_period_end, pay_date, finance_year, gross, net, currency, the 9 monetary breakdowns, the 6 hour inputs, the 2 leave fields, notes.
- [ ] 10.2 Implement `dao/pay-rate-history.ts` (new per Amendment 3, Decision 16):
  - `getRateForDate(finance, payDate: string): Promise<RateRow | null>` — temporal lookup
  - `getCurrentRate(finance): Promise<RateRow | null>` — the row with `effective_to IS NULL`
  - `listAllRates(finance): Promise<RateRow[]>` — all rows ordered `effective_from DESC`
  - `addNewRate(finance, rate: RateRowInput): Promise<void>` — atomic transaction: closes previous current row + inserts new one
  - `editCurrentRate(finance, patch: Partial<RateRowInput>): Promise<void>` — in-place update of current row
- [ ] 10.3 Implement `services/pay-service.ts` (extended per Decision 14):
  - `validatePayslipInput(input): { ok: true } | { ok: false, errors: string[] }` — checks gross ≥ 0, net ≤ gross, dates valid, account exists, breakdown ≥ 0.
  - `validateFinanceYear(payDate, financeYear, financialYearStart): { ok: true } | { ok: false, errors: string[] }` (new per Amendment 3) — checks finance_year matches the pay_date + FY start rule.
  - `calculatePaySlipBreakdown(payDate, gross, net, hours | null, rateRow, settings): PaySlipBreakdown` (new per Decision 14) — derives all 9 monetary fields + payg + super from rate row × hours.
  - `calculateNetFromGross(gross, taxRate): number` — retained stub for Phase 6.
  - `aggregateYearToDate(payslips, financialYearStart): { gross, net, count }`.
  - `reconcilePaySlip(breakdown, gross, tolerance): { difference, withinTolerance, warning? }` (new per Decision 14) — inline warning helper.
- [ ] 10.4 Implement `services/pay-rate-service.ts` (new per Decision 16):
  - `validateRateRow(input): { ok: true } | { ok: false, errors: string[] }` — checks effective_from < effective_to if both set; all 7 rates ≥ 0; SG ≤ 1.
  - Re-exports the temporal lookup helpers (or thin wrappers around the DAO methods).
- [ ] 10.5 Implement `services/payg-calc.ts` (new per Decision 14):
  - `validatePayg(gross: number, net: number, taxYear: string, toleranceDollars: number): PaygValidationResult` — returns `{ derivedPayg, atoEstimate, difference, tolerance, withinTolerance, taxYear }`.
  - `calculatePaygWeekly(gross: number, taxYear: string): number` — internal helper wrapping `CALCULATE_TAX_WITHHELD_26_27` from `payg-brackets.ts`.
- [ ] 10.6 Implement `services/payg-brackets.ts` (new per Decision 14):
  - `getBracketsForYear(year: string): Bracket[]` — returns ATO weekly tax brackets; Phase 4 hardcodes FY 2026-2027 (9 brackets); throws on unknown year (future-friendly).
  - `BRACKETS_2026_27: readonly Bracket[]` — the user's CALCULATE_TAX_WITHHELD_26_27 bracket data.
- [ ] 10.7 Add unit tests:
  - `pay-service.test.ts` (16 tests, +4 from Amendment 3): validation passes/fails on each rule, breakdown calculation for each derived field, aggregate handles empty list, financial year wrap-around, finance_year validation.
  - `pay-rate-service.test.ts` (10 tests): DAO CRUD + temporal logic (addNewRate closes previous current row; getRateForDate temporal lookup).
  - `payg-calc.test.ts` (12 tests): bracket boundaries + tolerance validation + edge cases (zero, negative, mid-bracket).
  - `payg-brackets.test.ts` (4 tests): year lookup; unknown year throws; FY 2026-2027 returns 9 brackets.
  - `dao/pay-slips.test.ts` (12 tests, +4 from Amendment 3): integration with stubbed `finance` (DAO stub) for 29 columns.
  - `dao/pay-rate-history.test.ts` (6 tests): rate_history DAO integration (insert + temporal close + getRateForDate).

**Verification:** `npm run test:unit -- salary-history` → 60 tests pass (was 20 after Amendment 1; +40 from Amendment 3).

> `[Plan Amendment 1]` Removed `dao/deductions.ts`, `services/deduction-service.ts`, `deduction-service.test.ts`, and `dao/deductions.test.ts`. Test count: 36 → 20.

> `[Plan Amendment 3]` Added 3 new service modules (`pay-rate-service.ts`, `payg-calc.ts`, `payg-brackets.ts`), 1 new DAO wrapper (`pay-rate-history.ts`), and 3 new test files. PayService gained `calculatePaySlipBreakdown`, `validateFinanceYear`, and `reconcilePaySlip`. PaySlipInput type expanded from 11 → 29 columns. Test count: 20 → 60.

---

### Task 11: Build the salary-history UI components (Lit)

**Files:** `extensions/salary-history/src/ui/payslip-form.ts` (new), `extensions/salary-history/src/ui/payslip-list.ts` (new), `extensions/salary-history/src/ui/accounts-seed-modal.ts` (new), `extensions/salary-history/src/ui/pay-rate-history-view.ts` (new), `extensions/salary-history/src/ui/rate-row-form.ts` (new), `extensions/salary-history/src/ui/reorder-sections-modal.ts` (new). **Visual contract:** `docs/design/salary-history-mvp/` (8 HTML mocks, pre-approved via Plan Amendment 4 / Decision 18). Implementation must match the mocks; any deviation is a design review.

**Steps:**

- [ ] 11.0 **Visual review of mocks** (per Decision 18 checklist): open each mock in `docs/design/salary-history-mvp/`, walk through the flow, confirm all 7 visual-review checks in Decision 18 pass before writing any Lit code.
- [ ] 11.1 `payslip-form.ts` (rewritten per Decision 14, refined per Decision 18):
  - 7 sections rendered per `salary-history.sectionOrder` setting (default: `period`, `totals`, `earnings`, `deductions`, `super`, `leave`, `notes`).
  - **Period section** (always visible): `pay_date`, `finance_year` (dropdown, auto-prefilled from settings), `account`. `pay_period_start/end` auto-derived from `pay_date`.
  - **Totals section** (always visible, NEW per Amendment 4 — the 2 of the 3 minimal user inputs): `gross` ($), `net` ($).
  - **Earnings section** (read-only preview, derived): 9 monetary breakdowns + reconciliation warning if sum-of-earnings ≠ gross by > tolerance.
  - **Deductions section**: `payg_withholding` (derived = gross − net) + `[ Validate PAYG ]` button + result display (inline amber/green callout).
  - **Super section**: `superannuation_guarantee` (derived = gross × rate).
  - **Leave section** (collapsed by default): "This week was different" toggle → expands to show 6 hour inputs (`regular_hours`, `shift_hours`, `overtime_1_5_hours`, `overtime_2_0_hours`, `holiday_hours`, `public_holiday_hours`) + 2 leave fields (`personal_leave_hours`, `holiday_leave_accrual_hours`).
  - **Notes section**: free text (used to record "back-pay from June" or similar reconciliation context).
  - Visual reference: `docs/design/salary-history-mvp/payslip-form-collapsed.html` (default), `payslip-form-expanded.html` (toggle on), `payslip-form-reconciled.html` (warning state).
  - Submit dispatches a `payslip-create` custom event with the payload.
  - Inline validation matches `PayService.validatePayslipInput` and `validateFinanceYear`.
- [ ] 11.2 `payslip-list.ts`:
  - Table of payslips (pay_date, finance_year, gross, net, account, hours).
  - Sortable by pay_date (default DESC) and gross.
  - YTD summary footer (green border, always visible): aggregate of `{ gross, net, payg, super, count }` from `PayService.aggregateYearToDate()` over the active financial year.
  - Top-of-page summary bar (4 KPI tiles): YTD Gross, YTD Net, Count, Avg / Week.
  - Edit button populates the form (parent re-renders).
  - Delete button confirms then dispatches `payslip-delete`.
  - Pagination: 15 rows/page default; filter button exposes FY / account / date-range filtering.
  - Visual reference: `docs/design/salary-history-mvp/payslip-list.html`.
- [ ] 11.3 `accounts-seed-modal.ts`:
  - On first activation, if `accounts` table is empty, prompt the user to create one (name, institution) or skip.
  - Welcome icon + title "Welcome to Salary History" + intro paragraph + "First-run only" info banner.
  - 3 actions: Skip (dismiss; user can create accounts later), Cancel (dismiss; modal reappears on next activation), Create Account (insert with `is_active=true`, then opens payslip form).
  - Skip is acceptable — the user can create accounts via Phase 5's Accounts extension.
  - Visual reference: `docs/design/salary-history-mvp/accounts-seed.html`.
- [ ] 11.4 `pay-rate-history-view.ts` (new per Decision 17, refined per Decision 18):
  - List of all rate rows ordered `effective_from DESC`.
  - Each row: Status badge ("Current" if `effective_to IS NULL`, else "History"), `effective_from`, `effective_to`, all 7 rate columns, `notes`, Actions.
  - Current row: green left border; history rows: neutral.
  - Per-row actions: `[ Edit ]` on current row only (in-place); `[ View ]` on history rows (read-only).
  - `[ + Add New Rate ]` button in topbar opens `rate-row-form.ts` with confirmation panel.
  - Visual reference: `docs/design/salary-history-mvp/pay-rate-history.html`.
- [ ] 11.5 `rate-row-form.ts` (new per Decision 17, refined per Decision 18):
  - Confirmation panel shown BEFORE the form (inline at top): "Adding this rate will close the current rate" + diff (current vs new) + Confirm/Cancel.
  - Form fields: `effective_from`, `effective_to` (optional, leave blank for open-ended current), the 7 rate columns, `notes`.
  - Pre-fills from current rate values; changed fields get amber border.
  - Validates via `PayRateService.validateRateRow`.
  - On submit (after Confirm), calls `PayRateService.addNewRate` or `editCurrentRate`.
  - Visual reference: `docs/design/salary-history-mvp/rate-row-form.html`.
- [ ] 11.6 `reorder-sections-modal.ts` (new per Decision 15, refined per Decision 18):
  - Modal listing **7 section IDs** (`period`, `totals`, `earnings`, `deductions`, `super`, `leave`, `notes`) with up/down arrow buttons per row.
  - First row: ▲ disabled (green left border), ▼ enabled.
  - Last row: ▲ enabled, ▼ disabled (purple left border).
  - "Reset to default" button restores `["period","totals","earnings","deductions","super","leave","notes"]`.
  - On save, writes JSON-encoded array via `finance.settings.set('salary-history.sectionOrder', JSON.stringify(newOrder))`.
  - Visual reference: `docs/design/salary-history-mvp/reorder-sections.html`.
- [ ] 11.7 Add unit tests per Lit element:
  - `payslip-form.ts`: 6 tests (renders 7 sections in order, fires payslip-create on submit, calls calculatePaySlipBreakdown on pay_date/gross/net change, Validate PAYG button click triggers payg-calc, section order from settings, finance_year dropdown changes).
  - `payslip-list.ts`: 4 tests (renders list, YTD footer updates, edit populates form, delete dispatches event).
  - `accounts-seed-modal.ts`: 3 tests (renders, creates account, skip dispatches event).
  - `pay-rate-history-view.ts`: 4 tests (renders rate list, current badge, add/edit/view buttons visible).
  - `rate-row-form.ts`: 3 tests (renders fields with current rate pre-fill, validates, submit dispatches add/edit event after confirm).
  - `reorder-sections-modal.ts`: 3 tests (renders 7 section list with up/down, save writes 7-element array to settings).
- [ ] 11.8 **Visual parity check**: after each component is implemented, take a screenshot (or DOM snapshot) and diff against the corresponding mock in `docs/design/salary-history-mvp/`. Any visible regression must be explained before merging.

**Verification:** `npm run build:extensions` produces `dist/extensions/salary-history.js` containing all 6 UI components. Type-check passes. `npm run test:unit` shows 23 UI-component tests passing. **Visual parity:** each component's Lit shadow DOM matches the corresponding mock in `docs/design/salary-history-mvp/` (see Decision 18 visual-review checklist).

> `[Plan Amendment 1]` Removed `ui/deductions-view.ts`. `payslip-list.ts` gains a YTD summary footer (see Deliverable item #2). Lit element count: 4 → 3.

> `[Plan Amendment 3]` Added 3 new UI components: `pay-rate-history-view.ts`, `rate-row-form.ts`, `reorder-sections-modal.ts`. `payslip-form.ts` rewritten with minimal-entry + collapsible hours + derived breakdown preview + Validate PAYG button. Lit element count: 3 → 6. UI test count: +13 (from 12 to 23).

> `[Plan Amendment 4]` (1) Added **Totals** section to `payslip-form.ts` as a 2nd user-input section (gross + net) — these are the 2 of the 3 minimal inputs. Section count went from 6 → 7. (2) `salary-history.sectionOrder` default updated to `["period","totals","earnings","deductions","super","leave","notes"]`. (3) Reconciliation warning design finalized: amber callout banner with 4 action buttons (Verify hours / Add bonus line / Accept mismatch / Cancel). (4) PAYG validation flow confirmed as user-button-triggered (not auto). (5) Rate history view design finalized: Current badge + green left border on current row; Edit on current row only, View on history rows. (6) Rate row form design finalized: pre-fills from current rate; changed fields get amber border. (7) Reorder sections modal design finalized: 7 section IDs with up/down arrows, first row green border, last row purple border, "Reset to default" button. (8) Accounts seed modal design finalized: 3 actions (Skip / Cancel / Create Account) with skip behavior documented. (9) **Visual parity check** added as step 11.8 — each component must match its corresponding mock in `docs/design/salary-history-mvp/`.
### Task 12: Wire the extension entry point

**Files:** `extensions/salary-history/src/main.ts` (rewritten), `extensions/salary-history/package.json` (modified)

**Steps:**

- [ ] 12.1 Rewrite `main.ts`:
  ```ts
  import type { FinanceApi } from 'finance';
  import { listPaySlips, createPaySlip, ... } from './dao/pay-slips.js';
  import { getRateForDate, listAllRates, ... } from './dao/pay-rate-history.js';
  import { validatePayslipInput, calculatePaySlipBreakdown, aggregateYearToDate, validateFinanceYear } from './services/pay-service.js';
  import { validateRateRow } from './services/pay-rate-service.js';
  import { validatePayg } from './services/payg-calc.js';
  import { registerUIComponents } from './ui/index.js';

  export async function activate(finance: FinanceApi): Promise<void> {
    // 1. Load accounts; show seed modal if empty.
    // 2. Seed default rate row if salary_history_rate_history is empty (Decision 16).
    // 3. Auto-compute settings.salary-history.financeYear if unset (from current date + financialYearStart).
    // 4. Register UI components on the host's UI registry (Decision 12).
    // 5. Register commands: salary.show-pay-history, salary.show-pay-rate-history (Decision 17).
    // 6. Set up subscriptions for ui-event back-channel.
  }

  export function deactivate(): void { /* cleanup */ }
  ```

> `[Plan Amendment 1]` Removed `import { addDeduction, ... } from './dao/deductions.js'`. Command list went from 2 to 1: `salary.show-deductions` was dropped.

> `[Plan Amendment 3]` Re-added a second command (`salary.show-pay-rate-history`) and the corresponding `pay-rate-history.js` import. New import for `payg-calc.js` and `pay-rate-service.js`. Activation now also seeds the default rate row and auto-computes the finance_year setting.
- [ ] 12.2 Update `package.json`:
  - Add `tables` block with **two** entries: `salary_history_pay_slips` (29 columns) and `salary_history_rate_history` (13 columns) — per Decisions 3 and 16.
  - Add `commands` block with **two** entries: `salary.show-pay-history` and `salary.show-pay-rate-history` — per Decision 17.
  - Add `configuration` block with all 6 keys: `defaultCurrency`, `financialYearStart`, `paygToleranceDollars`, `paygTaxYear`, `financeYear`, `sectionOrder` — per Decision 13 update.
  - Update `description` to reflect "Phase 4: real implementation with calculation engine, rate history, and second view".
- [ ] 12.3 Manual smoke test:
  - `npm run build:extensions` produces `dist/extensions/salary-history.js`.
  - `grep -r "from 'finance'" dist/extensions/salary-history.js` returns nothing (Decision 9 verification).
  - App boots, salary-history Activity Bar `P` button is clickable, no console errors.
  - Open Command Palette (`Ctrl+Shift+P`), confirm `salary.show-pay-history` and `salary.show-pay-rate-history` both appear.
  - Click `salary.show-pay-rate-history` → rate history view renders (initially with a seeded default rate row).

---

### Task 13: Configure `finance` type-only import in tsconfig + Vite

**Files:** `tsconfig.json` (modified), `vite.extensions.config.ts` (modified), `tests/unit/build/extensions-bundle.test.ts` (new)

**Steps:**

- [ ] 13.1 In `tsconfig.json`, add `paths` mapping:
  ```jsonc
  {
    "compilerOptions": {
      "paths": {
        "finance": ["./src/types/finance.d.ts"]
      }
    }
  }
  ```
- [ ] 13.2 In `vite.extensions.config.ts`, configure `resolve.alias` to map `finance` to `./src/types/finance.d.ts` for editor tooling only (Vite will strip type-only imports during build, but the alias keeps the editor happy).
- [ ] 13.3 Add build test `extensions-bundle.test.ts`:
  - Run `npm run build:extensions` (in `beforeAll`).
  - Assert no `from 'finance'` literal in the output bundle.
  - Assert no `require('finance')` literal.
  - Assert bundle size is < 200 KB (sanity).
  - 3 tests total.

**Verification:** `npm run test:unit -- extensions-bundle` → 3 tests pass.

---

### Task 14: Implement UI mount IPC channel

**Files:** `src/main/main.ts` (modified), `src/main/services/extension-ipc.ts` (modified), `src/preload/preload.ts` (modified), `src/types/finance-shell.d.ts` (modified), `src/renderer/index.ts` (modified), `src/renderer/views/salary-history-view.ts` (new)

**Steps:**

- [ ] 14.1 In `extension-ipc.ts`, add `setUIHandler(handler: (extensionId, mountRequest) => void)` so the renderer can request a UI mount.
- [ ] 14.2 In `main.ts`, when an extension calls `registerUIComponent(componentName, mountFn)`, push a `extensions:ui-mount` notification to the renderer with the component metadata.
- [ ] 14.3 In `preload.ts`, expose:
  - `extensions.onUiMount(callback)` — receive mount requests.
  - `extensions.uiEvent(extensionId, eventName, detail)` — send ui-event back to Main.
- [ ] 14.4 In `finance-shell.d.ts`, add `onUiMount` and `uiEvent` to `ExtensionsApi`.
- [ ] 14.5 In `renderer/index.ts`, on `extensions:ui-mount`, import the extension's UI element dynamically (Decision 11) and mount it in the workspace area.
- [ ] 14.6 Create `salary-history-view.ts` (Lit element) that hosts the extension's UI bundle.
- [ ] 14.7 Add 4 unit tests for the IPC channel pair (mount push, event ack, error path, multiple extensions).

**Verification:** Manual test: clicking the `P` Activity Bar button renders the salary-history form. Typing values and submitting creates a row in `salary_history_pay_slips` (verify via SQLite browser).

---

### Task 15: Update Command Palette to include new commands

**Files:** `src/renderer/components/command-palette.ts` (modified)

**Steps:**

- [ ] 15.1 The existing Phase 3 command `salary.show-pay-history` now executes a real command that switches the workspace view to the salary-history sub-view. Update the command-palette handler to call `workspace.replaceChildren(salaryHistoryView)` instead of `console.log`.
- [ ] 15.2 Manual test: open the Command Palette (Ctrl+Shift+P), type "pay", confirm `salary.show-pay-history` appears under the Extensions group, click it, confirm the salary-history form renders.

**Verification:** Manual test passes; existing E2E test (when unblocked) still passes.

> `[Plan Amendment 1]` Removed `salary.show-deductions` from the command list. The Phase 3 mock extension contributed two commands; Phase 4 ships one.

---

### Task 16: Update extension settings registration + persistence

**Files:** `extensions/salary-history/src/main.ts` (modified), `src/main/services/extension-ipc.ts` (modified)

**Steps:**

- [ ] 16.1 In the extension's `activate()`, read settings via `finance.settings.get('salary-history.defaultCurrency')` and `finance.settings.get('salary-history.financialYearStart')`. Use defaults if unset.
- [ ] 16.2 In `extension-ipc.ts`, expose `extension.setSetting` RPC so the extension can write settings (the settings service already enforces namespace prefixes per Phase 2).
- [ ] 16.3 Manual test: open a SQLite browser, set `salary-history.defaultCurrency = 'USD'`, restart the app, confirm the extension reads 'USD' (e.g. by showing the currency in the payslip form's currency selector).

**Verification:** Settings round-trip works; namespace enforcement prevents salary-history from setting `tax.financialYearStart`.

---

### Task 17: Manual Test Units — Salary History E2E walk-through

**Test Unit 1: First-Run Account Seed** — Open the app fresh (delete `finance.db`), click the `P` Activity Bar icon, confirm the accounts-seed modal appears. Create an account named "Primary Salary". Confirm the modal closes and the payslip form renders with the account in the dropdown.

**Test Unit 2: Create a Payslip** — Fill the form (period 2026-01-01 → 2026-01-15, pay date 2026-01-20, gross 5000, net 3800, account "Primary Salary"). Submit. Confirm the row appears in the list. Open a SQLite browser; confirm the row exists in `salary_history_pay_slips` with the correct `account_id` foreign key.

**Test Unit 3: Edit a Payslip** — Click the Edit button on the row, change gross to 5200, save. Confirm the list re-renders. Verify the SQLite row's `gross` column updated and `updated_at` is newer than `created_at`.

**Test Unit 4: Persistence Across Restart** — Note a payslip's id. Quit the app. Re-open. Click the `P` icon. Confirm the payslip is still in the list.

**Test Unit 5: Year-to-Date Aggregation** — Open a DevTools console in the Renderer (Phase 3 Test Unit 4 plumbing works). Add 3 more payslips for the same financial year (FY starting 2025-07-01 per default settings). Confirm `pay-service.aggregateYearToDate()` returns `{ gross: <sum>, net: <sum>, count: 4 }` (visible via a temporary debug console.log in the extension, or via a manual SQL query in the SQLite browser). The YTD summary footer in `payslip-list.ts` should also render these aggregates.

**Test Unit 6: Namespace Enforcement (Negative Test)** — In DevTools, evaluate `await window.financeShell.extensions.executeCommand('salary-history', 'debug.tryOtherTable', 'budget_items')` (this requires a small helper extension command for the manual test only). Confirm the response is a `TableAccessDenied` error. Remove the debug command after the test.

**Test Unit 7: Shared Accounts Read-Only** — In DevTools, attempt `finance.db.table('accounts').insert({ name: 'evil' })` from a temporary extension that has a manifest read of `accounts`. Confirm the response is a `SharedTableReadOnly` error.

**Test Unit 8: TypeScript Strict + Lint + Tests** — Run `npm run typecheck` (exit 0), `npm run lint` (exit 0), `npm run test:unit` (all ~144 tests pass: 65 Phase 3 + ~79 Phase 4).

**Test Unit 9: Multi-File Build Verification** — Run `npm run build:extensions`. Confirm `dist/extensions/salary-history.js` exists. Run `grep "from 'finance'" dist/extensions/salary-history.js` → exit code 1 (no matches). Confirm bundle size < 200 KB.

> `[Plan Amendment 1]` Test Unit 5 (Deduction Tracking) removed; subsequent units renumbered TU6→TU5, TU7→TU6, TU8→TU7, TU9→TU8, TU10→TU9. Total manual test units: 10 → 9. Test Unit 8's "130+ tests pass" updated to "~144 tests pass" (65 Phase 3 + ~79 Phase 4; old total of 130 was stale; new total reflects 16 deductions-related tests removed).

---

### Task 18: Self-Review Checklist (this plan's §10 below)

- [ ] 18.1 Verify all 17 architecture decisions are reflected in the code.
- [ ] 18.2 Verify all 10 manual test units pass.
- [ ] 18.3 Verify all 60+ new unit tests pass.
- [ ] 18.4 Verify the Self-Review Checklist sections §1–§10.
- [ ] 18.5 Update `docs/file-reference.md` (Task 19).
- [ ] 18.6 Update `CHANGELOG.md` and ADR-0002 addendum (Task 19 + 20).
- [ ] 18.7 Verify the E2E suite (Phase 3's `extension-host.spec.ts` + new `salary-history.spec.ts`) — still gated by environmental blocker; documented in Self-Review.

---

### Task 19: Doc sync — `docs/file-reference.md` + ADR-0002 addendum + CHANGELOG

**Files:** `docs/file-reference.md` (modified), `docs/decisions/0002-inline-migrations.md` (modified), `CHANGELOG.md` (modified)

**Steps:**

- [ ] 19.1 In `docs/file-reference.md`, append a new "## Phase 4 — Shared Financial Data & Salary History Extension (Planned; v0.7.0)" section mirroring the file inventory table from this plan's File Structure section. All files marked `(new)` or `(modified, planned)`.
- [ ] 19.2 In `ADR-0002`, append a Phase 4 evaluation addendum:
  > **Phase 4 evaluation (2026-07-05, post-Plan Amendment 1):** Total migration count 2 → 4. All Core-owned, all simple DDL, all idempotent. None of the original revisit triggers tripped (one over the original "more than three" but well below the revised "~10" threshold). Threshold language in ADR-0002 loosened from "more than three" to "more than ~10 migrations, OR an extension ships its own migration independent of Core releases". Re-evaluate at Phase 8 (marketplace extensions).
- [ ] 19.3 In `CHANGELOG.md`, add a new `## [0.7.0] - TBD` header with subsections:
  - `### Added` — Phase 4 implementation (after implementation lands). For plan creation only: add `### Administrative` entry citing this plan file.

**Verification:** `grep -n "Phase 4" docs/file-reference.md` returns the new section. ADR-0002 contains the addendum text.

---

### Task 20: Plan review handoff

**Files:** `docs/phase4-handoff.md` (new, optional but recommended)

**Steps:**

- [ ] 20.1 If a separate reviewer document is produced for this plan, capture the conversation context and decision rationale in `docs/phase4-handoff.md` following the Phase 3 handoff pattern (`docs/phase3-handoff.md`).
- [ ] 20.2 Update frontmatter `reviewed_by` and `review_date` fields.

---

## Test Plan

### Unit tests (~119 new; project total ~184)

| File | Tests | Covers |
|------|-------|--------|
| `tests/unit/main/services/shared-data-tables.test.ts` | 4 | Constant + accounts manifest |
| `tests/unit/shared/dao-schema.test.ts` | 10 | Zod schema generation + serializeRow |
| `tests/unit/main/services/table-schema-registry.test.ts` | 12 | Registry semantics |
| `tests/unit/main/services/dao-service.test.ts` | 10 | DAO enforcement + queries |
| `tests/unit/shared/json-rpc-methods.test.ts` | 3 | Method-name constants |
| `tests/unit/extension-host/json-rpc.test.ts` (extended) | 4 | New error codes |
| `tests/unit/extension-host/manifest-schema.test.ts` (extended) | 5 | tables[] + configuration validation |
| `tests/unit/extension-host/api/db.test.ts` | 8 | DAO surface from Host |
| `tests/unit/extensions/salary-history/pay-service.test.ts` | 16 | Validation + breakdown calculation + aggregation + finance_year validation (Amendment 3) |
| `tests/unit/extensions/salary-history/pay-rate-service.test.ts` | 10 | DAO CRUD + temporal logic for rate_history (Amendment 3) |
| `tests/unit/extensions/salary-history/payg-calc.test.ts` | 12 | Bracket boundaries + tolerance validation (Amendment 3) |
| `tests/unit/extensions/salary-history/payg-brackets.test.ts` | 4 | Year lookup (Amendment 3) |
| `tests/unit/extensions/salary-history/dao/pay-slips.test.ts` | 12 | DAO integration for 29 columns (Amendment 3: +4) |
| `tests/unit/extensions/salary-history/dao/pay-rate-history.test.ts` | 6 | Rate_history DAO integration (Amendment 3) |
| `tests/unit/build/extensions-bundle.test.ts` | 3 | Decision 9 verification (no `from 'finance'`) |
| **Total** | **~119** | |

> `[Plan Amendment 1]` Removed `deduction-service.test.ts` (10 tests) and `dao/deductions.test.ts` (6 tests). Total new unit tests: ~95 → ~79. Project total (after Phase 4 lands): ~125 → ~144.

> `[Plan Amendment 3]` Added 4 new test files (`pay-rate-service.test.ts`, `payg-calc.test.ts`, `payg-brackets.test.ts`, `dao/pay-rate-history.test.ts`); updated `pay-service.test.ts` (12 → 16, +4 for breakdown calculation + finance_year validation paths) and `dao/pay-slips.test.ts` (8 → 12, +4 for new hour/finance_year columns). Total new unit tests: ~79 → ~119 (+40). Project total (after Phase 4 lands): ~144 → ~184 (+40).

### Manual Test Units (10) — see Task 17 above

### E2E (new; gated by Phase 3 environmental blocker)

`tests/e2e/salary-history.spec.ts` (new, 6 tests):

1. First-run account seed modal appears.
2. Submitting a payslip form creates a DB row.
3. Reload after submission persists the row.
4. Command Palette `salary.show-pay-history` mounts the view.
5. Namespace enforcement returns TableAccessDenied on disallowed access.
6. Shared accounts read-only enforcement returns SharedTableReadOnly on write attempt.

These will be unblocked when the Phase 3 Playwright-electron environmental issue is resolved (tracked separately).

---

## Self-Review Checklist

### §1 — Vision Alignment

- [ ] **project_vision.md:332-337 (Phase 4 roadmap entry)** — implemented per deliverable.
- [ ] **project_vision.md:46 (strict namespace isolation)** — DAO enforces `<extensionId>_*` prefix structurally (Decision 1).
- [ ] **project_vision.md:48 (Do Not Break Other Extensions)** — process isolation from Phase 3; DAO prevents cross-table access; settings namespace prevents cross-setting access.
- [ ] **project_vision.md:78 (JSON-RPC transport)** — ADR-0003 transport reused; new methods added per Decision 6.
- [ ] **project_vision.md:131-152 (Secure Extension API — `finance.db.table()`)** — DAO shape matches Decision 2; no raw SQL; `finance.db.table('name')` access pattern.
- [ ] **project_vision.md:264-284 (Data Architecture / Shared Financial Data)** — Accounts table is Platform-owned; Salary History writes its own namespaced tables; reads Accounts via allowlist (Decision 4).
- [ ] **Vision Issue #1/#3 (raw SQL prohibited)** — DAO emits parameterised SQL only; raw `query()` method never existed (Phase 3 stub returned empty; Phase 4 implements typed accessors).
- [ ] **Vision Issue #23 (Shared Financial Data layer)** — `accounts` is the first such table; allowlist is the mechanism.
- [ ] **Vision Issue #28 (DAO over-engineering for first release)** — `.table('name')` shape; typed DAO generation deferred per `project_vision.md:151` ("Typed, schema-bound DAO generation may be introduced in a future release but is not required for the first production version").

### §2 — Spec Coverage

- [ ] **Implementation Design Phase 4 (lines 121-128):**
  - Shared Financial Data schemas: Accounts ✓. PaySlips ✓ (extension-private, namespaced as `salary_history_pay_slips`). **PaySlips schema expanded by Plan Amendment 2** to include 11 per-payslip breakdown columns (9 monetary, 2 hours) so per-payslip amounts and hours are first-class rather than aggregate-only. **PaySlips schema further expanded by Plan Amendment 3** to include 6 hour-input columns + `finance_year` text column (29 columns total); the rate-history infrastructure for deriving these fields lives in a new `salary_history_rate_history` table (13 columns). See Plan Amendment 2 and Plan Amendment 3 headers for the full column lists and rationale.
  - ~~Deductions~~ — **REMOVED by Plan Amendment 1.** The implementation design spec mentions deductions; Phase 4 reserves that concept for the Phase 5+ Tax extension (which already plans to own a "deduction records ledger" per `project_vision.md:526`). Per-payslip PAYG withholding is captured as the `payg_withholding` column on `salary_history_pay_slips` (Plan Amendment 2) instead. **Plan Amendment 3 adds PAYG validation** via `payg-calc.ts` (wraps user's `CALCULATE_TAX_WITHHELD_26_27`) — the function is invoked via a `[ Validate PAYG ]` button (Decision 14), not auto-applied.
  - `finance.db.table()` API for typed table access (no raw SQL) ✓
  - PayService ✓ (Decision 5, internal helper for Phase 4; **expanded by Decision 14** with `calculatePaySlipBreakdown`, `validateFinanceYear`, `reconcilePaySlip`)
  - ~~DeductionService~~ — **REMOVED by Plan Amendment 1.**
  - Extension UI: payslip entry form (minimal entry + collapsible hours toggle + derived breakdown preview + `[Validate PAYG]` button per Decision 14), salary history list, YTD summary footer, **rate history view** (Decision 17), accounts-seed-modal ✓
  - **Plan Amendment 4 — UI Design Finalization:** 8 HTML/CSS mocks pre-approve the visual contract at `docs/design/salary-history-mvp/` (see Decision 18). Implementation in Task 11 must match the mocks; visual parity check is Task 11.8. The mocks surfaced one structural correction: gross/net are user inputs in a dedicated **Totals** section between Period and Earnings (form now has 7 sections, not 6; `salary-history.sectionOrder` default updated accordingly).
  - Deliverable: fully functional salary history UI with persistent storage ✓ + **second view (rate history) reachable via Command Palette** (Decision 17)

### §3 — Carries-forward from Phase 3 (explicit deferrals resolved)

- [ ] **Phase 3 Self-Review §7 — `finance.db.table()` stub → real DAO.** Implemented in Task 5/6/7. **RESOLVED.**
- [ ] **Phase 3 Decision 9 — canonical import pattern.** Resolved in Task 13 (type-only SDK). **RESOLVED.**
- [ ] **Phase 3 handoff doc open question #1 (import mechanism).** Resolved by Decision 9. **RESOLVED.**
- [ ] **Phase 3 handoff doc open question #2 (bundling).** Already resolved by ADR-0004 in Phase 3. Multi-file structure exercises it in Task 12.
- [ ] **Phase 3 handoff doc open question #4 (Domain Service ownership).** Resolved in Decision 5 — internal helpers in Phase 4; cross-extension `finance.services.*` is Phase 5.

### §4 — Architecture Decision Coverage

- [ ] Decision 1 (table boundary enforcement) — Task 1/3/5.
- [ ] Decision 2 (DAO API shape) — Task 5/7.
- [ ] Decision 3 (Zod schemas from manifest) — Task 2/3/8.
- [ ] Decision 4 (Accounts owned by Core) — Task 1/4.
- [ ] Decision 5 (PayService as internal helper; DeductionService removed per Plan Amendment 1) — Task 10.
- [ ] Decision 6 (JSON-RPC method expansion) — Task 6.
- [ ] Decision 7 (**3** new migrations — Amendment 3 adds 005) — Task 4.
- [ ] Decision 8 (stay inline; **5 migrations** after Amendment 3, well under revised ~10 threshold) — Decision 8 itself + Task 19 ADR addendum.
- [ ] Decision 9 (type-only SDK for multi-file) — Task 13.
- [ ] Decision 10 (multi-file extension structure; **6 UI components** after Amendment 3) — Task 10/11/12.
- [ ] Decision 11 (Lit elements in workspace, not webview) — Task 14.
- [ ] Decision 12 (UI event IPC channel) — Task 14.
- [ ] Decision 13 (settings namespace registered; **6 keys** after Amendment 3: defaultCurrency, financialYearStart, paygToleranceDollars, paygTaxYear, financeYear, sectionOrder) — Task 16.
- [ ] **Decision 14 (Calculation Model — minimal inputs, derived breakdown; PAYG validation)** — **Plan Amendment 3** — Task 10 (PayService extension) + Task 11 (payslip-form rewrite) + Task 12 (entry point).
- [ ] **Decision 15 (Reorderable Form Sections — sectionOrder setting + modal)** — **Plan Amendment 3** — Task 11 (reorder-sections-modal) + Task 10 (setting key in Decision 13).
- [ ] **Decision 16 (Rate History as a First-Class Table — `salary_history_rate_history` 13 columns; temporal pattern)** — **Plan Amendment 3** — Task 4 (migration 005) + Task 10 (pay-rate-service) + Task 11 (rate-row-form) + Task 12 (seed default rate on activation).
- [ ] **Decision 17 (Two Commands / Two Views — pay-history existing + pay-rate-history new)** — **Plan Amendment 3** — Task 11 (pay-rate-history-view) + Task 12 (register both commands in main.ts).

### §5 — Test Pyramid

- [ ] ~119 new unit tests (all deterministic, fast, isolated via Phase 3's `getTestDatabase()` factory). **+40 from Plan Amendment 3** (4 new test files + extensions to 2 existing files).
- [ ] 9 manual test units covering the full user journey.
- [ ] **Plan Amendment 4 — visual review step:** before Task 11 implementation starts, walk through the 8 HTML mocks in `docs/design/salary-history-mvp/` (per Decision 18 visual-review checklist). After each component is implemented, take a DOM snapshot and diff against the corresponding mock — any visible regression must be explained before merging (Task 11.8).
- [ ] 6 new E2E tests written but gated by Phase 3 environmental blocker (documented).

### §6 — Code Quality / Production Readiness

- [ ] TypeScript strict mode maintained across all new and modified files.
- [ ] No `any` introduced (Zod-generated types flow end-to-end).
- [ ] All SQL parameterised (verified by `dao-service.test.ts` injection test).
- [ ] All cross-process payloads serialisable (verified by `serializeRow` unit tests).
- [ ] Error messages user-actionable (e.g. `TableAccessDenied` includes the offending table + caller extension id).
- [ ] No new runtime dependencies (uses existing `better-sqlite3`, `zod`, `lit`).
- [ ] No new dev dependencies.

### §7 — Explicit Deferrals (Out of Scope, Documented for Future Phases)

- `WebviewPanel` iframe rendering → Phase 5 (per Decision 11).
- `finance.services.*` cross-extension Domain Services → Phase 5 (per Decision 5).
- NavigationProvider data-driven sidebar → Phase 5.
- AI tools for Salary History → Phase 6.
- Typed DAO generation from manifest schemas → Phase 7+.
- Per-extension command allowlist on Main → Phase 5 (security hardening).
- Generic settings UI renderer → Phase 7.
- Umzug migration runner → Phase 8 evaluation.
- Production source map stripping → Phase 7.
- Marketplace extension packaging/signing → Phase 8.

### §8 — Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Direct-mount UI (Decision 11) is not sandboxed; renderer-side XSS in extension Lit element could affect shell | Lit elements use Shadow DOM by default (isolated styles); no `innerHTML` writes; reviewed in Self-Review §6 |
| `finance` type-only import could regress to runtime import (accidentally non-type import) | Build test in Task 13 catches this (`grep "from 'finance'" dist/extensions/` must return nothing) |
| 5 migrations crosses ADR-0002's trigger; staying inline is a judgement call | Documented in Decision 8 + ADR-0002 addendum |
| Accounts seed modal UX: forcing users to create an account on first run is intrusive | "Skip" button allows Phase 5's Accounts extension to handle it later |
| Multi-file Vite bundling could produce bloated output if circular imports creep in | Build test asserts < 200 KB; manual review of bundle during Task 12 |
| DAO query operator set is intentionally small — extensions may want `$and`, `$join` | Documented as Phase 5+ enhancement in Decision 2 |
| Shared table write protection is enforced at DAO level, not SQLite-level | A future bug in DAO code could allow writes; **mitigated by code review + integration test (manual TU 8)** |

### §9 — Questions / Clarifications for Reviewer

1. **Is the Phase 4 spec's "PaySlips as Shared Financial Data" wording a typo, or should they be platform-owned?** Plan interprets it as typo and namespaces them as `salary_history_pay_slips`. If reviewer disagrees, see §10 for the alternative.

2. **Should Decision 9's type-only SDK ship `finance.d.ts` as a separate npm package for Phase 8, or stay as an internal types file?** Plan defers to Phase 8. Path mapping is a build-time concern only in Phase 4.

3. **Should the multi-file Vite bundling test (Task 13.3) check for absolute path leakage (e.g. `/Users/foo/...` in the bundle)?** Plan asserts source-map behavior implicitly via Vite defaults; explicit check is Phase 7 polish.

4. **The settings registration (Decision 13) does not ship a UI. Should we add a Phase 4 placeholder UI to prove the storage layer works?** Plan defers to Phase 7. The settings round-trip is verified via SQLite browser in TU 9.

### §10 — Alternatives Considered (Per Decision)

Each decision's "Alternatives considered" section enumerates the rejected options with reasoning. Reviewer may push back on any of Decisions 1, 5, 9, or 11 (the highest-judgement calls). Specifically:

- **Decision 1 (allowlist + prefix):** If reviewer prefers manifest-declared data access, that's Phase 5 work.
- **Decision 5 (services as internal helpers):** If reviewer wants `finance.services.*` shipped now, the platform contract work moves to Phase 4 and overlaps with Phase 5.
- **Decision 9 (type-only SDK):** If reviewer wants a full Node loader hook, scope expands by ~200 lines (loader implementation) and ~150 lines of tests.
- **Decision 11 (direct-mount UI):** If reviewer wants WebviewPanels in Phase 4, scope roughly doubles.

---

## End of Plan

This plan is **draft — awaiting review**. Once approved, the executor follows the 20 tasks in order. Self-Review Checklist §1–§10 verifies completion.
