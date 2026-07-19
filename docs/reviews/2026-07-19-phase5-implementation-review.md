---
title: Review of Phase 5 – Webview Panels, Multi-Extension UI & Cross-Extension Services (Implementation Focus)
date: 2026-07-19
status: completed
---

## Overview

The plan **docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md** is a thorough, decision-driven implementation plan. The 12 architecture decisions are well-justified, the task decomposition is granular, and the security hardening (Decisions 6 and 7) closes real gaps from Phase 3/4. The test plan is ambitious (~87 new unit tests) and covers the critical paths.

This review focuses on **implementation-blocking gaps and inconsistencies** that will surface when the agentic worker starts executing tasks. The previous review (2026-07-19-phase5-webviews-multiextension-review.md) covered editorial and UX gaps; this review covers **task/decision mismatches, undefined interfaces, and under-specified behaviour** that will stall implementation.

---

## Gap 1 – Extension-to-Panel Mount Mechanism Undefined

### Gap / Ambiguity

Task 9.2 calls `finance.ui.requestMount('dashboard-view', { aggregator })` inside the Dashboard extension's `activate()` function. However, **Decision 10 explicitly does not expose `requestMount`** in the panel preload — it only exposes `onUiMount` (receive mount requests) and `extensions.executeCommand` / `extensions.uiEvent`. The Host-side `finance.ui` API surface is not defined anywhere in the plan.

There is no task that:
- Adds `requestMount` to the Host-side `finance.ui` API.
- Defines the RPC method (`extension.requestMount`?) that the Host calls to ask Main to create a WebviewPanel.
- Defines how Main buffers mount requests during `onStartup` activation (Decision 2 Step 5 says "Main buffers the mount requests and forwards them to the Renderer once the workspace is ready," but no task implements this buffer).

### Impact

When the agentic worker reaches Task 9, `finance.ui.requestMount` will not exist. The Dashboard extension cannot activate and mount its panel. This is a **hard blocker** for the primary deliverable.

### Suggested Improvement

1. **Extend Decision 10** (or add a Decision 13) to specify the mount-request path:
   - Extensions call `finance.ui.requestMount(viewId, mountData)` from the Host bundle.
   - Host forwards `extension.requestMount` RPC to Main.
   - Main's `WebviewPanelManager.mount()` creates the `WebContentsView` and forwards `panel:init`.
2. **Add a Task 4.5** (or extend Task 4) that implements the `extension.requestMount` RPC handler and the mount-request buffer described in Decision 2 Step 5.
3. **Update Task 9.2** to use the newly-defined `finance.ui.requestMount` explicitly.

---

## Gap 2 – `$join.on` Shape Inconsistency Between Decision 4 and Task 6

### Gap / Ambiguity

**Decision 4** defines `$join.on` as a structured object:

```
| `$join` | `{ table, on: { left: string, right: string }, type: 'INNER' | 'LEFT' | 'RIGHT' }` |
```

and the narrative says `on` is a structured object with no raw SQL string.

But **Task 6.1** defines `JoinSpec` as:

```ts
JoinSpec = { table: string, on: string, type: 'INNER' | 'LEFT' | 'RIGHT' }
```

where `on` is a `string`, not `{ left: string, right: string }`. The code example in Decision 4 (line 268) also still uses the raw SQL string `on: 'salary_history_pay_slips.account_id = accounts.id'`.

### Impact

The implementing agent will see two contradictory specifications. If Task 6.1 is followed, `$join.on` accepts raw strings and the injection-safety guarantee from Decision 4 is violated. If Decision 4 is followed, Task 6.1's type signature is wrong and the validator in Task 6.3 must parse a structured object instead of a raw string.

### Suggested Improvement

1. **Fix the Decision 4 code example** (line 268) to use the structured object:
   ```ts
   $join: { table: 'accounts', on: { left: 'salary_history_pay_slips.account_id', right: 'accounts.id' }, type: 'LEFT' }
   ```
2. **Fix Task 6.1** `JoinSpec` to match:
   ```ts
   JoinSpec = { table: string, on: { left: string, right: string }, type: 'INNER' | 'LEFT' | 'RIGHT' }
   ```
