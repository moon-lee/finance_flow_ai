---
title: Review of Phase 5 – Webview Panels, Multi-Extension UI & Cross-Extension Services
date: 2026-07-19
status: completed
---

## Overview

The plan document **docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md** provides a comprehensive, decision‑driven roadmap for delivering Phase 5 of *Finance Flow AI*.  It covers architecture, UI/UX, security hardening, data‑access extensions, and a detailed task list with test coverage.  Overall the structure is clear, the decisions are well‑justified, and the test‑plan is thorough.

## Gaps & Open Questions (expanded detail)

| # | Area | Gap / Ambiguity | Impact |
|---|------|------------------|--------|
| 1 | **Decision 1 vs Task 2: `WebContentsView` vs `BrowserWindow`** | Decision 1 explicitly selects `WebContentsView` (Electron 28+ API) and explains why a child `BrowserWindow` is rejected.  Yet **Task 2 Step 2.2** says *"Create a child `BrowserWindow` (Decision 1 settings)"*, and the **File Structure** lists only `webview-panel-manager.ts` (no separate viewer class).  This contradictory implementation could cause layout, sizing, and performance mismatches on platforms where `WebContentsView` is the recommended approach. | If the code uses `BrowserWindow`, the UI will not embed cleanly inside the main workspace pane, leading to visual glitches, extra OS windows, and higher memory usage. It also defeats the security rationale of Decision 1. |
| 2 | **Lazy‑unmount timeout (Task 8)** | The unmount policy is set to **5 minutes** (Task 8) with a `setInterval` checking every 30 s. No empirical data or user research backs the 5‑minute choice, and there is no UI for users to adjust it. | Users may lose unsaved state if they step away longer than expected, or the app could retain many idle panels, increasing memory pressure. |
| 3 | **`onStartup` activation order & circular dependencies** | The plan orders `onStartup` extensions alphabetically and notes hot‑disable on repeated crashes. It does **not** address the scenario where two extensions both declare `onStartup` and depend on each other (e.g., Dashboard needs Salary‑History data and Salary‑History needs a Dashboard‑provided service). | A circular activation could dead‑lock the start‑up sequence, leaving the UI blank or partially rendered. |
| 4 | **Domain Service Registry conflict resolution** | The registry uses a *last‑registered wins* rule (Decision 5). The plan mentions only a single `pay` service, but does not define how future services with the same name (or version) will be resolved (priority, versioning, namespace). | Ambiguity could lead to nondeterministic behaviour when multiple extensions provide the same service name, causing bugs that are hard to trace. |
| 5 | **NavigationProvider fallback for missing commands** | When a navigation item refers to a command that is not present or not allowed, the UI currently *silently logs a warning* (Decision 3). No visual indication is provided for the end user. | Users see a navigation entry that does nothing, creating confusion and a perception of broken functionality. |
| 6 | **CSP testing completeness** | Task 15 verifies the CSP meta tag but does **not** assert that the HTTP response header `Content‑Security‑Policy` is also set (Electron’s `protocol.handle` can strip headers). | If the header is missing, the panel could inherit a weaker CSP from the parent context, re‑introducing the `'unsafe‑eval'` risk. |
| 7 | **Documentation synchronization** | New manifest fields (`navigation`, `allowedCommands`, `allowedUiEvents`, `onStartup`) are introduced in the plan and later updated in Task 17, but the plan does not cross‑reference the exact sections of `docs/extension‑api.md`. | Reviewers may miss the updated schema, leading to inconsistencies between implementation and documentation. |
| 8 | **User‑visible error handling for `$join`** | DAO validation will reject joins that target non‑shared tables, but the plan does not specify what error message or UI feedback the user will see (e.g., toast, modal). | Developers debugging queries will have to inspect console logs, and end users may encounter silent failures. |
| 9 | **Manual Test Unit 2 fragility** | The test assumes the Activity Bar button **P** (Salary History) is always present. If a future setting disables the button or renames the view, the test will fail. | Test maintenance overhead and potential false negatives in CI. |
|10| **`ui-event` allowlist silent drops** | Disallowed UI events are dropped with a console warning (Decision 7). No telemetry or reporting is emitted, making it hard to detect in automated CI runs. | Security‑related mis‑configurations could go unnoticed. |

