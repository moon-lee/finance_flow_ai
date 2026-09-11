---
version: 0.1.0
created: 2026-09-11
last_updated: 2026-09-11T14:30:00+10:00
status: draft
---

# Mortgage Extension — View Design

Source: `docs/Tax Brackets_2025_2026.xlsx`, sheet `Mortgage` (`A1:Z657`).
Reference pattern: `extensions/salary-history` (orchestrator + dao + services + ui views).

## 1. Scope decision (approved)

- Full sheet parity: loan setup + rate history + monthly ledger + 8 offset accounts + yearly totals + savings targets.
- Offsets: dedicated view (not embedded columns, not totals-only).
- Rate history: editable effective-dated rows driving P&I recalculation.
- Daily interest snapshot: derived card in Overview (Section 2 below).
- Yearly + targets management (approved 2026-09-11): target amounts (M51/U51, both $100k) and Verified flag (V55:V57) are editable in Overview; all yearly figures (D:L ratios via `F/(F+H)`, FY-grouped rollups) and avg saving (`M52/U52`), est period (`M53/T53`), target date (`EDATE(TODAY(), NPER(...))`) stay derived (see Section 4). Verified flag lives in `finance.settings` (`mortgage.verified.<fy>`, e.g. `mortgage.verified.2025-2026` = `"Verified"`/empty) — no `mortgage_yearly` table (dropped 2026-09-11 as redundant once `finance_year` exists on repayments).
- Month-end entry (approved 2026-09-11): single combined action writes repayment + 8 offset balances atomically (see Section 6); fixes the split-write gap where one sheet row (`A-V`, e.g. `R47`) maps to two tables.
- Snapshot entry rule (approved 2026-09-11): each row is a point-in-time snapshot (balances B/E/M:V on `entry_date`), not accumulated data; flows (F/G/H/L) and FY cumulatives (C/D) are durations consistent with the snapshot dates. `entry_date` is flexible — any day within the month or a past month, normally month-end, never a future date. Rule is one snapshot per calendar month (`YYYY-MM` month-key upsert); see Section 6.
- Financial-year integration (approved 2026-09-11): `mortgage_repayments.finance_year` auto-set from `entry_date` via `computeFinanceYear` + `core.financialYear.start` (same as `salary-history`); Ledger FY filter + Overview yearly window reuse `core.financeYear.filter` count (same as Dashboard); `fy-changed` UI event (see Sections 4–7).

## 2. Views (4 total, recommended Option B)

| # | View | Sheet source | Contents |
|---|------|--------------|----------|
| 1 | Overview | `A1:C9` + `R50:R57` + snapshot | Loan setup card (property $687,500, deposit $45,000, loan $642,500, 30yr, set $4,200, P&I ~$3,930.94, extra ~$269.06); savings target cards - M-track ($100k, avg $1,361.99, `2 Years and 11 Months`, 2029-04-12) + U-track ($100k, avg $2,160.72, `2 Years and 5 Months`, 2028-10-12), target amounts editable; yearly cards (P/I ratio, interest, paid, extra derived; Verified flag editable); Daily Interest Snapshot card (derived) |
| 2 | Repayment Ledger | `R14:R47` | Point-in-time snapshots: Date (flexible, any day in month, normally month-end), Scheduled Balance, Actual, FY interest, FY offset saving (D), Interest charged, Scheduled ($3,899.36 + $8 fee = $3,907.36), Actual Repayment, Extra paid, `finance_year` (auto); one snapshot per calendar month; FY filter dropdown (last N FYs via `core.financeYear.filter`); owns the `Add month-end entry` combined form (repayment fields + 8 offset balances, one save — Section 6) |
| 3 | Offsets | `M:V` | 8 accounts (0390, 3564, 5272, 3545, 9722, 8107, 4323, 0743) + Sub Total + Total (latest $90,593.69); read/display per date, edit routes to the combined month-end form (no independent offset writes) |
| 4 | Rate History | `E1:G8` | 8 effective-dated rows (5.94% → 6.19% → 5.94% → 5.69% → 5.44% → 5.69% → 5.94% → 6.19%); lookup drives `C5` P&I + snapshot rate |

