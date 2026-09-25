# Wealth Flow Design (Bank + Stock)

**Date:** 2026-09-23 (merged from the Bank and Stock phase specs).
**Scope:** One standalone `wealthflow` extension shipping Bank (masters + monthly interest log + FY totals) and Stock (holdings + dividend receipts + cross-domain Overview). Delivered Bank-first, Stock-second; one spec, one repo, one tab.
**Approach:** Standalone user extension (mirrors `todo-list`/`mortgage`): SDK scaffold, lazy `onView` activation, `wealthflow_*` tables, public `wealthflow` domain service. App repo untouched.

## 1. Background

Source: `docs/Tax Brackets_2026_2027.xlsx`, sheet `Other Income` — two blocks, each yearly totals over a transaction log.

* **Right block (Bank):** interest across Macquarie / BOQ / ANZ / UBank with a rate row (4.25% / 4.05% / 0.65% / 4.35%); yearly totals (1,756.04 → 320.54 → 52.19 → 5.94 partial) from a monthly log (one row per bank per month).
* **Left block (Stock):** ~23 dividend receipt rows (Jul 2024–Jul 2026): `date | type (Non Trust / Trust(ETFs)) | Gross | Franking | Stock (VAS, VHY, FGX, NAB) | broker`. Yearly rows are `SUMIFS` over date + type. Caveats: 2023–24 hardcoded (pre-formula); 2026–27 formulas look copy-pasted with Trust franking stuck at 0.

Gross + franking + interest feed taxable income — the service surface (§7) is the designed Tax input.

Non-goals (v1): buy/sell trades, cost base / CGT, DRP automation, live prices (opt-in only — breaks offline-first), interest-rate tracking (opted out: display-only, no consumer; returns via migration if estimates/validation ever need it), charts, FY-vs-FY comparison (parked as 1.5), dashboard card (service ready; consumer wires up later), hard-delete.

## 2. Manifest (`package.json` `financeExtension`)

* `id: "wealthflow"`, `displayName: "Wealth Flow"`, `main: "src/main.ts"`, `dependencies: []`.
* `activationEvents: ["onView:wealthflow"]` — lazy like `todo-list`/`mortgage`. `onStartup` flip (plus dashboard dependency) fires only when dashboard/Tax invoke the service at boot; until then eager activation buys nothing (todo/mortgage placeholder lesson).
* `contributes.views`: exactly ONE entry (`id: "wealthflow"`, `name: "Wealth Flow"`, `assets/icon.svg`). All screens are orchestrator children via `mountData.view` (salary-history single-tab pattern).
* `contributes.commands`: `wealthflow.show-banks` (default view `openCommand`), `wealthflow.add-interest`, `wealthflow.show-stocks`, `wealthflow.add-dividend`, `wealthflow.show-overview`.
* `contributes.navigation` (group `Wealth`): Banks, Add Interest, Stocks, Add Dividend, Overview.
* `contributes.allowedCommands`: all five ids. `contributes.allowedUiEvents`: `bank-create/edit/activate/deactivate`, `interest-create/edit/delete`, `stock-create/edit/activate/deactivate`, `dividend-create/edit/delete`, `fy-changed`, `overview-fy-changed`.
* `contributes.configuration`: `wealthflow.themeColor` (hex pattern, sibling shape).
* `tables`: all four §3 tables. Installer enforces the `wealthflow_` prefix; DAO namespace enforcement makes cross-extension writes structurally impossible.

## 3. Tables

### 3.1 `wealthflow_banks` (master)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | integer | PK, autoincrement | |
| `name` | text | NOT NULL | e.g. `Macquarie`. Duplicate-name-among-active warning (app-level, §6). |
| `bsb` | text | NULL | 6 digits, stored raw, displayed `NNN-NNN`. TEXT — numeric storage would destroy leading zeros irreversibly. Optional. |
| `account_number` | text | NOT NULL | TEXT, same leading-zero reason. Display masked (§5). |
| `is_active` | boolean | NOT NULL, default `true` | First-class Activate/Deactivate (§5). No hard-delete in v1. |
| `notes` | text | NULL | |
| `created_at` / `updated_at` | datetime | NOT NULL, default `now` | |

