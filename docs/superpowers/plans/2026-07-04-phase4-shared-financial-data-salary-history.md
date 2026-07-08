---
title: Phase 4 - Shared Financial Data & The First Extension (Salary History)
date: 2026-07-04
amended: 2026-07-07
status: draft — awaiting review; not yet implemented
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

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Complete this milestone and wait for review before starting Phase 5.
>
> **Goal reminder:** Phase 4 ships the **first fully-functional extension** (Salary History) backed by **persistent SQLite storage**. It also turns the Phase 3 `finance.db.table()` *stub* into a real DAO with strict namespace enforcement, and proves the Shared Financial Data / Extension-owned boundary with the Accounts table. Phase 4 does **not** ship WebviewPanels (Phase 5), the AI Assistant (Phase 6), or `finance.services.*` cross-extension Domain Services (Phase 5 — see Decision 5).
>
> **Open questions inherited from Phase 3** (must be resolved by the executor):
> 1. **Canonical import pattern for multi-file extensions** — Decision 9 of Phase 3 deferred this. Salary History is the first multi-file extension. Resolution in Decision 9 below.
> 2. **`finance.services.*` Domain Service contract** — the spec lists PayService as a Phase 4 deliverable, but `finance.services.*` is a cross-extension API the platform doesn't support yet. Resolution in Decision 5 (PayService is an internal helper for Phase 4; `finance.services.*` is Phase 5 work where the API gets designed from the consumer side).
>
> ~~**Original item 2:** spec places `PayService` / `DeductionService` in Phase 4...~~ DeductionService is removed from Phase 4 entirely. The deductions concept now belongs to the Phase 5+ Tax extension.

---

## Goal

Make the Salary History extension fully functional: users can create a payslip, edit it, and view their salary history, with every write/read round-tripping through a real, namespaced DAO into the local SQLite database. This proves the Shared Financial Data architecture end-to-end and turns the Phase 3 mock extension into the platform's first real citizen.

**Architecture:** The Main process remains the sole SQLite owner (per `project_vision.md:99`). The Extension Host gains a new `extension.readTable` / `extension.writeTable` JSON-RPC pair that proxies to a real DAO in Main. The DAO enforces two boundaries structurally: (a) extensions may only access tables whose names match `<extensionId>_*` OR are on an explicit **Shared Financial Data allowlist** (Phase 4 ships `accounts`); (b) raw SQL is impossible — every call goes through typed accessors (`.find`, `.insert`, `.update`, `.delete`, `.findOne`, `.count`) backed by a parameterized SQL builder. The Salary History extension reads `accounts` (shared) and writes `salary_history_pay_slips` (extension-owned). All UI renders inside the workspace area as Lit elements mounted by the renderer (Phase 5 will replace this with proper WebviewPanels — see Decision 11).


**Tech Stack:** everything Phase 3 ships, plus: Zod (DAO input validation, already a dependency), `better-sqlite3` prepared statements (already a dependency, used more heavily), Lit (renderer components for payslip form / history list / accounts seed modal), Vitest (unit), Playwright Electron (E2E — still gated by the Phase 3 environmental blocker).


---

## Deliverable

A bootable Electron app. The Salary History extension exposes **one Activity Bar icon** (`P`) and **two Command Palette commands**, and ships **three modals** that open on top of the views. The items below are grouped by how the user reaches them.

### View reached by clicking `P` (the Activity Bar icon)

Clicking `P` opens the **pay-history view**, which renders two Lit components side-by-side:

1. **Payslip entry form** (Lit component) — fields: pay period, gross/net (Totals section), 7 hour inputs + 1 leave balance (collapsible "This week was different" toggle), derived breakdown preview, `[ Validate PAYG ]` button. Submit writes to `salary_history_pay_slips` via `finance.db.table('salary_history_pay_slips').insert({...})`.
2. **Salary history list** (Lit component) — paginated table of past payslips, sorted by pay_date DESC. Edit and Delete actions per row. Year-to-date gross / net / PAYG / SG summary footer (computed by `PayService.aggregateYearToDate()`).

### View reached via Command Palette only (NOT from clicking `P`)

3. **Pay rate history view** (Lit component) — rate rows list (newest first) with "Current" badge on the row whose `effective_to IS NULL`; Edit button on the current row only. Persisted in `salary_history_rate_history`. **Reachable only via the Command Palette command `salary.show-pay-rate-history`** — the rate history is an admin surface (rates change rarely), so per Decision 17 it does NOT get its own Activity Bar button; the Activity Bar stays at one `P` button. The Command Palette is the sole entry point.

### Modals (opened from the views, on top of the current view)

