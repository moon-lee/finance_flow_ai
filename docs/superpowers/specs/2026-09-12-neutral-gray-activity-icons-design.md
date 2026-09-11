# Neutral-Gray Activity Bar Icons Design

**Date:** 2026-09-12
**Status:** Approved + implemented
**Scope:** Activity Bar icons only; tabs and panel accents keep `themeColor`

## Goal

Make all extension Activity Bar icons neutral gray like the built-in
Settings gear, while keeping per-extension `themeColor` for tab letter
backgrounds and panel `--ff-accent` highlights.

## Decision

Static SVG recolor (no code changes):

- `extensions/dashboard/assets/icon.svg`: `#4ec9b0` → `#858585`
- `extensions/salary-history/assets/icon.svg`: `#f59e0b` → `#858585`
- `d:/finance_flow_ext/todo-list/assets/icon.svg`: `#38bdf8` → `#858585`
- `scripts/sdk/templates/assets/icon.svg`: `#6366F1` → `#858585`
- Backgrounds stay `#252526`, detail strokes stay `#f8fafc`
  (matches `src/renderer/public/icons/settings.svg`)

## Alternatives rejected

- **CSS grayscale filter in `activity-bar.ts`** — shifts whites/grays,
  cannot match Settings exactly.
- **Dynamic server-side SVG templating** — contradicts the all-gray goal;
  adds protocol/cache complexity for no benefit.

## Verification

- `tests/unit/renderer/activity-bar-icons.test.ts`,
  `tests/unit/renderer/activity-bar-color.test.ts`,
  `tests/unit/main/services/panel-protocol.test.ts` — 9/9 passed.
- Rebuild extensions + restart to see new icons
  (`npm run build:extensions` copies icon assets via
  `scripts/rename-extension-bundles.mjs`).
