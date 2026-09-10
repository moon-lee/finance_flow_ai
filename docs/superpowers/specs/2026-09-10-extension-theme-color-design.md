---
title: Per-Extension Theme Color (Icons + Topbar + In-View Accents)
date: 2026-09-10
last_updated: 2026-09-10T13:00:00+10:00
status: active
target_version: Unreleased
spec_source: user request 2026-09-10 (per-extension color, Approach A)
---

# Per-Extension Theme Color — Design

## Problem

All extensions share the single global accent (`--accent` / `--tab-icon-active-bg`
in `src/renderer/styles/tokens.css`, `--ff-accent` in panels). The Activity Bar
(`src/renderer/components/activity-bar.ts`) and tab strip (`src/renderer/components/tab-bar.ts`)
render every extension icon identically, and every panel's topbar (`.topbar` in
`extensions/salary-history/src/styles/ext-layout.css`) plus in-view controls
(`.btn-primary`, `.crumb-link`, focus rings — all `var(--ff-accent)`) render in the
same `#007acc` blue, so users cannot tell extensions apart at a glance. Manifest views
(`src/types/finance.d.ts` `ManifestViewContribution`) declare only `id`/`name`/`icon`.

## Scope

- Surfaces: Activity Bar icon + tab icon + panel topbar + in-view accents
  (buttons, links, focus rings — everything already bound to `--ff-accent`).
- One shared color per extension (not per view).
- Author declares a default; user may override in Settings.
- Format: free hex `#RRGGBB`.
- Missing color falls back to the global accent (never throws).

Out of scope: curated palettes, contrast auto-correction, navigation-panel
coloring, full per-extension token themes (backgrounds/typography stay shared).

## Confirmed decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Surfaces | Activity Bar icon + tab icon + topbar + in-view accents |
| 2 | Source | Author default + user override |
| 3 | Format | Free hex `#RRGGBB` |
| 4 | Fallback | Global accent |
| 5 | Settings input | Native color picker + synced text field |
| 6 | Scope | One shared color per extension |
| 7 | Approach | A — extension-level `themeColor` |

Alternatives B (view-level `views[].color`) and C (full per-extension theme)
were rejected: B duplicates one value across views and drifts; C breaks token
isolation and doubles light/dark contrast work.

## Design

### §1 — Data model & resolution

- New optional `FinanceExtensionManifest.themeColor?: string`
  (`src/types/finance.d.ts`), documented as the shared icon color for all
  views of the extension. Hex form `^#[0-9A-Fa-f]{6}$`.
- Mirrored in `financeExtensionManifestSchema`
  (`src/extension-host/manifest-schema.ts`) as
  `themeColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()`.
  Missing = valid. Malformed = existing invalid-manifest skip path
  (loader warns, shell stays alive).
- User override: extension declares `contributes.configuration` entry
  `<id>.themeColor` (`type: string`, `pattern: ^#[0-9A-Fa-f]{6}$`,
  `formatHint: #RRGGBB`, `placeholder: #6366F1`). Uses the existing
  namespaced settings (`finance.settings.get/set`, `assertExtensionKey`);
  no Core-owned storage change, preserving the vision settings rule
  (`project_vision.md` §2 strict namespace isolation).
- Effective color (renderer, per extension):
  `settings <id>.themeColor` → `manifest themeColor` → global accent
  (`--accent` / `--tab-icon-active-bg`). An invalid setting value is ignored
  with `console.warn` and falls through; it never blocks render.
- No new IPC method. Color flows inside the existing
  `financeShell.extensions.list()` view payload (registry `views()` already
  returns the full view object) plus `financeShell.settings.get`.

### §2 — Rendering

- `ActivityView` (`src/renderer/components/activity-bar.ts`) gains
  `color?: string`; `Tab` (`src/renderer/components/types.ts`) gains
  `color?: string`.
- `loadExtensionContributions()` (`src/renderer/index.ts:129`) resolves the
  effective color per view and maps it into `activityBar.views`
  (`{ id, name, icon, color }`).