3. **Update Task 6.3** validation logic to parse structured `{ left, right }` instead of `a.col = b.col` raw strings.

---

## Gap 3 – Domain Service Registry Resolution Underspecified

### Gap / Ambiguity

Decision 5 says the registry dispatches to the **"most recently activated"** extension that registered under a given `serviceName`. However, Task 7.1 stores services in a nested `Map<serviceName, Map<extensionId, impl>>`. JavaScript `Map` preserves insertion order, but the plan does not specify:

- Whether "most recently activated" means the last `register()` call (insertion order) or the last time `extension.activate` succeeded (activation timestamp).
- How `unregister()` affects resolution (if extension A registered, then B registered, then A unregisters, does B win?).
- Whether `invoke()` returns the first match or all matches (for fallback chains).

### Impact

When two extensions register the same service name (Phase 8 scenario, but testable in Phase 5 with mock extensions), the resolution behaviour is undefined. The unit tests in Task 7.8 ("last-registered wins") encode an assumption that may not match the implementation.

### Suggested Improvement

1. **Add explicit resolution rules to Decision 5:**
   - Resolution is by `register()` call order (insertion order in the inner Map).
   - `unregister()` removes the entry; subsequent `invoke()` picks the next-most-recent registration.
   - `invoke()` returns `null` if no registrations exist for the serviceName.
2. **Update Task 7.1** to implement these rules explicitly, e.g.:
   ```ts
   invoke(serviceName, method, params) {
     const impls = this.registry.get(serviceName);
     if (!impls || impls.size === 0) return null;
     const [extensionId, impl] = impls.entries().next().value;
     return impl[method](params).catch(() => null);
   }
   ```
3. **Add a test case** in Task 7.8 for the unregister-then-invoke scenario.

---

## Gap 4 – `finance.services.invoke` Null Ambiguity

### Gap / Ambiguity

Decision 5 and Task 7.1 both specify that `invoke()` returns `null` when:
- The service is not registered (extension missing/disabled).
- The registered implementation throws an error.

The Dashboard (Task 9.2) calls `finance.services.invoke('pay', 'getYearToDateSummary', ...)`. If salary-history is disabled, the Dashboard shows "Salary extension not installed." But if salary-history is enabled and its `PayService` throws an internal error, the Dashboard **also** shows "Salary extension not installed" — the user sees the same placeholder for two completely different failure modes.

### Impact

Debugging production issues becomes difficult. A user reporting "Salary extension not installed" could actually have a corrupted payslip database or a bug in `PayService`. The Dashboard cannot distinguish "service absent" from "service errored."

### Suggested Improvement

1. **Change the return shape** from `Promise<T | null>` to `Promise<{ value: T | null; error?: string }>` or add a companion `finance.services.isAvailable('pay')` method.
2. **Minimum viable fix:** add a `console.warn` in the registry's `catch` block that includes the error message and stack, so the DevTools console shows whether the null came from a missing service or a thrown error.
3. **Update Task 9.2** to check availability before rendering, or to render a different placeholder for "service errored" vs "service absent."

---

## Gap 5 – Test Count Discrepancy (Goal vs Test Plan)

### Gap / Ambiguity

The **Goal / Verification section** (line 89) states:

> `npm run test:unit` all tests pass (project total ~350 after Phase 5).

But the **Test Plan table** (line 1332) calculates:

> Phase 4 ~312 + ~87 new = ~399

And the Self-Review Checklist §5 (line 1414) says:

> ~87 new unit tests covering all 12 decisions... project total ~350.

These three numbers are inconsistent: ~350 vs ~399. The Test Plan table math is correct (312 + 87 = 399), so the Goal and Self-Review numbers are stale.

### Impact

CI configuration or acceptance criteria written against "~350" will fail when the actual count reaches ~399. The discrepancy undermines the test-plan's credibility.

### Suggested Improvement

1. **Update line 89** (Goal/Verification) to say "project total ~400 after Phase 5."
2. **Update Self-Review Checklist §5** (line 1414) to match.
3. **Add a Self-Review step** that asserts `npm run test:unit -- --listTests | Measure-Object` produces a count within ±10 of the documented total.

