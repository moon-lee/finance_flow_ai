---
title: Review of Phase 5 – Webview Panels, Multi-Extension UI & Cross-Extension Services
date: 2026-07-19
status: completed
---

## Overview

The plan document **docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md** provides a comprehensive, decision‑driven roadmap for delivering Phase 5 of *Finance Flow AI*.  It covers architecture, UI/UX, security hardening, data‑access extensions, and a detailed task list with test coverage.  Overall the structure is clear, the decisions are well‑justified, and the test‑plan is thorough.

---

## Gap 1 – Decision 1 vs Task 2: `WebContentsView` vs `BrowserWindow`

### Gap / Ambiguity

Decision 1 explicitly selects `WebContentsView` (Electron 28+ API) and explains why a child `BrowserWindow` is rejected.  Yet **Task 2 Step 2.2** says *"Create a child `BrowserWindow` (Decision 1 settings)"*, and the **File Structure** lists only `webview-panel-manager.ts` (no separate viewer class).  This contradictory implementation could cause layout, sizing, and performance mismatches on platforms where `WebContentsView` is the recommended approach.

### Impact

If the code uses `BrowserWindow`, the UI will not embed cleanly inside the main workspace pane, leading to visual glitches, extra OS windows, and higher memory usage. It also defeats the security rationale of Decision 1.

### Suggested Improvement

1. **Align Implementation with Decision 1**
   - **Modify Task 2**: replace the `BrowserWindow` creation code with `WebContentsView` instantiation per Decision 1.
   - **Update File Structure** to include `src/main/services/webview-panel-view.ts` that encapsulates the view logic (keeping `webview-panel-manager.ts` as the manager).

### Proposed Changes — Before / After

**Before – Goal section (line ~57):**

> **Architecture:** the workspace becomes a tab host that mounts one **`WebviewPanel`** per extension view
> (Electron `BrowserView` → Phase 7's native webview tag; Phase 5 uses `BrowserWindow` child iframes
> with `contextIsolation: true` + `sandbox: true` + a strict CSP).

**After:**

> **Architecture:** the workspace becomes a tab host that mounts one **`WebviewPanel`** per extension view
> using Electron's `WebContentsView` API (Electron 28+) with `contextIsolation: true` + `sandbox: true` +
> a strict CSP.

**Before – Tech Stack section (line ~59):**

> **Tech Stack:** everything Phase 4 ships, plus: Electron `BrowserWindow` (sandboxed child windows for
> WebviewPanels; same `contextIsolation: true` + `sandbox: true` + strict CSP as the main window),

**After:**

> **Tech Stack:** everything Phase 4 ships, plus: Electron `WebContentsView` (sandboxed embedded views for
> WebviewPanels; same `contextIsolation: true` + `sandbox: true` + strict CSP as the main window),

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

---

## Gap 2 – Lazy‑unmount timeout (Decision 8)

### Gap / Ambiguity

The unmount policy is set to **5 minutes** in Decision 8 with a `setInterval` checking every 30 s. However the Risk table (§8) still references the old **30 s** value. No empirical data or user research backs the 5‑minute choice, and there is no UI for users to adjust it.

### Impact

Users may lose unsaved state if they step away longer than expected, or the app could retain many idle panels, increasing memory pressure.

### Suggested Improvement

2. **Make Unmount Timeout Configurable**
   - Add a new setting `core.webview.unmountDelayMs` (default `300000`).
   - Expose it in the Settings UI (Phase 7) and document the default and allowed range (30 s – 30 min).
   - Update **Task 8** to read the setting at runtime and adjust the interval logic accordingly.

### Proposed Changes — Before / After

**Before – Risk table row 1 (line ~1445):**

> | Child `BrowserWindow` per panel uses ~30-50 MB RAM; 10+ open tabs is heavy |
> | Lazy unmount after 30 s unfocused (Decision 8); Phase 7+ adds `keepAlive` hint |

**After:**

> | `WebContentsView` per panel uses ~20-40 MB RAM; 10+ open tabs adds memory pressure |
> | Lazy unmount after 5 min unfocused, with dirty-state protection (Decision 8); Phase 7+ adds `keepAlive` hint |

**Before – Risk table row 2 (line ~1452):**

> | WebviewPanel lazy unmount loses in-panel state (e.g., a half-filled form) | Documented; user must save before tab-switching for >30 s. Phase 7+ may add a "save-on-blur" extension hook |

**After:**

> | WebviewPanel lazy unmount loses in-panel state (e.g., a half-filled form) | Mitigated by dirty-state protection (Decision 8): dirty panels are never unmounted, and autoSaveDraft is called before unmounting. Phase 7+ may add a "save-on-blur" extension hook |

**Before – Decision 8 Alternatives section (line ~1473):**

