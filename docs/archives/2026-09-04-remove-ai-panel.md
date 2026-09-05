# Remove Dead AI Panel Placeholder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dead right-side `ai-panel` placeholder ("Chat panel placeholder", no functionality since Phase 6 was scrapped) and collapse the shell to 3 columns.

**Architecture:** Pure deletion + layout collapse. No new code, no new behavior. Blast radius verified by grep: `ai-panel` custom element used only in `index.html`; `toggleAiPanel`/`toggle-ai`/`core.toggle-ai` referenced only in `index.ts`, `command-palette.ts`, `shortcut-registry.ts`; `RIGHT_OFFSET` only affects `webview-panel-manager.ts` fallback bounds; settings keys `core.ui.aiCollapsed`/`core.ui.aiPanelWidth` read only in `index.ts` (orphaned values in existing DBs are ignored). E2E spec has 5 assertions to update.

**Tech Stack:** Electron, Lit, Vite, TypeScript strict, Playwright E2E, Vitest unit.

---

## File Structure

**Files to modify:**
- `src/renderer/index.html` — delete `.ai-resizer` div + `<ai-panel>` element
- `src/renderer/index.ts` — delete import, `toggleAiPanel`, resizer drag block, settings restore, `toggle-ai`/`core.toggle-ai` branches
- `src/renderer/components/command-palette.ts` — delete `toggle-ai` entry
- `src/renderer/styles/layout.css` — grid 4 cols → 3 cols, delete `.ai-resizer`/`#ai-panel`/`ai-collapsed` blocks
- `src/renderer/styles/tokens.css` — delete `--ai-panel-width`
- `src/main/services/shortcut-registry.ts` — delete `core.toggle-ai` entry
- `src/main/services/webview-panel-manager.ts` — `RIGHT_OFFSET = 320` → `0`, update comment
- `tests/e2e/renderer-shell.spec.ts` — update 5 ai-panel assertions
- `docs/file-reference.md` — mark `ai-panel.ts` row removed

**Files to delete:**
- `src/renderer/components/ai-panel.ts`

---

### Task 1: Delete component + HTML slot + import

**Files:**
- Delete: `src/renderer/components/ai-panel.ts`
- Modify: `src/renderer/index.html:18-19`
- Modify: `src/renderer/index.ts:4`
- Test: `npx tsc --noEmit` (import removal must not break compile)

- [ ] **Step 1: Verify current references**

Run: `grep -rn "ai-panel" src/renderer/components/ src/renderer/index.html`
Expected: `ai-panel.ts` custom element + `index.html:19` `<ai-panel id="ai-panel">`

- [ ] **Step 2: Delete `src/renderer/components/ai-panel.ts`, remove import line 4 and HTML lines 18-19**

```html
<!-- src/renderer/index.html: delete these two lines -->
<div class="ai-resizer"></div>
<ai-panel id="ai-panel"></ai-panel>
```

```typescript
// src/renderer/index.ts: delete line 4
import './components/ai-panel';
```

- [ ] **Step 3: Run typecheck (expect unrelated errors only, no ai-panel import error)**

Run: `npx tsc --noEmit`
Expected: no `Cannot find module './components/ai-panel'`

---

### Task 2: Remove toggle + resizer + settings restore from index.ts

**Files:**
- Modify: `src/renderer/index.ts:118-159` (toggleAiPanel + resizer block)
- Modify: `src/renderer/index.ts:350` (`toggle-ai` branch)
- Modify: `src/renderer/index.ts:362-368` (aiCollapsed/aiPanelWidth restore)
- Modify: `src/renderer/index.ts:467-469` (`core.toggle-ai` case)

- [ ] **Step 1: Delete `toggleAiPanel` (lines 118-121), resizer block (lines 123-159), settings restore (lines 362-368)**

- [ ] **Step 2: Delete command branches**

