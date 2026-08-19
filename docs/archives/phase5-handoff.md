# Phase 5 Planning Session Handoff

> **Purpose:** This document captures the conversational context and decision rationale from the Phase 5 planning session (2026-07-18). It exists so future agents — who will not have access to the original conversation — understand the *why* behind decisions that may not be obvious from reading the plan alone.
>
> **Read this BEFORE reading the Phase 5 plan if you are about to implement Phase 5 or modify decisions made during planning.**

## Context Established During Planning

### Verification Done Before Writing the Plan

The user asked the planner to verify several assumptions before drafting. Findings:

1. **Phase 4 shipped a renderer-side Lit mount, not WebviewPanels.** The Phase 4 `salary-history-view.ts` Lit host element ran the extension bundle inside the main renderer's DOM via a `blob:` URL dynamic import. This forced `'unsafe-eval'` into the main renderer's CSP. Phase 5 replaces this with sandboxed `WebContentsView` iframes.

2. **Phase 4's `WorkspaceLayout` tree was a phantom data structure.** The tree (`WorkspaceNode = Tab | Split`) was persisted to `core.workspace.layout` but never rendered — `render()` only flattened leaves. Split panes never appeared. Persisted layouts were silently discarded on restart. This was audited against commit `a21b802` and confirmed.

3. **The `split-pane.ts` component existed but was unimported.** It was written during Phase 4's split-tree experiment but never wired into the renderer. ADR-0006 retains it as dead code for the future split retry rather than deleting it.

4. **Phase 4 had no cross-extension service contract.** `finance.services.*` did not exist. The Dashboard extension (new in Phase 5) needed a way to read Salary History data, which led to the Domain Service Registry design.

5. **Phase 4 extensions had no allowlist enforcement.** Any extension could call any command or emit any event. Phase 5 closes this with per-extension `allowedCommands` and `allowedUiEvents` allowlists on the Main side.

### User's Vision Confirmed

The user stated their high-level goal: *"VS Code-style extensions that can share data with each other."* Phase 5 advances this by making the workspace multi-extension (tabs, data-driven sidebar, Dashboard as aggregator) while keeping the security boundaries strict.

### User Preferences Observed

- **Evidence before claims.** The user asked for audit evidence (commit hashes, file paths, line numbers) before accepting claims about Phase 4's behavior. Future agents should verify before asserting state.

- **ADR for every significant deviation.** When the workspace split-tree proved to be phantom data, the user expected a formal ADR (ADR-0006) rather than an inline comment. Future agents should write ADRs for architectural reversals.

- **Deferrals must be explicit and traceable.** The user wants deferred items documented in the plan's Self-Review Checklist with specific phase targets, not buried as "out of scope" notes.

- **Security cannot be bypassed for convenience.** The user rejected proposals to make allowlists opt-out rather than mandatory. The Phase 4 migration shim auto-fills missing allowlists with a `console.warn`, but the allowlist itself is mandatory.

- **TypeScript strict mode is non-negotiable.** No `any` types were introduced in Phase 5. Typed DAO errors flow end-to-end; the Domain Service Registry uses `unknown` + Zod validation at the boundary.

- **Plan amendments are acceptable when documented.** Plan Amendment 1 (removing deductions), Amendment 2 (adding breakdown columns), and Amendment 6 (transient hour inputs) were all applied with inline markers and rationale. Future agents should follow this pattern.

## Key Decisions and Their Rationale

### Decision 1: WebviewPanel = Sandboxed Electron `WebContentsView`

**What was decided:** Each extension's UI renders inside a sandboxed `WebContentsView` attached to the main `BrowserWindow.contentView`, with `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and a strict CSP.

**Why it matters:** Process isolation is what structurally enforces the vision's cross-extension rule. `WebContentsView` is the officially supported replacement for the deprecated `<webview>` tag. It is embeddable inside the main window (unlike a child `BrowserWindow`), provides full process isolation (unlike an `<iframe>`), and avoids the `'unsafe-eval'` CSP regression that Phase 4's `blob:` URL import required.

**Alternatives rejected and why:**
- `<iframe>` — runs in the renderer's process and shares the renderer CSP. Cannot close the `'unsafe-eval'` risk.
- Child `BrowserWindow` — separate top-level OS window that cannot be embedded as a tab/split.
- Phase 4's renderer-side Lit mount — already proven, but `'unsafe-eval'` is a real CSP regression.

### Decision 2: Startup Auto-Activation (`onStartup`)

**What was decided:** Extensions can declare `onStartup` in `activationEvents`. Main activates them sequentially after the Host is ready, in deterministic order: service providers first, then the default-view extension, then remaining `onStartup` extensions alphabetically.

**Why it matters:** `project_vision.md:332-356` describes Dashboard as the platform's default landing view. The only way to show Dashboard before any user click is for it to auto-activate. The activation order guarantees that when Dashboard calls `finance.services.invoke('pay', ...)`, salary-history's service is already registered.

**Alternatives rejected and why:**
- Hard-code Dashboard activation in Main — couples Main to a specific extension.
- `*` activation — activates on startup but does not trigger a UI mount.
- Defer to Phase 8 — defeats Phase 5's "Dashboard is the default landing view" deliverable.

### Decision 5: Domain Service Registry

**What was decided:** A Core-owned singleton in Main (`DomainServiceRegistry`) with thin Host-side proxy. Extensions register services via `finance.services.register(name, impl)` and invoke via `finance.services.invoke(name, method, params)`. "Last-registered wins" for name conflicts.