> - **Decision 8 (lazy unmount at 30 s):** If reviewer prefers no unmount, memory pressure becomes a real complaint at 10+ tabs. Phase 7+ will add `keepAlive` hints.

**After:**

> - **Decision 8 (lazy unmount at 5 min):** If reviewer prefers no unmount, memory pressure becomes a real complaint at 10+ tabs. Phase 7+ will add `keepAlive` hints.

---

## Gap 3 – `onStartup` activation order & circular dependencies

### Gap / Ambiguity

The plan orders `onStartup` extensions alphabetically and notes hot‑disable on repeated crashes. It does **not** address the scenario where two extensions both declare `onStartup` and depend on each other (e.g., Dashboard needs Salary‑History data and Salary‑History needs a Dashboard‑provided service).

### Impact

A circular activation could dead‑lock the start‑up sequence, leaving the UI blank or partially rendered.

### Suggested Improvement

3. **Detect Circular `onStartup` Dependencies**
   - Extend the extension loader to build a directed graph of `onStartup` activation dependencies (e.g., `activate` → `finance.services.invoke` → other extension).
   - Perform a DFS to detect cycles; if found, abort startup with an error message: *"Circular onStartup dependency detected between extensions A and B"*.
   - Add unit tests in `tests/unit/extension-host/on-startup-cycle.test.ts`.

### Proposed Changes — Before / After

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

**After (no change needed — the table already matches the structured object; the narrative will be updated to be consistent):**

```
| `$join` | `{ table, on: { left: string, right: string },
 type: 'INNER' | 'LEFT' | 'RIGHT' }`
```

---

## Gap 4 – Domain Service Registry conflict resolution

### Gap / Ambiguity

The registry uses a *last‑registered wins* rule (Decision 5). The plan mentions only a single `pay` service, but does not define how future services with the same name (or version) will be resolved (priority, versioning, namespace).

### Impact

Ambiguity could lead to nondeterministic behaviour when multiple extensions provide the same service name, causing bugs that are hard to trace.

### Suggested Improvement

4. **Domain Service Registry Conflict Strategy**
   - Introduce an optional `priority: number` field in the `register` API.
   - Update the registry logic: choose the service with the highest priority; if equal, fall back to *last‑registered wins*.
   - Document the field in `docs/extension-api.md` and add a migration step in **Task 7** to default to `priority = 0` for existing registrations.

### Proposed Changes — Before / After

**Before – Decision 5 code example (lines ~309-316):**

```ts
class DomainServiceRegistry {
  register(serviceName: string, extensionId: string, impl: DomainServiceImpl): void;
  unregister(serviceName: string, extensionId: string): void;
  invoke(serviceName: string, method: string, params: unknown): Promise<unknown>;
}
```

The narrative says: *"Resolution is by `serviceName`; the calling extension passes `{ serviceName, method, params }` and the registry dispatches to the **most recently activated** extension that registered under that name."* No `priority` field, no versioning, no documented tiebreaker beyond activation order.

**After:**

```ts
class DomainServiceRegistry {
  register(serviceName: string, extensionId: string, impl: DomainServiceImpl, priority?: number): void;
  unregister(serviceName: string, extensionId: string): void;
  invoke(serviceName: string, method: string, params: unknown): Promise<unknown>;
}
```

Narrative updated: *"Resolution is by `serviceName`. When multiple extensions register under the same name, the one with the highest `priority` wins. If priorities are tied, the most recently activated extension wins (activation order). If `priority` is omitted, it defaults to `0`."*

---

## Gap 5 – NavigationProvider fallback for missing commands

### Gap / Ambiguity

When a navigation item refers to a command that is not present or not allowed, the UI currently *silently logs a warning* (Decision 3). No visual indication is provided for the end user.

### Impact

Users see a navigation entry that does nothing, creating confusion and a perception of broken functionality.

### Suggested Improvement

5. **Navigation UI Graceful Degradation**
   - In `navigation-panel.ts`, when rendering items, check `commandAllowlist.isAllowed(extensionId, commandId)`. If not allowed, render the item with CSS class `disabled` and add a tooltip `"Command not available"`.
   - Log a structured warning to the telemetry system.
   - Add a visual regression test to verify disabled items appear correctly.

### Proposed Changes — Before / After

**Before – Decision 3 trade-off section (line ~251):**

> **Trade-off:** The `command` field is a free-form string that could reference a command that
> doesn't exist. Phase 5 validates it at activation time (the `command-selected` handler resolves
> it; if missing, logs `console.warn` and does nothing — same graceful degradation as
> `finance.commands.execute`).

**After:**