### 3.2 `wealthflow_interest_entries` (monthly log)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | integer | PK, autoincrement | |
| `bank_id` | integer | NOT NULL | App-level FK (salary `account_id` pattern — no DB FK). Must exist; new entries require `is_active = true`. |
| `date` | date | NOT NULL | Any date; month = first 7 chars. Default: current month-end. Convention: once a month. |
| `amount` | real | NOT NULL, `min: 0` | AUD, stored plain; formatted display-only (§5). |
| `finance_year` | text | NOT NULL | Auto-filled via `computeFinanceYear(date, core.financialYear.start)` + amber mismatch callout on override (salary-history pattern). Shared setting, none of our own. |
| `notes` | text | NULL | |
| `created_at` / `updated_at` | datetime | NOT NULL, default `now` | |

**Once-per-month rule (load-bearing):** one entry per bank per calendar month, enforced app-side on insert/update (installer DDL has no expression-unique indexes): `An entry for <Bank> already exists in <Mon YYYY> — edit it instead.`

### 3.3 `wealthflow_stocks` (master)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | integer | PK, autoincrement | |
| `code` | text | NOT NULL, UNIQUE (all rows) | Ticker key (`VAS`), uppercase-normalized on write. Global uniqueness — re-buying later means reactivate, never duplicate. |
| `name` | text | NOT NULL | e.g. `Vanguard Australian Shares`. |
| `shares` | real | NOT NULL, `min: 0` | REAL (not integer) — DRP fractions later. Current count, edited directly (no trade log in v1). |
| `is_active` | boolean | NOT NULL, default `true` | Same Activate/Deactivate semantics as banks. |
| `notes` | text | NULL | |
| `created_at` / `updated_at` | datetime | NOT NULL, default `now` | |

### 3.4 `wealthflow_dividends` (receipt log — the sheet's left block)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | integer | PK, autoincrement | |
| `stock_id` | integer | NOT NULL | App-level FK. Must exist; inactive stocks allowed (receipts are history). |
| `date` | date | NOT NULL | Payment date. No once-per-month rule (interim + final can collide). |
| `type` | text | NOT NULL | App-validated enum `non_trust \| trust \| foreign` (labels `Non Trust` / `Trust (ETF)` / `Foreign` — sheet vocabulary). |
| `gross` | real | NOT NULL, `min: 0` | Sheet Gross column (taxable). |
| `franking` | real | NOT NULL, `min: 0`, default `0` | Franking credit attached. |
| `finance_year` | text | NOT NULL | Same auto-fill + mismatch callout as §3.2. |
| `notes` | text | NULL | |
| `created_at` / `updated_at` | datetime | NOT NULL, default `now` | |

**Deferred, explicitly:** no `foreign_offset` receipt column — the sheet's log has none (offset appears only in yearly rows). Foreign-offset accuracy is a Tax-consumer requirement; Tax either estimates from type or this table gains the column via migration.

## 4. Build order (Bank-first inside one repo)

1. Scaffold + manifest (views/commands/tables declared for the full §2 surface; unbuilt children return a "coming in Stock" stub, never a dead button — nav items for Stocks/Dividends/Overview appear only when their views land).
2. Bank tables + CRUD + entries + footer (§5 bank half) → shippable Bank milestone: install, enter banks + monthly interest, FY totals correct.
3. Stock tables + holdings + dividend log (§5 stock half).
4. Overview + full service surface (§7) → v1 done.

## 5. UI (single `wealthflow` view + Lit orchestrator)

Child views retargeted in place via `mount-update`: `bank-list`, `interest-grid`, `interest-form` (single-entry corrections), `bank-form` (new-bank only), `stock-list`, `dividend-log`, `dividend-form`, `overview-view`. Top-level child tabs: Banks | Stocks | Dividends | Overview. **Global FY context:** one FY selector in the child-tab bar rules every view + footer (§5.4) — no per-view selectors.

