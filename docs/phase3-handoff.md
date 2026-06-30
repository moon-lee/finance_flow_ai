# Phase 3 Planning Session Handoff

> **Purpose:** This document captures the conversational context and decision rationale from the Phase 3 planning session (2026-06-30). It exists so future agents — who will not have access to the original conversation — understand the *why* behind decisions that may not be obvious from reading the plan alone.
>
> **Read this BEFORE reading the Phase 3 plan if you are about to implement Phase 3 or modify decisions made during planning.**

## Context Established During Planning

### Verification Done Before Writing the Plan

The user asked the planner to verify several assumptions before drafting. Findings:

1. **Phase 1 added ZERO business layer.** The project vision mentions Domain Services (PayService, DeductionService, TransactionService, AccountService, CategoryService) but none of these classes exist in the codebase. The implementation design spec explicitly schedules Domain Services for Phase 4, not Phase 3. Phase 3 should stay out of business logic.

2. **Phase 2 added ZERO business layer.** Phase 2 introduced SQLite, Settings Service, window-state persistence, and theme persistence — all infrastructure. No finance tables (Accounts, Transactions, Categories, PaySlips, Deductions) exist.

3. **Phase 1's `src/types/finance.d.ts` was an empty placeholder.** The file contained only `export {};` with a comment explicitly saying *"Phase 1 intentionally does not expose extension APIs. This file reserves the package contract location that later milestones will expand."* Phase 2 did not populate the file.

4. **The vision's `import * as finance from 'finance'` is illustrative pseudocode, not a locked-in contract.** It appears once at `project_vision.md:275` as a code example showing the *shape* of the API surface, not a binding import syntax specification. The actual contract is the type definitions in `finance.d.ts`, which Phase 3 is the first milestone to populate.

5. **The implementation design spec is slightly out of date.** Last touched 2026-06-14 (before Phase 2 began). Its Phase 3 deliverable wording ("Extension loader spawning process successfully") is narrower than the vision's ("...and registers its views/commands in the UI"). Phase 3 plan follows the vision. The implementation design spec should be refreshed after Phase 3 lands.

### User's Vision Confirmed

The user stated their high-level goal: *"VS Code-style extensions that can share data with each other."* This matches the project vision exactly. The rules the vision enforces (no direct cross-extension imports, graceful degradation, namespace isolation) are the same rules VS Code uses for the same reason — to make the extension ecosystem stable.

### User Preferences Observed

- **Decision-level explanations before code.** When a new technical concept appeared (e.g., `utilityProcess`, `MessagePort`, JSON-RPC), the user asked for a plain-English explanation before engaging with implementation details. Future agents presenting architecture decisions should lead with the *why* before the *how*.

- **Verification before assertions.** The user asked "is Phase 1 or Phase 2 already added a business layer?" rather than taking the plan at face value. Future agents should expect to be asked to verify assumptions and should have evidence (file paths, grep output, citations) ready.

- **Design documents must stay in sync.** After the plan was drafted, the user reminded the planner that AGENTS.md Rule #5 requires CHANGELOG.md updates after work is completed. The planner had missed this for the plan creation step. Future agents should proactively update CHANGELOG.md, docs/file-reference.md, and write ADRs when architectural decisions are made — do not wait to be asked.

- **Citations matter.** The user asked for the exact location of "direct cross-extension access forbidden" in the vision. The planner cited `project_vision.md:48` and added an explicit verification item to the plan's Self-Review Checklist. Future agents should cite vision/plan line numbers when making claims about rules.

- **Deferrals should be explicit, not implicit.** When the planner identified items outside Phase 3 scope (settings UI renderer, extension manager, navigation provider, etc.), the user clarified these should be **documented as deferrals with phase targets** in the plan's Self-Review Checklist, not buried as "out of scope" comments. This makes them discoverable in future reviews.

## Key Decisions and Their Rationale

### Decision 1: Electron `utilityProcess.fork` for Extension Host

**What was decided:** Spawn the Extension Host via `utilityProcess.fork()`, not `child_process.fork` or hidden BrowserWindow.

**Why it matters:** Process isolation is what *structurally* enforces the vision's cross-extension rule. Two extensions in the same process could `import` from each other's modules; two extensions in separate processes cannot.

**Alternatives rejected and why:**
- `child_process.fork` — loses Electron lifecycle integration, no MessagePort primitive
- Hidden BrowserWindow — `nodeIntegration: true` is forbidden by vision for security
- In-process execution — kills crash isolation, violates vision's "separate Node.js background process" requirement

### Decision 2: JSON-RPC 2.0 over MessagePort