## Suggested Improvements (expanded with concrete actions)

1. **Align Implementation with Decision 1**
   - **Modify Task 2**: replace the `BrowserWindow` creation code with `WebContentsView` instantiation, e.g.:
     ```ts
     const view = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: panelPreloadPath } });
     mainWindow.contentView.addChildView(view);
     view.setBounds({ x, y, width, height });
     ```
   - **Update File Structure** to include `src/main/services/webview-panel-view.ts` that encapsulates the view logic (keeping `webview-panel-manager.ts` as the manager).
   - **Add migration note** in the plan: *"If the target Electron version does not yet support `WebContentsView`, we will fallback to a child `BrowserWindow` and migrate to `WebContentsView` in Phase 7."*

2. **Make Unmount Timeout Configurable**
   - Add a new setting `core.webview.unmountDelayMs` (default `300000`).
   - Expose it in the Settings UI (Phase 7) and document the default and allowed range (30 s – 30 min).
   - Update **Task 8** to read the setting at runtime and adjust the interval logic accordingly.

3. **Detect Circular `onStartup` Dependencies**
   - Extend the extension loader to build a directed graph of `onStartup` activation dependencies (e.g., `activate` → `finance.services.invoke` → other extension).
   - Perform a DFS to detect cycles; if found, abort startup with an error message: *"Circular onStartup dependency detected between extensions A and B"*.
   - Add unit tests in `tests/unit/extension-host/on-startup-cycle.test.ts`.

4. **Domain Service Registry Conflict Strategy**
   - Introduce an optional `priority: number` field in the `register` API.
   - Update the registry logic: choose the service with the highest priority; if equal, fall back to *last‑registered wins*.
   - Document the field in `docs/extension-api.md` and add a migration step in **Task 7** to default to `priority = 0` for existing registrations.

5. **Navigation UI Graceful Degradation**
   - In `navigation-panel.ts`, when rendering items, check `commandAllowlist.isAllowed(extensionId, commandId)`. If not allowed, render the item with CSS class `disabled` and add a tooltip `"Command not available"`.
   - Log a structured warning to the telemetry system.
   - Add a visual regression test to verify disabled items appear correctly.

6. **Assert CSP Header**
   - Create a test `tests/unit/main/services/panel-protocol.csp.test.ts` that registers the custom protocol, performs a request to a sample panel URL, and asserts the response includes `Content‑Security‑Policy` matching the meta tag.
   - Update **Task 15** to include this test.

7. **Cross‑Reference Documentation**
   - In `docs/extension-api.md` add a subsection **"Phase 5 Extensions – New Manifest Fields"** that lists the new fields and links to the plan (`docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md`).
   - In the plan, add a note under **Task 17**: *"See `docs/extension-api.md#phase-5-extensions-new-manifest-fields` for the schema details."*

8. **User‑Facing DAO Join Errors**
   - Extend the DAO service to throw a `JoinNotAllowedError` with a human‑readable message.
   - In the renderer, catch this error and display a toast: *"Join operation not permitted – table access denied"*.
   - Add a style for error toasts in `src/renderer/styles/toast.css`.

9. **Robust Manual Test Unit 2**
   - Replace the hard‑coded `'P'` reference with a query that finds the Activity Bar button by its **extension ID** (`dashboard`) and its `viewId` (`salary-history`).
   - Add a pre‑condition step: *"If the button does not exist, skip this test with a warning"*.

10. **Telemetry for Dropped UI Events**
    - In `src/main/services/ui-event-allowlist.ts`, after logging the warning, call `telemetry.record('uiEventDropped', { extensionId, eventName })`.
    - Ensure the telemetry layer is available in the main process (already used for other metrics).
    - Add a CI test that verifies the telemetry call is made when a disallowed event is emitted.