- `activity-bar.ts` button and `tab-bar.ts` `.tab-icon` apply the color as an
  inline style (background for the icon chip). Active-tab left marker in the
  Activity Bar stays global `--accent` for consistency.
- `workspace.ts` `_addPanel()` / tab restore carry `color` through; persisted
  tabs from older versions lack `color` and fall back on load.
- Light/dark: the hex passes through unchanged in both themes. The author
  owns contrast; the spec documents that low-contrast choices are the
  author's responsibility (no auto-correction in v1).
- Disabled extension: excluded via the existing `views()` enabled filter —
  no new gating.

### §2b — Panel delivery (topbar + in-view accents)

Panels run in isolated `WebContentsView`s; Core cannot reach into their DOM.
Delivery is data-only via the existing `panel:init` payload:

- `PanelPayload` (`src/main/resources/panel-bootstrap.ts:59`) gains optional
  `themeColor?: string`. `WebviewPanelManager.mount()`
  (`src/main/services/webview-panel-manager.ts:275`) resolves the effective
  color (see §1 precedence) and includes it in the `panel:init` send
  (`webview-panel-manager.ts:320`). No new IPC channel; `panel:init` already
  carries `{ extensionId, viewId, mountData }`.
- `mountPanelComponent()` (`panel-bootstrap.ts:164`) applies the color as
  `root.style.setProperty('--ff-accent', themeColor)` (and a darkened
  `--ff-accent-hover` derived in JS) on `document.documentElement` BEFORE
  importing the extension bundle, so first paint already uses it. Missing
  color = no override; the existing theme block (`panel-bootstrap.ts:169`)
  sets `--ff-accent: #007acc` as today.
- Because every in-view accent (`.topbar .crumb-link`, `.filter-btn:hover`,
  `.btn-primary`, focus rings in `ext-layout.css`) already reads
  `var(--ff-accent)`, no per-extension CSS change is needed: overriding the
  one variable recolors the topbar action affordances and all in-view accents
  at once. The `.topbar` bar itself keeps the shared `--ff-bg-panel`
  background — color appears on its interactive elements, not as a full
  recolored bar.
- `panel:mount-update` / `panel:navigate` payloads may carry a refreshed
  `themeColor` so a Settings override repaints a live panel without restart.
- `financeShell.theme.onChange` re-applies the override after theme switches
  (the theme block rewrites `--ff-accent`; the override is re-set after).

### §3 — Settings UI

- `settings-screen.ts` `_renderControl()` gains a color branch, used when the
  item key ends with `.themeColor` (or when `formatHint === '#RRGGBB'`):
  native `<input type="color">` synced bidirectionally with a text field.
- Text side reuses the existing formatted-input contract (spec
  `2026-08-08-settings-validation-design.md`): pattern-validated
  `^#[0-9A-Fa-f]{6}$`, invalid blocks save with inline error +
  `aria-invalid`, error clears on `input`.
- A "Reset to manifest default" button clears the override
  (`settings.set` back to manifest value or delete override), restoring the
  author default.
- Picker and text stay in sync: picker change updates text immediately and
  commits debounced (existing `_commit`); text change validates then updates
  the picker on valid input.

### §4 — Errors & edge cases

| Case | Behavior |
|------|----------|
| No manifest color, no override | Global accent fallback; icon renders as today |
| Malformed manifest color | Manifest rejected at load (existing skip + warn) |
| Invalid setting value | Ignored with `console.warn`, fall through to manifest/accent |
| Extension disabled | Excluded from `views()`; no color work |
| Old persisted tabs | `color` undefined → fallback, no migration needed |
| Duplicate colors across extensions | Allowed in v1 (no uniqueness enforcement) |
| `settings.changed` for `<id>.themeColor` | Renderer re-resolves and repaints icons without restart |

### §5 — Tests

- `tests/unit/extension-host/manifest-schema.test.ts`: valid hex accepted,
  missing ok, malformed (`red`, `#FFF`, `#GGGGGG`, `123456`) rejected.
