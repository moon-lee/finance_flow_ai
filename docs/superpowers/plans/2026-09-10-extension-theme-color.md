# Per-Extension Theme Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement extension-level `themeColor` (hex `#RRGGBB`, author default + `<id>.themeColor` user override) across Activity Bar icons, tab icons, panel topbar/in-view accents, Settings picker, and SDK templates.

**Architecture:** Single shared helper (`src/shared/theme-color.ts`) owns validation/resolution/darkening. Manifest type + Zod schema accept optional `themeColor`. Main ships the color inside existing `extensions:list` (`themeColors` map) and `panel:init` payloads — no new IPC channels. Renderer resolves setting → manifest → accent fallback. Panel bootstrap applies `--ff-accent` override before bundle import.

**Tech Stack:** TypeScript strict, Zod, Lit, Electron (Main/preload/panel), Vitest + happy-dom, Vite, SDK CLI (`scripts/sdk/cli.mjs`).

## Global Constraints

- TypeScript strict mode (`strict: true`); no implicit `any`.
- Never `git commit`, `git push`, `git tag`, or sync `package.json#version` without explicit user permission (AGENTS.md rule 6 — plan steps do NOT include commits).
- `CHANGELOG.md` must be updated for this work (AGENTS.md rule 5); `CHANGELOG.md` is version authority.
- Settings keys stay namespaced (`<extensionId>.themeColor`); no Core-owned per-extension storage.
- Hex format is exactly `^#[0-9A-Fa-f]{6}$`; invalid values never throw — fall through with `console.warn`.
- Missing color falls back to global accent; disabled extensions excluded via existing filters.
- `docs/extension-api.md` documents the new manifest field + override.

---

### Task 1: Shared theme-color helper + unit tests

**Files:**
- Create: `src/shared/theme-color.ts`
- Create: `tests/unit/shared/theme-color.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, no imports).
- Produces: `THEME_COLOR_RE: RegExp`, `isThemeColor(v: unknown) => v is string`, `resolveThemeColor(opts: { setting?: unknown; manifest?: unknown }) => string | undefined`, `darkenHex(hex: string, amount?: number) => string` — imported by Task 3 (Main), Task 4 (renderer), Task 5 (panel bootstrap).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/shared/theme-color.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isThemeColor, resolveThemeColor, darkenHex } from '../../../src/shared/theme-color';

describe('theme-color helper', () => {
  it('accepts valid hex', () => {
    expect(isThemeColor('#4EC9B0')).toBe(true);
    expect(isThemeColor('#6366f1')).toBe(true);
  });
  it('rejects malformed values', () => {
    expect(isThemeColor('red')).toBe(false);
    expect(isThemeColor('#FFF')).toBe(false);
    expect(isThemeColor('#GGGGGG')).toBe(false);
    expect(isThemeColor('123456')).toBe(false);
    expect(isThemeColor(null)).toBe(false);
    expect(isThemeColor(undefined)).toBe(false);
  });
  it('resolves setting over manifest', () => {
    expect(resolveThemeColor({ setting: '#FF0000', manifest: '#00FF00' })).toBe('#FF0000');
  });
  it('falls back to manifest when setting invalid', () => {
    expect(resolveThemeColor({ setting: 'red', manifest: '#00FF00' })).toBe('#00FF00');
  });
  it('returns undefined when neither valid', () => {
    expect(resolveThemeColor({})).toBeUndefined();
    expect(resolveThemeColor({ setting: 'nope', manifest: 'nope' })).toBeUndefined();
  });
  it('darkens hex for hover', () => {
    expect(darkenHex('#FFFFFF', 0.2)).toBe('#cccccc');
    expect(darkenHex('#007ACC', 0.2)).toBe('#0061a3');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/shared/theme-color.test.ts`