4. **Rate row form modal** — opened by the Edit button in the **pay-rate-history view** (item 3). Fields: `effective_from` / `effective_to`, the 8 rate columns (base + 7 multipliers), 2 accrual fields (`accrual_rate_per_week`, `starting_holiday_leave_balance`), notes. On add, atomically closes the previous current rate row (Decision 16's `addNewRate` uses `BEGIN IMMEDIATE`).
5. **Reorder sections modal** — opened by a `[ Reorder Sections ]` button in the **payslip entry form** (item 1). Up/down arrows for the 7 form sections (period, totals, earnings, deductions, super, leave, notes). Persists to `salary-history.sectionOrder` setting (item 7).
6. **Accounts seed modal** — appears automatically on first activation if the `accounts` table is empty (the only modal that opens without user action). User can name + optional institution; actions Create / Skip / Cancel. Proves Phase 4's read access to Shared Financial Data.

### Settings (persisted; no generic settings UI in Phase 4)

7. `salary-history.sectionOrder`, `salary-history.paygToleranceDollars` (default $5), `salary-history.paygTaxYear` (default "2026-2027"), `salary-history.financeYear` (auto-computed from current date + `financialYearStart` at boot). Round-tripped via `finance.settings.get()`. The reorder modal (item 5) is the only settings surface shipped in Phase 4; a generic settings UI is deferred to Phase 7.

### Verification

8. **Persistence verified** — every write survives an app restart (data round-trips through SQLite → settings → restart → render). Manual Test Unit 4 walks this loop.

### Command Palette commands

- `salary.show-pay-history` — opens the pay-history view (equivalent to clicking `P`).
- `salary.show-pay-rate-history` — opens the pay-rate-history view (item 3). **This is the only way to reach the rate history UI** — there is no Activity Bar button for it.


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

> **In plain English:** Extensions can only access their own tables (named with their prefix, like `salary_history_*`). Sharing data across extensions requires the table to be on a short allowlist maintained by Core — and the database enforces this rule automatically, so no extension can bypass it.

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

> **In plain English:** The way extensions touch data is a simple, typed interface: pick a table by name, then call `.find()`/`.insert()`/`.update()`/`.delete()`. No raw database queries are allowed — every call is validated against the table's declared shape before the database sees it.

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

> **In plain English:** Each extension declares its tables (name, columns, types) in a configuration file. From that declaration, validation rules are auto-generated. Bad data never reaches the database — it's blocked at the boundary.

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
        { "name": "finance_year",                "type": "text",    "nullable": false, "description": "Australian financial year label (e.g. 'FY2026-2027') auto-computed from pay_date + financialYearStart; format enforced by PayService.validateFinanceYear, not the DAO schema." },
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
        { "name": "personal_leave",             "type": "real",    "nullable": false, "default": 0, "min": 0, "description": "Money paid for personal leave this period. Derived by calculatePaySlipBreakdown as h.personal_leave_hours × rateRow.base_hourly_rate." },
        { "name": "holiday_leave_accrual_hours", "type": "real",    "nullable": false, "default": 0, "min": 0, "description": "Cumulative annual/holiday leave balance at this payslip (read-only, auto-derived): prev_balance − holiday_hours + accrual_rate_per_week. personal_leave_hours is intentionally excluded because personal leave is a separate entitlement under Australian payroll (Fair Work Act 2009); it does not reduce the annual/holiday leave balance. personal_leave_hours and holiday_hours are transient form inputs — not persisted, but passed by the form to calculateHolidayLeaveAccrual." },
        { "name": "notes",                       "type": "text",    "nullable": true },
        { "name": "created_at",                  "type": "datetime","nullable": false, "default": "now" },
        { "name": "updated_at",                  "type": "datetime","nullable": false, "default": "now" }
      ]
    }
  ]
}
```




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

**Column design — normalized per-payslip.** The Phase 4 `salary_history_pay_slips` table captures per-payslip breakdown amounts (`shift_allowance`, `base_hourly`, `overtime_1_5x`, `overtime_2_0x`, `holiday_leave_loading`, `holiday_pay`, `public_holiday`, `payg_withholding`, `superannuation_guarantee`) and per-payslip hours (`personal_leave_hours`, `holiday_leave_accrual_hours`) as first-class columns rather than as a separate deductions table or as cumulative balance columns. The normalized design means each row's earnings breakdowns sum toward its `gross`, and `gross − payg_withholding = net` (with `superannuation_guarantee` paid on top, not deducted from net). Per-period aggregates like YTD gross, total PAYG, total super are computed on demand via `PayService.aggregateYearToDate()` rather than stored — the user's xlsx shows cumulative values, but the import script converts them to per-payslip deltas via `delta_t = cumulative_t − cumulative_{t-1}` before insertion.

**Reasoning:** Validating at the boundary means the SQL builder never has to defensively re-check. The vision mandates Zod for runtime type-safety (`project_vision.md:83`); generating Zod schemas from a declarative table manifest keeps the contract in one place — the manifest.

**Why declarative in the manifest, not a separate SQL file:** SQLite DDL would mean two sources of truth (the manifest for validation, the SQL for the schema). Generating both from the manifest keeps them in sync. Migrations are still SQL (Decision 7); the manifest describes runtime validation, migrations describe schema evolution.

**Alternatives considered:**

- **Zod schemas hand-written per extension.** Repetitive, drift-prone.
- **JSON Schema + Ajv.** Vision reserves Ajv for settings schemas, not table schemas. Two validators, two mental models.
- **TypeScript types only, no runtime validation.** Vision's "schema-validated APIs" principle is violated.

**Trade-off:** The manifest grows by ~30 lines per table. Extension authors accept that cost for the schema-bound DAO safety net.

---

### Decision 4: Shared Accounts Schema Lives in Core, Not in an Extension

> **In plain English:** The `accounts` table (which extensions use for things like which bank account receives a salary) is owned by Core, not by any extension. Extensions can read it but can't change it. This is what makes the "Shared Financial Data" architecture work.

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

> **In plain English:** The logic for calculating payslips (validation, totals, year-to-date) lives inside the salary-history extension for now — not as a public cross-extension API. We get the working code, but we don't lock in the public shape until a second extension actually needs it.

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


The `finance.services.*` cross-extension contract **does not exist** in Phase 4 — the spec lists PayService as a Phase 4 deliverable but `finance.services.*` is a Phase 5 architectural decision (introduces the "Core Extensions as Services" pattern from `project_vision.md:107-117`). Phase 4 keeps PayService internal so the extension can demonstrate the use cases (validation, aggregation) without prematurely locking a cross-extension contract.

**Reasoning:** The Phase 3 handoff doc (`docs/phase3-handoff.md` "What Was NOT Decided" #4) flagged Domain Services ownership as unresolved. Prematurely exposing `finance.services.pay.validatePayslip()` when no second consumer exists means we ship an API that may need to change the moment a Budget extension wants to call it. Phase 4 ships the **value** (working validation + aggregation) without the **lock-in** (cross-extension surface).

**When does PayService graduate to `finance.services.*`?** Phase 5 introduction criteria:
- A second extension (likely Budget) wants to call `pay.getYearToDate(incomeType)` for budget forecasting.
- Dashboard wants `pay.getLatestPayslip()` for the Net Worth view.
- Cash Flow wants `pay.getMonthlySeries(financialYear)` for forecast charts.
- The interface has stabilised through internal use.

**Phase 5 design note:** The first version of `finance.services.pay.*` will be **designed from the consumer side** — by what Phase 5's Cash Flow / Dashboard / Budget actually need to call — not derived from PayService's current internal surface. PayService's internals are throwaway; the public API gets shaped by Phase 5's call sites. This avoids two failure modes: (a) shipping an internal-shape API that Phase 5 consumers find awkward; (b) over-investing in the current `aggregateYearToDate(payslips, financialYearStart)` signature when Phase 5 consumers will want aggregations at the database layer, not on pre-fetched JS lists.

**Alternatives considered:**

- **Ship `finance.services.pay.*` now.** Premature cross-extension surface. Rejected.
- **Skip PayService entirely.** Spec requires it for Phase 4 (validation + aggregation are user-visible in the salary-history UI). Rejected.
- **PayService lives in Core as a Core Extension.** Same problem as above (Core Extensions are Phase 5 architecture).

**Trade-off:** Salary History has to maintain PayService. That's the correct cost — it's domain logic for the salary-history domain. The risk that the internal surface diverges from what `finance.services.pay.*` eventually becomes is mitigated by the Phase 5 design note above.


---

### Decision 6: JSON-RPC Protocol — New `extension.readTable` / `extension.writeTable` Methods

> **In plain English:** Extensions talk to the database over a structured protocol with separate read and write methods and explicit error codes. The audit trail clearly shows what each extension did, on which table.

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

> **In plain English:** Two new database tables are added in Phase 4 (the shared `accounts` table and the `salary_history_pay_slips` table), bringing the total to four. Just over the threshold for re-evaluating the migration system, but still small and manageable.

**Choice:** Two new inline migrations:

| # | Name | Adds |
|---|------|------|
| `003-shared-accounts` | `accounts` table (Decision 4) |
| `004-salary-history-pay-slips` | `salary_history_pay_slips` table |

Total: 4 migrations (`001-init-infrastructure`, `002-extension-crash-tracking`, `003-shared-accounts`, `004-salary-history-pay-slips`).

**Reasoning:** ADR-0002 says "more than three migrations" is a trigger to revisit the inline runner. With deductions removed, Phase 4 lands at 4 migrations — one over the trigger but well within the "all Core-owned, all simple DDL" sweet spot. Decision 8 evaluates the runner choice and resolves to stay inline.


**Migration runner behaviour:** unchanged from Phase 2 — registered via `registerMigration({ name, up })`, applied in order at `initializeDatabase()` time, recorded in `migration_log`. Each Phase 4 migration declares its table DDL inline (no separate SQL files). The `down` callback remains intentionally absent per ADR-0002.

**Alternatives considered:**

- **One migration per extension.** Future-proof for extension-shipped migrations, but Phase 4's two extensions are bundled — Core still ships the migrations.
- **Squash into one `003-phase4-shared-and-extension` migration.** Loses the per-table audit trail.

**Trade-off:** Five migrations is just over the ADR-0002 trigger threshold. Decision 8 handles it.

---

### Decision 8: Keep Inline Migration Runner (Threshold Softly Crossed)

> **In plain English:** We're sticking with the simple inline migration approach (database-setup SQL embedded in code) rather than upgrading to a fancy migration framework. Five migrations is still small and the upgrade trigger hasn't actually fired — that would be extensions needing to ship their own migrations independently, which is Phase 8 work.

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

> *Phase 4 evaluation (2026-07-05,): 5 migrations (2 → 5). All Core-owned, all simple DDL. Re-evaluate at Phase 8 (extension-shipped migrations) per the original "extension needs to ship a migration independent of Core releases" trigger. Threshold language loosened from "more than three" to "more than ~10, OR an extension ships its own migration".*

This is a minor ADR amendment, not a new ADR. Recorded in `docs/decisions/0002-inline-migrations.md` as an addendum.



---

### Decision 9: Multi-File Extension Authoring — `finance` as a TypeScript Type-Only Import

> **In plain English:** Extensions can be written as multiple TypeScript files that share types via a `finance` import. The import is "type-only" — it exists for IntelliSense and compile-time checking; at runtime it's stripped out and doesn't bloat the extension bundle.

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

> **In plain English:** The salary-history extension is split into separate files for data access, business logic, UI components, and the entry point — rather than one giant `main.ts`. Same functionality, easier to maintain as the extension grows.

**Choice:** Replace the Phase 3 single-file stub (`extensions/salary-history/src/main.ts`, ~30 lines) with the multi-file structure shown in Decision 5. The Vite bundling pipeline (`vite.extensions.config.ts` per ADR-0004) already supports multi-file via `rollupOptions.input` — the config picks up all `.ts` files under `extensions/salary-history/src/` as one entry chunk.

**Reasoning:** Salary History is non-trivial enough to warrant separation: DAO (data access), services (business logic), UI (renderer code), and the entry point. Putting it all in one file is the kind of code smell that breeds 1000-line `main.ts` files by Phase 8. Multi-file proves the bundling infrastructure handles real extensions.

**Alternatives considered:**

- **Keep single file with internal modules.** Vite doesn't split the output, so internal modules aren't separately importable — this is just code organisation, not architectural structure. The DAO/service/UI split is real and benefits from separate files.
- **Two separate extensions (Payslips, Accounts).** Over-fragmented; each would need its own manifest, activation, IPC overhead. Rejected.

**Trade-off:** More files to navigate. Offset by clearer ownership boundaries.


---

### Decision 11: Phase 4 UI Mounts as Lit Elements in the Workspace Area (Stop-Gap for Phase 5 Webviews)

> **In plain English:** The salary history UI is rendered directly in the main window using web components. It's not yet sandboxed in a separate iframe — that's planned for Phase 5. This is acceptable for Phase 4 because extension code is bundled at build time (trusted), not loaded from a marketplace.

**Choice:** Phase 4 renders the Salary History UI (payslip form, list) as Lit elements mounted directly into the renderer DOM inside the workspace area. There is **no iframe**, no separate process — the Lit element runs in the same renderer process as the rest of the shell. The renderer's "active view" switch (`src/renderer/index.ts`) mounts/unmounts the salary-history Lit element when the user activates the view.


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

> **In plain English:** Form submissions from the extension's UI don't go through the existing "execute command" path (which the renderer could call for any extension). They use a new dedicated channel that distinguishes UI-driven mutations from keyboard-driven ones — clearer audit logs and tighter future security.

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

> **In plain English:** The salary-history extension gets its own settings namespace (like `salary-history.paygToleranceDollars`) so its preferences don't conflict with other extensions. Phase 4 ships only the persistence mechanism — a generic settings UI is Phase 7 work.

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
        "description": "ATO weekly tax table year; bracketed tables keyed by this value. Auto-computed from current date at app boot if unset (similar to financeYear). Phase 4 hardcodes FY 2026-2027 brackets in payg-brackets.ts; unknown years cause [ Check Tax Estimate ] (renamed from [ Validate PAYG ] per Review Finding 15) to surface a non-blocking 'Bracket data unavailable for FY X' message instead of throwing. Future FY brackets are added by appending entries to BRACKETS_* constants in payg-brackets.ts."
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


Phase 4 **does not** render the generic settings UI (that is Phase 7 work per Phase 3 Self-Review §7). The settings are persisted and retrievable via `finance.settings.get('salary-history.financeYear')` so the extension can read them at activation, but the Settings Activity Bar button still shows the Phase 1 hardcoded "App Preferences / Manage Extensions" placeholder. The payslip form's `[ Reorder Sections ]` button is the only Phase 4 settings UI.

**Reasoning:** Proves the settings-namespacing mechanism (`project_vision.md:46` — settings keys prefixed with extension id) works end-to-end with a real extension. Phase 7 will add the UI on top.

**Alternatives considered:**

- **Skip settings entirely.** Cheaper but defers proving the namespacing enforcement.
- **Ship the settings UI now.** Phase 7 work; too much scope.

**Trade-off:** Settings are persisted but no UI (except the reorder modal). Acceptable for Phase 4.

### Decision 14: Calculation Model — Minimal Inputs, Derived Breakdown

> **In plain English:** The user only enters 3 things on a payslip: pay date, gross pay, and net pay. Everything else (9 breakdown fields like overtime, holiday pay, super) is calculated automatically from the current pay rate and hours. This matches how the user thinks about payslips and prevents data-entry errors.


**Choice:** Per-payslip inputs are minimal: `pay_date`, `gross`, `net`. All 9 monetary breakdown fields and `payg_withholding` are derived by `PayService.calculatePaySlipBreakdown(pay_date, gross, net, hours?, rateRow, settings)`. PAYG validation is user-triggered via a `[ Validate PAYG ]` button that calls `payg-calc.ts` and displays the result inline.

**Form structure:**
- **Always-visible:** `pay_date`, `finance_year`, `gross`, `net`, `pay_period_start`, `pay_period_end`, `account`, `notes`
- **Collapsed by default:** "This week was different" toggle → 7 hour fields (`regular_hours`, `shift_hours`, `overtime_1_5_hours`, `overtime_2_0_hours`, `holiday_hours`, `public_holiday_hours`, `personal_leave_hours`)
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
    shift_hours: rateRow.shift_allowance_hours_per_week,
    overtime_1_5_hours: 0,
    overtime_2_0_hours: 0,
    holiday_hours: 0,
    public_holiday_hours: 0,
    personal_leave_hours: 0,
  };
  return {
    base_hourly:              h.regular_hours         * rateRow.base_hourly_rate,
    shift_allowance:          h.shift_hours           * rateRow.base_hourly_rate * rateRow.shift_allowance_multiplier,
    overtime_1_5x:            h.overtime_1_5_hours    * rateRow.base_hourly_rate * rateRow.overtime_1_5_multiplier,
    overtime_2_0x:            h.overtime_2_0_hours    * rateRow.base_hourly_rate * rateRow.overtime_2_0_multiplier,
    holiday_pay:              h.holiday_hours         * rateRow.base_hourly_rate,
    holiday_leave_loading:    h.holiday_hours         * rateRow.base_hourly_rate * rateRow.holiday_leave_loading_rate,
    public_holiday:           h.public_holiday_hours  * rateRow.base_hourly_rate,
    personal_leave:           h.personal_leave_hours  * rateRow.base_hourly_rate,
    payg_withholding:         Math.max(0, gross - net),
    superannuation_guarantee: gross * rateRow.superannuation_rate,
  };
}

// holiday leave accrual
// Computes the new cumulative holiday leave balance after a pay period.
// `prevBalance` is the previous payslip's holiday_leave_accrual_hours (or the rate row's
// starting_holiday_leave_balance for the first payslip). `holidayHours` is hours TAKEN
// from the annual/holiday leave balance this period; `accrualRatePerWeek` comes from the
// active rate row. `personalLeaveHours` is intentionally NOT a parameter — personal
// leave is a separate entitlement under Australian payroll (Fair Work Act 2009) and is
// paid via the derived `personal_leave` monetary column, but does not reduce the annual/
// holiday leave balance. The result is rounded to 2 decimal places.
function calculateHolidayLeaveAccrual(
  prevBalance: number,
  holidayHours: number,
  accrualRatePerWeek: number,
): number {
  const raw = prevBalance - holidayHours + accrualRatePerWeek;
  return Math.round(raw * 100) / 100;
}
```

