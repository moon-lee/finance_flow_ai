# Phase 5 Plan Review — Gaps, Inconsistencies & Improvements

**Reviewed file:** [2026-07-18-phase5-webviews-multiextension.md](file:///D:/finance_flow_ai/docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md)
**Reviewer:** Antigravity · 2026-07-20
**Scope:** Gaps, internal inconsistencies, and suggested improvements only — not a full approval review.

---

## Summary Verdict

The plan is **thorough and well-structured** — it carries forward every Phase 4 deferral, documents 12 architecture decisions with alternatives and trade-offs, provides 20 tasks with verification steps, and includes a 12-item Self-Review Checklist. The vision alignment, spec coverage, and test pyramid sections are exemplary.

That said, I found **7 gaps**, **8 inconsistencies**, and **9 improvements** worth addressing before implementation.

---

## 1. Gaps (Missing Coverage)

### Gap 1 — `WebContentsView` vs `BrowserWindow` child terminology clash (done)

> [!WARNING]
> Decision 1 (L125–170) correctly chooses `WebContentsView` and explicitly rejects a child `BrowserWindow`. However, several later references still use `BrowserWindow` terminology:
> - [L175](file:///D:/finance_flow_ai/docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md#L175): file-reference table says `webview-panel-manager.ts` owns "one `BrowserWindow` child per WebviewPanel".
> - [L498](file:///D:/finance_flow_ai/docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md#L498): Decision 8 mentions "the Phase 5 shape of `WebviewPanel`" but some downstream references say `BrowserWindow`.
> - The Deliverable (L73) says "sandboxed Electron `BrowserWindow` child iframe".
>
> These need to be reconciled to `WebContentsView` everywhere, since Decision 1 explicitly rejected `BrowserWindow`.

### Gap 2 — No `deactivate()` lifecycle hook for the WebviewPanel teardown (done)

Decision 8 describes lazy-unmount and auto-save-draft, but the plan does not describe what happens when an extension is **disabled at runtime** (Phase 3's hot-disable). Specifically:
- When `setEnabled(extensionId, false)` is called, should `WebviewPanelManager` forcibly unmount all panels for that extension?
- Should the Host send `extension.deactivate` to the extension before Main destroys its panels?
- Phase 3 §7 defers `extension.deactivate` notification, but Phase 5's panel lifecycle introduces a concrete teardown need that Phase 3 didn't have.

**Recommendation:** Add a `onExtensionDisabled(extensionId)` handler to `WebviewPanelManager` in Task 2 that forcibly unmounts all panels for the disabled extension (with a `panel:auto-save-failed` toast if dirty).

### Gap 3 — `accounts` read-only enforcement gap for Dashboard

Decision 4 (L258–300) says "$join is allowed only on shared tables and the calling extension's own tables" and the Dashboard joins `accounts` (shared). But **Dashboard does not own any extension tables** — the plan never declares a `tables` block in the Dashboard manifest (Task 9.1, L1031–1058). This means Dashboard's only DAO access is `finance.db.table('accounts').find({})`. This is fine and correct, but:

- The plan's TU10 (L1306–1313) describes Dashboard running `finance.db.table('accounts').find({}, { $join: ... })` — a **self-join** of `accounts` with itself. This makes no semantic sense for the Dashboard's actual use case (it just needs a list of accounts).
- If the Dashboard needs to correlate accounts with payslips, it must use `finance.services.pay.*` (as Decision 4 correctly says), not a `$join`. TU10 should be rewritten to test `$join` from a **salary-history** context (joining `salary_history_pay_slips` with `accounts`), not from Dashboard.

### Gap 4 — Missing `configuration` block in Dashboard manifest (done)

The plan describes `dashboard.cardOrder`, `dashboard.financialYearStart` settings in several places (L673, L676, L1061), but the Dashboard manifest in Task 9.1 (L1031–1058) has **no `configuration` block** declaring these setting keys. Per `project_vision.md:53`, extensions declare their settings schemas in `contributes.configuration`. Either:
- Add a `configuration` block to the Dashboard manifest, or
- Document explicitly that Dashboard settings are deferred to Phase 7 (when the generic settings UI ships) and the settings are used via `finance.settings.get/set` without manifest validation.

### Gap 5 — `$join.on` validation description contradicts the structured shape (done)

Decision 4 (L278) defines `$join.on` as a structured object: `{ left: 'from_column', right: 'to_column' }`. But TU10 at L1313 shows `$join.on: 'salary_history_pay_slips.account_id = accounts.id'` — a **raw SQL string**. This directly contradicts Decision 4's injection-safe design. TU10 must use the structured `{ left, right }` object shape.

### Gap 6 — No task for Vite multi-entry config update for Dashboard (not applicable)

Phase 4's [vite.extensions.config.ts](file:///D:/finance_flow_ai/docs/file-reference.md#L128) bundles `extensions/salary-history/` into `dist/extensions/salary-history.js`. Adding the Dashboard extension requires updating this config to also discover and bundle `extensions/dashboard/`. None of the 20 tasks explicitly owns this change. Task 9 focuses on the Dashboard source code; Task 12 (TU12, L1320) verifies the build output but does not describe the Vite config change.

**Recommendation:** Add a step in Task 9 (e.g., 9.0) to update `vite.extensions.config.ts` so it discovers the new `extensions/dashboard/` directory.

### Gap 7 — `panel:init` message shape not typed (done)

Decision 1 mentions `panel:init` is sent via `webContents.send('panel:init', { extensionId, viewId, mountData })`. Decision 10 describes the panel receiving `financeShell` via the preload. But no task defines the **TypeScript type** for the `panel:init` payload. The plan should add this to Task 3 (panel-preload) or Task 2 (webview-panel-manager): a shared interface `PanelInitPayload` in `src/shared/panel-protocol.ts`.

---

## 2. Inconsistencies

### Inconsistency 1 — `salary.show-dashboard` command reference (done)

Decision 6 (L392–396) shows `salary.show-dashboard` in salary-history's `allowedCommands`. But Decision 6's own description says `allowedCommands` is a "subset of `commands[]`" — and salary-history only has two commands (`salary.show-pay-history` and `salary.show-pay-rate-history`). `salary.show-dashboard` is not in salary-history's `commands[]`, so it cannot be in `allowedCommands`. Also, L416 says "by listing `salary.show-dashboard` in salary-history's `allowedCommands`, salary-history opts into Dashboard's invocation of that specific command" — but that's backwards. The `allowedCommands` list governs commands on **the declaring extension**, not cross-extension invocation rights.

Task 8.4 (L1016) correctly lists only the two real commands. The Decision 6 example at L394 should be corrected to remove `salary.show-dashboard`.

### Inconsistency 2 — Test count discrepancy

The Test Plan table (L1376) totals **~87 new tests** and a project total of **~399** (Phase 4 ~312 + ~87). But:
- The table rows sum to: 5+12+8+4+8+6+5+5+5+6+4+8+6+5 = **87** — matches.
- However, L89 (Deliverable §12) says "project total ~400" and L1377 says "~399". These are consistent enough.
- But L1335 (Task 19.3) says "~50 new unit tests" while the test plan says ~87. **~50 vs ~87 is a significant discrepancy.**

### Inconsistency 3 — Decision 1 says `WebContentsView`, Deliverable §5 says `BrowserWindow` (done)

Deliverable item 5 (L73): "sandboxed Electron `BrowserWindow` child iframe." Decision 1 (L129) explicitly uses `WebContentsView` and rejects `BrowserWindow`. The Deliverable text needs updating.

### Inconsistency 4 — `finance.services.pay.*` syntax in Task 9.2 (done)

Task 9.2 (L1062) calls `finance.services.pay.getYearToDateSummary(financialYearStart)` using **dot notation** (`finance.services.pay.method()`). But Decision 5 (L322) defines the API as `finance.services.invoke('pay', 'getYearToDateSummary', params)`. The dot-notation suggests a typed proxy object that doesn't exist in the plan — the actual API is `invoke(serviceName, method, params)`. Task 9.3 (L1071) correctly uses `finance.services.invoke('pay', 'getYearToDateSummary', ...)`, but Task 9.2 and the Deliverable (L77) use the dot notation.

**Recommendation:** Either:
- a) Add a typed convenience proxy (`finance.services.pay = { getYearToDateSummary: (...) => finance.services.invoke('pay', 'getYearToDateSummary', ...) }`) — more developer-friendly but adds scope, or
- b) Update all dot-notation references to use `finance.services.invoke(...)`.

### Inconsistency 5 — Decision 11 says `'unsafe-eval'` removed, but title says "file:// URL" (done)

Decision 11's title (L632) says "Phase 5's WebviewPanel loads the bundle via a regular `<script src="...">` from a `file://` URL". But Decision 1 (L144) and Task 15.1 (L1207–1211) explicitly use `finance-shell://` (custom protocol), NOT `file://`. Task 15.1 even explains why: "Chromium blocks pages loaded over custom protocols from loading `file://` resources." The Decision 11 description should say `finance-shell://`, not `file://`.

### Inconsistency 6 — File count mismatch

L781 says "New files: 26" but the File Structure tree (L682–778) lists far more than 26 new files when you count all the Dashboard UI components, test files, docs, etc. A precise recount:
- Services: domain-service-registry, command-allowlist, ui-event-allowlist, webview-panel-manager, panel-protocol (5)
- Preload: panel-preload (1)
- Renderer: tab-bar, split-pane (2) — navigation-panel and workspace are rewrites, not new
- Dashboard extension: package.json, main.ts, aggregator-service.ts, dashboard-view.ts, net-worth-card.ts, ytd-salary-card.ts, last-payslip-card.ts, accounts-summary-card.ts, shared-styles.ts (9)
- Salary-history: public-pay-adapter.ts (1)
- Shared: panel-protocol.ts (1)
- Docs: ADR-0005, phase5-handoff.md (2)
- Tests: ~12 test files (12)
- Panel template: panel-template.html (1)
- Extension-host: api/services.ts, host-on-startup.test.ts (2)

That's ~36, not 26. The "(8 services + 4 preload + 5 renderer components + ...)" breakdown also doesn't match the tree.

### Inconsistency 7 — `core.workspace.defaultView` vs `onStartup`

Decision 2 (L181) says Main reads `core.workspace.defaultView` (default `'dashboard'`) and validates the referenced view is contributed by an `onStartup` extension. But there's no task that **writes the default value** of this setting. If it's a new setting, it needs to be either:
- Seeded in the settings DB during Phase 5 migration, or
- Handled purely as a fallback default in code (if `get('core.workspace.defaultView')` returns undefined, default to `'dashboard'`).

The plan should clarify which approach is used.

### Inconsistency 8 — `$join.on` left/right field semantics (done)

Decision 4 (L278) defines `on: { left: 'from_column', right: 'to_column' }`. But Task 6.3 (L938) says "check `left` table matches the `$join.table`" — this implies `left` refers to the **join table** (the table in `$join.table`) and `right` refers to the **primary table**. However, Decision 4's example (L268) shows:

```ts
$join: { table: 'accounts', on: { left: 'salary_history_pay_slips.account_id', right: 'accounts.id' }, type: 'LEFT' }
```

Here `left` = `salary_history_pay_slips.account_id` (primary table) and `right` = `accounts.id` (join table). So `left` is the **primary** table, contradicting Task 6.3's description. The naming is confusing — `left`/`right` follows SQL `ON a.col = b.col` order (left of `=` and right of `=`), not "left table = join table".

**Recommendation:** Rename to `{ fromColumn: 'salary_history_pay_slips.account_id', toColumn: 'accounts.id' }` or document the convention explicitly.

---

## 3. Improvements

### Improvement 1 — Dashboard card error-state UX distinction

Task 9.3 (L1079) notes the registry logs distinct warnings for "service not found" vs "service errored", and Dashboard should show different messages. But the actual `finance.services.invoke` API (Decision 5, L322) returns `null` in **both** cases — the caller cannot distinguish them from the return value alone. Either:
- a) Return a discriminated union `{ status: 'not-found' | 'error' | 'ok', data: T | null }` instead of raw `T | null`, or
- b) Accept that Dashboard cannot distinguish the two at the API level and remove the differentiated UX claim from Task 9.3.