Expected: FAIL with "Failed to resolve import ... src/shared/theme-color.ts" (file does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/theme-color.ts`:

```ts
/** Canonical hex form for per-extension theme colors. */
export const THEME_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function isThemeColor(v: unknown): v is string {
  return typeof v === 'string' && THEME_COLOR_RE.test(v);
}

/**
 * Effective color precedence: user setting wins over manifest default.
 * Invalid values are ignored (fall through); never throws.
 */
export function resolveThemeColor(opts: { setting?: unknown; manifest?: unknown }): string | undefined {
  if (isThemeColor(opts.setting)) return opts.setting;
  if (isThemeColor(opts.manifest)) return opts.manifest;
  return undefined;
}

/** Darken a `#RRGGBB` hex by `amount` (0–1). Used for `--ff-accent-hover`. */
export function darkenHex(hex: string, amount = 0.2): string {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = Math.min(Math.max(1 - amount, 0), 1);
  const r = Math.round(((n >> 16) & 0xff) * f);
  const g = Math.round(((n >> 8) & 0xff) * f);
  const b = Math.round((n & 0xff) * f);
  const to = (c: number): string => c.toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/shared/theme-color.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck the new module**

Run: `npm run typecheck`
Expected: PASS (no new errors).

---

### Task 2: Manifest type + Zod schema + schema tests

**Files:**
- Modify: `src/types/finance.d.ts` (add `themeColor?: string` to `FinanceExtensionManifest`)
- Modify: `src/extension-host/manifest-schema.ts` (add `themeColor` to `financeExtensionManifestSchema`)
- Modify: `tests/unit/extension-host/manifest-schema.test.ts` (append themeColor cases)

**Interfaces:**
- Consumes: nothing new (Task 1 helper not needed here; Zod regex is inline).
- Produces: `FinanceExtensionManifest.themeColor?: string` type + validated schema — consumed by Task 3 (registry passthrough, no registry change needed) and Task 7 (SDK type copy).

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/extension-host/manifest-schema.test.ts` (after the semver test, inside the top-level `describe`):

```ts
it('accepts valid themeColor', () => {
  const result = validateManifest({ ...validManifest, themeColor: '#4EC9B0' });
  expect(result.ok).toBe(true);
});
it('accepts missing themeColor', () => {
  const result = validateManifest({ ...validManifest });
  expect(result.ok).toBe(true);
});
it('rejects non-hex themeColor', () => {
  for (const bad of ['red', '#FFF', '#GGGGGG', '123456', '#12345']) {
    const result = validateManifest({ ...validManifest, themeColor: bad });
    expect(result.ok).toBe(false);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/extension-host/manifest-schema.test.ts`
Expected: FAIL on `accepts valid themeColor` with `themeColor: Unrecognized key(s) in object` (strict mode rejects the unknown key).

- [ ] **Step 3: Add the type field**

In `src/types/finance.d.ts`, inside `FinanceExtensionManifest` after `description?: string;`, insert:

```ts
  /**
   * Optional shared icon/accent color for all views of this extension.
   * Hex form `#RRGGBB` (e.g. `#4EC9B0`). Applied to the Activity Bar icon,
   * tab icon, panel topbar affordances, and in-view accents (panel
   * `--ff-accent` override). The `<extensionId>.themeColor` settings
   * override wins over this author default; missing/invalid falls back to
   * the global accent and never throws.
   */
  themeColor?: string;
```

- [ ] **Step 4: Add the Zod field**

In `src/extension-host/manifest-schema.ts`, inside `financeExtensionManifestSchema` after `description: z.string().optional(),`, insert:

```ts
  themeColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'themeColor must be hex #RRGGBB').optional(),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/extension-host/manifest-schema.test.ts`
Expected: PASS (all existing + 3 new tests).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

---

### Task 3: Main wiring — list payload + panel:init delivery

**Files:**
- Modify: `src/main/main.ts` (extend `extensions:list` handler with `themeColors`; wire manifest provider into panel manager)
- Modify: `src/types/finance-shell.d.ts` (extend `ExtensionsApi.list()` return with `themeColors`)
- Modify: `src/main/services/webview-panel-manager.ts` (resolve effective color, include in `panel:init` + `panel:mount-update` sends)
- Modify: `src/main/resources/panel-bootstrap.ts` — PanelPayload type only (`themeColor?: string`); runtime apply is Task 5
- Test: `tests/unit/main/services/webview-panel-manager.test.ts` (extend) — if the file has constructor/DI seams, add themeColor resolution tests; otherwise add a focused test for the resolver wiring added here

**Interfaces:**
- Consumes: `resolveThemeColor`, `isThemeColor` from Task 1; `ExtensionRegistry.get(id)` (existing, `src/main/services/extension-registry.ts:242`); `getSetting` from `src/main/services/settings-service.ts:45`.
- Produces: `extensions:list` returns `{ views, commands, navigation, configuration, themeColors: Record<string, string | null> }`; `panel:init` payload `{ extensionId, viewId, mountData, themeColor?: string }` — consumed by Task 4 (renderer) and Task 5 (bootstrap).

- [ ] **Step 1: Extend the shell type**

In `src/types/finance-shell.d.ts`, find the `ExtensionsApi.list()` return type (near line 45, `views: Array<{ extensionId: string; view: ManifestViewContribution }>;`) and the surrounding `list()` signature; add after the `configuration` field of that return type:

```ts
themeColors: Record<string, string | null>;
```

If the `list()` return is an inline object literal, the edit is a single added line. Keep the panel-preload type (near line 154) unchanged — panels never call `list()` for colors.

- [ ] **Step 2: Extend the list handler**

In `src/main/main.ts`, replace the `extensions:list` handler (lines 272–281):

```ts
  ipcMain.handle("extensions:list", () => {
    if (!extensionRegistry) return { views: [], commands: [], navigation: [], configuration: [], themeColors: {} };
    return {
      views: extensionRegistry.views(),
      commands: extensionRegistry.commands(),
      navigation: extensionRegistry.navigation(),
      configuration: extensionRegistry.configuration(),
      themeColors: Object.fromEntries(
        extensionRegistry.getAllManifests().map((m) => [m.id, m.themeColor ?? null])
      ),
    };
  });
```

- [ ] **Step 3: Add manifest provider + color resolution to the panel manager**

In `src/main/services/webview-panel-manager.ts`:
1. Add import: `import { resolveThemeColor } from "../../shared/theme-color";` (alongside the existing `getSetting` import).
2. Add field + setter after `setUIHandler`:

```ts
  private getManifest: ((id: string) => { themeColor?: string } | undefined) | null = null;

  setManifestProvider(provider: (id: string) => { themeColor?: string } | undefined): void {
    this.getManifest = provider;
  }

  private resolveThemeColor(extensionId: string): string | undefined {
    let setting: unknown;
    try {
      setting = getSetting<string>(`${extensionId}.themeColor`);
    } catch {
      setting = undefined;
    }
    const manifest = this.getManifest?.(extensionId)?.themeColor;
    return resolveThemeColor({ setting, manifest });
  }
```

3. In `mount()` (`webview-panel-manager.ts:320`), extend the `panel:init` send:

```ts
      view.webContents.send("panel:init", {
        extensionId,
        viewId,
        mountData,
        themeColor: this.resolveThemeColor(extensionId),
      });
```

4. In the existing-panel branch (`mount()` early return) and `pushMountData()` (`webview-panel-manager.ts:515`), extend the `panel:mount-update` sends to include the color:

```ts
existing.view.webContents.send("panel:mount-update", { mountData, themeColor: this.resolveThemeColor(extensionId) });
```

```ts
handle.view.webContents.send('panel:mount-update', { mountData, themeColor: this.resolveThemeColor(extensionId) });
```

- [ ] **Step 4: Wire the provider in main.ts**

Where the panel manager is instantiated (near `new WebviewPanelManager(...)` / `setUIHandler`), add:

```ts
panelManager.setManifestProvider((id) => extensionRegistry?.get(id));
```

Use the exact local variable names for the manager and registry in `main.ts`.

- [ ] **Step 5: Extend the PanelPayload type (no runtime change yet)**

In `src/main/resources/panel-bootstrap.ts`, extend:

```ts
interface PanelPayload {
  extensionId: string;
  viewId: string;
  mountData?: Record<string, unknown>;
  themeColor?: string;
}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run tests/unit/main/services/webview-panel-manager.test.ts`
Expected: PASS (existing tests; update any exact-payload assertions to include `themeColor`).

Run: `npm run typecheck`
Expected: PASS.

---

### Task 4: Renderer icons — Activity Bar + tabs carry the color

**Files:**
- Modify: `src/renderer/components/activity-bar.ts` (`ActivityView` gains `color?: string`; button applies it)
- Modify: `src/renderer/components/types.ts` (`Tab` gains `color?: string`)
- Modify: `src/renderer/components/tab-bar.ts` (`.tab-icon` applies `tab.color`)
- Modify: `src/renderer/index.ts` (`loadExtensionContributions` resolves effective color per extension)
- Modify: `src/renderer/components/workspace.ts` (carry `color` through `_addPanel`, `_onPanelMounted`, restore, `_viewIdToColor` map)
- Test: extend renderer tests (`tests/unit/renderer/workspace.test.ts` and/or new `tests/unit/renderer/theme-color-icons.test.ts`) for icon style + fallback

**Interfaces:**
- Consumes: `resolveThemeColor` (Task 1); `themeColors` from `extensions:list` (Task 3); `window.financeShell.settings.get` (existing bridge).
- Produces: colored `ActivityView[]` + `Tab[]`; no new exports (visual only).

- [ ] **Step 1: Write the failing renderer test**

Create `tests/unit/renderer/theme-color-icons.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveThemeColor } from '../../../src/shared/theme-color';

describe('icon color resolution', () => {
  it('prefers the user setting over the manifest default', () => {
    expect(resolveThemeColor({ setting: '#FF0000', manifest: '#00FF00' })).toBe('#FF0000');
  });
  it('falls back to manifest then undefined (global accent)', () => {
    expect(resolveThemeColor({ setting: undefined, manifest: '#00FF00' })).toBe('#00FF00');
    expect(resolveThemeColor({})).toBeUndefined();
  });
});
```

(This locks the contract Task 4 implements; component DOM assertions below reuse the same precedence.)

- [ ] **Step 2: Run test to verify**

Run: `npx vitest run tests/unit/renderer/theme-color-icons.test.ts`
Expected: PASS immediately (helper exists from Task 1) — the FAIL-then-PASS cycle for DOM wiring is covered in Step 6 against `activity-bar`/`tab-bar` styles.

- [ ] **Step 3: Add `color` to `ActivityView` + `Tab`**

In `src/renderer/components/activity-bar.ts`:

```ts
export interface ActivityView {
  id: string;
  name: string;
  icon: string;
  /** Effective per-extension color (hex) or undefined = global accent. */
  color?: string;
}
```

In `src/renderer/components/types.ts`:

```ts
export interface Tab {
  panelId: string;
  label: string;
  commandId?: string;
  /** Effective per-extension color (hex) or undefined = global accent. */
  color?: string;
}
```

- [ ] **Step 4: Render the color**

In `activity-bar.ts` `render()`, change the button to carry the color as text color (active left marker stays `var(--accent)`):

```ts
      <button
        class="${this.activeView === view.id ? 'active' : ''}"
        title="${view.name}"
        aria-label="${view.name}"
        data-view-id="${view.id}"
        style="${view.color ? `color:${view.color}` : ''}"
        @click="${(e: MouseEvent) => { if (e.isTrusted) this._selectView(view.id); }}"
      >${view.icon}</button>
```

In `tab-bar.ts` `render()`, change the icon chip:

```ts
<span class="tab-icon" style="${tab.color ? `background:${tab.color};color:#ffffff` : ''}">${tab.label.split(' ')[1]?.charAt(0).toUpperCase() ?? tab.label.charAt(0).toUpperCase()}</span>
```

- [ ] **Step 5: Resolve + propagate in `index.ts` and `workspace.ts`**

In `src/renderer/index.ts`, add import `import { resolveThemeColor } from '../shared/theme-color';` and replace the `activityBar.views` mapping inside `loadExtensionContributions()`:

```ts
    if (activityBar) {
      const themeColors = (contributions as { themeColors?: Record<string, string | null> }).themeColors ?? {};
      const views = await Promise.all(contributions.views.map(async (v) => {
        viewToExtension.set(v.view.id, v.extensionId);
        let setting: unknown;
        try {
          setting = await window.financeShell?.settings?.get?.(`${v.extensionId}.themeColor`);
        } catch {
          setting = undefined;
        }
        const color = resolveThemeColor({ setting, manifest: themeColors[v.extensionId] ?? undefined });
        return { id: v.view.id, name: v.view.name, icon: v.view.icon, ...(color ? { color } : {}) };
      }));
      activityBar.views = views;
    }
```

In `src/renderer/components/workspace.ts`:
1. Add `private _viewIdToColor = new Map<string, string>();` beside `_viewIdToLabel`.
2. Populate it wherever `_viewIdToLabel` is populated from contributions (same loop): `const c = (list as { themeColors?: Record<string, string | null> }).themeColors?.[extensionId];` — resolve per view with the same `resolveThemeColor` precedence (settings read via `window.financeShell?.settings?.get`, guarded try/catch).
3. Change `_addPanel(panelId: string, label: string, commandId?: string)` to `_addPanel(panelId: string, label: string, commandId?: string, color?: string)` and store `{ panelId, label, commandId, ...(color ? { color } : {}) }`.
4. In `_onPanelMounted`, pass `this._viewIdToColor.get(live.viewId)` into `_addPanel`.
5. Persisted-layout restore (`version: 1` tabs): old tabs lack `color` — keep as-is (fallback renders).

- [ ] **Step 6: Verify**

Run: `npx vitest run tests/unit/renderer/theme-color-icons.test.ts tests/unit/renderer/workspace.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

---

### Task 5: Panel bootstrap — apply `--ff-accent` override

**Files:**
- Modify: `src/main/resources/panel-bootstrap.ts` (apply `themeColor` before bundle import; re-apply on theme change + mount-update)
- Test: manual (panel bootstrap is Electron-runtime; covered by Task 7 manual TU). Unit-test the hover derivation via Task 1 `darkenHex` (already done).

**Interfaces:**
- Consumes: `PanelPayload.themeColor` (Task 3); `darkenHex`, `isThemeColor` (Task 1).
- Produces: panel `:root` has `--ff-accent`/`--ff-accent-hover` overridden per extension; topbar + in-view accents recolor with zero extension-CSS changes.

- [ ] **Step 1: Apply the override in `mountPanelComponent`**

In `src/main/resources/panel-bootstrap.ts`:
1. Add import: `import { darkenHex, isThemeColor } from '../../shared/theme-color';`
2. Add module state near `unmountCallbacks`: `let currentThemeColor: string | undefined;`
3. After the existing light/dark theme block in `mountPanelComponent()` (after the `if/else` that sets `--ff-accent: #007acc`), insert:

```ts
  currentThemeColor = isThemeColor((payload as PanelPayload).themeColor)
    ? (payload as PanelPayload).themeColor as string
    : undefined;
  if (currentThemeColor) {
    root.style.setProperty('--ff-accent', currentThemeColor);
    root.style.setProperty('--ff-accent-hover', darkenHex(currentThemeColor, 0.2));
  }
```

Placement matters: AFTER the theme defaults, BEFORE `import(bundleUrl)` — first paint uses the override.

4. In the `financeShell.theme.onChange` handler inside `mountPanelComponent`, after the theme block, re-apply:

```ts
    if (currentThemeColor) {
      root.style.setProperty('--ff-accent', currentThemeColor);
      root.style.setProperty('--ff-accent-hover', darkenHex(currentThemeColor, 0.2));
    }
```

5. In the `onMountUpdate` subscriber, apply live refreshes:

```ts
    financeShell.onMountUpdate((payload: unknown) => {
      const { mountData, themeColor } = payload as { mountData?: Record<string, unknown>; themeColor?: string };
      if (isThemeColor(themeColor)) {
        currentThemeColor = themeColor;
        const root = document.documentElement;
        root.style.setProperty('--ff-accent', themeColor);
        root.style.setProperty('--ff-accent-hover', darkenHex(themeColor, 0.2));
      }
      if (!mountData) return;
      const app = document.getElementById('app');
      if (app) {
        app.dispatchEvent(new CustomEvent('mount-update', { detail: mountData }));
      }
    });
```

- [ ] **Step 2: Verify build of panel resources**

Run: `npm run build:resources`
Expected: PASS (`dist/resources/panel-bootstrap.js` regenerated).

Run: `npm run typecheck`
Expected: PASS.

---

### Task 6: Settings screen — native picker + text + reset

**Files:**
- Modify: `src/renderer/components/settings-screen.ts` (color branch in `_renderControl` + `.color-row` styles)
- Modify: `tests/unit/renderer/settings-screen.test.ts` (picker↔text sync, invalid block, reset)

**Interfaces:**
- Consumes: `<id>.themeColor` configuration entries declared by extensions (Task 7 template shows the shape); existing `_commit`, `_validateFormatted`, `_errors` machinery.
- Produces: working color control; Settings writes trigger `settings.changed` → Task 4/5 repaint paths.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/renderer/settings-screen.test.ts`:

```ts
it('renders a native color picker for .themeColor keys', async () => {
  const el = document.createElement('settings-screen') as any;
  document.body.appendChild(el);
  await el.updateComplete;
  el._sections = [{
    extensionId: 'todo-list',
    displayName: 'Todo List',
    items: [{ key: 'todo-list.themeColor', type: 'string', label: 'Accent color', default: '#6366F1', pattern: '^#[0-9A-Fa-f]{6}$', formatHint: '#RRGGBB', placeholder: '#6366F1' }],
  }];
  el._values = new Map([['todo-list.themeColor', '#4EC9B0']]);
  el.requestUpdate();
  await el.updateComplete;
  const picker = el.shadowRoot.querySelector('input[type="color"]') as HTMLInputElement | null;
  expect(picker).not.toBeNull();
  expect(picker!.value).toBe('#4ec9b0');
  el.remove();
});
```

Check the existing test file header for its happy-dom setup/imports and mirror them exactly.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/renderer/settings-screen.test.ts`
Expected: FAIL with `expected null not to be null` (no color branch renders `type="color"` yet).

- [ ] **Step 3: Implement the color branch**

In `settings-screen.ts`:
1. Add styles (inside `static styles`, near `.setting-helper`):

```css
    .color-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .color-row input[type="color"] {
      width: 36px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--input-border);
      border-radius: 3px;
      background: var(--input-bg);
      cursor: pointer;
    }
    .color-row input[type="text"] {
      flex: 1;
    }
```

2. At the top of `_renderControl()`, after the `error`/`fieldId` declarations, insert:

```ts
    const isColorInput = item.key.endsWith('.themeColor') || item.formatHint === '#RRGGBB';
    if (isColorInput) {
      const raw = value !== undefined ? String(value) : String(item.default ?? '#6366F1');
      const valid = /^#[0-9A-Fa-f]{6}$/.test(raw);
      const shown = valid ? raw : String(item.default ?? '#6366F1');
      return html`
        <div class="color-row">
          <input
            type="color"
            .value=${shown}
            aria-label="Pick color for ${item.key}"
            @input=${(e: Event) => {
              const hex = (e.target as HTMLInputElement).value;
              this._clearError(item.key);
              this._commit(item.key, hex.toUpperCase() === hex ? hex : hex);
            }}
          />
          <input
            id="${fieldId}"
            data-testid="${fieldId}"
            type="text"
            .value=${raw}
            placeholder="#RRGGBB"
            aria-invalid=${error !== null ? 'true' : undefined}
            class=${error !== null ? 'invalid' : ''}
            @input=${() => { this._clearError(item.key); }}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              const text = target.value.trim();
              if (!/^#[0-9A-Fa-f]{6}$/.test(text)) {
                this._setError(item.key, 'Value must match format #RRGGBB');
                return;
              }
              this._clearError(item.key);
              this._commit(item.key, text);
            }}
          />
          <button
            class="action-btn"
            title="Reset to manifest default"
            @click=${() => { this._commit(item.key, ''); this._clearError(item.key); }}
          >Reset</button>
        </div>
        ${helperText ? html`<div class="setting-helper" id="${helperId}">${helperText}</div>` : ''}
        ${error ? html`<div class="setting-helper setting-error invalid" role="alert">${error}</div>` : ''}
      `;
    }
```

Reset semantics: committing `''` is an invalid hex, so the Task 1/4 resolvers ignore it and fall back to the manifest default — no new delete-key API needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/renderer/settings-screen.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

---

### Task 7: SDK templates + docs + changelog + manual verification

**Files:**
- Modify: `scripts/sdk/types/finance.d.ts` (copy canonical, keeps parity test green)
- Modify: `scripts/sdk/templates/package.json.template` (ship `themeColor` default + `<id>.themeColor` config)
- Modify: `scripts/sdk/templates/src/ui/sample-view.ts.template` (document the `var(--ff-accent)` contract)
- Modify: `docs/extension-api.md` (document `themeColor` + override + panel behavior)
- Modify: `docs/file-reference.md` (add new/changed rows)
- Modify: `CHANGELOG.md` (Unreleased → Added entry + `last_updated`)
- Test: `tests/unit/sdk/sdk-type-parity.test.ts` (must stay green)

**Interfaces:**
- Consumes: all prior tasks.
- Produces: shippable feature; scaffolded extensions get color by default; existing extensions have a documented opt-in path.

- [ ] **Step 1: Sync the vendored SDK types**

Run: `cp src/types/finance.d.ts scripts/sdk/types/finance.d.ts` (PowerShell: `Copy-Item src/types/finance.d.ts scripts/sdk/types/finance.d.ts -Force`)

Verify: `npx vitest run tests/unit/sdk/sdk-type-parity.test.ts`
Expected: PASS.

- [ ] **Step 2: Update `package.json.template`**

Replace the `views` line and add the top-level field + configuration entry:

```json
    "contributions": {
      "views": [{ "id": "{{ID}}", "name": "{{DISPLAY_NAME}}", "icon": "{{ICON}}" }],
      "commands": [{ "id": "{{ID}}.hello", "title": "{{DISPLAY_NAME}}: Hello" }],
      "configuration": [
        { "key": "{{ID}}.themeColor", "type": "string", "label": "Accent color for icons, topbar actions, and in-view highlights (hex).", "default": "#6366F1", "pattern": "^#[0-9A-Fa-f]{6}$", "formatHint": "#RRGGBB", "placeholder": "#6366F1" }
      ],
```

And after `"description": "{{DESCRIPTION}}",` add:

```json
    "themeColor": "#6366F1",
```

- [ ] **Step 3: Update `sample-view.ts.template`**

After the `<h1>{{DISPLAY_NAME}}</h1>` line, replace the readiness paragraph with:

```html
          <p>Your extension screen is ready — uses <code>ext-tokens.css</code> + <code>ext-layout.css</code> (<code>.topbar</code> / <code>.view-scroll</code> / <code>.view-container</code>).</p>
          <p>Accents (<code>.btn-primary</code>, <code>.crumb-link</code>, focus rings) follow <code>var(--ff-accent)</code> — Core sets it from your manifest <code>themeColor</code> (overridable via <code>{{ID}}.themeColor</code>). Do not hardcode accent hex values.</p>
```

- [ ] **Step 4: Verify scaffold output**

Run: `node scripts/sdk/cli.mjs init my-test D:\Temp`
Expected: `Created extension project at D:\Temp\my-test`; `D:\Temp\my-test\package.json` contains `"themeColor": "#6366F1"` and the `{{ID}}.themeColor` configuration entry with `{{ID}}` replaced by `my-test`.

Clean up afterwards: remove `D:\Temp\my-test`.

- [ ] **Step 5: Document the API**

In `docs/extension-api.md`, under the manifest schema section, add:

```markdown
### `themeColor` (per-extension accent)

Optional hex `#RRGGBB` on `financeExtension` (e.g. `"themeColor": "#4EC9B0"`).
Applied to the Activity Bar icon, tab icon, panel topbar affordances, and all
in-view accents bound to `--ff-accent`. The `<extensionId>.themeColor` settings
override (declare it in `contributes.configuration` with
`pattern: ^#[0-9A-Fa-f]{6}$`) wins over the manifest default; missing/invalid
falls back to the global accent. Panels receive the effective color in
`panel:init` as `themeColor` and must NOT hardcode accent hex values — bind to
`var(--ff-accent)` instead.
```

- [ ] **Step 6: Update CHANGELOG + file reference**

In `CHANGELOG.md`, under `## [Unreleased]`, add:

```markdown
### Added

- **Per-extension theme color** (`src/types/finance.d.ts`, `src/extension-host/manifest-schema.ts`, `src/shared/theme-color.ts`, `src/main/main.ts`, `src/main/services/webview-panel-manager.ts`, `src/main/resources/panel-bootstrap.ts`, `src/renderer/index.ts`, `src/renderer/components/activity-bar.ts`, `src/renderer/components/tab-bar.ts`, `src/renderer/components/types.ts`, `src/renderer/components/workspace.ts`, `src/renderer/components/settings-screen.ts`, `src/types/finance-shell.d.ts`, `scripts/sdk/types/finance.d.ts`, `scripts/sdk/templates/package.json.template`, `scripts/sdk/templates/src/ui/sample-view.ts.template`, `docs/extension-api.md`). New optional `financeExtension.themeColor` (`#RRGGBB`) + `<id>.themeColor` settings override; effective color = setting → manifest → global accent. Renderer icons + panel `--ff-accent` (topbar/in-view) recolor; Settings gains a native picker + text + reset.
```

Update `CHANGELOG.md` frontmatter `last_updated` to the current ISO timestamp. Add `src/shared/theme-color.ts` (+ test) rows to `docs/file-reference.md`.

- [ ] **Step 7: Full verification**

Run in order:

```bash
npm run typecheck
npx vitest run tests/unit/shared/theme-color.test.ts tests/unit/extension-host/manifest-schema.test.ts tests/unit/renderer/settings-screen.test.ts tests/unit/sdk/sdk-type-parity.test.ts tests/unit/main/services/webview-panel-manager.test.ts tests/unit/renderer/workspace.test.ts
npm run build
```

Expected: typecheck PASS; all suites PASS; build PASS.

Manual TU (do NOT commit; await user approval per AGENTS.md rule 6):
1. Add `"themeColor": "#4EC9B0"` + `todo-list.themeColor` config to `d:\finance_flow_ext\todo-list\package.json`, `npm run build` there, Install Folder in app, restart — Activity Bar + tab icons teal; panel topbar links/buttons teal.
2. Settings → Todo List → pick a new color — icons + live panel repaint without restart.
3. Reset — manifest default returns.
4. Remove `themeColor` — global accent renders as before (no crash).

## Self-Review

- [x] Spec §1 (data model/resolution) → Tasks 1–3 (helper, schema, Main delivery + types).
- [x] Spec §2 (renderer icons) → Task 4 (ActivityView/Tab/index/workspace).
- [x] Spec §2b (panel topbar/in-view) → Task 5 (`panel:init` apply, hover derivation, live update, theme-switch re-apply).
- [x] Spec §3 (Settings picker) → Task 6 (color branch, validation reuse, reset-via-empty).
- [x] Spec §4 (edge cases) → covered: fallback (Tasks 1/4/5), malformed manifest (Task 2), invalid setting (Tasks 1/3/4), disabled (existing filters, Task 3 passthrough), old tabs (Task 4), duplicates allowed (no uniqueness code — intentional), `settings.changed` repaint (Tasks 4–5 via mount-update + re-resolve).
- [x] Spec §5 (tests) → Tasks 1/2/4/6 unit + Task 7 full/manual.
- [x] Spec §6 (SDK) → Task 7 (vendored types, manifest template, sample-view guidance, refresh-safe opt-in documented).
- [x] No placeholders: every step shows exact code/commands/expected output; no TBD/TODO.
- [x] Type consistency: `themeColor?: string` (manifest), `color?: string` (ActivityView/Tab), `themeColors: Record<string, string | null>` (list payload), `resolveThemeColor({ setting, manifest })`, `darkenHex(hex, amount?)` used identically across Tasks 1/3/4/5.
- [x] No `git commit` steps (AGENTS.md rule 6 overrides the plan template's commit convention).