```
┌ Wealth Flow ── [Banks|Stocks|Dividends|Overview] ── [FY: 2025–2026 ▾] ─┐
│ Banks                                                                 │
│ ○ Active ○ Inactive ○ All                                             │
│ ● Macquarie  012-345 •••4567   FY $25.93                              │
│     [Add interest] [Edit] [Deactivate]                                │
├───────────────────────────────────────────────────────────────────────┤
│ Interest ── FY 2025–2026 (sheet grid: months × banks, tab to move)    │
│            Macquarie    BOQ      ANZ      UBank      Total             │
│ Jul 2025     3.39      6.48     0.46      0.00      10.33              │
│ Aug 2025     2.10      5.30     0.58      0.00       7.98              │
│ ...          ...       ...      ...       ...        ...               │
├───────────────────────────────────────────────────────────────────────┤
│ Stocks                                                                │
│ VAS  Vanguard Aust. Shares  120 sh  FY $X + fr $Y  [...]              │
├───────────────────────────────────────────────────────────────────────┤
│ Overview ── FY 2025–2026                                              │
│ [Dividends  gross $A  frank $B (NT/Trust/F split)]                    │
│ [Interest   $C                               → Banks]                 │
│ [Combined   gross $A+C  franking $B]                                  │
├───────────────────────────────────────────────────────────────────────┤
│ FY 2025–2026 total (context):                               $52.19   │
│ [+ Add Bank] [+ Add Holding]...                                       │
└───────────────────────────────────────────────────────────────────────┘
```

* **Master rows (banks + stocks, same pattern):** status badge, Active/Inactive/All filter, per-row FY figure (bank: interest total; stock: gross + franking), per-row Add-entry / Edit / Deactivate-Activate. Deactivated rows muted; excluded from new-entry dropdowns but their history stays in all totals (closed accounts/positions are still taxable history).
* **Inline master editing:** name / BSB / account / shares edit directly in the row (Enter saves, Esc cancels, inline field errors). Modals reserved for deactivation confirms and the new-bank form only.
* **Entries — interest grid (primary):** 12 month-rows × N active-bank columns for the selected FY, mirroring the sheet; tab moves across, typing a cell creates/updates that bank-month's entry (any date within the month is recorded as month-end unless edited via the single-entry form). Duplicate-month violations are impossible by construction in the grid; the once-per-month rule + error (§3.2, §6) still guards the form/API path. `wealthflow.add-interest` focuses the grid at the current month. Per-row and per-column totals render live; the grid is the FY footer’s source view, not a second totals implementation.
* **Entries — single form (corrections/overflow):** bank dropdown (active only), any date, amount, auto `finance_year`, notes; used for back-dated edits, notes-heavy rows, and months outside the grid’s FY.
* **Entries — dividends:** form-based log only (irregular receipts don’t suit grids): filterable table (`date | stock | type | gross | franking`) by stock + FY.
* **Deletion:** entry delete allowed with `confirm()` (user corrections, both logs); master delete = deactivate only, no hard path in v1.
* **Overview:** FY selector (shared `core.financialYear.*`) + three cards — Dividends (gross + franking, Non-Trust/Trust/Foreign split), Interest (total, deep-links to Banks), Combined — i.e. the sheet's yearly row as cards.
* **Formatting:** `Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })` → `$1,000,000.00` (dashboard helper precedent). Single-currency domain, no currency column. Accounts masked to last 4 (`•••4567`); BSB shown `NNN-NNN`.
* **Empty states:** no banks/holdings → first-add prompts; no FY rows → `$0.00`, never an error; Overview with neither → per-card hints (dashboard placeholder language).

## 6. Validation & errors

* Bank: amount ≥ 0; valid ISO date; bank must exist; new entries need active bank; once-per-month rejection with edit redirect; duplicate active name → warning; BSB non-6-digit → field error.
* Stock: `code` required, uppercased, globally unique → `Code VAS already exists — reactivate it instead.`; `shares`/gross/franking ≥ 0; `type` in enum; `stock_id` must exist; new dividends need active stock.
* `finance_year` override → amber mismatch callout (both logs).
* DAO errors propagate typed; service methods return `null` on error (graceful contract, §7).

## 7. Domain service (same `wealthflow` name, additive)