**Reconciliation (inline warnings, non-blocking):**
- Sum of earnings (base + shift + OT1.5 + OT2.0 + holiday_pay + holiday_leave_loading + public_holiday) vs `gross` → warn if `|Δ| > settings.paygToleranceDollars`
- Derived PAYG vs ATO estimate (via `[ Validate PAYG ]` button) → warn if `|Δ| > settings.paygToleranceDollars` (default $5)
- Public-holiday disambiguation (resolved by Review Finding 4): if `public_holiday_hours > 0`, then `holiday_pay = 0` and `holiday_leave_loading = 0` for those hours (public holiday pay replaces ordinary holiday pay); the `public_holiday` field captures the public-holiday premium instead. Without this rule, `holiday_pay` and `public_holiday` would double-count. Documented in Self-Review §8 as a known limitation if a future user reports under-counting for split public-holiday shifts.

**Override rule (resolved by Review Finding 8):** The form's derived breakdown fields are **read-only preview** per Decision 18 and the mocks at `docs/design/salary-history-mvp/payslip-form-*.html`. There is no in-form override UI. To preserve historical payslips whose breakdown values were user-entered in the source xlsx, the **xlsx import script only** writes breakdown values directly via `finance.db.table('salary_history_pay_slips').update(...)`, bypassing derivation; subsequent reads return the stored values without re-derivation. New payslips entered via the form are always derived from the rate row × hours and never carry an override.

