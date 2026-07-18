# Phase 3 Plan Review — Extension Host & IPC Scaffolding

**Reviewed:** `docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md` (105 KB, 17 tasks, 9 architecture decisions, 8 manual test units)
**Reviewed with:** `docs/phase3-handoff.md`, `docs/file-reference.md`, `AGENTS.md` Rule 6 docs
**Reviewer stance:** read-only — no source or plan files modified

---

## TL;DR

The plan is **strong and ready to implement** with one notable exception: it under-specifies the **extension-host lifecycle on crash**, leaving the shell in a degraded state with no documented recovery path. Three smaller correctness gaps (fire-and-forget Host start, missing command-execute IPC handler stub, E2E selector coupling to Phase 1 HTML) should be tightened before the executor touches code. Everything else is solid: 9 architecture decisions are well-justified, the vision is cited by line number, deferrals are explicit, and the test pyramid is appropriate.

**Verdict:** Approve with the changes in **§2 (must-fix)**, **§3 (should-fix)**, and **§4 (consider)** below. Nothing in §2 is a blocker for starting work — they're issues that will surface as bugs during Task 16/17 if not addressed now.

---

## 1. Strengths

### 1.1 Architecture decisions are exceptional
The 9 decisions each have a clear *why*, *alternatives considered*, and *trade-off accepted*. Decision 1 (utilityProcess) is particularly strong — it correctly identifies that process isolation is what *structurally* enforces `project_vision.md:48`'s "no direct cross-extension imports" rule, rather than relying on convention. This is the kind of design rationale that survives personnel changes.

### 1.2 Vision alignment is explicit and cited
The plan cites `project_vision.md:48`, `:78`, `:275` directly. The handoff doc explains the verification path for each citation. AGENTS.md Rule 6 ("Read project context at session start") is satisfied by design.

### 1.3 Self-Review Checklist is honest about deferrals
Section 7 of the Self-Review Checklist documents 6 explicit deferrals with target phases. This is exactly what the handoff doc says the user asked for ("Deferrals should be explicit, not implicit"). No "out of scope" hand-waving.

### 1.4 Test pyramid matches the risk profile
- 23 new unit tests for the deterministic parts (schema, envelopes, loader)
- 5 E2E tests for the wiring
- 8 manual test units for things only humans can verify (DevTools, process tree, SQLite browser)

The placeholder E2E test for "Host process crash is non-fatal" is the right honest call — programmatic crash simulation in Playwright + utilityProcess is non-trivial and Phase 4+ can add it.

### 1.5 Stubs are shaped correctly for Phase 4 drop-in
`db.table()`, `ai.registerTool()`, and `commands.registerCommand()` all have shape-correct interfaces even though their behavior is empty. Phase 4 won't need to change the contract extensions see — only fill in implementations. This is exactly the right discipline.

### 1.6 Activation plumbing actually proves itself
Decision 3 (lazy activation with `*` and `onView:`) is the smallest set that proves the activation pipeline works. Phase 4+ adds more triggers without architectural change.

---

## 2. Must-fix before implementation

### 2.1 No documented recovery when the Extension Host crashes

**Where:** `src/main/services/extension-ipc.ts` (the `'exit'` handler), Test Unit 5

**The gap:** The IPC transport's `'exit'` handler clears pending requests and nulls `this.process`, but it doesn't attempt to restart. Test Unit 5 says the shell survives, the Activity Bar still shows cached buttons, but clicking them logs an error. There's no documented behaviour for what happens on the *next* user interaction with an extension — does Main attempt to spawn a new Host? Does it surface a status-bar message? Does it retry with backoff?

**Why this matters:** Crash isolation is meaningless without recovery. The vision's "Crash Isolation" principle (`project_vision.md:48`) is half-addressed: the shell doesn't die, but the user is stuck with broken extensions until restart.

**Suggested addition** (a few lines to add to Task 8, Step 1):

- On `'exit'`, set a `crashed` flag and emit a status-bar message (renderer already listens on the IPC channel; add `extensions:host-status` notification).
- On the next `extensions:activate-view` or `extensions:list` IPC call, if `crashed`, attempt a single `start()` retry with a short delay. If the retry fails, mark the extension as failed in `extension_registry` (new column? or `enabled = 0` with a `last_error` column).
- Document the recovery behaviour in Test Unit 5's "Expected result" so the manual test verifies both "shell survives" AND "host re-spawns when next interaction triggers it".

### 2.2 Fire-and-forget `extensionIPC.start()` swallows startup errors

**Where:** Task 10, Step 1:

```typescript
extensionIPC = new ExtensionIPC();
void extensionIPC.start(extensionRegistry.list());
```

**The gap:** `start()` can reject (Host doesn't become ready in `requestTimeoutMs`, the bundled `host.js` doesn't exist, the fork fails on Linux due to sandbox restrictions in some distros). The `void` discards the rejection. The catch-all `try/catch` around `app.whenReady()` only catches synchronous errors, so an unhandled promise rejection is logged but never surfaced to the user.

