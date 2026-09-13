# Dashboard Mortgage Summary Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third Dashboard card showing mortgage loan/offset/net + snapshot date from the `mortgage.summary` domain service.

**Architecture:** Extend `buildAggregator` with a `mortgage.summary` invoke (graceful null); render a same-style card third in order; `⋮` opens Mortgage Overview via existing source-open bridge.

**Tech Stack:** TypeScript strict, Lit 3, Vitest + happy-dom, `finance.services.invoke` cross-extension contract.

## Global Constraints

- TypeScript `strict: true`; no implicit `any`.
- Dashboard only: `extensions/dashboard/src/**` + `tests/unit/extensions/dashboard/**`. No mortgage changes (`d:/finance_flow_ext/mortgage/**` untouched).
- No new settings keys, no `dependencies` manifest change, no new `allowedUiEvents` (reuse `card-source-open`).
- Command IDs unchanged; mortgage command `mortgage.show-overview` referenced but not modified.
- Graceful degradation: missing/disabled/errored `mortgage` service → placeholder, never throw.
- No `finance.db.table('mortgage_*')` reads from dashboard (namespace isolation).
- Do not bump versions; update `CHANGELOG.md` under `Unreleased` and `docs/file-reference.md`.

---

### Task 1: Aggregator mortgage field

**Files:**
- Modify: `extensions/dashboard/src/services/aggregator-service.ts`
- Test: `tests/unit/extensions/dashboard/aggregator-service.test.ts`

**Interfaces:**
- Consumes: `finance.services.invoke('mortgage', 'summary')` → `{ entry_date, loan_balance, offset_balance, net_loan } | null` (mortgage `getSummary`).
- Produces: `DashboardData.mortgage: MortgageCard | null` consumed by `dashboard-view.ts`.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/extensions/dashboard/aggregator-service.test.ts`:

```ts
it('populates mortgage card from mortgage.summary', async () => {
  const finance = makeMockFinance({
    mortgageSummary: { entry_date: '2026-08-31', loan_balance: 599047.14, offset_balance: 98759.17, net_loan: 500287.97 },
  });
  const result = await buildAggregator(finance as Parameters<typeof buildAggregator>[0], defaultSettings);
  expect(result.mortgage).toEqual({ entry_date: '2026-08-31', loan_balance: 599047.14, offset_balance: 98759.17, net_loan: 500287.97 });
});

it('mortgage card is null when service is missing', async () => {
  const finance = makeMockFinance();
  const result = await buildAggregator(finance as Parameters<typeof buildAggregator>[0], defaultSettings);
  expect(result.mortgage).toBeNull();
});
```

This requires extending the file's `makeMockFinance` overrides with `mortgageSummary?: unknown` and a branch `if (serviceName === 'mortgage' && method === 'summary') return overrides.mortgageSummary ?? null;` — add those lines as part of Step 1 (test scaffolding, not implementation).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/extensions/dashboard/aggregator-service.test.ts -v`
Expected: FAIL with `expected undefined to equal {...}` (no `mortgage` field yet).

- [ ] **Step 3: Write minimal implementation**

In `extensions/dashboard/src/services/aggregator-service.ts`:

```ts
export interface MortgageCard {
  entry_date: string | null;
  loan_balance: number;
  offset_balance: number;
  net_loan: number;
}
```

Add `mortgage: MortgageCard | null;` to `DashboardData`.

In `buildAggregator`, extend the `Promise.all` destructure with `mortgageSummaryRaw`:

```ts
const [ytdSummaryRaw, payslipStats, todoCountsRaw, mortgageSummaryRaw] = await Promise.all([
  finance.services?.invoke<unknown>('pay', 'getYearToDateSummary', [settings.financialYearStart, undefined, settings.financialYearCurrent]),
  finance.services?.invoke<unknown>('pay', 'getPayslipStats'),
  finance.services?.invoke<unknown>('todo-list', 'counts'),
  finance.services?.invoke<unknown>('mortgage', 'summary'),
]);
```

Add to the return object:

