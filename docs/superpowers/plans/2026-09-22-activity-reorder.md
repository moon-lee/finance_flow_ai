# Activity Bar Icon Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorderable Activity Bar extension icons via native drag-and-drop plus `Ctrl+Up/Down`, persisted in `core.activityBar.order` with the Settings gear pinned.

**Architecture:** `activity-bar.ts` owns interaction (draggable buttons, indicator, intent events) plus pure `sortActivityViews` helper; `index.ts` sorts on every contributions load and saves on reorder. Renderer-only; no Main/Host changes.

**Tech Stack:** TypeScript strict, Lit 3, native HTML5 DnD, Vitest + happy-dom, `financeShell.settings` KV.

---

## File Structure

```
src/renderer/components/activity-bar.ts      # draggable buttons, drag/indicator/keyboard handlers, sortActivityViews helper (Task 1)
src/renderer/index.ts                        # sort on load + reorder/move listeners + save (Task 2)
tests/unit/renderer/activity-bar-icons.test.ts # draggable/gear/move/sort tests (Task 1)
```

---

### Task 1: activity-bar drag interaction + sort helper

**Files:**
- Modify: `src/renderer/components/activity-bar.ts:1-127`
- Modify: `tests/unit/renderer/activity-bar-icons.test.ts:24-33` (append tests)