Registered in `activate()`, unregistered in `deactivate()` — salary-history `pay` adapter precedent (thin wrappers, JSON-safe values only).

```ts
invoke('wealthflow', 'getInterestSummary', ['2025-2026']);
// → { financialYear, total, byBank: [{ bankId, name, total }] }

invoke('wealthflow', 'getDividendSummary', ['2025-2026']);
// → { financialYear, gross, franking,
//     byType: { non_trust: {gross, franking}, trust: {...}, foreign: {...} },
//     byStock: [{ stockId, code, name, gross, franking }] }

invoke('wealthflow', 'getOverviewSummary', ['2025-2026']);
// → { financialYear, dividends: <above>, interest: <above>,
//     combined: { gross, franking } }   // franking from dividends only
// All → null when inactive/missing (consumers degrade gracefully).
```

* `getInterestSummary` ships at the Bank milestone and stays contract-stable; Stock adds the other two (reusing the bank adapter internally for the combined call).
* History rule crosses the boundary: sums include deactivated banks/stocks. Documented in the contract.
* One method per consumer need, consumer-driven per ADR-0005 (dashboard card: totals + breakdowns; Tax: FY interest + dividends + franking). Monthly series waits for a real caller.

## 8. Activation & lifecycle

* `activate(finance)`: read settings, register service + commands, `requestMount('wealthflow', …)` in Host context; panel context mounts the orchestrator (dual-context shape mirrors `salary-history/src/main.ts`).
* `deactivate()`: unregister service, clear timers/subscriptions.
* No `db-changed` subscription (single writer; refresh is the future consumer's problem).

## 9. Testing

* Unit (happy-dom + stub `FinanceApi`, salary-history `main.test.ts` pattern): manifest shape; bank once-per-month accept/reject; stock code normalization + global uniqueness (active + inactive collision); type-enum rejection; finance_year auto-fill; `getInterestSummary` totals/byBank/empty→zeros/error→null; `getDividendSummary` with franking split by type + byStock; `getOverviewSummary` combining adapters; register/unregister on activate/deactivate.
* Mirror-of-sheet test: seed the ~23-row dividend shape (VAS/VHY/FGX across types) and assert FY gross + franking per type — guards the SUMIFS-to-code translation.
* Grid tests: cell write creates/updates the right bank-month entry; grid totals equal footer totals (single source — grid renders, footer sums same query); month-cell collision impossible (no duplicate path); single-form path still rejects duplicates with the edit redirect.
* Global-FY test: switching the tab-bar FY re-queries every child view + footer + Overview (no per-view drift).
* Manual: bank milestone (add bank → 2 months interest → duplicate-month rejected → deactivate keeps totals → FY switch); stock milestone (holding → dividend → duplicate-code rejected → deactivate keeps totals → Overview FY switch → DevTools shape checks).

## 10. Post-v1 handoff (reserved)

Trades / cost base / CGT, DRP, live prices (opt-in), `foreign_offset` receipts, FY-vs-FY comparison, charts, dashboard card + `onStartup` flip, Tax feed (`getOverviewSummary` is the designed input).

## Self-review

1. **Placeholder scan:** no TBD/TODO; deferrals named with owners (§1, §3.4, §10).
2. **Internal consistency:** single-view + children (§2) matches UI (§5); once-per-month for interest (grid-unreachable, form-guarded) vs none for dividends (stated, domain-justified); global FY (§5) removes per-view drift by construction; grid renders while footer sums the same query (one totals implementation, §5/§9); code-global-unique (§3.3) vs bank-name-warning (§3.1) — different identifier classes, both stated; inactive-included service (§7) matches entries-are-history (§5); `onView`-only (§8) consistent with no-live-consumers (§1); build order (§4) never exposes dead buttons.
3. **Scope check:** one extension, two sequenced milestones, no half-views; Overview included because all inputs decided here.
4. **Ambiguity check:** "total" per surface defined (§5 footer/cards, §7 contract); `gross` = sheet Gross (taxable); `combined.gross` = dividends gross + interest total; bank delete = deactivate, entry delete = hard with confirm.