**Suggested fix:**

```typescript
extensionIPC = new ExtensionIPC();
extensionIPC.start(extensionRegistry.list()).catch((err) => {
  console.error('[extensions] Extension Host failed to start:', err);
  // Phase 3: log and continue with extensions disabled.
  // The renderer will see an empty contribution list.
  // Phase 4: add a status-bar notification.
});
```

This is a one-line fix and aligns with the existing pattern (`shutdownPersistence` already uses `.catch()` for the stop path).

### 2.3 Missing `extensions:execute-command` IPC handler stub

**Where:** Task 10, Step 2 (IPC handlers), Task 13 Step 3 (renderer `command-selected` handler)

**The gap:** The renderer has a `command-selected` handler that, for extension commands, just `console.log`s. The plan explicitly says "Phase 5 will dispatch via the AI tool registry / extension IPC" — but there's no IPC handler stubbed today to *prove the channel exists end-to-end*. If Phase 4 wants to wire real execution, they'll discover the missing handler during integration.

**Suggested addition** to Task 10, Step 2:

```typescript
ipcMain.handle('extensions:execute-command', async (_event, commandId: string, ...args: unknown[]) => {
  if (!extensionIPC) return { executed: false, reason: 'host not running' };
  return extensionIPC.request('extension.executeCommand', { commandId, args });
});
```

And a corresponding `extension.executeCommand` handler in the Host (Task 5). Phase 3's Host implementation can just delegate to `executeCommand(commandId, ...args)` from the existing commands stub. This makes the round-trip observable in DevTools (Phase 4 only needs to swap the stub for real execution).

---

## 3. Should-fix during implementation

### 3.1 JSON-RPC types live under `extension-host/` but are imported by Main

**Where:** `src/extension-host/json-rpc.ts`, `src/main/services/extension-ipc.ts`

**The smell:** The folder name says "extension-host" but Main imports from it. Phase 4+ will add more shared protocol types (command execution, event subscriptions). The folder name will become increasingly misleading.

**Suggestion:** Move `json-rpc.ts` to `src/shared/json-rpc.ts` (or `src/main/shared/` if you want to signal "owned by Core"). Update both Vite configs and the test imports. This is a 5-minute refactor that pays off as the protocol surface grows.

### 3.2 Type duplication: `ManifestViewContribution` declared twice

**Where:** `src/types/finance.d.ts` (canonical) and `src/types/finance-shell.d.ts` (preload contract)

**The risk:** `finance-shell.d.ts` re-declares `ManifestViewContribution` and `ManifestCommandContribution` rather than importing them from `finance.d.ts`. If the canonical type changes (Phase 4 adds an `icon: 'lucide:foo'` field, say), the preload contract silently drifts.

**Suggestion:** Either:

- Import both types from `finance.d.ts` into `finance-shell.d.ts` (preferred — same source of truth), OR
- Add a CI check (`tsc --noEmit`) that fails if the two shapes diverge.

Either is fine; the status quo is a latent bug.

### 3.3 Command palette input has no filter behaviour

**Where:** `src/renderer/components/command-palette.ts` (the `<input>` element has no `@input` handler)

**The gap:** Phase 1's command palette presumably filtered by typed query. Phase 3's rewrite adds the extension commands group but loses the filter. The Test Unit 4 step "Type a command" expects filtering; without an `@input` handler, typing has no effect.

**Suggestion:** Add a `@state private _query: string = ''` and an `@input` handler that filters `this._items` by case-insensitive substring on `label`. Trivial addition (5 lines), restores the Phase 1 capability, and proves the extension command integration works under filtering.

### 3.4 E2E selector `#navigation-panel .nav-title` is undocumented

**Where:** `tests/e2e/extension-host.spec.ts`:

```typescript
await expect(page.locator('#navigation-panel .nav-title').first()).toHaveText('Salary');
```

**The risk:** This selector assumes Phase 1's `navigation-panel.ts` exposes a `.nav-title` element. The plan doesn't reference Phase 1's HTML structure, so the test could be passing by accident against whatever Phase 1 happens to render, not against the actual contract.

**Suggestion:** Either:

- Add a Phase 3 task that explicitly defines the Navigation Panel's view-driven render (with `nav-title` as the contract), OR
- Test the round-trip a different way — e.g., assert the IPC channel's `extension.activated` notification was observed, or assert the registry's `markActivated` was called (via DevTools-exposed read of `financeShell.extensions.list()`).

The second option is cleaner because it tests the same observable behaviour without coupling to Phase 1's DOM shape.

### 3.5 Test Unit 6 hard-codes a Windows path

**Where:** Test Unit 6:

> Open a SQLite browser against `%APPDATA%/Finance Flow AI/finance.db`