Manifest: 1 `views` entry + 4 `navigation` commands (same shape as `salary-history`: 1 view, 2 nav items).

## 3. Daily Interest Snapshot (approved detail)

- Placement: Overview card (no new view).
- Rate: looked up from Rate History for snapshot date (not stored per row).
- Formulas: `Daily = Round((loan - offset) * (rate / 365), 2)`; `Monthly = Daily × daysInMonth(Date)` (actual days, not fixed ×31).
- Recalculated examples (@6.19%): 30 Jun 2026 ($602,168.12 − $92,747.63 → $86.39 → $2,591.70); 31 Jul 2026 ($600,626.51 − $97,058.82 → $85.40 → $2,647.40); 31 Aug 2026 ($599,047.14 − $98,759.17 → $84.84 → $2,630.04).
- Note: user's original Jun monthly $2,678.09 used ×31; approved rule gives ×30 = $2,591.70.
- Implementation: derived on read from latest repayment loan + offset total + rate lookup (Option A). No new table, no drift. Alternatives rejected: B persisted `interest_snapshots` table (audit history but stale risk); C forecast rows in Ledger (mixes actuals with forecasts).

## 4. Yearly & Targets management (approved detail)

Source rows `R50:R57`. Two parallel savings tracks: M-track (Offset 0390 column: M51 target $100k, M52 avg $1,361.99, M53 `2 Years and 11 Months`, M54 `2029-04-12`) and U-track (Sub Total column: U51 target $100k, U52 avg $2,160.72, T53 `2 Years and 5 Months`, U54 `2028-10-12`).

Editable (Overview cards):
- Target amount (M51/U51, default $100,000 each, `min: 0`): editing re-derives est period (`NPER(0, -avg, -current, target)` then `INT(y/12) Years + ROUNDUP(MOD) Months`) and target date (`EDATE(TODAY(), NPER)`).
- Verified flag per FY row (V55 `Verified`, V56 `comfirmed` [sic in sheet — normalize to `Verified` on import], V57 empty/YTD): dropdown (`Verified` / empty); stored in `finance.settings` as `mortgage.verified.<fy>` (e.g. `mortgage.verified.2025-2026`), read via `finance.settings.get`, written via `yearly-verify-edit` → `finance.settings.set`; max ~20 chars; never derived. No DB table — a single flag per FY does not justify DAO/service surface.

Derived (read-only, recomputed on ledger/offset writes):
- Yearly P/I ratios: `D = F/(F+H)`, `E = 1-D`.
- Yearly columns F:L: grouped by `mortgage_repayments.finance_year` equality (`WHERE finance_year = ?`), replacing the sheet's `SUMIFS` date-window rollups. FY boundary comes from `core.financialYear.start` at write time (via `computeFinanceYear`, same logic as `extensions/salary-history/src/services/pay-service.ts:133`); readable FY rows are 2023-2024, 2024-2025, 2025-2026 YTD.
- Avg saving: `M52 = (M44-M33)/(COUNT(M33:M44)-1)`, same for U52; est period and target dates derive from these.
- M55/U55-style checkpoints (`M52*M50`, `M44+M55`) shown as info only.

Validation/UX: target amount numeric >= 0; Verified flag max ~20 chars; derived cells show formula tooltip; YTD row (2025-2026) labeled as partial until FY end. Overview yearly cards show the last N FYs (N from `core.financeYear.filter`, default 5). Caveat: changing `core.financialYear.start` after data exists leaves stored `finance_year` labels stale — same trade-off as `salary-history`; fix by backfill pass or accept drift.

## 5. Data model (detailed schema)

Extension id: `mortgage` (display name `Mortgage`); all tables use the `mortgage_` prefix. Blocks below are copy-paste ready for `package.json` `financeExtension.tables` (shapes per `src/extension-host/manifest-schema.ts` `columnManifestSchema`: `integer`/`real`/`text`/`date`/`datetime`/`boolean` + `nullable`/`default`/`min`/`max`/`index`/`references`/`description`). Conventions: `date` = `YYYY-MM-DD` string; money = `real`, `min: 0` (except `extra_paid`, which goes negative — sheet `R55` `-411.99`); every table has `id` + `created_at`/`updated_at` like `salary-history`. Manifest has no `unique` constraint, so monthly `entry_date` uniqueness is enforced by the service upsert (`saveMonthEnd`, Section 6).