**Interfaces:**
- Consumes: `ActivityView[]` (existing prop).
- Produces: `activity-reorder { fromViewId, toViewId, after }`, `activity-move { viewId, dir }` events + exported `sortActivityViews(views, order)`, consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/renderer/activity-bar-icons.test.ts` (before the final `});`):

```ts
  it('marks extension buttons draggable but not the Settings gear', async () => {
    if (!customElements.get('activity-bar')) customElements.define('activity-bar', ActivityBar);
    const element = document.createElement('activity-bar') as ActivityBar;
    element.views = [{ id: 'a-view', name: 'A', icon: 'A' }];
    document.body.appendChild(element);
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('button[data-view-id="a-view"]')?.getAttribute('draggable')).toBe('true');
    expect(element.shadowRoot?.querySelector('button.settings')?.hasAttribute('draggable')).toBe(false);
    document.body.removeChild(element);
  });

  it('dispatches activity-move on Ctrl+ArrowDown', async () => {
    if (!customElements.get('activity-bar')) customElements.define('activity-bar', ActivityBar);
    const element = document.createElement('activity-bar') as ActivityBar;
    element.views = [
      { id: 'a-view', name: 'A', icon: 'A' },
      { id: 'b-view', name: 'B', icon: 'B' },
    ];
    document.body.appendChild(element);
    await element.updateComplete;
    const seen: unknown[] = [];
    element.addEventListener('activity-move', (e: Event) => seen.push((e as CustomEvent).detail));
    const first = element.shadowRoot?.querySelector('button[data-view-id="a-view"]') as HTMLElement | null;
    first?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, bubbles: true, composed: true }));
    expect(seen).toEqual([{ viewId: 'a-view', dir: 1 }]);
    document.body.removeChild(element);
  });

  it('sortActivityViews applies saved order, drops missing, appends new', async () => {
    const { sortActivityViews } = await import('../../../src/renderer/components/activity-bar');
    const views = [
      { id: 'a-view', name: 'A', icon: 'A' },
      { id: 'b-view', name: 'B', icon: 'B' },
      { id: 'c-view', name: 'C', icon: 'C' },
    ];
    expect(sortActivityViews(views, ['c-view', 'a-view', 'gone-view']).map((v) => v.id))
      .toEqual(['c-view', 'a-view', 'b-view']);
    expect(sortActivityViews(views, 'corrupt').map((v) => v.id))
      .toEqual(['a-view', 'b-view', 'c-view']);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/renderer/activity-bar-icons.test.ts -v`
Expected: FAIL — `expected null to be 'true'`, no `activity-move`, `sortActivityViews` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/components/activity-bar.ts`:

1. Add pure helper after the `ActivityView` interface (line 11):

```ts
/** Order extension views by a saved id list. Unknown saved ids are dropped; views missing from the list append at the end in registry order. Non-array input returns views unchanged. */
export function sortActivityViews<T extends { id: string }>(views: T[], order: unknown): T[] {
  if (!Array.isArray(order)) return views.slice();
  const rank = new Map((order as unknown[]).filter((id): id is string => typeof id === 'string').map((id, i) => [id, i]));
  return views.slice().sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}
```

Note: `Array.prototype.sort` is stable in modern JS, so appended views keep registry order.

2. Add `state` to the decorators import (line 2): `import { customElement, property, state } from 'lit/decorators.js';`

3. Add state fields after `activeView` (line 86):

```ts
  @state()
  private _dragFrom: string | null = null;

  @state()
  private _dropKey: string | null = null;
```

4. Add styles after `.activity-icon` block (line 69):

```css
    button.drop-before {
      box-shadow: inset 0 2px 0 var(--accent);
    }

    button.drop-after {
      box-shadow: inset 0 -2px 0 var(--accent);
    }
```

5. Add handlers after `_selectView` (line 96):

```ts
  private _onDragStart(e: DragEvent, viewId: string) {
    this._dragFrom = viewId;
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', viewId);
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  private _onDragOver(e: DragEvent, viewId: string) {
    e.preventDefault();
    if (!this._dragFrom || this._dragFrom === viewId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    this._dropKey = `${after ? 'after' : 'before'}:${viewId}`;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  private _onDragLeave(e: DragEvent) {
    const to = (e as DragEvent & { relatedTarget?: Node | null }).relatedTarget;
    if (to && (e.currentTarget as HTMLElement).contains(to as Node)) return;
    this._dropKey = null;
  }

  private _onDrop(e: DragEvent, viewId: string) {
    e.preventDefault();
    const from = this._dragFrom ?? e.dataTransfer?.getData('text/plain') ?? '';
    this._dragFrom = null;
    this._dropKey = null;
    if (!from || from === viewId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    this.dispatchEvent(new CustomEvent('activity-reorder', { detail: { fromViewId: from, toViewId: viewId, after }, bubbles: true, composed: true }));
  }

  private _onDragEnd() {
    this._dragFrom = null;
    this._dropKey = null;
  }

  private _onButtonKeyDown(e: KeyboardEvent, viewId: string) {
    if (!e.ctrlKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    this.dispatchEvent(new CustomEvent('activity-move', { detail: { viewId, dir: e.key === 'ArrowDown' ? 1 : -1 }, bubbles: true, composed: true }));
  }
```

6. Update the extension button in `render()` (lines 100-110) — add `draggable`, indicator classes, and handlers. The Settings button (lines 114-124) is untouched:

```ts
      <button
        class="${this.activeView === view.id ? 'active' : ''} ${this._dropKey === `before:${view.id}` ? 'drop-before' : ''} ${this._dropKey === `after:${view.id}` ? 'drop-after' : ''}"
        title="${view.name}"
        aria-label="${view.name}"
        data-view-id="${view.id}"
        draggable="true"
        style="${this.activeView === view.id ? `background: rgba(255, 255, 255, 0.35);${view.color ? ` --active-indicator: ${mixWithWhite(view.color, 0.35)};` : ''}` : ''}"
        @click="${(e: MouseEvent) => { if (e.isTrusted) this._selectView(view.id); }}"
        @keydown="${(e: KeyboardEvent) => this._onButtonKeyDown(e, view.id)}"
        @dragstart="${(e: DragEvent) => this._onDragStart(e, view.id)}"
        @dragover="${(e: DragEvent) => this._onDragOver(e, view.id)}"
        @dragleave="${(e: DragEvent) => this._onDragLeave(e)}"
        @drop="${(e: DragEvent) => this._onDrop(e, view.id)}"
        @dragend="${() => this._onDragEnd()}"
      >${view.iconUrl
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/renderer/activity-bar-icons.test.ts -v`
Expected: PASS (5/5 — 2 existing + 3 new).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS with no output.

---

### Task 2: index.ts sort-on-load + persist

**Files:**
- Modify: `src/renderer/index.ts:163-184` (`loadExtensionContributions`), top-level listener wiring
- Test: covered by Task 1 helper tests + manual gate (index.ts glue is untested, as today)

**Interfaces:**
- Consumes: `sortActivityViews` + `activity-reorder` / `activity-move` events (Task 1), `financeShell.settings` KV.
- Produces: ordered `activityBar.views`, persisted `core.activityBar.order: string[]`.

- [ ] **Step 1: Implement sort + listeners**

In `src/renderer/index.ts`:

1. Extend the type import (line 12): `import type { ActivityView } from './components/activity-bar';` → `import { sortActivityViews, type ActivityView } from './components/activity-bar';`

2. In `loadExtensionContributions()`, replace the `activityBar.views = await Promise.all(...)` assignment (lines 168-183) so the built array is sorted by the saved order:

```ts
    if (activityBar) {
      const built = await Promise.all(contributions.views.map(async (v) => {
        viewToExtension.set(v.view.id, v.extensionId);
        let setting: unknown;
        try {
          setting = await window.financeShell?.settings?.get?.(`${v.extensionId}.themeColor`);
        } catch {
          setting = undefined;
        }
        const color = resolveThemeColor({
          setting,
          manifest: contributions.themeColors?.[v.extensionId] ?? undefined,
          report: (message, value) => rendererLogger.warn(`${message}:`, value as string),
        });
        const iconUrl = extensionIconUrl(v.extensionId, v.view.icon);
        return { id: v.view.id, name: v.view.name, icon: v.view.icon, iconUrl, color };
      }));
      let savedOrder: unknown;
      try {
        savedOrder = await window.financeShell?.settings?.get?.('core.activityBar.order');
      } catch {
        savedOrder = undefined;
      }
      activityBar.views = sortActivityViews(built, savedOrder);
    }
```

3. Add one-time listeners + reorder helpers after `loadExtensionContributions` (before the `window.addEventListener('click', ...)` block, line 207). Guard with a flag since loads re-run:

```ts
let activityReorderWired = false;

function currentActivityIds(): string[] {
  return (activityBar?.views ?? []).map((v) => v.id);
}

async function persistActivityOrder(): Promise<void> {
  try {
    await window.financeShell?.settings?.set?.('core.activityBar.order', currentActivityIds());
  } catch (err) {
    rendererLogger.warn('Failed to persist activity bar order:', err as string);
  }
}

function reorderActivityViews(fromId: string, toId: string, after: boolean): void {
  if (!activityBar || fromId === toId) return;
  const views = activityBar.views.slice();
  const from = views.findIndex((v) => v.id === fromId);
  const to = views.findIndex((v) => v.id === toId);
  if (from === -1 || to === -1) return;
  const [moved] = views.splice(from, 1);
  const target = views.findIndex((v) => v.id === toId);
  views.splice(after ? target + 1 : target, 0, moved);
  activityBar.views = views;
  void persistActivityOrder();
}

function moveActivityView(viewId: string, dir: -1 | 1): void {
  if (!activityBar) return;
  const views = activityBar.views.slice();
  const i = views.findIndex((v) => v.id === viewId);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= views.length) return;
  [views[i], views[j]] = [views[j], views[i]];
  activityBar.views = views;
  void persistActivityOrder();
}

function wireActivityReorder(): void {
  if (activityReorderWired || !activityBar) return;
  activityReorderWired = true;
  activityBar.addEventListener('activity-reorder', (e: Event) => {
    const d = (e as CustomEvent).detail as { fromViewId: string; toViewId: string; after: boolean };
    reorderActivityViews(d.fromViewId, d.toViewId, d.after);
  });
  activityBar.addEventListener('activity-move', (e: Event) => {
    const d = (e as CustomEvent).detail as { viewId: string; dir: -1 | 1 };
    moveActivityView(d.viewId, d.dir);
  });
}
```

4. Call `wireActivityReorder()` at the end of `loadExtensionContributions()` (after the navigationPanel block, before the catch close).

- [ ] **Step 2: Run full renderer suite + typecheck**

Run: `npx vitest run tests/unit/renderer/ -v`
Expected: PASS, no regressions.

Run: `npm run typecheck`
Expected: PASS with no output.

- [ ] **Step 3: Manual verification in the app**

1. `npm run dev` → drag an Activity Bar icon above/below another → order changes, active highlight intact, no console errors.
2. Reload → order persists.
3. Focus an icon button, `Ctrl+Up/Down` → icon moves, persists after reload.
4. Disable an extension → its icon disappears; re-enable → icon appends at end.

---

## Self-Review

- **Spec coverage:** Goal + Decisions 1–4 → Tasks 1–2; §2 components → Task 1 (activity-bar) + Task 2 (index glue); §3 data flow → drag/keyboard handlers + sort-on-load; §4 errors → self/unknown no-ops, corrupt-setting fallback, uninstall filter; §5 testing → Task 1 unit + Task 2 manual.
- **Placeholder scan:** no TBD/TODO; every step has exact paths, code, commands, expected output. Prior-failure traps addressed (no stale not-draggable test exists here; `dragover` `preventDefault` included; `currentTarget`-based rect).
- **Type consistency:** `activity-reorder { fromViewId, toViewId, after }` and `activity-move { viewId, dir }` identical in emitter (Task 1), listener wiring, and handler signatures (Task 2); `sortActivityViews<T extends { id: string }>` matches `ActivityView`.