---

## Gap 6 – `setUIHandler` Interface Undefined

### Gap / Ambiguity

Task 2.3 says:

> In `main.ts`, instantiate `WebviewPanelManager` after the window is created; pass it to `ExtensionIPC.setUIHandler(...)` (replacing the Phase 4 renderer-mount path).

But `ExtensionIPC.setUIHandler` is not defined anywhere in the plan:
- No signature is given.
- No interface describes what methods `WebviewPanelManager` must implement to satisfy `setUIHandler`.
- The Phase 4 renderer-mount path that it replaces is not described (so the agent cannot safely "replace" it).

### Impact

The implementing agent must guess the interface. If the guess is wrong, the WebviewPanelManager won't receive mount/unmount/focus events from the Extension Host, and the panel lifecycle breaks silently.

### Suggested Improvement

1. **Define the UI handler interface** explicitly, e.g.:
   ```ts
   interface WebviewPanelUIHandler {
     onMountRequested(extensionId, viewId, mountData): void;
     onFocusRequested(panelId): void;
     onUiEvent(extensionId, eventName, detail): void;
     onSetDirty(panelId, dirty): void;
     onAutoSaveDraft(panelId): Promise<void>;
   }
   ```
2. **Add Task 2.5** that defines `setUIHandler` in `extension-ipc.ts` and wires it to the Host's `finance.ui.requestMount` / `finance.ui.setDirty` / `finance.ui.autoSaveDraft` calls.
3. **Document the Phase 4 renderer-mount path** being replaced (e.g., "the `extensions.onUiMount` subscription in `renderer/index.ts`") so the agent knows what to remove.

---

## Gap 7 – `autoSaveDraft` Failure Handling Missing

### Gap / Ambiguity

Decision 8 describes the lazy-unmount sequence:

> When a panel is about to be unmounted, `WebviewPanelManager` calls `autoSaveDraft()`... giving the extension a last chance to persist form state.