> **Platform note — Main auto-creates system columns.** At install, `ExtensionInstaller` → `createExtensionTables` (`src/main/services/table-ddl.ts` `buildCreateTableSql`) wraps every manifest table as `id INTEGER PRIMARY KEY AUTOINCREMENT` first, then the manifest columns, then `created_at TEXT NOT NULL DEFAULT (datetime('now'))` and `updated_at TEXT NOT NULL DEFAULT (datetime('now'))` last. The JSON blocks below still declare `id`/`created_at`/`updated_at` explicitly to match the `salary-history` reference convention (`extensions/salary-history/package.json`), which installs fine. At runtime the DAO validator (`src/shared/dao-schema.ts` `isSystemManagedColumn` + `.strict()`) strips `id` (`primary: true`), `created_at`, `updated_at` from insert/update payloads — extension code must never write them; the DAO fills them. If the manifest omits them, Main still adds them; declaring them is redundant but harmless and keeps parity with the working reference.

### 5.1 `mortgage_loans` — singleton setup + targets (sheet `A1:C9`, `M51`/`U51`)

One row seeded on `activate()` from sheet values (property $687,500, deposit $45,000, loan $642,500, 30yr, set $4,200); manifest defaults stay neutral.

```json
{
  "name": "mortgage_loans",
  "columns": [
    { "name": "id", "type": "integer", "primary": true, "autoIncrement": true },
    { "name": "property_value", "type": "real", "nullable": false, "default": 0, "min": 0 },
    { "name": "deposit_amount", "type": "real", "nullable": false, "default": 0, "min": 0 },
    { "name": "loan_amount", "type": "real", "nullable": false, "default": 0, "min": 0 },
    { "name": "term_years", "type": "integer", "nullable": false, "default": 30, "min": 1, "max": 50 },
    { "name": "set_payment", "type": "real", "nullable": false, "default": 0, "min": 0, "description": "Monthly set payment C7 (4200); extra = set_payment - P&I" },
    { "name": "target_amount_offset", "type": "real", "nullable": false, "default": 100000, "min": 0, "description": "Editable M51 target" },
    { "name": "target_amount_subtotal", "type": "real", "nullable": false, "default": 100000, "min": 0, "description": "Editable U51 target" },
    { "name": "notes", "type": "text", "nullable": true },
    { "name": "created_at", "type": "datetime", "nullable": false, "default": "now" },
    { "name": "updated_at", "type": "datetime", "nullable": false, "default": "now" }
  ]
}
```

### 5.2 `mortgage_rate_history` — editable rate rows (sheet `E1:G8`)

`rate` stored as decimal (6.19% = `0.0619`). Overlap validation (`effective_to` >= next `effective_from`) is service-level. Rate lookup by snapshot/ledger date drives P&I (`C8` `PMT`) and the daily-interest card.

```json
{
  "name": "mortgage_rate_history",
  "columns": [
    { "name": "id", "type": "integer", "primary": true, "autoIncrement": true },
    { "name": "effective_from", "type": "date", "nullable": false, "index": true },
    { "name": "effective_to", "type": "date", "nullable": true },
    { "name": "rate", "type": "real", "nullable": false, "min": 0, "max": 1 },
    { "name": "notes", "type": "text", "nullable": true },
    { "name": "created_at", "type": "datetime", "nullable": false, "default": "now" },
    { "name": "updated_at", "type": "datetime", "nullable": false, "default": "now" }
  ]
}
```

### 5.3 `mortgage_repayments` — monthly ledger rows (sheet `A-L`, `R14:R47`)

Column mapping: `scheduled_balance`→B, `actual_balance`→E, `fy_interest`→C, `offset_saving_fy`→D (Total offset / FY offset interest saving; FY-cumulative, resets each FY per `core.financialYear.start`; stored + derived check), `actual_repayment`→F, `scheduled_payment`→G, `interest_charged`→H, `base_amount`→I (constant 3899.36), `fee`→J (constant 8), `total_paid`→K (stored for audit; service checks `total_paid == base_amount + fee`), `extra_paid`→L (no `min` — negatives occur), plus auto `finance_year` (no sheet source; computed, never user-edited). Snapshot semantics: balances (B/E plus 8 offset balances) are point-in-time values on `entry_date`; flows and FY cumulatives are durations over the snapshot dates. One snapshot per calendar month (`YYYY-MM` month-key); re-saving within the same month upserts (Section 6).

