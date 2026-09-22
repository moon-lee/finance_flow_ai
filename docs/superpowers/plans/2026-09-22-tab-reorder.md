# Workspace Tab Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorderable workspace tabs via native drag-and-drop plus `Ctrl+Left/Right` keyboard move, persisted in the existing v1 layout.

**Architecture:** `tab-bar.ts` owns interaction (draggable tabs, drop indicator, intent events `tab-reorder`/`tab-move`); `workspace.ts` owns state (splice `_tabs`, `_scheduleSave`). Flat-list reorder per ADR-0006 — no split-tree, no schema change, no Main/Host changes.

**Tech Stack:** TypeScript strict, Lit 3, native HTML5 DnD, Vitest + happy-dom, Electron renderer.

---

## File Structure

```
src/renderer/components/tab-bar.ts      # draggable tabs, drag/indicator/keyboard handlers, emits tab-reorder/tab-move (Task 1)
src/renderer/components/workspace.ts    # @tab-reorder/@tab-move listeners, _onTabReorder/_onTabMove splice + save (Task 2)
tests/unit/renderer/tab-bar.test.ts     # replace stale not-draggable test, add reorder/move dispatch tests (Task 1)
tests/unit/renderer/workspace.test.ts   # reorder order/active/persist/unknown-id tests (Task 2)
```

---

### Task 1: tab-bar drag interaction + intent events

**Files:**
- Modify: `src/renderer/components/tab-bar.ts:7-100` (styles + state + handlers + render)
- Modify: `tests/unit/renderer/tab-bar.test.ts:65-73` (replace stale test, append dispatch tests)

**Interfaces:**
- Consumes: `Tab[]` (`./types`), `activePanelId` (existing props).
- Produces: `tab-reorder { fromPanelId, toPanelId, after }` and `tab-move { panelId, dir }` CustomEvents (bubbles + composed), consumed by Task 2.

- [ ] **Step 1: Replace the stale test with failing reorder tests**

In `tests/unit/renderer/tab-bar.test.ts`, replace the `does not mark tabs draggable` test (lines 65-73) with:

```ts
  it('marks tabs draggable for reorder', async () => {
    const el = document.createElement('tab-bar') as TabBar;
    el.tabs = [{ panelId: 'panel-1', label: 'Dashboard' }];
    document.body.appendChild(el);
    await el.updateComplete;
    const shadow = el.shadowRoot as unknown as { querySelector: (sel: string) => HTMLElement | null } | null;
    expect(shadow?.querySelector('.tab')?.getAttribute('draggable')).toBe('true');
    document.body.removeChild(el);
  });

  it('dispatches tab-move on Ctrl+ArrowRight', async () => {
    const el = document.createElement('tab-bar') as TabBar;
    el.tabs = [
      { panelId: 'panel-1', label: 'Dashboard' },
      { panelId: 'panel-2', label: 'Salary' },
    ];
    document.body.appendChild(el);
    await el.updateComplete;
    const handler = vi.fn();
    el.addEventListener('tab-move', handler);
    const shadow = el.shadowRoot as unknown as { querySelectorAll: (sel: string) => NodeListOf<HTMLElement> } | null;
    const first = shadow?.querySelectorAll('.tab')[0];
    first?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true, composed: true }));
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ detail: { panelId: 'panel-1', dir: 1 } }));
    document.body.removeChild(el);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/renderer/tab-bar.test.ts -v`
Expected: FAIL — `expected null to be 'true'` (no `draggable` attribute yet) and `tab-move` never dispatched.

- [ ] **Step 3: Write minimal tab-bar implementation**

In `src/renderer/components/tab-bar.ts`:

1. Add imports/state after the `direction` property (line 109):

```ts
  @state()
  private _dragFrom: string | null = null;

  @state()
  private _dropKey: string | null = null;
```

Add `state` to the lit/decorators import: `import { customElement, property, state } from 'lit/decorators.js';`

2. Add styles inside `static styles` (after `.tab-close:hover` block, line 99):

```css
    .tab.drop-before {
      box-shadow: inset 2px 0 0 var(--accent);
    }

    .tab.drop-after {
      box-shadow: inset -2px 0 0 var(--accent);
    }
```

3. Add handlers after `_onTabClose` (line 118):

