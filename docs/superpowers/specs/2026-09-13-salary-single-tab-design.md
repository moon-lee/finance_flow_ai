---
version: 0.1.0
created: 2026-09-13
last_updated: 2026-09-13T12:00:00+10:00
status: approved
---

# Salary History — Single-Tab Unification Design

## Goal

Convert `salary-history` from two panel identities (`payslip-list` + `pay-rate-history-view`) to a single `salary` tab titled `Salary`, retargeted in place by both sidebar nav items — mirroring the `mortgage` single-panel pattern (`views: [{ id: mortgage }]` + 5 nav commands → `mount-update` retarget).

## Context

- Current: `extensions/salary-history/package.json` declares `views: [{ id: payslip-list }]` with `activationEvents: [onStartup, onView:payslip-list]`; commands `salary.show-pay-history` → `requestMount('payslip-list')` and `salary.show-pay-rate-history` → `requestMount('pay-rate-history-view')` open two separate tabs.
- Reference: `d:/finance_flow_ext/mortgage/package.json` declares `views: [{ id: mortgage }]` with `activationEvents: [onView:mortgage]`; 5 commands each call `openView(childTag)` → `requestMount('mortgage', { view: childTag })`; `src/main.ts` panel branch creates `mortgage-orchestrator` and handles `mount-update` for in-place retarget.
- Current orchestrator (`extensions/salary-history/src/orchestrator.ts`) is a plain class doing `container.replaceChildren(child)`; mortgage uses a Lit `MortgageOrchestrator` element with `view` state + `pushFinance()` + `render()` child switch.
- Constraints: `docs/project_vision.md` Core-generic + extension-isolation rules; ADR-0005 consumer-driven `pay` service must stay untouched; no DB/schema changes.

## Decisions (approved 2026-09-13)

1. **Nav items:** keep both (`Pay History` + `Pay Rate History`, group `Salary`); both retarget the open `salary` panel.
2. **View identity:** single `views: [{ id: salary, name: Salary, icon: assets/icon.svg }]`; tab title always `Salary`.
3. **Orchestrator shape:** new Lit `salary-orchestrator` element replacing the plain class.
4. **Default child:** `payslip-list` unless `mount.view` specifies otherwise.
5. **Retarget behavior:** in-place `mount-update` retarget; forms return to caller.

## 1. Manifest identity (single tab)

```json
"activationEvents": ["onStartup", "onView:salary"],
"contributions": {
  "views": [{ "id": "salary", "name": "Salary", "icon": "assets/icon.svg" }]
}
```

- `activationEvents` keeps `onStartup` (cold-start fix 2026-09-13): the `pay` service must register before dashboard `buildAggregator` runs at boot (`host.ts` activates `onStartup` manifests in dependency order; `services.invoke` does not lazily activate providers). Single tab is unaffected — `onStartup` only restores Host-side provider ordering, `onView:salary` still lazy-mounts the panel.

- `commands`: unchanged IDs/titles/keybindings (`salary.show-pay-history` + `Ctrl+Alt+H`, `salary.show-pay-rate-history` + `Ctrl+Alt+R`).
- `navigation`: keep both items (`salary-pay-history` → `salary.show-pay-history`, `salary-pay-rate-history` → `salary.show-pay-rate-history`, group `Salary`).
- `allowedUiEvents`: unchanged (13 existing names); no new names.
- No `tables` / `configuration` changes.

## 2. `main.ts` mount flow (single panel identity)

- Keep settings read as-is: `core.defaultCurrency`, `core.financialYear.start`, `core.financialYear.current` → `mountData`.
- Add mortgage-style helper:

```ts
function openView(childTag: string): () => Promise<void> {
  return async () => {
    const mountData = settingsMountData; // + fresh settings read
    await finance.ui?.requestMount('salary', { view: childTag, ...mountData });
  };
}
```

- Mapping: `salary.show-pay-history` → `openView('payslip-list')`; `salary.show-pay-rate-history` → `openView('pay-rate-history-view')`.
- `activate(finance, ctx: { viewId?: string } & Record<string, unknown>)`: registers `pay` adapter + both commands in all contexts (unchanged).
- Panel branch (mirrors `mortgage/src/main.ts`): `if (typeof window !== 'undefined') await import('./ui/index.js')`; `if (ctx.viewId && typeof document !== 'undefined')` → clear `#app`, create `salary-orchestrator`, `queueMicrotask(() => el.init(finance, baseData))` + 50ms `setFinance` fallback, plus `app.addEventListener('mount-update', e => el.init(finance, { ...baseData, ...detail }))`.
- `registerUIComponents()` keeps the `typeof HTMLElement === 'undefined'` guard (Host stays DOM-free).

