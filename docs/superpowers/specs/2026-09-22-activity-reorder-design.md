---
version: 0.1.0
created: 2026-09-22
last_updated: 2026-09-22T12:00:00+10:00
status: draft
---

# Activity Bar Icon Reorder (Drag-and-Drop) — Design

## Goal

Let users reorder Activity Bar extension icons by dragging them (mouse) or with `Ctrl+Up/Down` (keyboard). Order persists across restarts via a new Core-generic setting. The Settings gear stays pinned at the bottom.

## Context

- `src/renderer/components/activity-bar.ts` renders one button per `views[]` entry plus a separate pinned Settings button (`.settings`, `margin-top: auto`). No DnD today.
- `src/renderer/index.ts:163 loadExtensionContributions()` rebuilds `activityBar.views` from registry (manifest discovery) order on every load — any reorder must be re-applied here or it resets.
- Settings keys are namespaced KV with JSON serialization (`settings-service.ts`), so a `string[]` order value is natively supported.

## Decisions

1. **Same hybrid as tabs (native drag + keyboard).** Vertical `dragover` math (pointer Y vs button midpoint) mirrors the tab strip's horizontal version. `Ctrl+Up/Down` on a focused button moves it. Rejected pointer-custom (overkill) and menu-only move (undiscoverable).
2. **Extensions only; Settings pinned.** The gear is Core-owned chrome, not an extension view — no setting, no drag. Matches VS Code.
3. **New setting `core.activityBar.order: string[]`.** Core-generic UI state (like `core.theme`, `core.workspace.layout`), zero finance logic — vision-safe. Unknown ids ignored, new views append at end, so install/uninstall never breaks the strip.
4. **Sort is a pure exported helper.** `sortActivityViews(views, order)` lives in `activity-bar.ts` (no imports, unit-testable); `index.ts` glue stays thin and untested, as today.

## 1. Architecture

`activity-bar.ts` owns interaction (draggable extension buttons, top/bottom indicator, intent events) plus the pure `sortActivityViews` helper. `index.ts` owns state: sorts on every `loadExtensionContributions()`, listens once for `activity-reorder`/`activity-move`, reorders `activityBar.views`, saves the id array. Event contract mirrors tabs:

- `activity-reorder { fromViewId: string, toViewId: string, after: boolean }`
- `activity-move { viewId: string, dir: -1 | 1 }`

## 2. Components

- **`activity-bar.ts`** — extension buttons get `draggable="true"` + existing focus; `_dragFrom` / `_dropKey` state; `.drop-before` / `.drop-after` horizontal accent lines (top/bottom inset box-shadow). Settings button untouched (no draggable, no handlers). Emits intents; never persists.
- **`index.ts`** — `loadExtensionContributions()` sorts via helper after building views; one-time `activity-reorder`/`activity-move` listeners reorder + `settings.set('core.activityBar.order', ids)`.

## 3. Data flow

Drag: `dragstart` (id in `dataTransfer`) → `dragover` (`preventDefault`, before/after from Y vs midpoint) → `drop` (emit) → index.ts reorders + saves → re-render. Keyboard: `Ctrl+Up/Down` → `activity-move` → swap with neighbour → save. Reload: setting re-applied over fresh registry order.

## 4. Error handling

- Drop on self / unknown id: no-op, indicator cleared.
- Corrupt setting (non-array, non-string ids): ignored, registry order kept.
- Uninstalled extension ids in saved order: filtered; newly installed views append at end.

## 5. Testing

- `activity-bar-icons.test.ts` (extend): buttons draggable, Settings button not draggable, `activity-move` on `Ctrl+ArrowDown`, `sortActivityViews` order/filter/append behavior.
- Manual gate: `npm run dev` → drag icon → reload persists; disable/enable extension → strip stays sane.

## Alternatives rejected

- **Reorder via Settings screen list:** discoverable but indirect; drag is the asked interaction.
- **Include Settings gear:** mixes Core chrome with extension views; pinned is the VS Code convention.

## Self-review

- No placeholders; paths, event names, and setting key verified against current source.
- Consistent: mirrors tab-reorder contract (direction-adapted); Core stays finance-free; install/uninstall degradation matches dashboard-card graceful patterns.
- Scope: renderer-only, two source files + one test file; fits one implementation plan.
- Unambiguous: pinned-gear rule, sort/merge rules, and no-op cases each have one reading.