## Minor Editorial Tweaks (expanded)

- Use consistent heading levels (`##` for top‑level sections, `###` for sub‑sections) throughout the plan.
- In the **self‑review checklist**, add a note that the split layout is persisted via `core.workspace.layout` (already present) for clarity.
- In **Decision 4**, replace the raw SQL string example for `$join.on` with the structured object format, e.g.:
  ```ts
  $join: { table: 'accounts', on: { left: 'salary_history_pay_slips.account_id', right: 'accounts.id' }, type: 'LEFT' }
  ```
- Update the table in **Decision 4** to reflect the new schema (`on: { left: string, right: string }`).

## Proposed Changes: Before/After Examples

Below are concrete before/after snippets illustrating how the plan would be updated to address the highest‑priority gaps. These are **illustrative only**—no files are modified by this review.

### Gap 1: Decision 1 vs Task 2 (WebContentsView vs BrowserWindow)

**Before – Goal section (line ~57):**
```markdown
**Architecture:** the workspace becomes a tab host that mounts one **`WebviewPanel`** per extension view
(Electron `BrowserView` → Phase 7's native webview tag; Phase 5 uses `BrowserWindow` child iframes
with `contextIsolation: true` + `sandbox: true` + a strict CSP).
```

**After:**
```markdown
**Architecture:** the workspace becomes a tab host that mounts one **`WebviewPanel`** per extension view
using Electron's `WebContentsView` API (Electron 28+) with `contextIsolation: true` + `sandbox: true` +
a strict CSP.
```

**Before – Tech Stack section (line ~59):**
```markdown
**Tech Stack:** everything Phase 4 ships, plus: Electron `BrowserWindow` (sandboxed child windows for
WebviewPanels; same `contextIsolation: true` + `sandbox: true` + strict CSP as the main window),
```

**After:**
```markdown
**Tech Stack:** everything Phase 4 ships, plus: Electron `WebContentsView` (sandboxed embedded views for
WebviewPanels; same `contextIsolation: true` + `sandbox: true` + strict CSP as the main window),
```

**Before – Task 2 Step 2.2 (line ~818):**
```markdown
- [ ] 2.2 In `webview-panel-manager.ts`, implement `WebviewPanelManager`:
  - `mount(extensionId, viewId, mountData)`: create a child `BrowserWindow` (Decision 1 settings),
    load `finance-shell://panel/<extensionId>/<viewId>.html`,
```

**After:**
```markdown
- [ ] 2.2 In `webview-panel-manager.ts`, implement `WebviewPanelManager`:
  - `mount(extensionId, viewId, mountData)`: create a `WebContentsView` with the panel's
    webPreferences (Decision 1), attach it to the main `BrowserWindow.contentView`,
    load `finance-shell://panel/<extensionId>/<viewId>.html`,
```

### Gap 2: Lazy-unmount timeout (30 s vs 5 min)

**Before – Risk table (lines ~1445):**
```markdown
| Child `BrowserWindow` per panel uses ~30-50 MB RAM; 10+ open tabs is heavy |
Lazy unmount after 30 s unfocused (Decision 8); Phase 7+ adds `keepAlive` hint |
```

**After:**
```markdown
| `WebContentsView` per panel uses ~20-40 MB RAM; 10+ open tabs adds memory pressure |
Lazy unmount after 5 min unfocused, with dirty-state protection (Decision 8);
Phase 7+ adds `keepAlive` hint |
```

### Gap 3: Decision 4 `$join.on` syntax (raw SQL vs structured object)

**Before – Decision 4 code example (lines ~266-274):**
```ts
finance.db.table('salary_history_pay_slips').find(
  { account_id: 1 },
  {
    $join: { table: 'accounts', on: 'salary_history_pay_slips.account_id = accounts.id', type: 'LEFT' },
    $orderBy: [{ column: 'pay_date', direction: 'DESC' }],
    $limit: 50,
    $offset: 0
  }
)
```

**After:**
```ts
finance.db.table('salary_history_pay_slips').find(
  { account_id: 1 },
  {
    $join: { table: 'accounts',
             on: { left: 'salary_history_pay_slips.account_id', right: 'accounts.id' },
             type: 'LEFT' },
    $orderBy: [{ column: 'pay_date', direction: 'DESC' }],
    $limit: 50,
    $offset: 0
  }
)
```

**Before – Decision 4 table row (line ~278):**
```
| `$join` | `{ table, on: { left: string, right: string },
 type: 'INNER' | 'LEFT' | 'RIGHT' }`
