# Overlay Coordinator Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the main renderer's DOM overlays (`#command-palette`) appear above the native `WebContentsView` panels that currently cover them, by hiding all panels while an overlay is open and restoring the previously-active panel when it closes.

**Architecture:** Native `WebContentsView` panels (Dashboard, Salary History) render above the main renderer's DOM regardless of CSS `z-index`, so the palette (z-index 1000) is unreachable while a panel is visible. We add an overlay lifecycle to `WebviewPanelManager`: `hidePanelsForOverlay()` (set every panel view `setVisible(false)`, preserving webContents state — no reload, no data loss) and `restorePanels()` (re-`showPanel()` the active panel). An `overlayActive` flag suppresses the manager's two other visibility paths (`resize()` and the mount fallback timer) so panels cannot re-show themselves under an open overlay. Main exposes `panel:hide-overlay` / `panel:restore-overlay` IPC; preload + types expose `panel.hideForOverlay()` / `panel.restoreAfterOverlay()`; the renderer's `overlayCoordinator` (a ref-counted guard) wires these into `setCommandPaletteVisible()`.

**Tech Stack:** Electron (BrowserWindow + WebContentsView), TypeScript, Vitest, Vite. Main process services are unit-tested with `vitest` (`WebviewPanelManager` mock lives in `tests/unit/main/services/webview-panel-manager.test.ts`); `main.ts` / `preload.ts` / `renderer/index.ts` are app-glue verified by `tsc --noEmit`, `eslint`, and the manual GUI walk-through (per this repo's TU conventions).

---

## Design decisions (from the 2026-07-31 review of the draft plan)

1. **Hide, don't destroy.** `view.setVisible(false)` preserves the panel's webContents, its mounted Lit UI, and its `mountData` — destroying and re-mounting would flash the panel and lose state. `showPanel()` already re-adds the view to `contentView` (z-front) and sets it visible, so `restorePanels()` delegates to it.
2. **`overlayActive` guard is mandatory.** `resize()` (webview-panel-manager.ts:310) calls `view.setVisible(true)` unconditionally, and `workspace.ts:313–318` fires `panel.resize` on every workspace `.content` resize (window resize, tab strip changes). Without the guard, a window resize while the palette is open would re-show the panel over it. The mount dedup path (line 100) and the 200 ms fallback timer (line 178) are guarded for the same reason.
3. **Ref-counted `overlayCoordinator`.** A plain boolean would break with two overlapping overlays (palette + a future modal). The coordinator only calls `hideForOverlay` on the 0→1 transition and `restoreAfterOverlay` on the 1→0 transition.
4. **`setCommandPaletteVisible` is transition-based.** The Ctrl+Shift+P toggle can re-enter the "visible" state without a hide in between; `show()`/`hide()` are only called on actual hidden↔visible transitions to avoid ref-count drift.
5. **First-run seed modal is OUT OF SCOPE.** The draft plan's Layer 4 proposed a core DOM seed modal gated on `accounts.count()` in `DOMContentLoaded`. Review found no seed modal in the main DOM (`index.html` has only `#app` + `#command-palette`); the real one is the extension-owned Lit element `accounts-seed-modal` rendered inside the salary-history panel (CHANGELOG Task 17(b)). The draft's premise came from a stale comment at `src/main/main.ts:505-510`. Adding a duplicate core modal would be scope creep — drop it.
6. **`hideForOverlay` takes no arguments.** It hides *all* panels (the overlay covers the whole window); the draft's `(panelId: string)` signature was a dead parameter.
7. **Known pre-existing limitation (not fixed here).** Keyboard input routes to the focused webContents. If a panel has keyboard focus, Ctrl+Shift+P does not reach the main renderer. Out of scope — orthogonal to this fix, which is about *visibility* of DOM overlays.
8. **Dead pattern not to copy.** `renderer/index.ts:83-86` calls `window.financeShell?.extensions?.panel?.resize` but preload exposes `panel` only at the top level — that listener is a runtime no-op. Our coordinator uses the top-level `window.financeShell?.panel?.hideForOverlay?.()`.

## File structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/main/services/webview-panel-manager.ts` | Owns panel lifecycle (mount/unmount/show/hide) | Add `overlayActive` flag, `hidePanelsForOverlay()`, `restorePanels()`; guard `resize()`/mount/fallback-timer visibility |
| `src/main/main.ts` | Electron app wiring, IPC handlers | Add `panel:hide-overlay` / `panel:restore-overlay` handlers beside `panel:show` |
| `src/preload/preload.ts` | `window.financeShell` bridge | Add `panel.hideForOverlay()` / `panel.restoreAfterOverlay()` |
| `src/types/finance-shell.d.ts` | Renderer-facing types | Add the two methods to both `ExtensionsApi.panel` and `FinanceShellApi.panel` |
| `src/renderer/index.ts` | Main renderer entry | Add `overlayCoordinator`; wire `setCommandPaletteVisible` transitions |
| `tests/unit/main/services/webview-panel-manager.test.ts` | Unit tests for the manager | Add "overlay coordination" describe block |
| `CHANGELOG.md` | Release history | Add `### Fixed` bullet (no version bump — requires explicit permission) |

---

## Task 1: `WebviewPanelManager` overlay coordination (TDD)

**Files:**

- Modify: `src/main/services/webview-panel-manager.ts`
- Test: `tests/unit/main/services/webview-panel-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

Append a new describe block to the end of `tests/unit/main/services/webview-panel-manager.test.ts` (after the `'WebviewPanelManager lifecycle (Phase 5 additional tests)'` describe, line 201):

```ts
describe('WebviewPanelManager overlay coordination', () => {
  function makeManager() {
    const manager = new WebviewPanelManager();
    manager.setUIHandler(noopUIHandler);
    manager.setMainWindow({
      contentView: {
        addChildView: () => {},
        removeChildView: () => {},
        getBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
        setVisible: () => {}
      },
      getContentBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
      webContents: { send: vi.fn() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return manager;
  }

  it('hidePanelsForOverlay() hides every panel; restorePanels() re-shows the active panel', () => {
    const manager = makeManager();
    const setVisibleSpy = vi.fn();
    manager.mount('dashboard', 'dashboard-view');
    manager.mount('salary-history', 'pay-history');
    const handle = manager.findByPanelId('panel-dashboard-dashboard-view')!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handle.view as any).setVisible = setVisibleSpy;

    manager.showPanel('panel-dashboard-dashboard-view');
    setVisibleSpy.mockClear();

    manager.hidePanelsForOverlay();
    expect(setVisibleSpy).toHaveBeenCalledWith(false);

    manager.restorePanels();
    expect(setVisibleSpy).toHaveBeenCalledWith(true);
    expect(manager.getActivePanelId()).toBe('panel-dashboard-dashboard-view');
  });

  it('resize() does not re-show a panel while the overlay is active', () => {
    const manager = makeManager();
    const setVisibleSpy = vi.fn();
    manager.mount('dashboard', 'dashboard-view');
    const handle = manager.findByPanelId('panel-dashboard-dashboard-view')!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handle.view as any).setVisible = setVisibleSpy;

    manager.showPanel('panel-dashboard-dashboard-view');
    manager.hidePanelsForOverlay();
    setVisibleSpy.mockClear();

    manager.resize('panel-dashboard-dashboard-view', { x: 0, y: 0, width: 800, height: 600 });

    expect(setVisibleSpy).not.toHaveBeenCalledWith(true);

    manager.restorePanels();
    expect(setVisibleSpy).toHaveBeenCalledWith(true);
  });

  it('hidePanelsForOverlay() / restorePanels() are no-ops with no panels', () => {
    const manager = makeManager();
    expect(() => manager.hidePanelsForOverlay()).not.toThrow();
    expect(() => manager.restorePanels()).not.toThrow();
    expect(manager.getActivePanelId()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/main/services/webview-panel-manager.test.ts`
Expected: FAIL — `TypeError: manager.hidePanelsForOverlay is not a function` (method does not exist yet).

- [ ] **Step 3: Add the `overlayActive` flag**

In `src/main/services/webview-panel-manager.ts`, add the field directly after line 60 (`private activePanelId: string | null = null;`):

```ts
  private overlayActive = false;
```

- [ ] **Step 4: Add `hidePanelsForOverlay()` and `restorePanels()`**

Insert these two methods directly after the closing brace of `showPanel()` (line 353), before `findByPanelId()`:

```ts
  hidePanelsForOverlay(): void {
    this.overlayActive = true;
    for (const [, h] of this.panels) {
      if (!h.view.webContents.isDestroyed()) {
        h.view.setVisible(false);
      }
    }
  }

  restorePanels(): void {
    this.overlayActive = false;
    if (this.activePanelId) {
      this.showPanel(this.activePanelId);
    }
  }
```

- [ ] **Step 5: Guard the visibility paths in `resize()`**

In `resize()`:

Replace the fallback-timer-cancel block (currently lines 297-304):

```ts
    const timer = this.mountShowTimers.get(panelId);
    if (timer) {
      clearTimeout(timer);
      this.mountShowTimers.delete(panelId);
      console.log('[webview-panel] cancelled fallback timer for', panelId);
      // First resize for a newly mounted panel — show it and hide others
      this.showPanel(panelId);
    }
```

with:

```ts
    const timer = this.mountShowTimers.get(panelId);
    if (timer) {
      clearTimeout(timer);
      this.mountShowTimers.delete(panelId);
      console.log('[webview-panel] cancelled fallback timer for', panelId);
      // First resize for a newly mounted panel — show it and hide others,
      // unless a DOM overlay is active (see hidePanelsForOverlay()).
      if (!this.overlayActive) {
        this.showPanel(panelId);
      }
    }
```

Replace the unconditional `setVisible(true)` (currently lines 306-316):

```ts
    const view = handle.view;
    try {

      if (!view.webContents.isDestroyed()) {
        view.setVisible(true);
        view.setBounds(bounds);
```

with:

```ts
    const view = handle.view;
    try {

      if (!view.webContents.isDestroyed()) {
        // Do not re-show panels while a DOM overlay is open; bounds still
        // apply so the panel is correctly positioned when restored.
        if (!this.overlayActive) {
          view.setVisible(true);
        }
        view.setBounds(bounds);
```

- [ ] **Step 6: Guard the mount dedup and fallback-timer `showPanel` calls**

In `mount()`, the dedup path (currently line 100):

```ts
      this.showPanel(panelId);
```

becomes:

```ts
      if (!this.overlayActive) {
        this.showPanel(panelId);
      }
```

In the mount fallback timer (currently line 178):

```ts
          this.showPanel(panelId);
          view.setBounds(fallbackBounds);
```

becomes:

```ts
          if (!this.overlayActive) {
            this.showPanel(panelId);
          }
          view.setBounds(fallbackBounds);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/main/services/webview-panel-manager.test.ts`
Expected: PASS — 8 tests (5 existing + 3 new), 0 failures.

- [ ] **Step 8: Typecheck + lint**

Run: `npm run typecheck`
Expected: PASS — `tsc --noEmit` reports no errors.

Run: `npm run lint`
Expected: PASS — no new errors.

---

## Task 2: IPC bridge (Main handlers + preload + types)

**Files:**

- Modify: `src/main/main.ts` (insert after line 473, the `});` closing `panel:show`)
- Modify: `src/preload/preload.ts` (inside the `panel` object, after the `show` method, line 97)
- Modify: `src/types/finance-shell.d.ts` (both `panel` interface sites)

- [ ] **Step 1: Add the Main-side IPC handlers**

In `src/main/main.ts`, insert directly after the `panel:show` handler (line 471-473):

```ts
  ipcMain.on("panel:hide-overlay", () => {
    webviewPanelManager?.hidePanelsForOverlay();
  });

  ipcMain.on("panel:restore-overlay", () => {
    webviewPanelManager?.restorePanels();
  });
```

- [ ] **Step 2: Add the preload bridge methods**

In `src/preload/preload.ts`, inside the `panel` object (line 95-130), add these two methods directly after the `show` method (line 97):

```ts
    hideForOverlay: (): void => { console.log('[preload] panel.hideForOverlay'); ipcRenderer.send('panel:hide-overlay'); },
    restoreAfterOverlay: (): void => { console.log('[preload] panel.restoreAfterOverlay'); ipcRenderer.send('panel:restore-overlay'); },
```

- [ ] **Step 3: Add the type declarations (both interfaces)**

In `src/types/finance-shell.d.ts`:

In `ExtensionsApi.panel` (lines 61-69), add after the `show` member (line 63):

```ts
    show: (panelId: string) => void;
    hideForOverlay: () => void;
    restoreAfterOverlay: () => void;
```

In `FinanceShellApi.panel` (lines 105-115), add after the `show` member (line 107):

```ts
    show: (panelId: string) => void;
    hideForOverlay: () => void;
    restoreAfterOverlay: () => void;
```

> Note: the two `panel` interfaces have already drifted — `onMounted`/`onRequestBounds` exist only in `FinanceShellApi.panel`. Adding both methods to both sites keeps the call sites that use each shape compiling. Do not "fix" the drift here.

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck`
Expected: PASS — no errors.

Run: `npm run lint`
Expected: PASS — no new errors.

> Verification note: `main.ts` and `preload.ts` are app-glue without unit-test infra in this repo (services are tested; the IPC channel strings are covered by the manager tests in Task 1 + the manual walk-through in Task 3). No new test file is required.

---

## Task 3: Renderer `overlayCoordinator` + palette wiring

**Files:**

- Modify: `src/renderer/index.ts` (lines 70-73, `setCommandPaletteVisible`)

- [ ] **Step 1: Add the coordinator and transition-based visibility**

Replace `setCommandPaletteVisible` (lines 70-73):

```ts
function setCommandPaletteVisible(visible: boolean): void {
  commandPalette?.classList.toggle('hidden', !visible);
  if (visible) commandPalette?.focusInput();
}
```

with:

```ts
const overlayCoordinator = {
  _refCount: 0,
  show(): void {
    this._refCount += 1;
    if (this._refCount === 1) {
      window.financeShell?.panel?.hideForOverlay?.();
    }
  },
  hide(): void {
    if (this._refCount > 0) this._refCount -= 1;
    if (this._refCount === 0) {
      window.financeShell?.panel?.restoreAfterOverlay?.();
    }
  },
};

function setCommandPaletteVisible(visible: boolean): void {
  const currentlyVisible = !(commandPalette?.classList.contains('hidden') ?? true);
  commandPalette?.classList.toggle('hidden', !visible);
  if (visible && !currentlyVisible) overlayCoordinator.show();
  else if (!visible && currentlyVisible) overlayCoordinator.hide();
  if (visible) commandPalette?.focusInput();
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck`
Expected: PASS — no errors.

Run: `npm run lint`
Expected: PASS — no new errors.

- [ ] **Step 3: Manual GUI walk-through** (this repo uses manual TU verification for renderer behavior)

Run: `npm run dev`

1. Startup → Dashboard panel visible and interactive.
2. Press Ctrl+Shift+P → command palette opens *above* the panel (panel hidden); type to filter, mouse-click a command works.
3. While the palette is open, resize the window → palette stays on top, panel does not reappear (guard from Task 1, Step 5).
4. Press Esc → palette closes, Dashboard panel returns, still fully interactive (data intact — no reload flash).
5. Open palette again, click a palette command (e.g. `view-dashboard`) → palette closes, the command's panel shows.
6. Open palette, click outside it → closes, panel returns.
7. Close the active panel tab → panel unmounts, palette still opens/closes normally (restore is a no-op-safe when no panel is active).

Expected: no step shows a panel covering the palette.

---

## Task 4: CHANGELOG

**Files:**

- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the entry**

In `CHANGELOG.md`, add a bullet under `### Fixed` in the current `## [0.7.3] - 2026-07-30` section (after line 30, the last existing bullet), and update the frontmatter `last_updated` to the current ISO timestamp with timezone:

```markdown
- **`#command-palette` and other DOM overlays covered by native panels** (`src/main/services/webview-panel-manager.ts`, `src/main/main.ts`, `src/preload/preload.ts`, `src/types/finance-shell.d.ts`, `src/renderer/index.ts`, tests in `tests/unit/main/services/webview-panel-manager.test.ts`). `WebContentsView` panels render above the main renderer's DOM regardless of CSS z-index, so the palette's z-index 1000 was unreachable while a panel was visible. `WebviewPanelManager` now has an overlay lifecycle: `hidePanelsForOverlay()` hides all panel views (`setVisible(false)` preserves webContents state — no reload, no data loss) and `restorePanels()` re-shows the previously-active panel; an `overlayActive` flag also suppresses `resize()` and mount-fallback-timer visibility changes so a window resize cannot re-show a hidden panel under an open overlay. New IPC (`panel:hide-overlay` / `panel:restore-overlay`) wired through `preload.panel.hideForOverlay` / `restoreAfterOverlay` (both `ExtensionsApi.panel` and `FinanceShellApi.panel`). The renderer's ref-counted `overlayCoordinator` calls these on hidden↔visible transitions in `setCommandPaletteVisible`, so stacked overlays (palette + future modals) each hide/restore once. Note: the first-run accounts-seed modal was explicitly left in the salary-history panel (it is not a main-DOM element — see CHANGELOG Task 17(b)); the plan's draft Layer 4 was dropped as based on a stale comment at `src/main/main.ts:505-510`.
```

- [ ] **Step 2: Do NOT bump version / commit**

Per AGENTS.md rule 6: no new version header, no `package.json#version` sync, no `git commit` — wait for explicit user approval.

---

## Self-review

**1. Spec coverage** — The reported bug (palette covered by panels) is fully addressed by Task 1+2+3. Review findings addressed: `overlayActive` guard for `resize()` (Task 1 Step 5), mount dedup + fallback timer guards (Task 1 Step 6), no-arg `hideForOverlay` (Task 2), correct d.ts sites (Task 2 Step 3), transition-based coordinator to prevent ref-count drift (Task 3), seed-modal dropped (Design decision 5), CHANGELOG entry (Task 4). The draft's Layer 4 (first-run modal) is deliberately out of scope and documented as such.

**2. Placeholder scan** — Every step has concrete code or an exact command with expected output; no TBD/TODO/“similar to Task N” anywhere.

**3. Type consistency** — Method names are identical across all five files: `hidePanelsForOverlay()`/`restorePanels()` (manager + main.ts), `hideForOverlay()`/`restoreAfterOverlay()` (preload + both d.ts sites), `overlayCoordinator.show()`/`.hide()` (renderer). IPC channel strings `panel:hide-overlay`/`panel:restore-overlay` match between main.ts and preload.ts. Test names reference only methods added in Task 1. The `overlayActive` flag name is used consistently in all four guard sites.

**4. Risks / known limits** — (a) Pre-existing: Ctrl+Shift+P does not reach the main renderer while a panel has keyboard focus (input routing follows webContents focus); not fixed here. (b) `restorePanels()` with a stale `activePanelId` (panel unmounted while overlay open) is safe — `showPanel()` warns and returns. (c) Pending 200 ms mount-fallback timers persist across unit tests in this suite already (existing pattern); the resize test clears its own timer.