- Resolution unit test (renderer or pure helper): override order
  setting → manifest → accent; invalid setting falls through.
- `tests/unit/renderer/settings-screen.test.ts`: picker↔text sync, invalid
  text blocks save, reset restores manifest default.
- Renderer tests (`activity-bar`, `tab-bar`/`workspace`): icon style applied
  from `color`, fallback path renders without inline style.
- Manual: set `todo-list` themeColor, Install Folder, restart, verify
  Activity Bar + tab icons; change override in Settings, verify live repaint;
  clear override, verify manifest default returns.

## Blast radius

- Touched: `src/types/finance.d.ts`, `src/extension-host/manifest-schema.ts`,
  `src/renderer/index.ts`, `src/renderer/components/activity-bar.ts`,
  `src/renderer/components/tab-bar.ts`, `src/renderer/components/types.ts`,
  `src/renderer/components/workspace.ts`,
  `src/renderer/components/settings-screen.ts`,
  `src/main/services/webview-panel-manager.ts`,
  `src/main/resources/panel-bootstrap.ts`, `docs/extension-api.md`,
  SDK types + templates (see §6).
- Untouched: DAO, services registry, Host API surface, panel-preload bridge
  shape (settings/theme bridge already exists), extension business logic.

## §6 — Extension SDK: what you get and where to update it

The SDK (`scripts/sdk/`, documented in `docs/sdk-templates.md`) is the
standalone scaffold that `init` copies and `refresh` re-syncs. `themeColor`
touches it in three places:

| # | File | What you get | Update rule |
|---|------|--------------|-------------|
| 1 | `scripts/sdk/types/finance.d.ts` | Vendored `FinanceApi`/manifest types incl. `themeColor` | Copy from `src/types/finance.d.ts` (parity test `tests/unit/sdk/sdk-type-parity.test.ts` fails on drift). Re-synced to projects by `refresh` |
| 2 | `scripts/sdk/templates/package.json.template` | New-extension manifests ship `"themeColor": "#6366F1"` default + `<id>.themeColor` configuration entry (pattern `^#[0-9A-Fa-f]{6}$`) | Edit template; verify via `node scripts/sdk/cli.mjs init my-test D:\Temp` |
| 3 | `scripts/sdk/templates/src/ui/sample-view.ts.template` | Sample view documents the contract: topbar/in-view accents follow `var(--ff-accent)`, which Core overrides from `themeColor` — no author CSS needed; do NOT hardcode accent hex | Edit template comment/markup only |

What `refresh` does and does NOT do (`cli.mjs:87 cmdRefresh`):

- Overwrites ONLY `src/finance.d.ts` + `src/vendor/logger.ts` +
  `src/styles/*` — so existing projects (e.g. `d:\finance_flow_ext\todo-list`)
  receive the new `themeColor` type automatically on next `refresh`.
- NEVER touches `package.json` / `src/main.ts` / `src/ui/*` — author code is
  safe. Each existing extension opts in by adding `themeColor` +
  `<id>.themeColor` to its own `package.json` by hand (documented in
  `docs/extension-api.md`), then `npm run build` + Install Folder + restart.
- `ext-tokens.css` / `ext-layout.css` are copied verbatim, not templated —
  no SDK change needed there since accents already bind `var(--ff-accent)`.
- `finance-mock.ts.template` needs no change: the dev mock serves
  `settings.get => null`, so panels render with the manifest default via the
  same fallback chain; authors can hardcode a return to preview overrides.

## Self-review

- [x] No placeholders; all file paths concrete.
- [x] No contradiction with settings namespace isolation (override lives in
  extension namespace).
- [x] No ambiguity in resolution order or fallback.
- [x] Scope covers icons + topbar/in-view via the single `--ff-accent`
  override; full token theming explicitly deferred.
- [x] SDK covered: vendored types via `refresh`, manifest default + sample
  view guidance via templates, opt-in path for existing extensions.