**Reasoning:** This inverts the CRUD-first design toward a derivation-first design. The user's xlsx tracks 50 weekly payslips where the breakdown fields are derived values (rate × hours), not user-entered facts. By making the form minimal (3 inputs), the user enters the facts they actually know (what the payslip shows) and the system derives everything else. This minimizes data-entry error, keeps the breakdown consistent with the rates, and matches the way the user works.

**Alternatives considered:**
- **Full CRUD entry of all 22 fields** — rejected. Too many fields, error-prone, doesn't match the user's mental model.
- **Hybrid entry with all fields visible** — rejected. Clutters the form.
- **Auto-calculate `payg_withholding` from `CALCULATE_TAX_WITHHELD_26_27(gross)` instead of `gross − net`** — rejected. PAYG = gross − net is the canonical Australian payroll relationship (assuming no other deductions like salary sacrifice, HELP debt, child support garnishee). The ATO function is used for **validation only**.
- **Known limitation (resolved by Review Finding 5):** the formula `payg_withholding = max(0, gross − net)` is exact only when there are no other deductions. Users with HELP debt, salary sacrifice, or child support garnishee will see a permanent reconciliation warning because their PAYG ≠ gross − net. This is documented as a Phase 5+ concern (the Phase 5+ Tax extension's "deduction records ledger" per `project_vision.md:526` is the right home for per-payslip other-deduction tracking). A future schema migration adds an `other_deductions real not null default 0` column to `salary_history_pay_slips` and generalises the formula to `payg = gross − net − other_deductions`.

**Trade-off:** The form requires an accurate rate_history row effective at the `pay_date`. If the user enters a back-dated payslip without first creating a rate row for that era, the calculations use the current rate (wrong historical fidelity). Mitigations: (a) user can override individual breakdown fields to fix the row in the short term; (b) user adds a historical rate row in the rate history view (Decision 17) for the long term; (c) the `[ Validate PAYG ]` button flags obvious rate-period mismatches.

### Decision 15: Reorderable Form Sections

> **In plain English:** Users can rearrange the sections of the payslip form (Period, Earnings, Deductions, etc.) via a "Reorder Sections" button, since different users care about different sections first. The order is saved per-user.

**Choice:** The form sections can be reordered by the user. The order is persisted via the `salary-history.sectionOrder` settings key (JSON array of section IDs). Default order: `["period", "earnings", "deductions", "super", "leave", "notes"]`.

**Section IDs and contents:**

| Section ID | Fields rendered |
|---|---|
| `period` | `pay_date`, `finance_year`, `pay_period_start`, `pay_period_end`, `account` |
| `earnings` | (read-only preview) `base_hourly`, `shift_allowance`, `overtime_1_5x`, `overtime_2_0x`, `holiday_pay`, `holiday_leave_loading`, `public_holiday` |
| `deductions` | (read-only) `payg_withholding` + `[ Validate PAYG ]` button + result display |
| `super` | (read-only) `superannuation_guarantee` |
| `leave` | (collapsed by default) 7 hour fields under "this week was different" toggle (regular_hours, shift_hours, overtime_1_5_hours, overtime_2_0_hours, holiday_hours, public_holiday_hours, personal_leave_hours); `holiday_leave_accrual_hours` (read-only balance) |
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

### Decision 16: Rate History as a First-Class Table

> **In plain English:** Pay rates change over time (raises, etc.). Instead of storing only the current rate, Phase 4 keeps a full history of rate changes with effective dates. Past payslips always use the rate that was current when they were entered — no recalculation when rates change.


**Choice:** A new `salary_history_rate_history` table holds effective-dated rate rows. Only one row has `effective_to = NULL` at any time (the current rate). The calc engine queries this table via `PayRateService.getRateForDate(pay_date)` to find the rate row effective at a given `pay_date`.

**Schema (16 columns per Plan Amendments 3 + 5 + 6):**

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
    { "name": "shift_allowance_hours_per_week", "type": "real", "nullable": false, "min": 0, "default": 38, "description": "Hours per week the shift allowance is paid on. Distinct from standard_hours_per_week. Used as the default for h.shift_hours in calculatePaySlipBreakdown." },
    { "name": "overtime_1_5_multiplier",   "type": "real",    "nullable": false, "default": 1.5 },
    { "name": "overtime_2_0_multiplier",   "type": "real",    "nullable": false, "default": 2.0 },
    { "name": "superannuation_rate",       "type": "real",    "nullable": false, "default": 0.12 },
    { "name": "holiday_leave_loading_rate","type": "real",    "nullable": false, "default": 0.175 },
    { "name": "accrual_rate_per_week",     "type": "real",    "nullable": false, "min": 0, "default": 2.92, "description": "Weekly holiday leave accrual in hours" },
    { "name": "starting_holiday_leave_balance", "type": "real", "nullable": false, "min": 0, "default": 0, "description": "Initial balance used as prev_balance for the first payslip" },
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
- `addNewRate(rate)` — atomically closes the previous current row + inserts the new one (single SQLite transaction using `BEGIN IMMEDIATE` for write-locking — prevents two concurrent `addNewRate` calls from both reading "no current row" and inserting duplicate current rows per Review Finding 7)
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

### Decision 17: Two Commands / Two Views

> **In plain English:** The extension has two commands: one for pay history (the main view, reachable from clicking `P`) and one for rate history (admin surface, reachable only via Command Palette). Only one Activity Bar button to keep the bar uncluttered.

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

### Decision 18: UI Design Finalization — Mocks Pre-Approve the Visual Contract

> **In plain English:** Before any UI code is written, 8 static HTML mockups show exactly how each screen should look. Implementation must match the mocks; any deviation is a design review. Catches layout issues cheaply, before code is written.

**Choice:** The visual design for all 6 UI components is pre-approved via 8 static HTML/CSS mockups at `docs/design/salary-history-mvp/`. Task 11 implementation must match the mocks; any deviation is a design review. The mocks surfaced one structural correction — gross/net must be **user inputs** in a dedicated Totals section, not derived — and that correction is captured here.

**Form structure (final, 7 sections):**

| # | Section | Always visible? | Inputs | Derived from |
|---|---|---|---|---|
| 1 | **Period** | yes | `pay_date`, `finance_year` (dropdown, auto-prefilled), `account` | `pay_period_start/end` auto-derived from `pay_date` |
| 2 | **Totals** (NEW per Amendment 4) | yes | `gross` ($), `net` ($) | nothing — these are the 2 of the 3 minimal inputs |
| 3 | **Earnings (derived)** | yes | — | rate row × hours; 7 monetary fields |
| 4 | **Deductions** | yes | — | `payg_withholding` = gross − net; `[ Validate PAYG ]` button calls `payg-calc.validatePayg` |
| 5 | **Super** | yes | — | `superannuation_guarantee` = gross × sg_rate |
| 6 | **Hours breakdown** | always visible | 7 hour inputs (`regular_hours`, `shift_hours`, `overtime_1_5_hours`, `overtime_2_0_hours`, `holiday_hours`, `public_holiday_hours`, `personal_leave_hours`) | — |
| 7 | **Leave** | collapsed by default | `holiday_leave_accrual_hours` (read-only, auto-calculated via `calculateHolidayLeaveAccrual`; displays formula breakdown: `prev_balance − holiday_hours + accrual_rate_per_week`) | `prev_balance − holiday_hours + accrual_rate_per_week` |
| 8 | **Notes** | yes | free text | — |

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
- [ ] User has approved all 8 mocks (per Decision 18 visual-review checklist)
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


### Decision 19: Renderer-Side Dynamic UI Mount — IPC Fetch + Blob URL + Dynamic Import (Unsafe-Eval Phase 4; Sandboxed WebviewPanel Phase 5)

> **In plain English:** A mechanism for the main window to dynamically load extension UI components: the bundle is fetched over a special channel, wrapped in a temporary URL, and dynamically loaded. This requires `unsafe-eval` in the security policy — acceptable for Phase 4 since extension code is bundled at build time (trusted), but Phase 5 will replace it with properly sandboxed WebviewPanels.

**Choice:** The renderer process cannot `import()` an extension's bundled JS directly (the bundle lives in `dist/extensions/<id>.js` on the Main side, and the renderer's `webSecurity: true` blocks arbitrary `file://` imports per `project_vision.md`). Phase 4 ships a **pragmatic mechanism** for renderer-side dynamic mount:

1. Extension calls `finance.ui.registerComponent(name, factory)` from `activate()`. The Host forwards to Main via JSON-RPC; Main stores `(extensionId, name, factoryPath)`.
2. When the renderer needs to mount a component, it calls `financeShell.extensions.onUiMount(callback)`. Main responds via the `extensions:ui-mount` notification with `{ extensionId, name, sourceCode }` — where `sourceCode` is the **text content** of the extension's bundled JS file fetched via a new IPC handler `extension:fetch-ui-bundle(id)`.
3. The renderer wraps the source in a Blob: `const blob = new Blob([sourceCode], { type: 'application/javascript' }); const url = URL.createObjectURL(blob);` then `await import(url)`.
4. The imported module calls `customElements.define(name, LitElementClass)`. The Lit element is now a registered custom element the renderer can use like any other HTML tag.

**Security implications:** This requires the renderer's CSP to allow `'unsafe-eval'` for the blob-URL import. Phase 4 accepts this risk because (a) extensions are developer-installed (not user-installed) per `project_vision.md:48`, (b) the marketplace flow (Phase 8) is where signed-bundle + remote-installed extensions land, and (c) Phase 5 will replace this mechanism with a sandboxed `WebviewPanel` iframe that uses `sandbox="allow-scripts"` without `'unsafe-eval'`.