**The gap:** Phase 3 is cross-platform. The path should be `app.getPath('userData')` joined with whatever filename Phase 2 chose (the plan doesn't say).

**Suggestion:** Replace with: *"Open a SQLite browser against the file at the path shown by `console.log(dbPath)` (printed by Main on startup)"*. Better yet, add a debug-only IPC handler `extensions:db-path` that returns the path so the manual test doesn't require filesystem hunting.

### 3.6 `hostPath` resolution assumes `dist/extension-host/host.js` is bundled next to Main

**Where:** `ExtensionIPC` constructor:

```typescript
this.hostPath = options.hostPath ?? join(app.getAppPath(), 'dist', 'extension-host', 'host.js');
```

**The smell:** If Phase 4+ ever changes the build layout (e.g., Vite outputs to `out/` instead of `dist/`, or `host.js` becomes `host.cjs`), this path silently points at nothing and the Host fails to start with a confusing fork error.

**Suggestion:** Either:

- Define the host path as a constant in a shared module that both `main.ts` and the Vite config import (single source of truth), OR
- At minimum, log the resolved host path on startup so failures are diagnosable.

---

## 4. Consider (nice-to-have, not blocking)

### 4.1 Renderer property access via intersection casts is awkward

`document.querySelector<HTMLElement & { views: ActivityView[]; activeView: string }>(...)` works but is a code smell. Lit components should be queried by their custom element name and TypeScript should infer via a wrapper or via Lit's `@query` decorator. Not blocking — but if Phase 4+ adds more cross-component communication, the casts will multiply.

### 4.2 `ExtensionRegistry.upsert` cache update happens after DB write

Low-risk because Phase 3 only calls `upsert` once per extension at startup. If Phase 4+ adds runtime extension install, consider transaction-wrapping the DB write + cache update.

### 4.3 `ExtensionRegistry.views()` and `.commands()` do N DB queries

Each call iterates `byId.values()` and queries `enabled` per entry. For Phase 3's one extension this is one query per call. If Phase 8 ships with 50 marketplace extensions, this becomes 50 queries per Renderer fetch. Batch into one `SELECT enabled FROM extension_registry` and join in memory. Document in the ADR or as a follow-up.

### 4.4 No smoke-test instructions in the README

The plan's verification is comprehensive but not discoverable. A 5-line "Phase 3 smoke test" section in `README.md` (or `docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md` "Quick verification" appendix) would help future agents verify the build in under a minute without re-reading all 17 tasks.

### 4.5 Decision 9's "Phase 4+ migration target" owner is unassigned

The handoff doc's "Open Questions for Future Phases" lists this. Worth adding to the Phase 4 plan's prerequisites ("Decision: `import * as finance from 'finance'` mechanism") so it doesn't get lost.

### 4.6 `extension.activated` notification is emitted but never consumed in Phase 3

The Host emits `extension.activated` after successful activation, but `ExtensionIPC.handleMessage` only forwards to listeners — and Phase 3 registers no listeners. The notification is dead code until Phase 4. Either remove it for Phase 3 (add back when there's a consumer) or add a `console.log` in `handleMessage`'s notification branch so it's visible in DevTools during manual testing.

---

## 5. Questions / clarifications

These are not blockers — judgement calls the implementer can make:

1. **Test Unit 5 mentions "Killing the Host process"** — should the manual test also verify the Activity Bar reverts to empty after a restart, or is the cached-contributions behaviour intentional? The plan implies "yes, cached" but doesn't say.

2. **`extensions:list` is invoked on `DOMContentLoaded`** — what about extensions installed *after* startup (Phase 8 marketplace)? The plan defers marketplace, but the renderer has no event subscription for "contributions changed". Worth a one-line `financeShell.onExtensionsChanged(cb)` API placeholder for Phase 8, even if no Phase 3 extension fires it.

3. **ADR-0003 is mentioned as a candidate in Decision 1** but the handoff doc says it was already created. Worth verifying `docs/decisions/0003-extension-host-transport.md` exists and references Decisions 1+2 (the handoff doc implies yes, but the plan doesn't confirm).

---

## 6. What the plan does NOT need to change

- **Decision 9 reframing (parameter injection)** — the handoff doc explains the verification path that justifies this; the plan text reflects it accurately. Don't reopen.
- **Six explicit deferrals in Self-Review Checklist §7** — these are well-placed and well-targeted. Phase 5/7/8 will pick them up.
- **Mock `salary-history` extension** — perfect scope for Phase 3. Don't add payslip schema to it.
- **`finance.*` stub shape** — exactly right. Phase 4 won't have to touch the contract.

---

## 7. Recommended action

Hand this review to the implementer. Address the three items in §2 (host restart, fire-and-forget, command IPC stub) before Task 16/17 — they will surface as test failures or stuck-on-crash states otherwise. Items in §3 can be addressed inline during the relevant task or in a Phase 3.1 follow-up. Items in §4 are optional polish.

The plan is approved with these notes. No source files have been modified.
