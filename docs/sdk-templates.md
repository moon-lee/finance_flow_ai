# SDK Templates — Control & Maintenance

> How the standalone extension scaffold (`scripts/sdk/`) is organized and how to keep it consistent. Read this before editing any template.

## 1. Template inventory (single source of truth)

All templates live in `scripts/sdk/` — edit there, never inside a generated `D:\my-extensions\foo` or `D:\finance_flow_ext\todo-list`:

```
scripts/sdk/
  cli.mjs                          # init | build | refresh
  types/finance.d.ts               # vendored FinanceApi (re-synced on init+refresh)
  templates/
    AGENTS.md.template             # agent entrypoint (rendered on init)
    package.json.template          # financeExtension manifest + tables example (`version:bump` script included)
    scripts/version-bump.mjs.template # per-project version bumper (copied verbatim on init → scripts/version-bump.mjs)
    assets/icon.svg                # default Activity Bar icon copied by init
    tsconfig.json.template
    vite.config.ts.template
    index.html.template
    README.md.template
    src/main.ts.template           # Host activate + Domain Service example
    src/ui/sample-view.ts.template # Lit view (topbar + view-container)
    src/ui/index.ts.template
    src/mock/finance-mock.ts.template # in-memory FinanceApi + services registry
    src/vendor/logger.ts.template
    src/styles/shared-styles.ts.template
    src/styles/tokens.css          # copied verbatim (not templated)
    src/styles/ext-layout.css      # copied verbatim
```

`cli.mjs:17` `render()` substitutes `{{ID}}`, `{{DISPLAY_NAME}}`, `{{ICON}}`, `{{DESCRIPTION}}`, `{{APP_SDK}}` on `init`. One template = one file, no nested generators.

## 2. `init` vs `refresh`

- **`init <id> [dir]`** — copies **all** templates + `finance.d.ts` + `tokens.css`/`ext-layout.css` → new project (`<dir>/<id>/`). The new project is fully standalone (no need to open `D:\finance_flow_ai\extensions\...`). `init` creates `assets/icon.svg` and points the generated manifest at it. `init` also creates `docs/superpowers/plans/` + `docs/superpowers/specs/` (with `.gitkeep` placeholders) for design docs and implementation plans, mirroring the `todo-list` / `mortgage` layout. `init` also creates `scripts/version-bump.mjs` (from `scripts/version-bump.mjs.template`, copied verbatim — no `{{}}` substitution) so authors run `npm run version:bump` to bump `version` + `financeExtension.version` in sync.
- **`build [dir] [--bump]`** — bumps both version fields first when `--bump` is passed (reuses the core `bumpVersion`; plain `build` never touches the version), then bundles so `build/extension/package.json` ships the new version. Scaffold shortcut: `npm run release` (bump + build) or `npm run build -- --bump`.

- **`refresh <project>`** — overwrites **only** `src/finance.d.ts` + `src/vendor/logger.ts` + `src/styles/*` (`cli.mjs` `cmdRefresh`), **never** `src/main.ts`/`src/ui/*`/`AGENTS.md`/`package.json` — author code is safe. Run after the app updates `src/types/finance.d.ts`. `refresh` updates vendored types/styles/logger but does not overwrite a custom icon or `package.json`.

Existing extensions must add `assets/icon.svg` and change their manifest `icon` value manually.

## 3. Maintenance workflow (when you change a template)

1. Edit the template in `D:\finance_flow_ai\scripts\sdk\templates\...` (or `types/finance.d.ts`).
2. Verify: `node scripts/sdk/cli.mjs init my-test D:\Temp` → check `D:\Temp\my-test\<file>` has your change with `{{ID}}` replaced.
3. Run `cd D:\Temp\my-test && npm run dev` (HMR, mock DB) and `npm run build` → `build/extension` → Install in app → restart → test panel.
4. Commit the template change to `phase-8` (future `init` projects all get it). Clean up `D:\Temp\my-test`.

## 4. Avoid drift

- **Pins:** `vite.config.ts.template` + `tsconfig.json.template` pin `lit`/`vite`/`typescript` versions — update in one place.
- **Parity:** `src/types/finance.d.ts` (real app) and `scripts/sdk/types/finance.d.ts` (vendored) must stay in sync. `tests/unit/sdk/sdk-type-parity.test.ts` fails if they drift — fix until `PASS`.
- **Phase 8 inventory:** update `docs/file-reference.md` and `CHANGELOG.md` Administrative when you add/rename a template.