```ts
mortgage: (() => {
  const m = mortgageSummaryRaw as Record<string, unknown> | null;
  if (!m) return null;
  const entry = m.entry_date;
  return {
    entry_date: typeof entry === 'string' ? entry : null,
    loan_balance: Number(m.loan_balance ?? 0),
    offset_balance: Number(m.offset_balance ?? 0),
    net_loan: Number(m.net_loan ?? 0),
  };
})(),
```

Also update the file header comment (`2 Dashboard card payloads` → mortgage) — one-line comment touch.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/extensions/dashboard/aggregator-service.test.ts -v`
Expected: PASS. Also update the `only invokes the services the view renders` test's expected call list to include `mortgage.summary`.

- [ ] **Step 5: Commit**

```bash
git add extensions/dashboard/src/services/aggregator-service.ts tests/unit/extensions/dashboard/aggregator-service.test.ts
git commit -m "feat(dashboard): aggregate mortgage summary"
```

---

### Task 2: Mortgage card UI + order + source-open

**Files:**
- Modify: `extensions/dashboard/src/ui/dashboard-view.ts`
- Modify: `extensions/dashboard/src/orchestrator.ts`
- Modify: `extensions/dashboard/src/main.ts`
- Modify: `extensions/dashboard/src/ui/reorder-cards-modal.ts`
- Test: `tests/unit/extensions/dashboard/orchestrator.test.ts`

**Interfaces:**
- Consumes: `DashboardData.mortgage` (Task 1), `cardOrder` with `mortgage-summary`.
- Produces: rendered card + `_CARD_SOURCES['mortgage-summary']` consumed by panel shell bridge.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/extensions/dashboard/orchestrator.test.ts`:

```ts
it('mortgage-summary card points at Mortgage Overview', async () => {
  const { DashboardOrchestrator } = await import('../../../../extensions/dashboard/src/orchestrator');
  const orch = new DashboardOrchestrator({} as never, document.createElement('div'), {});
  const sources = (orch as unknown as { _CARD_SOURCES: Record<string, { viewId: string; commandId: string }> })._CARD_SOURCES;
  expect(sources['mortgage-summary']).toEqual({ viewId: 'mortgage', commandId: 'mortgage.show-overview' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/extensions/dashboard/orchestrator.test.ts -v`
Expected: FAIL with `expected undefined to equal {...}`.

- [ ] **Step 3: Write minimal implementation**

In `extensions/dashboard/src/orchestrator.ts`:

```ts
export const CANONICAL_CARD_ORDER = [
  'pay-summary',
  'todo-summary',
  'mortgage-summary',
] as const;
```

```ts
const CARD_LABELS: Record<string, string> = {
  'pay-summary': 'Pay Summary',
  'todo-summary': 'Todo Summary',
  'mortgage-summary': 'Mortgage Summary',
};
```

```ts
private readonly _CARD_SOURCES: Record<string, { viewId: string; commandId: string }> = {
  'pay-summary': { viewId: 'salary', commandId: 'salary.show-pay-history' },
  'todo-summary': { viewId: 'todo-list', commandId: 'todo-list.hello' },
  'mortgage-summary': { viewId: 'mortgage', commandId: 'mortgage.show-overview' },
};
```

In `extensions/dashboard/src/main.ts`, the `readSettings` card-order validation uses `CANONICAL_CARD_ORDER` already — no change needed (import covers the new id). Verify by reading: the filter `CANONICAL_CARD_ORDER.includes(...)` automatically accepts `mortgage-summary`.

In `extensions/dashboard/src/ui/reorder-cards-modal.ts`, extend `CARD_LABELS`:

```ts
const CARD_LABELS: Record<string, string> = {
  'net-worth': 'Net Worth',
  'ytd-salary': 'Year-to-Date Salary',
  'last-payslip': 'Last Payslip',
  'accounts-summary': 'Accounts Summary',
  'pay-summary': 'Pay Summary',
  'todo-summary': 'Todo Summary',
  'mortgage-summary': 'Mortgage Summary',
};
```

In `extensions/dashboard/src/ui/dashboard-view.ts`, add after `_renderTodoSummaryCard`:

```ts
private _renderMortgageSummaryCard(): unknown {
  const m = this.aggregator?.mortgage;

  return html`
    <div class="card">
      <div class="card-header">
        <span class="card-title-group">
          <span class="card-title">Mortgage Summary</span>
          ${m?.entry_date
            ? html`<span class="card-badge">${m.entry_date}</span>`
            : html`<span class="card-badge muted">No data</span>`}
        </span>
        <span class="card-header-actions">
          <button class="card-action-btn" data-card-id="mortgage-summary" title="Open Mortgage" @click=${() => this._emitCardSourceOpen('mortgage-summary')}>⋮</button>
        </span>
      </div>

      <table class="ytd-table">
        <thead>
          <tr>
            <th></th>
            <th class="num">LOAN</th>
            <th class="num">OFFSET</th>
            <th class="num">NET</th>
          </tr>
        </thead>
        <tbody>
          ${m ? html`
            <tr>
              <td>Mortgage</td>
              <td class="num actual">${this._formatCurrency(m.loan_balance)}</td>
              <td class="num actual">${this._formatCurrency(m.offset_balance)}</td>
              <td class="num actual">${this._formatCurrency(m.net_loan)}</td>
            </tr>
          ` : html`
            <tr><td colspan="4">Install Mortgage to see this card</td></tr>
          `}
        </tbody>
      </table>
    </div>
  `;
}
```

In `render()`, extend the card map:

```ts
const cards = this.cardOrder.map(id => {
  if (id === 'pay-summary') return this._renderPaySummaryCard();
  if (id === 'todo-summary') return this._renderTodoSummaryCard();
  if (id === 'mortgage-summary') return this._renderMortgageSummaryCard();
  return null;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/extensions/dashboard/ -v`
Expected: PASS (all dashboard suites).

- [ ] **Step 5: Commit**

```bash
git add extensions/dashboard/src/ui/dashboard-view.ts extensions/dashboard/src/orchestrator.ts extensions/dashboard/src/main.ts extensions/dashboard/src/ui/reorder-cards-modal.ts tests/unit/extensions/dashboard/orchestrator.test.ts
git commit -m "feat(dashboard): mortgage summary card"
```

---

### Task 3: Verification + docs (typecheck, full suite, CHANGELOG)

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/file-reference.md`
- Test: full dashboard suite + `tsc --noEmit`

**Interfaces:**
- Consumes: Tasks 1–2 output.
- Produces: green suite + changelog entry per `AGENTS.md §5`.

- [ ] **Step 1: Run full dashboard suite**

Run: `npx vitest run tests/unit/extensions/dashboard/ -v`
Expected: PASS (all files, including updated service/order/view expectations).

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS with no output.

- [ ] **Step 3: Write docs**

In `CHANGELOG.md`, under `## [Unreleased]` (create if absent) add `### Added`:

```markdown
### Added

- **Dashboard Mortgage Summary card** (`extensions/dashboard/src/services/aggregator-service.ts`, `extensions/dashboard/src/ui/dashboard-view.ts`, `extensions/dashboard/src/orchestrator.ts`, `extensions/dashboard/src/ui/reorder-cards-modal.ts`). Third card (`mortgage-summary`) showing loan/offset/net + snapshot-date badge from the `mortgage.summary` domain service; same card/table style as pay/todo; `⋮` opens Mortgage Overview with `activateView` fallback; placeholder when Mortgage is missing; order persisted via `dashboard.cardOrder`.
```

In `docs/file-reference.md`, dashboard rows: note `mortgage-summary` in `CANONICAL_CARD_ORDER` / aggregator / view rows. Keep frontmatter version in sync with `package.json#version`; do not bump.

- [ ] **Step 4: Manual verification (dev panel, not automated)**

`npm run dev` with mortgage installed: card shows loan/offset/net + snapshot badge; mortgage disabled → placeholder; `⋮` opens Mortgage Overview; reorder persists; `dashboard.refresh` re-pulls summary.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md docs/file-reference.md
git commit -m "docs: changelog for dashboard mortgage card"
```

---

## Self-Review

- **Spec coverage:** §1 aggregator → Task 1; §2 UI/order/source-open → Task 2; §3 tests/rollout → Task 3. All covered.
- **Placeholder scan:** no TBD/TODO; every step has exact paths, code, commands, expected output.
- **Type consistency:** `MortgageCard` shape matches mortgage `getSummary` return; `mortgage-summary` id consistent across order, labels, sources, view map, tests.