**Why it matters:** Cross-extension data sharing must route through Main so allowlists can gate it. The registry is designed from the consumer side (Dashboard's aggregator queries), not derived from Phase 4's internal `PayService` shape.

**Alternatives rejected and why:**
- Per-extension typed surface — would explode the JSON-RPC method catalogue as services are added.
- Host-side registry — service implementations are JavaScript functions that cannot cross the IPC boundary.

### Decision 6 / 7: Per-Extension Allowlists

**What was decided:** Every `executeCommand` and `ui-event` IPC call is gated by a per-extension allowlist built from `manifest.contributes.allowedCommands` and `allowedUiEvents`. Missing allowlists auto-fill from `commands[].id` with a `console.warn`.

**Why it matters:** Renderer-driven arbitrary execution is no longer possible. Allowlist denials are surfaced in the main-process terminal and forwarded to the originating panel's DevTools so extension developers see violations immediately.

### Decision 8: WebviewPanel Lifecycle + Dirty-State Protection

**What was decided:** `finance.ui.setDirty(dirty)` and `finance.ui.autoSaveDraft()` are exposed to extensions. `autoSaveDraft` is wrapped in a 500 ms timeout; on failure the panel is destroyed. Dirty panels are never lazy-unmounted. `finance.ui.onBeforeUnmount(callback)` lets extensions register draft-persist hooks.

**Why it matters:** A `WebContentsView` per panel uses ~20–40 MB RAM. Lazy unmount after 5 minutes unfocused mitigates memory pressure, but dirty-state protection prevents losing half-filled forms.

### Decision 9 / ADR-0006: Flat Workspace Layout

**What was decided:** The workspace ships with a flat tab list (`_tabs: Tab[]` + `_activePanelId`) as the single source of truth. The `WorkspaceNode` split tree and drag-to-split are deferred. Persisted layouts are versioned flat JSON (`{ version: 1, tabs, activePanelId }`).

**Why it matters:** The tree was a phantom data structure — persisted but unreadable, with dead DnD plumbing. Deleting it removes drift bugs at a net negative line count. The flat model is the smallest correct model for the tabs Phase 5 actually ships.

### Overlay Coordinator (post-planning addition)

**What was decided:** A centralized `OverlayCoordinator` with reference counting hides `WebContentsView` panels when main-renderer DOM overlays (`#command-palette`, account-seed-modal) are open and restores them on close. `WebviewPanelManager.hidePanelsForOverlay()` / `restorePanels()` plus `overlayActive` guard suppress resize/mount-fallback visibility changes.

**Why it matters:** `WebContentsView` panels render natively above the main renderer's DOM regardless of CSS z-index. Without hiding panels, the command palette could not appear while a panel was visible.

## Six Explicit Deferrals (Self-Review Checklist Section 7)

Each deferral is documented with its target phase:

| Deferred | Target Phase |
|---|---|
| AI Assistant (`finance.ai.registerTool` wiring + Ollama) | Phase 6 |
| Generic settings UI renderer (`contributes.configuration`) | Phase 7 |
| Extension Manager UI (install/enable/disable/uninstall) | Phase 8 |
| Full grid layout for split-screen (3+ panes) | Phase 7+ |
| Main renderer `'unsafe-eval'` CSP removal | Phase 7 |
| Keyboard shortcut customization | Phase 7 |

**None of these block Phase 5 verification.**

## What Was NOT Decided (Open Questions for Future Phases)

1. **How to persist split layouts** — `version: 2` migration path is defined but not implemented.
2. **Whether to ship a "pin tab" affordance** — deferred to Phase 8's tab management.
3. **Should `finance.services.pay.getCurrentRate` return raw or simplified shape** — plan ships raw `RateRow`; Dashboard renders what it needs.
4. **Should the 2-pane split persist across restarts** — yes, via `core.workspace.layout` setting; reviewer confirmed naming.

## Files Created or Modified in This Session

| File | Change |
|---|---|
| `docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md` | **Created.** ~1688-line implementation plan with 12 architecture decisions, 20 tasks, 12 manual test units, ~87 new unit tests + 10 E2E tests, Self-Review Checklist §1–§10. |
| `docs/decisions/0005-domain-service-registry.md` | **Created (ADR).** Documents Decision 5: cross-extension Domain Service Registry in Main. |
| `docs/decisions/0006-flat-workspace-layout.md` | **Created (ADR).** Documents ADR-0006: flat tab list replaces phantom split tree; 2-pane split deferred. |
| `docs/decisions/README.md` | **Modified.** Added 0005 and 0006 to the index. |
| `docs/extension-api.md` | **Modified.** Added Phase 5 API sections: `onStartup`, `contributes.navigation`, `allowedCommands`/`allowedUiEvents`, `finance.services.*`, `finance.ui.*`, WebviewPanel hosting model. |
| `docs/file-reference.md` | **Modified.** Added Phase 5 inventory section (planned files tagged `(planned)`). |
| `docs/phase5-handoff.md` | **Created (this file).** Session handoff for future agents. |

## Reading Order for Future Agents

If you are about to:
- **Implement Phase 5** → read this handoff doc, then the Phase 5 plan, then ADR-0005 and ADR-0006, then the plan's Task 20 Self-Review Checklist.
- **Review the Phase 5 plan** → read this handoff doc (especially "Context Established During Planning" and "Key Decisions"), then the plan.
- **Modify a Phase 5 decision** → read this handoff doc's "Key Decisions and Their Rationale" section, then the plan's corresponding Decision section, then verify your change against the vision and the AGENTS.md rules.
- **Implement the split-screen retry** → read ADR-0006 first; the `version: 2` migration path is defined there.