```json
{
  "name": "mortgage_repayments",
  "columns": [
    { "name": "id", "type": "integer", "primary": true, "autoIncrement": true },
    { "name": "entry_date", "type": "date", "nullable": false, "index": true, "description": "Snapshot date: any day within the month or a past month, normally month-end; future dates rejected; month-key YYYY-MM unique per calendar month (service-enforced upsert key)" },
    { "name": "finance_year", "type": "text", "nullable": false, "index": true, "description": "Auto-set YYYY-YYYY from entry_date via computeFinanceYear + core.financialYear.start (salary-history pattern); never user-edited" },
    { "name": "scheduled_balance", "type": "real", "nullable": false, "default": 0, "min": 0 },
    { "name": "actual_balance", "type": "real", "nullable": false, "default": 0, "min": 0 },
    { "name": "fy_interest", "type": "real", "nullable": false, "default": 0, "min": 0 },
    { "name": "offset_saving_fy", "type": "real", "nullable": false, "default": 0, "min": 0, "description": "Stored D (Total offset / FY offset interest saving); service shows derived check alongside" },
    { "name": "actual_repayment", "type": "real", "nullable": false, "default": 0, "min": 0 },
    { "name": "scheduled_payment", "type": "real", "nullable": false, "default": 0, "min": 0 },
    { "name": "interest_charged", "type": "real", "nullable": false, "default": 0, "min": 0 },
    { "name": "base_amount", "type": "real", "nullable": false, "default": 3899.36, "min": 0 },
    { "name": "fee", "type": "real", "nullable": false, "default": 8, "min": 0 },
    { "name": "total_paid", "type": "real", "nullable": false, "default": 0, "min": 0 },
    { "name": "extra_paid", "type": "real", "nullable": false, "default": 0, "description": "Allows negatives (sheet R55 -411.99)" },
    { "name": "created_at", "type": "datetime", "nullable": false, "default": "now" },
    { "name": "updated_at", "type": "datetime", "nullable": false, "default": "now" }
  ]
}
```

### 5.4 `mortgage_accounts` — offset account lookup (sheet headers `M13:T13`)

Seeded once on `activate()` with the 8 accounts (key → label, `sort_order` 1–8): `0390` Offset, `3564` My Trans, `5272` Emergency, `3545` Car, `9722` Emergency 2, `8107` Solar, `4323` Investment, `0743` My Childs. New accounts can be added later without schema change.

```json
{
  "name": "mortgage_accounts",
  "columns": [
    { "name": "id", "type": "integer", "primary": true, "autoIncrement": true },
    { "name": "account_key", "type": "text", "nullable": false, "description": "Sheet account suffix, e.g. 0390" },
    { "name": "label", "type": "text", "nullable": false },
    { "name": "sort_order", "type": "integer", "nullable": false, "default": 0, "min": 0 },
    { "name": "is_active", "type": "boolean", "nullable": false, "default": true },
    { "name": "created_at", "type": "datetime", "nullable": false, "default": "now" },
    { "name": "updated_at", "type": "datetime", "nullable": false, "default": "now" }
  ]
}
```

### 5.5 `mortgage_offset_balances` — per-date offset balances (sheet `M:V`)

Normalized: one row per (repayment, account) — 8 rows per month-end. `saveMonthEnd` resolves `account_key` → `account_id`; Sub Total/Total are derived, never stored.

```json
{
  "name": "mortgage_offset_balances",
  "columns": [
    { "name": "id", "type": "integer", "primary": true, "autoIncrement": true },
    { "name": "repayment_id", "type": "integer", "nullable": false, "index": true, "references": "mortgage_repayments.id" },
    { "name": "account_id", "type": "integer", "nullable": false, "index": true, "references": "mortgage_accounts.id" },
    { "name": "balance", "type": "real", "nullable": false, "default": 0, "min": 0 },
    { "name": "created_at", "type": "datetime", "nullable": false, "default": "now" },
    { "name": "updated_at", "type": "datetime", "nullable": false, "default": "now" }
  ]
}
```

