---
version: 0.1.0
created: 2026-09-13
last_updated: 2026-09-13T16:00:00+10:00
status: approved
---

# Dashboard — Mortgage Summary Card Design

## Goal

Add a third Dashboard card (`mortgage-summary`) showing the mortgage position from the mortgage extension's `summary` domain service, styled like the existing pay/todo cards.

## Context

- Dashboard (`extensions/dashboard`) currently renders 2 cards: `pay-summary` (YTD Pay Summary, via `pay.getYearToDateSummary` + `getPayslipStats`) and `todo-summary` (via `todo-list.counts`). Order: `CANONICAL_CARD_ORDER = ['pay-summary', 'todo-summary']` (`extensions/dashboard/src/orchestrator.ts:15`).
- Card UI (`extensions/dashboard/src/ui/dashboard-view.ts`): `.card` / `.card-header` / `.ytd-table` pattern, `⋮` button dispatching `card-source-open` → orchestrator `_CARD_SOURCES` → `executeCommand` with `activateView` fallback.
- Mortgage service (`d:/finance_flow_ext/mortgage/src/main.ts:57-64`): registers `mortgage` service with `summary: async () => getSummary(finance)`. `getSummary` (`d:/finance_flow_ext/mortgage/src/services/mortgage-service.ts:110`) returns `{ entry_date: string | null; loan_balance: number; offset_balance: number; net_loan: number }` — pure read, latest snapshot wins.
- Constraints: `docs/project_vision.md` extension isolation (no direct cross-table reads); ADR-0005 consumer-driven services with graceful `null` degradation; no mortgage changes.

## Decisions (approved 2026-09-13)

1. **Card fields:** all four (`entry_date` as badge, `loan_balance`, `offset_balance`, `net_loan` as rows).
2. **Card placement:** append third (`pay-summary`, `todo-summary`, `mortgage-summary`).
3. **Card open target:** `⋮` opens Mortgage Overview (`mortgage.show-overview`, fallback `activateView('mortgage')`).
4. **Approach:** Option A — aggregator `mortgage.summary` invoke + same card style (Option B direct DAO rejected as `TableAccessDenied`).

## 1. Aggregator contract

New types in `extensions/dashboard/src/services/aggregator-service.ts`:

```ts
export interface MortgageCard {
  entry_date: string | null;
  loan_balance: number;
  offset_balance: number;
  net_loan: number;
}
```

`DashboardData` gains `mortgage: MortgageCard | null`.

`buildAggregator` adds to the existing `Promise.all`:

```ts
finance.services?.invoke<unknown>('mortgage', 'summary')
```

Normalization mirrors pay/todo: `Number(... ?? 0)` for balances, string-or-null for `entry_date`. `null` (missing/disabled/errored service) → `mortgage: null` → placeholder row.

Cold-start note: mortgage declares only `onView:mortgage` (no `onStartup`), dashboard does not list it in `dependencies` — same lazy shape as `todo-list` (`onView:todo-list`). Fresh boot shows the placeholder until Mortgage opens once or `dashboard.refresh` re-runs; identical to the existing Todo card. No manifest dependency changes.

## 2. Card UI + order + source-open

New `_renderMortgageSummaryCard()` in `extensions/dashboard/src/ui/dashboard-view.ts`:

- Header: `Mortgage Summary` title + `card-badge` with `entry_date` (or muted `No data`); `⋮` button `data-card-id="mortgage-summary"` → `card-source-open`.
- Body (`ytd-table`, `_formatCurrency`, `num actual` classes):
  - `Loan` → `loan_balance`
  - `Offset` → `offset_balance`
  - `Net` → `net_loan`
- Missing: single row `Install Mortgage to see this card`.

Order: `CANONICAL_CARD_ORDER = ['pay-summary', 'todo-summary', 'mortgage-summary']` (`orchestrator.ts:15`, mirrored in `main.ts` read path); `CARD_LABELS` + reorder-modal label `Mortgage Summary`. Saved orders without the id keep working (filter-validated; new card appears after Reset or fresh default).

Source-open: `_CARD_SOURCES['mortgage-summary'] = { viewId: 'mortgage', commandId: 'mortgage.show-overview' }` — `executeCommand` first, `activateView('mortgage')` fallback.

## 3. Tests + rollout

Scope guard: dashboard only (`aggregator-service.ts`, `dashboard-view.ts`, `orchestrator.ts` + `CARD_LABELS`, `reorder-cards-modal.ts` label). No mortgage changes, no new settings keys, no `dependencies` change, no new `allowedUiEvents` (reuses `card-source-open`).

Tests (extend existing suites, TDD like pay/todo):

- `aggregator-service.test.ts`: `mortgage.summary` values → card populated; `null`/missing service → `mortgage: null`; `invoke` called with `('mortgage', 'summary')`; no `db.table` calls.
- `orchestrator.test.ts`: `_CARD_SOURCES['mortgage-summary']` → `{ viewId: 'mortgage', commandId: 'mortgage.show-overview' }`.
- View: rows render currency + badge date; missing → placeholder text.
- `vitest` + `tsc` green before done.

Manual: mortgage installed → card shows loan/offset/net + snapshot badge; mortgage disabled → placeholder; `⋮` opens Mortgage Overview; reorder persists via `dashboard.cardOrder`; `dashboard.refresh` re-pulls summary.

Completion bookkeeping per `AGENTS.md §5`: `CHANGELOG.md` entry + `docs/file-reference.md` sync.

## Alternatives rejected

- **B — Inline DAO read in dashboard:** `finance.db.table('mortgage_repayments')` from dashboard; rejected — violates namespace isolation (`TableAccessDenied`), bypasses the ADR-0005 service contract.

## Self-review

- No placeholders; all file paths, service names, and field names verified against current source.
- Consistent: single `mortgage.summary` invoke matches approved fields; card style/order/open-target match approved answers; placeholder + cold-start behavior matches existing pay/todo cards.
- Scope: dashboard-only; fits one implementation plan.
- Unambiguous: interface shape, invoke signature, card id/label, and test gates each have exactly one reading.