## 3. Lit `salary-orchestrator` (replaces plain class)

- New file `extensions/salary-history/src/ui/salary-orchestrator.ts`: `SalaryOrchestrator extends Base` with the `typeof HTMLElement !== 'undefined' ? LitElement : class {}` guard; tag `salary-orchestrator`; registered in `src/ui/index.ts`. Delete `src/orchestrator.ts` after migration.
- State: `view: 'payslip-list' | 'pay-rate-history-view' | 'payslip-form' | 'rate-row-form' | 'reorder-sections-modal'`, `mountData`, `sectionOrder` (from `salary-history.sectionOrder` setting), `editPaySlip`, `rateData`, `rateReadOnly`, `rateError`, `confirmDelete`, `replaceMode`, `returnTo: 'payslip-list' | 'pay-rate-history-view'`.
- `init(f, mount)`: child = `mount.view ?? mount.viewId ?? 'payslip-list'`; `'salary' | undefined → payslip-list`; legacy `'payslip-list'` / `'pay-rate-history-view'` pass through. Then `pushFinance()`.
- `render()`: single `#child` slot switching on `view` + error banner (same shape as `mortgage-orchestrator`).
- `pushFinance()`: after `requestUpdate`, query `#child`, assign `finance`, `sectionOrder`, `mountData` spread, one-shot `editPaySlip` / `rate` / `readOnly` / `rateError` / `confirmDelete` / `replaceMode`; call `child.setFinance(f)` when present, else property assignment. Clears one-shot state after inject (current `_mountChild` semantics preserved).
- Events move from `container.addEventListener` to `connectedCallback` `this.addEventListener`; all DB writes (`salary_history_pay_slips` / `salary_history_rate_history` insert/update/delete, `sectionOrder` persist) stay in orchestrator handlers; children stay pure surfaces.

## 4. In-panel navigation + form return paths

- Child tags unchanged: `payslip-list`, `pay-rate-history-view`, `payslip-form`, `rate-row-form`, `reorder-sections-modal`. No child UI logic changes required.
- Sidebar retarget: `mount-update` → `orchestrator.init()` remaps `detail.view` to child; never opens a second `Salary` tab.
- `navigate(tag)` sets `view` + `requestUpdate` + `pushFinance` (no full remount).
- Form flow: payslip add/edit sets `returnTo = 'payslip-list'`; rate add/view/edit/delete/replace sets `returnTo = 'pay-rate-history-view'`; create/edit/delete/cancel handlers write then `navigate(returnTo)`. `host-navigate` retained as fallback. `reorder-sections` modal returns to `payslip-form`.
- Failed rate writes keep `_failRateWrite` inline-error behavior (`rateError` on live `rate-row-form`), no navigation.

## 5. Testing + rollout

- Scope guard: manifest + `main.ts` + orchestrator only. No DAO/service/schema/child-UI changes; no new settings keys; `pay` adapter untouched (Dashboard unaffected).
- Tests: update mount/orchestrator tests to `salary-orchestrator` + single `salary` identity; add cases for (a) Activity Bar opens `Salary` defaulting to `payslip-list`, (b) nav retargets same panel via `mount-update`, (c) payslip form → `payslip-list`, rate form → `pay-rate-history-view`. `vitest` + `tsc` green before done.
- Manual: one `Salary` tab, both sidebar items retarget in place, forms/modals round-trip, reload preserves `sectionOrder`.
- Completion bookkeeping per `AGENTS.md §5`: `CHANGELOG.md` entry + `docs/file-reference.md` sync (implementation task, not this spec).

## Alternatives rejected

- **B — Single view + keep plain class:** smaller diff but diverges from the mortgage `pushFinance`/`setFinance` pattern and leaves `replaceChildren` remounts in place.
- **C — Core tab-reuse:** keep two view IDs and dedupe in shell; rejected — violates Core-generic / extension-isolation (`project_vision.md` §1–2), pushes extension concern into Core.

## Self-review

- No placeholders; all file paths and event/command names verified against current source.
- Consistent: single `salary` view with two nav retargets matches approved answers; Lit orchestrator matches mortgage reference; default/return-to rules unambiguous.
- Scope: manifest + entry + orchestrator only; fits one implementation plan.
- Unambiguous: view IDs, command mapping, `mount-update` flow, and test gates each have exactly one reading.