> **Trade-off:** The `command` field is a free-form string that could reference a command that
> doesn't exist. Phase 5 validates it at activation time: the `command-selected` handler checks
> `commandAllowlist.isAllowed(extensionId, commandId)`. If the command is missing, not allowed, or
> doesn't exist, the navigation item is rendered with CSS class `disabled` and a tooltip
> `"Command not available"` (instead of a click that silently does nothing). The console still logs
> a warning for developer visibility, and a telemetry event `navigationItemMissingCommand` is
> emitted for observability in CI.

---

## Gap 6 – CSP testing completeness

### Gap / Ambiguity

Task 15 verifies the CSP meta tag but does **not** assert that the HTTP response header `Content‑Security‑Policy` is also set (Electron's `protocol.handle` can strip headers).

### Impact

If the header is missing, the panel could inherit a weaker CSP from the parent context, re‑introducing the `'unsafe‑eval'` risk.

### Suggested Improvement

6. **Assert CSP Header**
   - Create a test `tests/unit/main/services/panel-protocol.csp.test.ts` that registers the custom protocol, performs a request to a sample panel URL, and asserts the response includes `Content‑Security‑Policy` matching the meta tag.
   - Update **Task 15** to include this test.

### Proposed Changes — Before / After

**Before – Task 15 Step 15.1 (lines ~1152-1166):**

```markdown
- [ ] 15.1 Create `panel-template.html`:
  ```html
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self';
        style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';">
      <title>Webview Panel</title>
    </head>
    <body>
      <script type="module" src="finance-shell://extensions/{extensionId}.js"></script>
    </body>
  </html>
  ```
- [ ] 15.2 In `panel-protocol.ts`, ensure the response headers set the CSP meta tag (already in the
  HTML); add a `Content-Security-Policy` response header as a defense-in-depth.
```

The meta tag is present, but there is no test that verifies the HTTP response header `Content-Security-Policy` is actually served by the custom protocol handler.

**After:**

```markdown
- [ ] 15.1 Create `panel-template.html`:
  ```html
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self';
        style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';">
      <title>Webview Panel</title>
    </head>
    <body>
      <script type="module" src="finance-shell://extensions/{extensionId}.js"></script>
    </body>
  </html>
  ```
- [ ] 15.2 In `panel-protocol.ts`, ensure the response headers set the CSP meta tag (already in the
  HTML); add a `Content-Security-Policy` response header as a defense-in-depth.
- [ ] 15.3 Add `tests/unit/main/services/panel-protocol.csp.test.ts` that:
  - Registers the `finance-shell://` protocol handler.
  - Issues a request to `finance-shell://panel/test-extension/test-view.html`.
  - Asserts the response includes an HTTP `Content-Security-Policy` header.
  - Asserts the header value matches the meta tag from `panel-template.html`.
  - Asserts the meta tag is present in the HTML body (verified via DOM parser).
```

---

## Gap 7 – Documentation synchronization

### Gap / Ambiguity

New manifest fields (`navigation`, `allowedCommands`, `allowedUiEvents`, `onStartup`) are introduced in the plan and later updated in Task 17, but the plan does not cross‑reference the exact sections of `docs/extension‑api.md`.

### Impact

Reviewers may miss the updated schema, leading to inconsistencies between implementation and documentation.

### Suggested Improvement

7. **Cross‑Reference Documentation**
   - In `docs/extension-api.md` add a subsection **"Phase 5 Extensions – New Manifest Fields"** that lists the new fields and links to the plan (`docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md`).
   - In the plan, add a note under **Task 17**: *"See `docs/extension-api.md#phase-5-extensions-new-manifest-fields` for the schema details."*

### Proposed Changes — Before / After

**Before – Task 17 Step 17.1 (lines ~1199-1201):**

> - [ ] 17.1 In `extension-api.md`, add sections for:
>   - `contributes.navigation`
>   - `contributes.allowedCommands` / `allowedUiEvents`
>   - `activationEvents: 'onStartup'`
>   - `finance.services.*` API
>   - WebviewPanel hosting model

There is no cross‑reference from the plan to the API docs, and no link from the API docs back to the plan.

**After:**

> - [ ] 17.1 In `extension-api.md`, add a subsection **"Phase 5 Extensions – New Manifest Fields"** that
>   lists the new fields (`navigation`, `allowedCommands`, `allowedUiEvents`, `onStartup`) and links to
>   the plan: *"See `docs/superpowers/plans/2026-07-18-phase5-webviews-multiextensions.md` for the full
>   architecture."*
> - [ ] 17.2 In the plan's Task 17, add a reverse cross‑reference: *"See
>   `docs/extension-api.md#phase-5-extensions-new-manifest-fields` for the schema details."*
> - [ ] 17.3 In `extension-api.md`, add sections for:
>   - `contributes.navigation`
>   - `contributes.allowedCommands` / `allowedUiEvents`
>   - `activationEvents: 'onStartup'`
>   - `finance.services.*` API
>   - WebviewPanel hosting model

---

## Gap 8 – User‑visible error handling for `$join`

### Gap / Ambiguity

DAO validation will reject joins that target non‑shared tables, but the plan does not specify what error message or UI feedback the user will see (e.g., toast, modal).

### Impact

Developers debugging queries will have to inspect console logs, and end users may encounter silent failures.

### Suggested Improvement

8. **User‑Facing DAO Join Errors**
   - Extend the DAO service to throw a `JoinNotAllowedError` with a human‑readable message.
   - In the renderer, catch this error and display a toast: *"Join operation not permitted – table access denied"*.
   - Add a style for error toasts in `src/renderer/styles/toast.css`.

### Proposed Changes — Before / After

**Before – Decision 4 trade-off section (lines ~297-299):**

```markdown
**Trade-off:** A structured `{ left: string, right: string }` join condition is injection-safe by
design and does not require the small parser from Phase 4's raw-SQL approach. The trade-off is that
`left`/`right` must exist in the respective table's column manifest; a `left` column that does not
exist is caught at validation time with a `ValidationFailedError` (-32012).
```

The error is an RPC error code only — there is no user-visible UI surface (toast, modal, or inline message) when a `$join` validation fails.

**After:**

```markdown
**Trade-off:** A structured `{ left: string, right: string }` join condition is injection-safe by
design and does not require the small parser from Phase 4's raw-SQL approach. The trade-off is that
`left`/`right` must exist in the respective table's column manifest; a `left` column that does not
exist is caught at validation time with a `ValidationFailedError` (-32012). When the error surfaces
in the renderer, the error handler in `src/renderer/components/workspace.ts` displays a
user-visible toast: *"Join operation not permitted – table access denied. See console for
details."* The toast is styled via `src/renderer/styles/toast.css` and auto-dismisses after 8
seconds.
```

---

## Gap 9 – Manual Test Unit 2 fragility

### Gap / Ambiguity

The test assumes the Activity Bar button **P** (Salary History) is always present. If a future setting disables the button or renames the view, the test will fail.

### Impact

Test maintenance overhead and potential false negatives in CI.

### Suggested Improvement

9. **Robust Manual Test Unit 2**
   - Replace the hard‑coded `'P'` reference with a query that finds the Activity Bar button by its **extension ID** (`dashboard`) and its `viewId` (`salary-history`).
   - Add a pre‑condition step: *"If the button does not exist, skip this test with a warning"*.

### Proposed Changes — Before / After

**Before – Test Unit 10 Step 10.1 (lines ~1262-1269):**

```markdown
**Test Unit 10: DAO `$join` operator.**
- [ ] 10.1 From the Renderer DevTools console, run:
  ```js
  const result = await window.financeShell.extensions.executeCommand('dashboard.refresh');
  ```
  This triggers the Dashboard's `buildAggregator`, which calls `finance.db.table('accounts').find(..., {
  $join: { table: 'accounts', on: '...', type: 'LEFT' },
  $orderBy: [{ column: 'name', direction: 'ASC' }] }).
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

---

## Gap 10 – `ui-event` allowlist warn‑silence

### Gap / Ambiguity

Disallowed UI events are dropped with a console warning (Decision 7). No telemetry or reporting is emitted, making it hard to detect in automated CI runs.

### Impact

Security‑related mis‑configurations could go unnoticed.

### Suggested Improvement

10. **Telemetry for Dropped UI Events**
    - In `src/main/services/ui-event-allowlist.ts`, after logging the warning, call `telemetry.record('uiEventDropped', { extensionId, eventName })`.
    - Ensure the telemetry layer is available in the main process (already used for other metrics).
    - Add a CI test that verifies the telemetry call is made when a disallowed event is emitted.

### Proposed Changes — Before / After

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

---

## Minor Editorial Tweaks (expanded)

- Use consistent heading levels (`##` for top‑level sections, `###` for sub‑sections) throughout the plan.
- In the **self‑review checklist**, add a note that the split layout is persisted via `core.workspace.layout` (already present) for clarity.
- In **Decision 4**, replace the raw SQL string example for `$join.on` with the structured object format, e.g.:
  ```ts
  $join: { table: 'accounts', on: { left: 'salary_history_pay_slips.account_id', right: 'accounts.id' }, type: 'LEFT' }
  ```
- Update the table in **Decision 4** to reflect the new schema (`on: { left: string, right: string }`).

## Overall Assessment

The plan is **well‑structured, technically sound, and sufficiently detailed** to guide implementation. The gaps identified are largely around edge‑cases, future‑proofing, and small UX refinements. Addressing the suggested improvements will make the rollout smoother, reduce the risk of regression in later phases, and improve observability and developer ergonomics.

---
*Reviewed by Claude Code on 2026‑07‑19.*