Option (a) is cleaner but expands the API surface. Option (b) is simpler and honest.

### Improvement 2 — `autoSaveDraft` needs a clear extension-side contract

Decision 8 (L507, L523) describes `autoSaveDraft(handle)` as "which the extension implements via `finance.settings.set`", but there's no **extension-side API** defined. The extension needs:
- `finance.ui.onBeforeUnmount(callback: () => Promise<void>)` — called by `WebviewPanelManager` before unmounting.
- The callback is the extension's chance to persist its draft state.

Without this, the `autoSaveDraft` described in the plan has no way to actually call into the extension's code. Task 2.6 describes the Main-side timeout but not the extension-side hook.

### Improvement 3 — Navigation Panel should show items from ALL active extensions, not just the active one

Decision 3 (L237) says "Render the items of the **currently-active extension**." This means clicking Dashboard shows only Dashboard's nav items; clicking Salary shows only Salary's nav items. But `project_vision.md:350-352` describes the Navigation Panel as a "context-specific sidebar controlled by the active extension" — which aligns with the plan.

However, the Dashboard's navigation (L227–228) includes a cross-extension item: `"Open Salary History"` with `command: "salary.show-pay-history"`. This item only appears when Dashboard is the active extension, which is good UX. But what if a user wants to see **all** installed extensions' quick links? Consider adding a "All Extensions" group or a global "Quick Switch" section in Phase 7+.

