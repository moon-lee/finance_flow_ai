---
version: 0.1.0
created: 2026-09-22
last_updated: 2026-09-22T12:00:00+10:00
status: draft
---

# Workspace Tab Reorder (Drag-and-Drop) — Design

## Goal

Let users reorder workspace tabs by dragging them (mouse) or with `Ctrl+Left/Right` (keyboard). Order persists across restarts via the existing `core.workspace.layout` v1 payload. No split panes, no schema change.

## Context

- `src/renderer/components/workspace.ts` owns the single source of truth `_tabs: Tab[]` (flat list, ADR-0006). Persistence (`_scheduleSave`, 500 ms debounce, 16 KB guard) already stores array order — reordering the array is sufficient for persistence.
- `src/renderer/components/tab-bar.ts` renders tabs with no DnD plumbing (removed by ADR-0006) and is used only by `workspace.ts:3,514`.
- Panels are position-independent: `_sendBoundsToPanel(activePanelId)` sizes only the active `WebContentsView`. Reorder never touches Main, Host, or `panel:` IPC.

### Why a previous attempt failed

1. `tests/unit/renderer/tab-bar.test.ts:65` asserts tabs are **not** draggable. Adding `draggable` without updating that test fails the suite.
2. Native DnD's most common trap: `drop` never fires unless `dragover` calls `preventDefault()`.
3. Lit Shadow DOM retargeting: `dragstart` must set `dataTransfer` data on the originating `.tab`; handlers must use `e.currentTarget`, not `e.target`.

This design addresses all three: the plan replaces the stale test, mandates `preventDefault` on `dragover`, and uses `currentTarget`-based handlers.

## Decisions

1. **Native HTML5 drag + keyboard move (hybrid).** Mouse users drag; keyboard users press `Ctrl+Left/Right` on a focused tab. Both mutate the same `_tabs` array. Rejected custom pointer-drag (more code, touch/scroll edge cases) and buttons-only (less discoverable).
2. **Persist order (free).** Reorder calls the existing `_scheduleSave()`; v1 `{ version, tabs, activePanelId }` keeps array order. Session-only would need extra code to suppress saves — more error-prone.
3. **Active tab follows identity, not position.** Reorder never changes `_activePanelId`; the active panel keeps focus, just moves in the strip.
4. **`_refreshPanels` is order-safe.** It `.map()`s over `_tabs` (labels/colors only), never re-sorts — reorder survives background refreshes.

## 1. Architecture

`tab-bar.ts` owns all pointer interaction (draggable tabs, drop indicator, keyboard) and emits intent events. `workspace.ts` owns state (splice `_tabs`, save, re-render). Event contract:

- `tab-reorder { fromPanelId: string, toPanelId: string | '__end__', after: boolean }`
- `tab-move { panelId: string, dir: -1 | 1 }` (keyboard)

This matches ADR-0006's revisit trigger: flat-list reorder, not a split-tree revival (no `version: 2`, no `split-pane` import).

## 2. Components

- **`tab-bar.ts`** — `.tab` gets `draggable="true"` + `tabindex="0"`; internal `_dragFrom` / `_dropTarget` state; drop indicator via `.drop-before` / `.drop-after` inset box-shadow in accent color. Emits `tab-reorder` / `tab-move`; never mutates `tabs` directly.
- **`workspace.ts`** — listens `@tab-reorder` / `@tab-move` on `<tab-bar>`, splices `_tabs`, calls `_scheduleSave()`, `requestUpdate()`. Unknown `panelId`s ignored (same guard style as `_focusPanel`).

## 3. Data flow

Drag: `dragstart` (store id in `dataTransfer`) → `dragover` (`preventDefault`, compute before/after from pointer X vs tab midpoint, set indicator) → `drop` (emit `tab-reorder`) → workspace splices → debounced save → re-render. `dragend`/`dragleave` clear indicator state.

Keyboard: focused tab + `Ctrl+Arrow` → `tab-move` → workspace swaps with neighbour (no-op at ends) → save.

## 4. Error handling

- Drop on same tab / unknown id: no-op, indicator cleared, no throw.
- `_refreshPanels` racing a reorder: map preserves order; worst case a label update re-renders mid-drag, indicator resets harmlessly.
- Persisted layout over 16 KB or corrupt: existing guards unchanged (truncate / fall back to Dashboard default).

## 5. Testing

- `tab-bar.test.ts`: replace the stale not-draggable test; assert `draggable="true"`, `tab-reorder` dispatched on drop, `tab-move` dispatched on `Ctrl+Arrow`.
- `workspace.test.ts`: reorder changes `_tabs` order, keeps `_activePanelId`, ignores unknown ids, persists new order to `localStorage` after debounce.
- Manual gate (happy-dom cannot verify native DnD end-to-end): `npm run dev` → drag tab → order changes + survives reload; `Ctrl+Left/Right` moves focused tab.

## Alternatives rejected

- **Custom pointer drag:** full indicator control and touch support, but ~3x code plus scroll/capture edge cases. Revisit if touch reorder is requested.
- **Buttons/context-menu move only:** simplest, but undiscoverable for mouse users; kept only as the keyboard half of the hybrid.

## Self-review

- No placeholders; all file paths, event names, and method references verified against current source.
- Consistent: flat `_tabs` reorder matches ADR-0006 revisit trigger; v1 persistence unchanged; `pay`/`budget` services untouched.
- Scope: renderer-only, two source files + two test files; fits one implementation plan.
- Unambiguous: event payloads, active-tab rule, and no-op cases each have one reading.