But it does not specify:
- What happens if `autoSaveDraft()` rejects (e.g., the extension's `finance.settings.set` fails due to a locked database).
- Whether the unmount proceeds or is deferred.
- Whether the user is notified.

### Impact

If `autoSaveDraft` fails and the panel is unmounted anyway, the user loses form data with no feedback. If the unmount is blocked indefinitely by a failing extension, memory leaks accumulate.

### Suggested Improvement

1. **Add a failure contract to Decision 8:**
   - `autoSaveDraft` has a **500 ms timeout** (configurable).
   - On timeout or rejection: log `console.error`, proceed with unmount, and show a toast in the renderer: "Your unsaved changes in [Extension Name] were lost."
   - The extension's `activate()` can re-hydrate from the last known good settings on next mount.
2. **Add Task 2.6** that implements the timeout + error-to-renderer toast flow.

---

## Gap 8 – Manual Test Unit 2 Hardcodes Activity Bar Button `P`

### Gap / Ambiguity

Test Unit 2 (line 1218) says:

> Click the `P` Activity Bar button.

But the plan itself (Task 11.3) says the Navigation Panel is now data-driven from extension contributions. The Activity Bar button label/icon is derived from the extension's `views[].icon` field (line 1007 shows `"icon": "D"` for Dashboard). If the salary-history extension's icon changes from `P` to something else, this test breaks.

The previous review's Gap 9 proposed a DOM-id-based lookup (`#activity-bar-button-salary-history`). This plan does not adopt that suggestion.

### Impact

Test fragility. A cosmetic manifest change (icon letter) breaks a manual test that is supposed to verify tab functionality.

### Suggested Improvement

1. **Replace line 1218's hardcoded `P`** with a lookup by extension view-id:
   > Locate the Activity Bar button for the `salary-history` view (icon from manifest). If the button is not present, skip this test.
2. **Add a precondition check** to all manual test units that reference Activity Bar buttons by label.

---

## Gap 9 – `Promise.all` vs Sequential Activation Order in Task 10

### Gap / Ambiguity

Decision 2 specifies that `onStartup` extensions activate in **alphabetical `id` order**, with the default-view extension first. But Task 10.1 shows:

```ts
if (manifest.activationEvents.includes('onStartup')) {
  onStartupCallbacks.push(activateExtension(extensionId, manifest));
}
```

This pushes Promises into an array but does not `await` them sequentially. If Main fires all `extension.activate` RPCs in parallel (e.g., `Promise.all(onStartupCallbacks)`), the Host may activate extensions out of order, violating Decision 2's deterministic ordering.

### Impact

Dashboard (id: `dashboard`) should activate before any other `onStartup` extension. If two `onStartup` extensions race, the Domain Service Registry's "most recently activated wins" rule (Decision 5) becomes non-deterministic, and the active tab may not be the default view.

### Suggested Improvement

1. **Update Task 10.1 / 10.2** to use sequential `for...of` with `await`:
   ```ts
   for (const ext of sortedOnStartupExtensions) {
     await extensionIPC.request('extension.activate', { extensionId: ext.id, reason: 'onStartup' });
   }
   ```
2. **Add a test case** in Task 10.5 that asserts Dashboard activates before any other `onStartup` extension, even when multiple are present.

---

## Gap 10 – WorkspaceLayout Persistence Schema Undefined

### Gap / Ambiguity

Task 12.5 says:

> Persist the `WorkspaceLayout` to `core.workspace.layout` setting on every change (debounced 500 ms).

But the plan never specifies:
- The JSON schema of `core.workspace.layout` (what does a 2-pane layout look like as JSON?).
- What happens on restore if an extension referenced in the layout is no longer installed or enabled.
- The maximum size of the persisted value (could be large with deep trees).

### Impact

On app restart, the workspace may fail to restore if the persisted layout references missing extensions. The debounced 500 ms write to `finance.settings.set` could also cause race conditions if the user drags splits rapidly.

### Suggested Improvement

1. **Add a schema example** to Decision 9 or Task 12:
   ```json
   { "type": "split", "direction": "horizontal", "children": [
     { "type": "tab", "panelId": "panel-dashboard", "label": "Dashboard" },
     { "type": "tab", "panelId": "panel-salary-history", "label": "Salary History" }
   ]}
   ```
2. **Add a fallback** in Task 12.6: if restoration fails (missing extension, corrupted JSON), fall back to a single-tab default layout with the Dashboard active.
3. **Add a size guard**: if the serialized layout exceeds 4 KB, truncate to the active tab only (prevent settings bloat).

---

## Minor Issues

1. **Task 5.2** references `DashboardOrchestrator` inside the salary-history extension — this is a copy-paste error from a shared template. The orchestrator should be named `SalaryHistoryOrchestrator` or simply `Orchestrator`.
2. **Task 2.4** test description still says "child BrowserWindow parent reference correct" — stale wording from before Gap 1 was fixed. Should say "WebContentsView parent reference correct."
3. **Task 2 verification** says "a child window opens" — should say "a WebContentsView panel opens embedded in the workspace."
4. **Task 9.1** Dashboard manifest uses `"icon": "D"` — but the Activity Bar icon in Phase 3/4 was a single character or emoji. The plan should confirm whether `D` is the icon string or if it maps to an asset path.

---

## Overall Assessment

The plan is structurally sound and covers the major architectural moves well. However, **Gap 1 (mount mechanism) is a hard blocker** — without a defined `finance.ui.requestMount` path, the Dashboard extension cannot render. **Gap 2** is a type-level contradiction that will cause implementation errors. **Gap 3** and **Gap 4** are correctness gaps that will surface in Phase 8 when multiple extensions exist. The remaining gaps are test hygiene and specification completeness issues that are cheap to fix now but expensive to debug later.

**Recommended action before implementation:**
1. Resolve Gap 1 (define mount mechanism + add Task 4.5).
2. Resolve Gap 2 (align `$join.on` shape across Decision 4 and Task 6).
3. Resolve Gap 9 (sequential activation in Task 10).
4. Note Gaps 3, 4, 5, 6, 7, 8, 10 as follow-ups in the plan's Administrative section.

---

*Reviewed by Kilo on 2026-07-19.*