No action needed for Phase 5, but worth noting as a §9 open question.

### Improvement 4 — Panel bounds sync on resize is under-specified

Decision 1 (L164) says "layout bounds must be synced from the workspace DOM to the `WebContentsView` on resize/scroll/split changes; Task 12 owns this sync." But Task 12 (L1135–1152) focuses on the `WorkspaceLayout` data model and tab-bar rendering — it does not describe the `setBounds()` sync mechanism. Specifically:

- Who computes the pixel bounds? The renderer knows the DOM layout; Main owns the `WebContentsView`.
- Is it a `ResizeObserver` in the renderer that sends `ipcRenderer.send('panel:resize', { panelId, bounds })` to Main?
- What about scroll sync (if the workspace itself scrolls)?

**Recommendation:** Add a step in Task 12 (e.g., 12.8) for the bounds-sync mechanism: renderer `ResizeObserver` → IPC → `panel.setBounds()` in Main.

### Improvement 5 — `core.workspace.layout` 4KB cap is fragile

Decision 9 (L566) says "if the serialized layout exceeds 4 KB, truncate to the active tab only." With verbose extension IDs and view IDs, a layout with ~20 tabs could easily approach 4 KB. The truncation to a single tab is a **destructive operation** that loses the user's workspace state silently.

**Recommendation:** Either:
- Increase the cap to 16 KB (still tiny for a setting), or
- Warn the user before truncating ("Your workspace layout was too large to save — it has been reset to the active tab"), or
- Store the layout in the DB as a separate table row (not in the settings KV store) to avoid the arbitrary cap.

