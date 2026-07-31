# ADR-0006: Flat Workspace Layout Instead of Split-Tree (2-Pane Split Deferred)

**Status:** Accepted
**Date:** 2026-07-31
**Context:** Phase 5 — Webview Panels, Multi-Extension UI & Cross-Extension Services (`docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md`, Task 12, Decision 9).

## Context

Task 12 ships the multi-tab workspace. Decision 9 specified a `WorkspaceLayout` **tree** (`WorkspaceNode = Tab | Split`) as the single data model: the tab bar shows the active leaf's path, drag-to-split creates 2-pane groups, and `core.workspace.layout` persists the tree. The tree was implemented in `src/renderer/components/workspace.ts` alongside a parallel flat `_tabs: Tab[]` array.

Audit of the shipped code (verified against `a21b802`) showed the tree was a **phantom data structure**:

- Every `_addTab` call wrapped the layout in a fake `{ type: 'split', children: [tab, tab] }` node (`workspace.ts` `_addTab`), but `render()` never instantiated `split-pane` — it only flattened leaves via `_getLeafTabs`. `split-pane` was imported but never rendered.
- The phantom split tree was **persisted** (`_scheduleSave` serialized `this._layout`) and then **silently discarded on restart**: `_restoreLayout` accepted only `isTab(layout)` nodes, so any restored split tree fell back to a default single-tab layout. A user's saved multi-tab state could be lost.
- `tab-bar` grew unused drag-and-drop plumbing (HTML5 `draggable` + `dragstart`/`dragend` + a drop-affordance CSS class) whose `tab-drag-end` event only triggered `_refreshPanels()` — no split was ever created.

The real source of truth in every code path was the flat `_tabs` array; the tree added state-maintenance risk (duplication, `_collapseEmptySplits`, `_setActive` tree rewriting) without delivering the split UI it described.

## Decision

Ship the workspace with a **flat tab list as the single source of truth**, and defer the 2-pane split to a later task.

- `_tabs: Tab[]` is the only layout state. `WorkspaceNode`, `isTab`, `isSplit`, and the tree helpers (`_getLeafTabs`, `_getActiveLeaf`, `_findNode`, `_setActive`, `_addTab`, `_removeTab`, `_collapseEmptySplits`, `_firstLeafPanelId`) are deleted.
- The persistence schema becomes **versioned flat JSON**:

  ```json
  { "version": 1, "tabs": [{ "panelId": "...", "label": "Dashboard" }], "activePanelId": "..." }
  ```

  The `version` field is the migration hook: when split layouts are re-added, they become `version: 2` with a split model, and `_restoreLayout` migrates older shapes. The legacy `{ type: 'tab', panelId, label }` shape (0.7.x) is migrated to the flat format on restore.
- The 16 KB persistence guard is preserved unchanged.
- `tab-bar.ts` loses its drag-and-drop plumbing (`draggable`, `dragstart`/`dragend`, `tab-drag-end`, drop-affordance CSS). `split-pane.ts` stays in the tree as a **standalone, unimported component** — it is the reusable splitter for the split retry and its removal would be churn, not simplification.
- Focus rules: `_focusPanel` ignores panel ids that are not open (prevents activating a tab that is not displayed); closing the active tab refocuses the tab that took its place (VS Code behaviour) or the new last tab; closing the last tab unmounts all panels and shows the empty state.

### Rationale

The tree failed its primary purpose — no split UI ever rendered — while adding a second, diverging copy of layout state that was persisted but unreadable. Deleting it removes a class of drift bugs (persisted-then-dropped layouts, tab duplication across branches) at a net negative line count. The flat model is the smallest correct model for the tabs that Phase 5 actually ships; the split becomes an additive, versioned change rather than a rewrite.

## Consequences

**Positive:**

- Single source of truth: `_tabs` + `_activePanelId`; no tree/flat drift possible.
- Persisted layouts survive restarts: flat layouts restore; legacy single-tab layouts migrate; invalid/corrupt payloads fall back to the default Dashboard tab.
- `version` in the schema gives future work a clean migration path.
- Removes dead code (tree helpers, DnD plumbing, phantom split import).

**Negative / costs:**

- 2-pane split (Decision 9's UI surface) is not available in Phase 5 as planned; it is deferred. The saved `version: 1` payloads will need a forward migration when `version: 2` ships.
- `split-pane.ts` remains unimported dead code until the split retry, which can confuse agents auditing for dead code.

## Alternatives considered

- **Keep the tree and fix rendering to actually instantiate `split-pane`.** Rejected for this increment: wiring the tree renderer, per-pane bounds sync, and DnD split creation is a large chunk of work, and the tree's add-to-left-branch-only logic had already proven buggy. Better to ship a correct flat model now and build split on top of the `version` migration.
- **Delete `split-pane.ts` entirely.** Rejected — it is ~150 lines of reusable, tested-in-principle splitter code that the split retry will need; deleting and later recreating it is pure churn.
- **Keep `_layout` as a derived getter over `_tabs`.** Rejected — with no split UI there is nothing to derive; a getter would merely preserve a type no code path uses.

## Revisit triggers

Reconsider when **any** of the following becomes true:

- A user-facing requirement for side-by-side/top-bottom panes appears (Phase 7 grid layouts per `project_vision.md:222-241`). Then implement split as `version: 2`, migrating `version: 1` flat payloads and restoring `split-pane` usage.
- A drag affordance is wanted on the tab strip itself (reordering tabs) — that is a flat-list reorder feature, not a split, and does not resurrect the tree.

## Related

- Plan: `docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md` (Decision 9, Task 12)
- Code: `src/renderer/components/workspace.ts` (flat rewrite), `src/renderer/components/tab-bar.ts` (DnD removal), `src/renderer/components/split-pane.ts` (kept, unimported)
- Tests: `tests/unit/renderer/workspace.test.ts` (12 tests, flat model + persistence), `tests/unit/renderer/tab-bar.test.ts`
- Vision: `project_vision.md:222-241` (Main Workspace — tabs + split-screen groups); `project_vision.md:374` (tabs)