**Why not the alternatives (resolved by Review Finding 14):**
- **Renderer-side eager import** — every extension's UI module bundled into the renderer; defeats ADR-0004's runtime-bundling goal and bloats the renderer.
- **Main-process HTML render** — defeats Lit's reactive model; not viable for a multi-tab workspace.
- **Defer UI to Phase 5 entirely** — too much scope cut; the deliverable explicitly requires the form to render.

**Documentation:** Add a one-paragraph note to `docs/extension-api.md` (next to the existing Phase 4+ migration notes section) so extension authors know what to expect.

**Phase 5 follow-up:** Replace blob-URL dynamic import with a sandboxed `WebviewPanel` (`<iframe sandbox="allow-scripts" src="…">`) that loads the extension's UI HTML + JS bundle in a separate origin. The Lit components themselves port unchanged.

**Alternative waiting for user confirmation:** This is the recommended mechanism (option (b) from the review). The user should confirm before Task 14 implementation begins; if the user prefers one of the other options, the implementation note is straightforward to swap.

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
|       |-- package.json                         (modified) — adds tables[] (2 entries: salary_history_pay_slips with 23 columns per Decision 3 + salary_history_rate_history with 16 columns), configuration[] (6 keys: defaultCurrency, financialYearStart, paygToleranceDollars, paygTaxYear, financeYear, sectionOrder), commands[] (2 entries: salary.show-pay-history, salary.show-pay-rate-history), financeExtension.main
|       `-- src/
|           |-- main.ts                          (modified) — real activate() implementation; mounts UI, wires both commands (salary.show-pay-history, salary.show-pay-rate-history)
|           |-- services/
|           |   |-- pay-service.ts               (new) — validatePayslipInput, calculatePaySlipBreakdown, aggregateYearToDate, validateFinanceYear (extended per Amendment 3)
|           |   |-- pay-rate-service.ts           (new) — getRateForDate, getCurrentRate, listAllRates, addNewRate, editCurrentRate; DAO wrapper for salary_history_rate_history (Decision 16)
|           |   |-- payg-calc.ts                  (new) — validatePayg(gross, net, taxYear, tolerance) returning PaygValidationResult; wraps CALCULATE_TAX_WITHHELD_26_27 (Decision 14)
|           |   `-- payg-brackets.ts               (new) — getBracketsForYear(year) returning ATO weekly tax brackets for FY 2026-2027 + future years
|           |-- dao/
|           |   |-- pay-slips.ts                 (new) — typed wrapper around finance.db.table('salary_history_pay_slips') with 23 columns per Decision 3
|           |   `-- pay-rate-history.ts           (new) — typed wrapper around finance.db.table('salary_history_rate_history') with 16 columns (per Plan Amendments 3 + 5 + 6)
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
  - `004-salary-history-pay-slips` — `CREATE TABLE salary_history_pay_slips (...)` with FK to `accounts.id`. Includes all 23 columns per Decision 3 (id, account_id, pay_period_start, pay_period_end, pay_date, finance_year, gross, net, currency, 9 monetary breakdowns [shift_allowance, base_hourly, overtime_1_5x, overtime_2_0x, holiday_leave_loading, holiday_pay, public_holiday, payg_withholding, superannuation_guarantee], personal_leave, holiday_leave_accrual_hours, notes, created_at, updated_at).
  - `005-salary-history-rate-history` — `CREATE TABLE salary_history_rate_history (...)` with 16 columns per Decision 16 (temporal anchor + 8 rates including `shift_allowance_hours_per_week` + notes + 2 timestamps).
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
  - `PaySlipInput` type = 23 columns per Decision 3 manifest. All 7 hour inputs (`regular_hours`, `shift_hours`, `overtime_1_5_hours`, `overtime_2_0_hours`, `holiday_hours`, `public_holiday_hours`, `personal_leave_hours`) are transient form inputs only (not persisted).
- [ ] 10.2 Implement `dao/pay-rate-history.ts` (new per Amendment 3, Decision 16):
  - `getRateForDate(finance, payDate: string): Promise<RateRow | null>` — temporal lookup
  - `getCurrentRate(finance): Promise<RateRow | null>` — the row with `effective_to IS NULL`
  - `listAllRates(finance): Promise<RateRow[]>` — all rows ordered `effective_from DESC`
  - `addNewRate(finance, rate: RateRowInput): Promise<void>` — atomic transaction using `db.transaction(...).immediate()` (better-sqlite3's `BEGIN IMMEDIATE`): closes previous current row + inserts new one. The IMMEDIATE variant acquires a RESERVED lock at transaction start, preventing two concurrent `addNewRate` calls from racing. See Decision 16 + Review Finding 7.
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
  - `dao/pay-slips.test.ts` (12 tests): integration with stubbed `finance` (DAO stub) for 23 columns per Decision 3.
  - `dao/pay-rate-history.test.ts` (6 tests): rate_history DAO integration (insert + temporal close + getRateForDate).

**Verification:** `npm run test:unit -- salary-history` → 60 tests pass (was 20 after Amendment 1; +40 from Amendment 3).




---

### Task 11: Build the salary-history UI components (Lit)

**Files:** `extensions/salary-history/src/ui/payslip-form.ts` (new), `extensions/salary-history/src/ui/payslip-list.ts` (new), `extensions/salary-history/src/ui/accounts-seed-modal.ts` (new), `extensions/salary-history/src/ui/pay-rate-history-view.ts` (new), `extensions/salary-history/src/ui/rate-row-form.ts` (new), `extensions/salary-history/src/ui/reorder-sections-modal.ts` (new). **Visual contract:** `docs/design/salary-history-mvp/` (8 HTML mocks, pre-approved per Decision 18). Implementation must match the mocks; any deviation is a design review.

**Steps:**

- [ ] 11.0 **Visual review of mocks** (per Decision 18 checklist): open each mock in `docs/design/salary-history-mvp/`, walk through the flow, confirm all 7 visual-review checks in Decision 18 pass before writing any Lit code.
- [ ] 11.1 `payslip-form.ts` (rewritten per Decision 14, refined per Decision 18):
  - 7 sections rendered per `salary-history.sectionOrder` setting (default: `period`, `totals`, `earnings`, `deductions`, `super`, `leave`, `notes`).
  - **Period section** (always visible): `pay_date`, `finance_year` (dropdown, auto-prefilled from settings), `account`. `pay_period_start/end` auto-derived from `pay_date`.
  - **Totals section** (always visible, NEW per Amendment 4 — the 2 of the 3 minimal user inputs): `gross` ($), `net` ($).
  - **Earnings section** (read-only preview, derived): 9 monetary breakdowns + reconciliation warning if sum-of-earnings ≠ gross by > tolerance.
  - **Deductions section**: `payg_withholding` (derived = gross − net) + `[ Check Tax Estimate ]` button (renamed from `[ Validate PAYG ]` per Review Finding 15 — the button validates the user's net against the ATO estimate, not the derived PAYG) + result display (inline amber/green callout). If the user has manually changed `finance_year` away from the pay_date-derived default (Review Finding 9), the form shows a non-blocking amber callout with two actions: "Auto-correct to <derived-FY>" (default) and "Keep override". The form does not block submit; it surfaces the discrepancy and lets the user choose.
  - **Super section**: `superannuation_guarantee` (derived = gross × rate).
  - **Leave section** (collapsed by default): "This week was different" toggle → expands to show 7 hour inputs (`regular_hours`, `shift_hours`, `overtime_1_5_hours`, `overtime_2_0_hours`, `holiday_hours`, `public_holiday_hours`) + 1 leave balance field (`holiday_leave_accrual_hours`).
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
  - Form fields: `effective_from`, `effective_to` (optional, leave blank for open-ended current), the 8 rate columns (7 originals + `shift_allowance_hours_per_week`, default 38), `accrual_rate_per_week` (default 2.92), `starting_holiday_leave_balance` (default 0), `notes`. The form has 10 rate-row fields (the 8 rate columns + the 2 accrual fields).
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
  - `reorder-sections-modal.ts`: 4 tests (renders 7 section list with up/down; save writes 7-element array to settings; **roundtrips section order through settings as a JSON string — no double-encoding, no over-escaping** per Review Finding 6; reset-to-default button restores the canonical 7-section order).
- [ ] 11.8 **Visual parity check**: after each component is implemented, take a screenshot (or DOM snapshot) and diff against the corresponding mock in `docs/design/salary-history-mvp/`. Any visible regression must be explained before merging.

**Verification:** `npm run build:extensions` produces `dist/extensions/salary-history.js` containing all 6 UI components. Type-check passes. `npm run test:unit` shows 23 UI-component tests passing. **Visual parity:** each component's Lit shadow DOM matches the corresponding mock in `docs/design/salary-history-mvp/` (see Decision 18 visual-review checklist).



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

  export function deactivate(): void {
    // Phase 4 cleanup contract (per Review Finding 13):
    // 1. Unsubscribe from any ui-event listeners (Decision 12).
    // 2. Release the `finance` API reference (let GC reclaim).
    // 3. NOTE: Seeded data is NOT auto-deleted. The default rate row inserted
    //    on first activation persists in `salary_history_rate_history`. Data
    //    cleanup is the user's responsibility via the Phase 8 "Delete Extension
    //    Data" flow (project_vision.md:50-52 — Disable / Uninstall / Delete Data
    //    are three separate actions, and Delete Data always requires explicit user
    //    confirmation).
  }
  ```