### Improvement 6 — Dashboard `activate()` calls `finance.services.pay.*` before salary-history activates

Decision 2 (L182–184) says `onStartup` extensions activate in alphabetical order, with the default-view extension first. Dashboard (`id: 'dashboard'`) comes before Salary History (`id: 'salary-history'`) alphabetically, and Dashboard is the default view. So Dashboard activates **first**.

But Dashboard's `activate()` (Task 9.2, L1062) calls `finance.services.pay.getYearToDateSummary(...)` — which requires salary-history to have already registered its `pay` service. If Dashboard activates first, the `pay` service is not yet registered, and all service calls return `null`.

The plan's graceful degradation handles this (cards show "—"), but it means the Dashboard **always** shows placeholders on first boot, even if salary-history is installed. The user must click "Refresh" after salary-history activates.

**Recommendation:** Either:
- a) Activate salary-history (as an `onStartup` dependency) before Dashboard, by adding an `activateAfter: ['salary-history']` manifest field or by hardcoding the order in Decision 2.
- b) Have Dashboard defer its service calls to a `setTimeout(0)` or `queueMicrotask` after all `onStartup` activations complete (Main sends a `'startup-complete'` notification).
- c) Accept the first-boot placeholder UX and document it as a known limitation — Dashboard refreshes when the user navigates back to it or clicks "Refresh".

Option (b) is cleanest — it keeps activation order generic but gives Dashboard a chance to re-query after all extensions have activated.

### Improvement 7 — Missing `dashboard.open-salary-history` navigation command

Decision 3's Dashboard navigation example (L217–230) includes `"Open Salary History"` with `command: "salary.show-pay-history"`. But this command is owned by salary-history, and the command allowlist (Decision 6) gates commands by the **owning extension's** allowlist, not the **calling extension's** allowlist. So when the Navigation Panel fires `salary.show-pay-history`, the allowlist checks salary-history's `allowedCommands` — which **does** include `salary.show-pay-history` (Task 8.4).