Table prefix rule: must start with `<extension-id with - → _>_` per install validation. Five tables total (`mortgage_yearly` dropped — verified flag lives in settings).

## 6. Month-end entry (combined action)

Problem: the sheet stores one row per month (`A-V`, e.g. `R47`) but the model splits it into `mortgage_repayments` + `mortgage_offset_balances` (FK `repayment_date`). Two separate saves risk partial entry (ledger row without offsets, or offsets without ledger).

Design: single service method `saveMonthEnd({ date, scheduled_balance, actual, fy_interest, offset_saving_fy, interest_charged, scheduled, actual_repayment, extra_paid, offsets: {8 balances} })` executed in one DB transaction — repayment insert + 8 offset inserts commit together or roll back together. `finance_year` is auto-set from `date` via `computeFinanceYear(date, core.financialYear.start)` (same logic as `salary-history` `pay-service.ts:133`); it is never a form field and never user-edited. Upsert key is the calendar month (`YYYY-MM` derived from `date`), not the exact day: saving a second snapshot with the same `YYYY-MM` (e.g. `2026-05-29` then `2026-05-31`) replaces that month's rows with overwrite confirm, and the stored `entry_date` becomes the latest saved date. The Ledger shows the stored `offset_saving_fy` (D) with the service-derived FY offset saving alongside as a check (same stored + derived-check pattern as `total_paid`).

UI: the `Repayment Ledger` view owns an `Add month-end entry` action opening one form — snapshot-date field (defaults to today, editable to any day in the current or a past month, labeled "Snapshot date (normally month-end)") plus repayment fields on top, 8-account offset grid below with live Sub Total/Total. The `Offsets` view shows per-date breakdowns read-only; its edit button routes to the same combined form. No independent offset writes exist.

Validation: date required, valid `YYYY-MM-DD`, never in the future (any day in the current or a past month allowed); `finance_year` computable from it (reject unparseable dates / bad FY-start setting); all 8 balances numeric >= 0, prefilled from the previous month (never blank); repayment amounts numeric; `offset_saving_fy` numeric >= 0 (FY cumulative, resets each FY); duplicate calendar month (`YYYY-MM`) requires explicit overwrite confirm.

Rate-change flow unchanged: `Rate History` edit only; takes effect on next snapshot/P&I lookup.

## 7. Navigation (manifest + orchestrator)

Navigation has 3 layers. Proposed blocks are copy-paste ready for `package.json` `financeExtension` (shapes per `src/extension-host/manifest-schema.ts`).

### 7.1 Activity Bar — `views[]` (1 entry)

One icon; clicking it fires `onView:mortgage` and mounts the default panel (Overview). Same pattern as `salary-history` (1 view entry, 2 nav items).

```json
"activationEvents": ["onView:mortgage"],
"contributions": {
  "views": [{ "id": "mortgage", "name": "Mortgage", "icon": "assets/icon.svg" }]
}
```

### 7.2 Navigation Panel — `commands[]` + `navigation[]` (4 entries)

Each sidebar row triggers a command; each command handler (`activate()` via `finance.commands.registerCommand`) mounts a tag via `finance.ui.requestMount(tag)` (see `extensions/salary-history/src/main.ts` `openView`). When a Mortgage panel is active, the sidebar filters to the `Mortgage` group (`src/renderer/components/navigation-panel.ts` `_getVisibleItems`).

```json
"commands": [
  { "id": "mortgage.show-overview", "title": "Mortgage: Overview" },
  { "id": "mortgage.show-ledger", "title": "Mortgage: Repayment Ledger" },
  { "id": "mortgage.show-offsets", "title": "Mortgage: Offsets" },
  { "id": "mortgage.show-rates", "title": "Mortgage: Rate History" }
],
"navigation": [
  { "id": "mortgage-overview", "label": "Overview", "command": "mortgage.show-overview", "group": "Mortgage" },
  { "id": "mortgage-ledger", "label": "Repayment Ledger", "command": "mortgage.show-ledger", "group": "Mortgage" },
  { "id": "mortgage-offsets", "label": "Offsets", "command": "mortgage.show-offsets", "group": "Mortgage" },
  { "id": "mortgage-rates", "label": "Rate History", "command": "mortgage.show-rates", "group": "Mortgage" }
],
"allowedCommands": ["mortgage.show-overview", "mortgage.show-ledger", "mortgage.show-offsets", "mortgage.show-rates"]
```