```ts
  private _onDragStart(e: DragEvent, panelId: string) {
    this._dragFrom = panelId;
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', panelId);
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  private _onDragOver(e: DragEvent, panelId: string) {
    e.preventDefault();
    if (!this._dragFrom || this._dragFrom === panelId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientX > rect.left + rect.width / 2;
    this._dropKey = `${after ? 'after' : 'before'}:${panelId}`;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  private _onDragLeave(e: DragEvent) {
    const to = (e as DragEvent & { relatedTarget?: Node | null }).relatedTarget;
    if (to && (e.currentTarget as HTMLElement).contains(to as Node)) return;
    this._dropKey = null;
  }

  private _onDrop(e: DragEvent, panelId: string) {
    e.preventDefault();
    const from = this._dragFrom ?? e.dataTransfer?.getData('text/plain') ?? '';
    this._dragFrom = null;
    this._dropKey = null;
    if (!from || from === panelId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientX > rect.left + rect.width / 2;
    this.dispatchEvent(new CustomEvent('tab-reorder', { detail: { fromPanelId: from, toPanelId: panelId, after }, bubbles: true, composed: true }));
  }

  private _onDragEnd() {
    this._dragFrom = null;
    this._dropKey = null;
  }

  private _onTabKeyDown(e: KeyboardEvent, panelId: string) {
    if (!e.ctrlKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    this.dispatchEvent(new CustomEvent('tab-move', { detail: { panelId, dir: e.key === 'ArrowRight' ? 1 : -1 }, bubbles: true, composed: true }));
  }
```

4. Replace the `.tab` div in `render()` (lines 124-134) with:

```ts
          <div class="tab ${tab.panelId === this.activePanelId ? 'active' : ''} ${this._dropKey === `before:${tab.panelId}` ? 'drop-before' : ''} ${this._dropKey === `after:${tab.panelId}` ? 'drop-after' : ''}"
                role="tab"
                tabindex="0"
                draggable="true"
                aria-selected="${tab.panelId === this.activePanelId}"
                @click="${() => tab.panelId && this._onTabClick(tab.panelId)}"
                @keydown="${(e: KeyboardEvent) => tab.panelId && this._onTabKeyDown(e, tab.panelId)}"
                @dragstart="${(e: DragEvent) => tab.panelId && this._onDragStart(e, tab.panelId)}"
                @dragover="${(e: DragEvent) => tab.panelId && this._onDragOver(e, tab.panelId)}"
                @dragleave="${(e: DragEvent) => this._onDragLeave(e)}"
                @drop="${(e: DragEvent) => tab.panelId && this._onDrop(e, tab.panelId)}"
                @dragend="${() => this._onDragEnd()}">
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/renderer/tab-bar.test.ts -v`
Expected: PASS (6/6 — 4 existing + 2 new).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS with no output.

---

### Task 2: workspace reorder handlers + persistence

**Files:**
- Modify: `src/renderer/components/workspace.ts:425-433` (add handlers), `src/renderer/components/workspace.ts:514` (wire events)
- Modify: `tests/unit/renderer/workspace.test.ts` (append reorder tests)