This works, but the plan doesn't clearly document the **cross-extension command invocation flow**: Navigation Panel click → renderer `command-selected` → `executeCommand('salary.show-pay-history')` → Main allowlist checks salary-history's `allowedCommands` → allowed → Host activates salary-history → view mounts.

The flow works, but the allowlist enforcement point deserves a note: "The allowlist checks the **target command's owning extension**, not the calling extension." This distinction is implicit in the code but should be explicit in Decision 6 or Task 13.

### Improvement 8 — `WebContentsView` cleanup on app quit

The plan describes lazy unmount and `autoSaveDraft` but does not describe what happens when the **app quits** (Electron `will-quit` / `before-quit`). With `WebContentsView` panels, Main should:
- Call `autoSaveDraft` on all dirty panels before destroying them.
- Destroy all `WebContentsView` instances to avoid Electron leaks.

Phase 3's `will-quit` handler already does Host shutdown. Task 2 should add a `WebviewPanelManager.destroyAll()` call to the same `will-quit` handler.

### Improvement 9 — No visual design mocks for Dashboard or tab bar

Phase 4 shipped 8 HTML/CSS mockups (Plan Amendment 4 / Decision 18) that pre-approved the visual contract for all Salary History UI components. Phase 5 introduces significant new UI surfaces (Dashboard 4-card layout, tab bar, split-pane splitter, navigation panel redesign) but has **no mockups**. This is a regression from Phase 4's design discipline.

**Recommendation:** Either:
- Create mockups for the Dashboard, tab bar, and split-pane UI before implementation, or
- Document that Phase 5's UI design is intentionally deferred to implementation time (acceptable given the scope, but explicitly stated).

---

## 4. Cross-Reference Checks

| Check | Result |
|-------|--------|
| Every Phase 4 §7 deferral has a Phase 5 resolution | ✅ All 9 Phase 4 deferrals addressed in §3 |
| ADR-0005 exists and matches Decision 5 | ✅ [0005-domain-service-registry.md](file:///D:/finance_flow_ai/docs/decisions/0005-domain-service-registry.md) is consistent |
| `file-reference.md` has Phase 5 section | ✅ Present at [L165–229](file:///D:/finance_flow_ai/docs/file-reference.md#L165) |
| `project_vision.md` alignment claims are accurate | ✅ All 10 vision-alignment citations verified against [project_vision.md](file:///D:/finance_flow_ai/docs/project_vision.md) |
| Phase 4 `create-finance.ts` survival noted | ✅ L709, L920 — correctly preserved |
| ADR-0003 (JSON-RPC) extended, not replaced | ✅ New `domain.service.invoke` method added |
| ADR-0004 (bundling) exercised by Dashboard | ✅ Task 9 + TU12 verify two-extension build |

---

## 5. Severity Summary

| Category | Critical | Major | Minor |
|----------|----------|-------|-------|
| **Gaps** | 1 (Gap 3 — TU10 tests nonsensical self-join) | 3 (Gaps 1, 2, 6) | 3 (Gaps 4, 5, 7) |
| **Inconsistencies** | 1 (Inc 1 — `allowedCommands` semantics wrong) | 4 (Inc 2, 4, 5, 8) | 3 (Inc 3, 6, 7) |
| **Improvements** | 0 | 3 (Imp 2, 6, 4) | 6 |

**Recommended action:** Fix the critical and major items before implementation begins. Minor items can be resolved during implementation.

---

## 6. Responses to §9 Open Questions

> 1. **Should `dashboard.cardOrder` be a `string[]` or typed enum?**

`string[]` for now — the enum values are known only to the Dashboard extension, not to Core. Phase 7's generic settings UI can validate against a `oneOf` JSON Schema constraint declared in `contributes.configuration`. No change needed.

> 2. **Should Phase 5 ship a `dashboard.refresh` keyboard shortcut?**

No. Phase 7's shortcut customization is the right home. Agree with the plan's deferral.

> 3. **Should the 2-pane split persist across app restarts?**

Yes. `core.workspace.layout` is the right setting key — it follows the `core.*` namespace convention. Confirmed.

> 4. **Should the WebviewPanel manager expose a "pin tab" affordance?**

No — Phase 8 scope. Agree.

> 5. **Should `getMonthlySeries` return sparse or dense?**

**Dense** (every month in the FY, with zero for empty months). The Dashboard's chart rendering will be simpler if it receives a uniform 12-element array rather than having to gap-fill. The adapter can zero-fill cheaply. Recommend changing to dense.