Command → tag mapping (Host `activate()` handlers read `core.financialYear.start`, `core.financialYear.current`, `core.financeYear.filter` like Dashboard/Salary History and pass them as `mountData` `{ viewId, financialYearStart, financialYearCurrent, financeYearFilter }` for orchestrator `init()`; Ledger FY dropdown and Overview yearly window consume them):

| Command | Mounted tag |
|---|---|
| `mortgage.show-overview` | `mortgage-overview` (default) |
| `mortgage.show-ledger` | `mortgage-ledger` |
| `mortgage.show-offsets` | `mortgage-offsets` |
| `mortgage.show-rates` | `mortgage-rate-history` |

### 7.3 In-panel — Orchestrator + `allowedUiEvents`

Inside the panel, `Orchestrator.navigate(tag, mountData)` swaps the child custom element. UI elements stay thin: they dispatch `CustomEvent`s, the Orchestrator listens and drives navigation + writes. Form sub-states (month-end form, rate form, target/verified edits) are orchestrator-internal — no sidebar entries. Every event name must be listed or it is dropped.

```json
"allowedUiEvents": [
  "monthend-add-request", "monthend-save", "monthend-cancel",
  "offset-edit-request",
  "rate-add-request", "rate-create", "rate-edit-request", "rate-edit", "rate-form-cancel",
  "target-edit", "yearly-verify-edit", "fy-changed"
]
```

Event → orchestrator action:

| Event | Action |
|---|---|
| `monthend-add-request` | navigate to `mortgage-month-end-form` (prefilled from previous month) |
| `monthend-save` | `saveMonthEnd()` transaction (Section 6) → navigate `mortgage-ledger` |
| `monthend-cancel` | back to `mortgage-ledger` |
| `offset-edit-request` | navigate to `mortgage-month-end-form` for that date |
| `rate-add-request` / `rate-create` / `rate-edit-request` / `rate-edit` / `rate-form-cancel` | rate form lifecycle in Rate History |
| `target-edit` | update `mortgage_loans` targets (Overview) |
| `yearly-verify-edit` | `finance.settings.set('mortgage.verified.<fy>', flag)` (Overview; no DB write) |
| `fy-changed` | Ledger FY dropdown / Overview yearly-window selection; orchestrator reloads filtered by `finance_year` (last N FYs from `core.financeYear.filter`, default 5, same as Dashboard) |

## 8. Self-review

- No placeholders; all figures cite sheet cells.
- Consistent: 4 views match full-parity + dedicated-offsets + editable-rates answers; snapshot placement consistent with Overview choice; yearly/targets stay in Overview per management choice (no 5th view); month-end writes stay atomic via the combined action (no split-write path); snapshots are point-in-time with flexible backdated dates, one per calendar month (`YYYY-MM` upsert). navigation is 1 Activity Bar icon + 4 sidebar commands mapping to 4 tags, forms orchestrator-internal.
- Scope: single extension design, fits one implementation plan.
- Unambiguous: monthly uses actual days in month; rate from history lookup; only target amounts + Verified flag editable, yearly figures/avg/period/dates derived; `finance_year` auto-set via `computeFinanceYear(entry_date, core.financialYear.start)`, never user-edited; FY grouping by `finance_year` equality.
- Schema: Section 5 is copy-paste manifest JSON (5 tables, `mortgage_` prefix, sheet-cell mapping per column); `entry_date` uniqueness and all derived-only rules are service-enforced (manifest has no `unique`); verified flag lives in settings (`mortgage.verified.<fy>`), not a table.
- Navigation: Section 7 blocks are copy-paste manifest JSON (1 view, 4 commands, 4 nav items, 12 UI events); every `allowedUiEvents` entry has a mapped orchestrator action; `mountData` carries FY settings and `fy-changed` drives the Ledger filter + Overview window.