```

**After (no change needed—the table already matches the structured object; the narrative will be updated to be consistent):**
```
| `$join` | `{ table, on: { left: string, right: string },
 type: 'INNER' | 'LEFT' | 'RIGHT' }`
```

### Gap 9: Test Unit 10 (Dashboard aggregation vs $join)

**Before – Test Unit 10 Step 10.1 (lines ~1262-1269):**
```markdown
**Test Unit 10: DAO `$join` operator.**
- [ ] 10.1 From the Renderer DevTools console, run:
  ```js
  const result = await window.financeShell.extensions.executeCommand('dashboard.refresh');
  ```
  This triggers the Dashboard's `buildAggregator`, which calls `finance.db.table('accounts').find(..., {
  $join: { table: 'accounts', on: '...', type: 'LEFT' },
  $orderBy: [{ column: 'name', direction: 'ASC' }] })`.
- [ ] 10.2 **Expected:** the Dashboard's Accounts Summary card re-renders with the joined + sorted
  accounts list.
```

**After:**
```markdown
**Test Unit 10: Dashboard aggregation (JS-side merge, not database $join).**
- [ ] 10.1 From the Renderer DevTools console, run:
  ```js
  const result = await window.financeShell.extensions.executeCommand('dashboard.refresh');
  ```
  This triggers the Dashboard's `buildAggregator`, which reads `accounts` from `finance.db` and
  payslip data from `finance.services.pay.*`, then merges in JavaScript to compute the net-worth
  card. The Dashboard does NOT use `$join` (cross-extension joins are not allowed per Decision 4).
- [ ] 10.2 **Expected:** the Dashboard's Accounts Summary card shows account data; the Net Worth
  card displays the JS-merged total (accounts balance + aggregate payslip income).
```

### Gap 10: Manual Test Unit 2 (hard‑coded "P" button)

**Before – Test Unit 2 (lines ~1222-1227):**
```markdown
**Test Unit 2: Salary History opens as a second tab.**
- [ ] 2.1 Click the `P` Activity Bar button.
- [ ] 2.2 **Expected:** Salary History opens in a second tab. The Dashboard tab stays open.
  Switching tabs swaps the visible content; each tab's WebviewPanel stays mounted.
- [ ] 2.3 Click `P` again → no new tab opens; Salary History tab gains focus (idempotent).
```

**After:**
```markdown
**Test Unit 2: Salary History opens as a second tab.**
- [ ] 2.1 Locate the Activity Bar button for the salary-history extension (view-id
  `'salary-history'`) by its DOM id `#activity-bar-button-salary-history`.
  If the button is not present (e.g., because the extension is disabled), skip this test.
- [ ] 2.2 Click the button. **Expected:** Salary History opens in a second tab. The Dashboard
  tab stays open. Switching tabs swaps the visible content; each tab's WebviewPanel stays mounted.
- [ ] 2.3 Click the same button again → no new tab opens; Salary History tab regains focus
  (idempotent).
```

## Overall Assessment

The plan is **well‑structured, technically sound, and sufficiently detailed** to guide implementation. The gaps identified are largely around edge‑cases, future‑proofing, and small UX refinements. Addressing the suggested improvements will make the rollout smoother, reduce the risk of regression in later phases, and improve observability and developer ergonomics.

---
*Reviewed by Claude Code on 2026‑07‑19.*