- [ ] 12.2 Update `package.json`:
  - Add `tables` block with **two** entries: `salary_history_pay_slips` (23 columns per Decision 3) and `salary_history_rate_history` (16 columns per Decision 16) — per Decisions 3 and 16.
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

**Test Unit 6: Namespace Enforcement (Negative Test)** — Open a SQLite browser. Insert a row into `extension_registry` with `id='tax-stub'` (simulating a different extension installed). Then from the salary-history Host, evaluate `finance.db.table('tax_deductions').find({})` (the table name has the `tax_` prefix, not `salary-history_`). Confirm the DAO returns `TableAccessDenied` because the prefix doesn't match the calling extension's id. Restore the `extension_registry` row to its original state after the test. (Rewritten per Review Finding 10 — Phase 4 has no Budget extension, so testing against `budget_items` would return `TableNotFound` instead of `TableAccessDenied`. The new test exercises the prefix-rejection branch directly via the registry seam.)

**Test Unit 7: Shared Accounts Read-Only** — In DevTools, from a temporary test extension that calls `finance.db.table('accounts').insert({ name: 'evil' })` directly (no `tables[]` manifest declaration needed for shared reads — `accounts` is in Core's `SHARED_FINANCIAL_DATA_TABLES` allowlist per Decision 4), confirm the response is a `SharedTableReadOnly` error. (Reworded per Review Finding 11 — the original "manifest read of `accounts`" phrasing was misleading because the `tables[]` manifest block is for OWNED tables, not for shared-read declarations.)

**Test Unit 8: TypeScript Strict + Lint + Tests** — Run `npm run typecheck` (exit 0), `npm run lint` (exit 0), `npm run test:unit` (all ~144 tests pass: 65 Phase 3 + ~79 Phase 4).

**Test Unit 9: Multi-File Build Verification** — Run `npm run build:extensions`. Confirm `dist/extensions/salary-history.js` exists. Run `grep "from 'finance'" dist/extensions/salary-history.js` → exit code 1 (no matches). Confirm bundle size < 200 KB.


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
  > **Phase 4 evaluation (2026-07-05,):** Total migration count 2 → 4. All Core-owned, all simple DDL, all idempotent. None of the original revisit triggers tripped (one over the original "more than three" but well below the revised "~10" threshold). Threshold language in ADR-0002 loosened from "more than three" to "more than ~10 migrations, OR an extension ships its own migration independent of Core releases". Re-evaluate at Phase 8 (marketplace extensions).
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
| `tests/unit/extensions/salary-history/dao/pay-slips.test.ts` | 12 | DAO integration for 23 columns per Decision 3 |
| `tests/unit/extensions/salary-history/dao/pay-rate-history.test.ts` | 6 | Rate_history DAO integration (Amendment 3) |
| `tests/unit/build/extensions-bundle.test.ts` | 3 | Decision 9 verification (no `from 'finance'`) |
| **Total** | **~119** | |



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
- [ ] **Cross-doc consistency (review-integrated 2026-07-06)** — `docs/extension-api.md` line 70 now uses the Decision 1 shape `finance.db.table('<extensionId>_<table>')` (Review Finding 1). `docs/superpowers/specs/2026-06-13-implementation-design.md` Phase 4 section now aligns with the plan's architecture (Review Finding 2: pay slips extension-private; `accounts` first shared table; cross-extension `finance.services.*` deferred; DeductionService removed per Amendment 1). Phase 4 timeline estimate updated to 6–8 Days (Review Finding 18).

### §2 — Spec Coverage

- [ ] **Implementation Design Phase 4 (lines 121-128):**
  - Shared Financial Data schemas: Accounts ✓. PaySlips ✓ (extension-private, namespaced as `salary_history_pay_slips`). **PaySlips schema expanded** to include 11 per-payslip breakdown columns (9 monetary, 2 hours) so per-payslip amounts and hours are first-class rather than aggregate-only. **PaySlips schema further expanded** to include 6 hour-input columns + `finance_year` text column (22 → 29 columns). **PaySlips schema further adjusted** to drop `personal_leave_hours` and `holiday_hours` from storage (both become transient form inputs feeding the calc) and to add the derived `personal_leave` column (29 → 28 columns). The rate-history infrastructure for deriving these fields lives in a new `salary_history_rate_history` table (13 columns, 16 columns per Plan Amendments 3 + 5 + 6 — adds `accrual_rate_per_week`, `starting_holiday_leave_balance`, and `shift_allowance_hours_per_week`). See Plan Amendments 2, 3, 5, and 6 headers for the full column lists and rationale.
  - ~~Deductions~~ — **REMOVED.** The implementation design spec mentions deductions; Phase 4 reserves that concept for the Phase 5+ Tax extension (which already plans to own a "deduction records ledger" per `project_vision.md:526`). Per-payslip PAYG withholding is captured as the `payg_withholding` column on `salary_history_pay_slips` instead. PAYG validation is available via `payg-calc.ts` (wraps user's `CALCULATE_TAX_WITHHELD_26_27`) — the function is invoked via a `[ Validate PAYG ]` button (Decision 14), not auto-applied.
  - `finance.db.table()` API for typed table access (no raw SQL) ✓
  - PayService ✓ (Decision 5, internal helper for Phase 4; **expanded by Decision 14** with `calculatePaySlipBreakdown`, `validateFinanceYear`, `reconcilePaySlip`)
  - ~~DeductionService~~ — **REMOVED.**
  - Extension UI: payslip entry form (minimal entry + collapsible hours toggle + derived breakdown preview + `[Validate PAYG]` button per Decision 14), salary history list, YTD summary footer, **rate history view** (Decision 17), accounts-seed-modal ✓
  - **UI Design Finalization:** 8 HTML/CSS mocks pre-approve the visual contract at `docs/design/salary-history-mvp/` (see Decision 18). Implementation in Task 11 must match the mocks; visual parity check is Task 11.8. The mocks surfaced one structural correction: gross/net are user inputs in a dedicated **Totals** section between Period and Earnings (form now has 7 sections, not 6; `salary-history.sectionOrder` default updated accordingly).
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
- [ ] Decision 5 (PayService as internal helper; DeductionService removed) — Task 10.
- [ ] Decision 6 (JSON-RPC method expansion) — Task 6.
- [ ] Decision 7 (**3** new migrations — Amendment 3 adds 005) — Task 4.
- [ ] Decision 8 (stay inline; **5 migrations** after Amendment 3, well under revised ~10 threshold) — Decision 8 itself + Task 19 ADR addendum.
- [ ] Decision 9 (type-only SDK for multi-file) — Task 13.
- [ ] Decision 10 (multi-file extension structure; **6 UI components** after Amendment 3) — Task 10/11/12.
- [ ] Decision 11 (Lit elements in workspace, not webview) — Task 14.
- [ ] Decision 12 (UI event IPC channel) — Task 14.
- [ ] Decision 13 (settings namespace registered; **6 keys** after Amendment 3: defaultCurrency, financialYearStart, paygToleranceDollars, paygTaxYear, financeYear, sectionOrder) — Task 16.
- [ ] Decision 14 (Calculation Model — minimal inputs, derived breakdown; PAYG validation) — Task 10 (PayService extension) + Task 11 (payslip-form rewrite) + Task 12 (entry point).
- [ ] Decision 15 (Reorderable Form Sections — sectionOrder setting + modal) — Task 11 (reorder-sections-modal) + Task 10 (setting key in Decision 13).
- [ ] Decision 16 (Rate History as a First-Class Table — `salary_history_rate_history` 16 columns; temporal pattern: temporal anchor + 8 rates including `shift_allowance_hours_per_week` + `accrual_rate_per_week` + `starting_holiday_leave_balance` + notes + 2 timestamps) — Task 4 (migration 005) + Task 10 (pay-rate-service) + Task 11 (rate-row-form) + Task 12 (seed default rate on activation).
- [ ] Decision 17 (Two Commands / Two Views — pay-history existing + pay-rate-history new) — Task 11 (pay-rate-history-view) + Task 12 (register both commands in main.ts).

### §5 — Test Pyramid

- [ ] ~119 new unit tests (all deterministic, fast, isolated via Phase 3's `getTestDatabase()` factory). Includes 4 new test files + extensions to 2 existing files. Test Unit 6 rewritten (Review Finding 10 — exercises prefix-rejection branch via registry seam instead of non-existent `budget_items`); Test Unit 7 reworded (Review Finding 11 — clarifies that shared reads don't require `tables[]` manifest declaration).
- [ ] 9 manual test units covering the full user journey.
- [ ] **Visual review step (Decision 18):** before Task 11 implementation starts, walk through the 8 HTML mocks in `docs/design/salary-history-mvp/` (per Decision 18 visual-review checklist). After each component is implemented, take a DOM snapshot and diff against the corresponding mock — any visible regression must be explained before merging (Task 11.8).
- [ ] 6 new E2E tests written but gated by Phase 3 environmental blocker (documented).

### §6 — Code Quality / Production Readiness

- [ ] TypeScript strict mode maintained across all new and modified files.
- [ ] No `any` introduced (Zod-generated types flow end-to-end).
- [ ] All SQL parameterised (verified by `dao-service.test.ts` injection test).
- [ ] All cross-process payloads serialisable (verified by `serializeRow` unit tests on raw row data; the IPC handlers in `extension-ipc.ts#readTable` / `writeTable` must also call `serializeRow` on the response before returning across the MessagePort — Task 6 should add a lightweight mock test asserting `serializeRow` is invoked, per Review Finding 20).
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
- **`extensions:ui-event` per-extension allowlist on Main** (Review Finding 3) — Phase 4 Decision 12 introduces a new writeback IPC channel (`extensions:ui-event`) that bypasses the Phase 3 `executeCommand` path. The Phase 5 hardening list now needs to cover TWO surfaces (commands + ui-events), not one. Phase 5 should add a per-extension ui-event allowlist on Main alongside the existing `executeCommand` allowlist deferred from Phase 3 Self-Review §7.

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
| `addNewRate` "close previous + insert new" sequence is racy without explicit write-locking (Review Finding 21) | Use `db.transaction(...).immediate()` (better-sqlite3's `BEGIN IMMEDIATE`) per Decision 16 + Task 10.2; add a concurrency test in `pay-rate-service.test.ts` that simulates two concurrent `addNewRate` calls |
| Phase 4's renderer-side dynamic UI mount requires `'unsafe-eval'` CSP for blob-URL dynamic import (Review Finding 22, Decision 19) | Acceptable for Phase 4 (extensions are developer-installed, not marketplace); Phase 5 WebviewPanel replacement removes the requirement. Documented in `docs/extension-api.md` Phase 4+ migration notes |

### §9 — Questions / Clarifications for Reviewer

1. **~~Is the Phase 4 spec's "PaySlips as Shared Financial Data" wording a typo, or should they be platform-owned?~~ RESOLVED 2026-07-06 (Review Finding 2):** The spec was stale (pre-`vision_review.md Issue #23` and pre-Decision 1). Updated `docs/superpowers/specs/2026-06-13-implementation-design.md` Phase 4 section to reflect the post-vision-review architecture: pay slips are extension-private under `salary-history_*`; `accounts` is the first shared table; cross-extension `finance.services.*` deferred to Phase 5. If a future phase needs pay slips as shared records (Dashboard/Cash Flow/Budget in Phase 5+), they can be promoted to shared ownership or replicated via read-only APIs.

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