```typescript
// line 350: delete this branch, keep neighbors
if (cmd === 'toggle-ai') toggleAiPanel();
else if (cmd === 'view-dashboard') navigationPanel?.setView('Dashboard');
// becomes:
if (cmd === 'view-dashboard') navigationPanel?.setView('Dashboard');
```

```typescript
// lines 467-469: delete this case, keep neighbors
case 'core.toggle-ai':
  toggleAiPanel();
  break;
```

- [ ] **Step 3: Verify no dangling references**

Run: `grep -rn "toggleAiPanel\|aiPanel\|_aiDragging\|_aiStartX\|_aiStartWidth\|ai-resizer" src/renderer/index.ts`
Expected: 0 matches

---

### Task 3: CSS collapse to 3 columns + tokens + palette + shortcut registry

**Files:**
- Modify: `src/renderer/styles/layout.css:27-95`
- Modify: `src/renderer/styles/tokens.css:10`
- Modify: `src/renderer/components/command-palette.ts:15`
- Modify: `src/main/services/shortcut-registry.ts:13`

- [ ] **Step 1: Rewrite grid + delete ai blocks in layout.css**

```css
#app {
  display: grid;
  grid-template-columns: var(--activity-bar-width) var(--navigation-width) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) var(--status-bar-height);
  width: 100%;
  height: 100%;
  position: relative;
}
```

Delete: `.ai-resizer` block (lines 37-56), `#ai-panel` block (lines 80-86), `#app.ai-collapsed` + `#app.ai-collapsed #ai-panel` blocks (lines 88-95). Keep `#activity-bar`, `#navigation-panel`, `#workspace`, `#status-bar` rules unchanged.

- [ ] **Step 2: Delete `--ai-panel-width: 250px;` from tokens.css, `{ id: 'toggle-ai', ... }` from command-palette.ts, `{ commandId: 'core.toggle-ai', ... }` from shortcut-registry.ts**

- [ ] **Step 3: Verify**

Run: `grep -rn "ai-panel\|aiPanel\|ai-collapsed\|aiPanelWidth\|aiCollapsed\|ai-resizer\|toggle-ai" src/renderer/styles/ src/renderer/components/command-palette.ts src/main/services/shortcut-registry.ts`
Expected: 0 matches

---

### Task 4: Webview fallback offset + E2E spec

**Files:**
- Modify: `src/main/services/webview-panel-manager.ts:364-369`
- Modify: `tests/e2e/renderer-shell.spec.ts:9,41,43,45,68`

- [ ] **Step 1: Update RIGHT_OFFSET**

```typescript
// The workspace grid has: activity-bar (56) + nav (260) = 316px left offset,
// no right panel, tab-strip (36px) top, status-bar (26px) bottom.
const TAB_STRIP_HEIGHT = 36;
const STATUS_BAR_HEIGHT = 26;
const LEFT_OFFSET = 56 + 260; // activity-bar + navigation
const RIGHT_OFFSET = 0; // ai-panel removed
```

- [ ] **Step 2: Update E2E spec — delete `#ai-panel` visibility assertion (line 9), collapse-toggle assertions (lines 41-45), `core.ui.aiCollapsed` setup (line 68). Keep all other tests unchanged.**

- [ ] **Step 3: Run verification**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: 0 errors

---

## Self-Review

**Spec coverage:** Placeholder deletion (Tasks 1-2) ✓, 3-column collapse (Task 3) ✓, shortcut/command removal (Tasks 2-3) ✓, webview bounds (Task 4) ✓, E2E update (Task 4) ✓.

**Placeholder scan:** No TBD/TODO — all steps have concrete edits.

**Type consistency:** No new types. Deleted symbols (`toggleAiPanel`, `ai-panel` element, `toggle-ai`/`core.toggle-ai` commands, `--ai-panel-width`, `core.ui.aiCollapsed`/`core.ui.aiPanelWidth` reads) verified absent via grep in Tasks 2-3.

---

Plan complete and saved to `docs/superpowers/plans/2026-09-04-remove-ai-panel.md`. Executing inline now (sequential deletions, single session).