**What was decided:** All Main↔Host traffic uses JSON-RPC 2.0 envelopes.

**Why:** Industry standard, debuggable as text, request/response correlation, standard error codes. Matches vision's pinned transport at `project_vision.md:78`.

**Why not a library:** The protocol is small enough (~50 lines) that a hand-rolled envelope helper beats pulling in `@vscode/jsonrpc` for clarity.

### Decision 9 (added late in planning): Phase 3 Establishes the `finance` API Loading Mechanism

**What was decided:** Phase 3 extensions receive the `finance` API as a parameter to `activate(finance)`, not via `import * as finance from 'finance'`.

**Why this was reframed mid-planning:** The original draft framed parameter injection as a "deviation from the vision." After verification (Phase 1's `finance.d.ts` was empty; Phase 2 didn't define the contract; the vision's import syntax is illustrative pseudocode), the framing changed: Phase 3 is *establishing* the contract, not deviating from a pre-existing one.

**Phase 4+ migration target:** When a real multi-file extension is built (Phase 4 Salary History), decide between (a) implementing `import * as finance from 'finance'` via a Node loader hook in the Host, or (b) publishing `finance.d.ts` as a typed SDK package that extensions import for types while still receiving the API as an `activate(finance)` parameter. The decision belongs to whichever phase first builds a multi-file extension.

### Six Explicit Deferrals (Self-Review Checklist Section 7)

Each deferral is documented with its target phase:

| Deferred | Target Phase |
|---|---|
| `contributes.configuration` settings UI renderer | Phase 7 |
| Extension Manager UI (install/enable/disable) | Phase 8 |
| NavigationProvider pattern (data-driven side panel) | Phase 5 |
| Menu bar contribution rendering | Phase 5 |
| Canonical `import * as finance from 'finance'` pattern | Phase 4+ |
| Cross-process event bus | Phase 5 |

**None of these block Phase 3 verification.** The mock `salary-history` extension in Phase 3 contributes views and commands but does NOT contribute configuration, menus, or trigger cross-process events.

## What Was NOT Decided (Open Questions for Future Phases)

1. **How to implement canonical `import * as finance from 'finance'`** — Node loader hook vs Vite alias vs SDK package. Decision deferred to Phase 4.

2. **Whether to bundle extensions as part of the Host build or load them at runtime** — Phase 3 uses `createRequire` at runtime. Phase 4+ may want pre-bundled extensions for faster cold-start.

3. **Whether the implementation design spec should be updated before or after Phase 3 implementation** — recommended after, but the user did not decide.

4. **Which phase owns Domain Services implementation** — implementation design spec assigns them to Phase 4 (PayService, DeductionService). The vision's broader list (TransactionService, AccountService, CategoryService) is for later phases.

## Files Created or Modified in This Session

| File | Change |
|---|---|
| `docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md` | **Created.** 2732-line implementation plan with 9 architecture decisions, 17 tasks, 8 manual test units, Self-Review Checklist with 7 sections. |
| `docs/decisions/0003-extension-host-transport.md` | **Created (ADR).** Documents Decisions 1 and 2 of the plan. |
| `docs/decisions/README.md` | **Modified.** Added 0003 to the index. |
| `docs/file-reference.md` | **Modified.** Added Phase 3 file inventory section (planned files tagged `(planned)`). |
| `CHANGELOG.md` | **Modified.** Version bumped to 0.5.0; `[0.5.0]` section added documenting the plan creation; frontmatter `last_updated` set to 2026-06-30T17:00:00+10:00. |
| `package.json` | **Modified.** Version bumped from 1.0.0 to 0.5.0 to sync with CHANGELOG. |
| `docs/phase3-handoff.md` | **Created (this file).** Session handoff for future agents. (Moved from `.kimchi/docs/` to `docs/` on user request — placing it in the docs/ folder makes it discoverable via the AGENTS.md Rule #6 auto-read path.) |

## Reading Order for Future Agents

If you are about to:
- **Implement Phase 3** → read this handoff doc, then the Phase 3 plan, then ADR-0003, then the plan's Task 17 Self-Review Checklist.
- **Review the Phase 3 plan** → read this handoff doc (especially "Context Established During Planning"), then the plan.
- **Modify a Phase 3 decision** → read this handoff doc's "Key Decisions and Their Rationale" section, then the plan's corresponding Decision section, then verify your change against the vision and the AGENTS.md rules.
- **Update the implementation design spec** → it should reflect Phase 3's actual deliverable (which is broader than its current narrow Phase 3 wording) and Phase 2's actual lessons learned (inline migrations, ABI handling, vitest scope).