**Interfaces:**
- Consumes: `tab-reorder` / `tab-move` events from Task 1.
- Produces: reordered `_tabs` + debounced persist via existing `_scheduleSave()`; `activePanelId` unchanged by reorder.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/renderer/workspace.test.ts` (before the final `});`):

```ts
  it('reorders tabs on tab-reorder and keeps the active panel', () => {
    const el = makeEl() as unknown as {
      _tabs: Tab[];
      _activePanelId: string;
      _addPanel: (panelId: string, label: string) => void;
      _onTabReorder: (fromPanelId: string, toPanelId: string, after: boolean) => void;
    };
    el._addPanel(SALARY.panelId, SALARY.label);
    el._focusPanel(DASHBOARD.panelId);
    el._onTabReorder(SALARY.panelId, DASHBOARD.panelId, false);
    expect(el._tabs.map((t) => t.panelId)).toEqual([SALARY.panelId, DASHBOARD.panelId]);
    expect(el._activePanelId).toBe(DASHBOARD.panelId);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('ignores reorder with unknown panel ids', () => {
    const el = makeEl() as unknown as {
      _tabs: Tab[];
      _onTabReorder: (fromPanelId: string, toPanelId: string, after: boolean) => void;
    };
    el._onTabReorder('panel-missing', DASHBOARD.panelId, false);
    expect(el._tabs).toEqual([DASHBOARD]);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });

  it('moves a tab with tab-move direction', () => {
    const el = makeEl() as unknown as {
      _tabs: Tab[];
      _addPanel: (panelId: string, label: string) => void;
      _onTabMove: (panelId: string, dir: -1 | 1) => void;
    };
    el._addPanel(SALARY.panelId, SALARY.label);
    el._onTabMove(DASHBOARD.panelId, 1);
    expect(el._tabs.map((t) => t.panelId)).toEqual([SALARY.panelId, DASHBOARD.panelId]);
    document.body.removeChild(document.querySelector('workspace-panel')!);
  });
```

The `makeEl` helper returns the element cast — extend its inline type in the test file only if TS complains (add `_onTabReorder` / `_onTabMove` to the cast, as shown).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/renderer/workspace.test.ts -v`
Expected: FAIL — `el._onTabReorder is not a function`.

- [ ] **Step 3: Write minimal workspace implementation**

In `src/renderer/components/workspace.ts`, add after `_closePanel` (line 456):

```ts
  private _onTabReorder(fromPanelId: string, toPanelId: string, after: boolean) {
    const from = this._tabs.findIndex(t => t.panelId === fromPanelId);
    const to = this._tabs.findIndex(t => t.panelId === toPanelId);
    if (from === -1 || to === -1 || from === to) return;
    const next = this._tabs.slice();
    const [moved] = next.splice(from, 1);
    const target = next.findIndex(t => t.panelId === toPanelId);
    next.splice(after ? target + 1 : target, 0, moved);
    this._tabs = next;
    this._scheduleSave();
    this.requestUpdate();
  }

  private _onTabMove(panelId: string, dir: -1 | 1) {
    const i = this._tabs.findIndex(t => t.panelId === panelId);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= this._tabs.length) return;
    const next = this._tabs.slice();
    [next[i], next[j]] = [next[j], next[i]];
    this._tabs = next;
    this._scheduleSave();
    this.requestUpdate();
  }
```

Wire the events in `render()` line 514 — replace the `<tab-bar ...>` element with:

```ts
        <tab-bar .tabs="${tabs}" .activePanelId="${this._activePanelId}" @tab-focus="${(e: CustomEvent) => this._onTabFocus(e.detail.panelId)}" @tab-close="${(e: CustomEvent) => this._onTabClose(e.detail.panelId)}" @tab-reorder="${(e: CustomEvent) => this._onTabReorder(e.detail.fromPanelId, e.detail.toPanelId, e.detail.after)}" @tab-move="${(e: CustomEvent) => this._onTabMove(e.detail.panelId, e.detail.dir)}"></tab-bar>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/renderer/workspace.test.ts tests/unit/renderer/tab-bar.test.ts -v`
Expected: PASS (all suites, including the replaced draggable test).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS with no output.

---

### Task 3: Full verification + manual gate

**Files:** none (verification only; docs already updated with this plan).

- [ ] **Step 1: Run the full renderer + unit scope**

Run: `npx vitest run tests/unit/renderer/ -v`
Expected: PASS, no regressions in `navigation-panel`, `settings-screen`, or `activity-bar` suites.

- [ ] **Step 2: Manual verification in the app**

1. `npm run dev` → open 3 tabs (Dashboard, Salary, Budget).
2. Drag the last tab to the front → strip order changes, active panel keeps focus, no console errors.
3. Reload → order persists (v1 `core.workspace.layout` in `localStorage`).
4. Focus a tab, press `Ctrl+Left/Right` → tab moves, order persists after reload.
5. Drag a tab onto itself → no-op, no error.

---

## Self-Review

- **Spec coverage:** Goal + Decisions 1–4 → Tasks 1–2; §2 components → Task 1 (tab-bar) + Task 2 (workspace); §3 data flow → drag/keyboard handlers; §4 errors → unknown-id/same-tab no-ops + existing 16 KB/corrupt guards; §5 testing → Task 1/2 unit + Task 3 manual.
- **Placeholder scan:** no TBD/TODO; every step has exact paths, code, commands, expected output. Prior-failure traps addressed inline (stale not-draggable test replaced in Task 1 Step 1; `dragover` `preventDefault` in handler; `currentTarget`-based rect).
- **Type consistency:** `tab-reorder { fromPanelId: string, toPanelId: string, after: boolean }` and `tab-move { panelId: string, dir: -1 | 1 }` identical in emitter (Task 1), listener wiring, and handler signatures (Task 2); `_dropKey` `before:/after:` prefixes match the render classes.
