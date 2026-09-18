---
version: 0.1.0
created: 2026-09-19
last_updated: 2026-09-19T12:00:00+10:00
status: approved
---

# TaxFlow Extension — Design

Source: `docs/Tax Brackets_2026_2027.xlsx` (13 sheets).
Reference pattern: `taskflow` / `budget` (single tab + Lit orchestrator + DAO/services, SDK standalone project).
SDK target: standalone extension built with `node D:/finance_flow_ai/scripts/sdk/cli.mjs` (`init` → `dev` → `build` → Install Folder).

## Decisions (approved 2026-09-19)

1. **Scope:** many finance years with a year switch. Each year keeps its own tax rates.
2. **Spouse:** included in v1 (income, fringe benefits, super, reportable total).
3. **Surcharge (MLS):** its own section. Per-year thresholds and rates. Result adds to tax total.
4. **Forecast:** included in v1 (average pay x 52 weeks).
5. **Deductions:** item rows with cost + work-use %. TaxFlow does the math.
6. **Capital gain:** one typed total per year in v1. Full CGT records later.
7. **Other income:** one total per type per year in v1. Detail moves to new extensions later.
8. **Layout:** Approach A — one tab, summary page with cards + separate Tax Rates view.
9. **Tab identity:** `Tax Flow`, id `taxflow`, `onView:taxflow`. Tables use the `taxflow_` prefix.
10. **Flexible items:** item types are data rows, not code. Add/deactivate without rebuild.
11. **Card order:** summary cards follow the `taxflow.cardOrder` setting, changed via a Reorder modal (salary-history `sectionOrder` shape). Rendered with CSS `order`, never by moving data.

## 1. Screens (one tab, two views)

Single `views[]` entry (`taxflow`, name `Tax Flow`). Lazy activation only — no `onStartup` (no consumer calls a `tax` service at boot).

| Nav item | View | Contents |
|---|---|---|
| Tax Summary | `tax-summary-view` | Year switch + 7 cards (§2) |
| Tax Rates | `tax-rates-view` | Year list + rate sets per year (§3) |

Both retarget the open panel via `mount-update` (salary/mortgage single-tab shape).

## 2. Tax Summary cards (7)

Year switch on top. All cards calculate with the picked year's rates. Card order follows `taxflow.cardOrder` (Reorder button); canonical order: income, deductions, spouse, mls, result, forecast, planner. Sheet F-block map: F5 full-FY flag, F7 combined income, F8 taxable, F9 super-adjusted taxable, F10 tax bill, F11 Medicare, F12 surcharge, F13 total bill, F14 withheld, F15 rate ratio, F17 refund, F18 full-year withheld, F19 planner compare.

1. **Income** — one row per active income type: Wages (auto from salary-history `pay` service when installed, else typed), Gross interest, Dividends (+withheld), Managed funds (+withheld), Net capital gain (typed total), Foreign income. Total row.
2. **Deductions** — item rows: label, cost, work-use %. Claim = cost x %. Groups: work, dividend costs, personal super. Total row.
3. **Spouse** — spouse income, fringe benefits, super, reportable total (auto sum). Hospital cover yes/no + covered days (drives MLS).
4. **Surcharge (MLS)** — always family-based: combined income (mine + spouse reportable + extras) against family tiers shifted by children. Single tiers only when no spouse and no children. Shows tier, rate, amount. Result adds to tax total.
5. **Result** — shows the math line by line: taxable income, tax on income, Medicare levy, surcharge, offsets, total withheld, refund or amount owed.
6. **Forecast** — average weekly pay so far x 52 weeks = full-year income, then re-runs the Result math. Marked clearly as a guess.
7. **Super top-up planner** (from sheet F9/F19) — what-if box: type a planned extra super amount → shows adjusted taxable income, new tax, and extra refund vs doing nothing. Answers "should I add more super before June 30?"

## 3. Tax Rates view (per-year sets)

One set per finance year. Each set holds:

- **Tax brackets** — rows: from, to, base tax, rate (e.g. $0–18,200 = 0%).
- **Medicare levy** — flat rate per year (2026-2027: 2%; no low-income cut-off in v1, approved 2026-09-19).
- **MLS tiers** — 3 tiers x single/family: income from, income to, rate (1%, 1.25%, 1.5%). 2026-2027 single: 105,000 / 123,000 / 164,000; family: 210,000 / 246,000 / 328,000; family limits shift +$1,500 per child after the first (ATO rule, approved 2026-09-19).
- **Reference links** — per year: ATO rates page, paycalculator.com.au, homeloanexperts.com.au calculator (from the sheet's hyperlinks).

Rules: **Copy last year** button starts a new year (never from zero). Old years lock at year end (unlock to fix). Rate edits need no rebuild — rates are data.

## 4. Data model (6 tables)

| Table | Purpose |
|---|---|
| `taxflow_years` | One row per year: key (`2026-2027`), start/end date, locked flag |
| `taxflow_rates` | Rate rows per year: kind (`bracket`/`medicare`/`mls-single`/`mls-family`), from, to, base, rate, link |
| `taxflow_item_types` | Master list: key, label, group (`income`/`deduction`/`offset`), order, active flag. Seed from the sheet |
| `taxflow_income` | Amounts per year per item type (+withheld where relevant). Wages row filled from salary service or typed |
| `taxflow_deductions` | Item rows: label, cost, work-use %, group. Claim derived, never stored |
| `taxflow_spouse` | One row per year: income, fringe benefits, super, hospital cover flag + covered days. MLS income also adds net investment losses + reportable super (yours + spouse) per ATO definition |

Result, refund, forecast: never stored — always calculated fresh.

Money = `real`, `min: 0`. Dates = `YYYY-MM-DD`. No `configuration` in v1 except `taxflow.themeColor`.

### Relationship map

```
taxflow_years (2026-2027, 2027-2028...)
   ├── taxflow_rates ───── rate rows for that year
   ├── taxflow_income ──── money per year ──► taxflow_item_types (group = income)
   ├── taxflow_deductions ─ items per year ─► taxflow_item_types (group = deduction)
   └── taxflow_spouse ──── one row per year
```

### Worked example (year 2026-2027, your sheet numbers)

`taxflow_years`: (`2026-2027`, 2026-07-01, 2027-06-30, unlocked).

`taxflow_item_types` (menu, seeded once):

| key | label | group |
|---|---|---|
| wages | Wages | income |
| interest | Gross interest | income |
| super-personal | Personal super | deduction |
| work | Work-related | deduction |

`taxflow_income` (each row points at one `income` menu item):

| year | item | amount | withheld |
|---|---|---|---|
| 2026-2027 | wages | 13,595.45 | 2,899 |
| 2026-2027 | interest | 5.94 | 0 |

`taxflow_deductions` (same menu item reusable; claim is math):

| year | item | label | cost | work % | claim |
|---|---|---|---|---|---|
| 2026-2027 | work | Internet | 1,290 | 40% | 516 (auto) |
| 2026-2027 | super-personal | Member contribution | 2,400 | 100% | 2,400 (auto) |

`taxflow_spouse`: (2026-2027, income 107,331, fringe 16,999, super 0, cover yes, 3 children).

`taxflow_rates`: 2026-2027 bracket rows (15% / 4,020 / 31,020 / 51,370), Medicare 2%, MLS single 105k/123k/164k + family 210k/246k/328k with +$1,500 per child after the first, 3 reference links.

Rules: one income row per item per year; menu item must match the table's group and be active; deactivating a menu item hides it from new entries but keeps history.

## 5. Calc engine (`tax-service.ts`, pure functions)

1. `taxOnIncome(income, brackets)` — walk bracket rows.
2. `medicareLevy(income, rate)` — income x rate.
3. `mlsAmount(mlsIncome, tiers, uncoveredDays, daysInYear)` — tier pick + day pro-rate (tiers pre-shifted for children).
4. `refund(withheld, bill)` — positive = refund, negative = owed.
5. `forecastFullYear(weeklyAverage)` — average x 52.
6. `superTopUp(taxable, extraSuper, brackets, medicareRate)` — F9/F19 planner.
7. `shiftFamilyTiers(tiers, children)` — +$1,500 per child after the first (ATO rule).
8. `deductionClaim(cost, workPercent)` — cost x %.

Fix safety: wrong number = edit in Tax Rates view. Wrong formula = one-line fix + unit test. Each card shows its working so errors are easy to spot against the sheet.

## 6. Salary link + future extension services

Wages YTD + withheld YTD via `finance.services.invoke('pay', ...)` (same calls Budget uses). Missing/disabled service → typed fallback boxes. Never throws, never blocks (vision graceful rule).

Future: each income type gets its own extension, same pattern as salary-history today. TaxFlow tries the service first, falls back to the typed total when the extension is missing:

| Income type | Future extension | Service method (planned) |
|---|---|---|
| Bank interest | interest extension | `interest.getYearTotal` |
| Dividends | dividends extension | `dividends.getYearTotal` |
| Managed fund distributions | managed-funds extension | `funds.getYearTotal` |
| Net capital gain | capital-gains extension | `gains.getYearTotal` |
| Work-related expenses | work-expenses extension | `expenses.getYearTotal` |
| Dividend deductions | dividends extension | `dividends.getDeductionTotal` |
| Personal super contributions | super extension | `super.getPersonalTotal` |

Until those extensions exist, the values stay typed in TaxFlow. No TaxFlow code change needed when they arrive — the service call is already in place, only the fallback goes quiet.

## 6b. Tax domain service (provided to other extensions)

TaxFlow registers a `tax` service in `activate()` (ADR-0005 pattern, salary `pay` shape). All methods return `null` on empty/error — same graceful contract. Unregistered in `deactivate()`.

Because consumers (e.g. Dashboard) may call at boot, TaxFlow declares `onStartup` + `onView:taxflow` (same cold-start lesson as salary/budget).

| Method | Returns |
|---|---|
| `getEstimate({ yearKey })` | `{ taxable, tax, medicare, mls, withheld, refund }` — current YTD numbers |
| `getEstimateWithSuper({ yearKey, extraSuper })` | Same shape after the planned extra super (the F9/F19 planner) |
| `getMls({ yearKey })` | `{ tier, rate, amount }` — surcharge tier pick + amount |

## 7. Files
```
src/
  main.ts                  # activate: 2 commands, panel branch builds orchestrator
  dao/years.ts             # listYears, lockYear
  dao/rates.ts             # rate sets per year, copyYear
  dao/items.ts             # item types + seed
  dao/income.ts            # income amounts per year
  dao/deductions.ts        # deduction items CRUD
  dao/spouse.ts            # spouse row per year
  services/tax-service.ts  # pure calc functions (§5)
  services/tax-summary.ts  # getEstimate/getEstimateWithSuper/getMls behind the tax service (§6b)
  ui/tax-orchestrator.ts   # 2-child view state + pushFinance + mount-update
  ui/tax-summary-view.ts   # year switch + 7 cards
  ui/tax-reorder-modal.ts  # card order editor (up/down + save, salary shape)
  ui/tax-rates-view.ts     # year list + bracket/MLS editors + links
  ui/index.ts              # customElements.define
```

## 8. Testing + rollout

- Unit tests for all 5 calc functions using the sheet's real 2026-2027 numbers (10,850.83 taxable → 2,681 refund shape).
- DAO tests against inline mock (taskflow pattern). `vitest run` + `tsc --noEmit` green.
- Manual: side-by-side with Excel, every card must match for 2026-2027.
- Rollout: SDK init/build/Install Folder/restart. No Core changes, no other-extension changes.

## Self-review

- No placeholders; all names, tables, and contracts named exactly.
- Consistent: single `taxflow` view + 2 nav retargets matches approved answers; flexible items match §3 fix; MLS own section matches user ask.
- Scope: one extension, v1 as approved. Full CGT records and per-bank detail deferred, noted in §2/§6.
- Unambiguous: per-year rates, copy-last-year, lock rule, typed fallbacks each have one reading.
