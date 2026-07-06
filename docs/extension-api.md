# Finance Extension API Reference

> **Status:** Phase 3 skeleton. `finance.db.*` and `finance.ai.*` are stubbed and will fill in during Phase 4 and Phase 6 respectively. Phase 4+ migration notes document the planned API evolution.

## Manifest schema

Every extension declares a `financeExtension` block in its `package.json`. The canonical TypeScript types live in [`src/types/finance.d.ts`](../types/finance.d.ts). Runtime validation is enforced by the Zod schema in [`src/extension-host/manifest-schema.ts`](../extension-host/manifest-schema.ts).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Lowercase alphanumeric/hyphen; must match `package.json#name`. |
| `displayName` | `string` | Human-readable name shown in the Extension Manager. |
| `version` | `string` | Semver (e.g. `0.1.0`). |
| `activationEvents` | `ActivationEvent[]` | At least one. `*` activates on startup; `onView:<id>` and `onCommand:<id>` are lazy. |
| `contributions` | `ManifestContributions` | `views`, `commands`, `menus`, `configuration`. |
| `main` | `string` | Path to the bundled ESM entry (relative to package root). |

### `contributes.views`

Each view contributes one Activity Bar button. Phase 3 renders the icon as a single character; the renderer ignores any CSS-class suggestion.

### `contributes.commands`

Each command registers a Palette entry. Phase 3 wires execution end-to-end; the renderer invokes commands via `window.financeShell.extensions.executeCommand(id, ...args)`.

### `contributes.menus` (deferred)

Schema is defined; Electron `Menu` rendering is deferred to Phase 5.

### `contributes.configuration` (deferred)

Schema is defined; the generic settings UI renderer is deferred to Phase 7.

## Activation events

- `*` — load immediately on app start.
- `onView:<viewId>` — load when the user activates the named view.
- `onCommand:<commandId>` — load when the named command is invoked.

## `finance.*` API surface

The `finance` global is parameter-injected into the extension's `activate(finance)` function. **Phase 3 does not implement canonical `import * as finance from 'finance'`** — the parameter-injection mechanism is the Phase 3 contract; Phase 4+ adds module-loader support for multi-file extensions without changing this signature.

### `finance.commands.registerCommand(id, title, handler, keybinding?)`

Register a command. Throws if `id` is already registered. `keybinding` is stored but not enforced until Phase 7.

### `finance.commands.execute(id, ...args)`

Execute a command. Returns `null` if the command is missing (graceful degradation per `project_vision.md:46`). Never throws.

### `finance.db.table(name)` (Phase 3 stub)

Returns an empty queryable. Phase 4 wires real access via the Core DAO.

### `finance.ai.registerTool(definition)` (Phase 3 stub)

Stores the tool definition and forwards it to Main. Phase 6 wires execution.

## Lifecycle hooks

- `activate(finance)` — called when an activation event fires. Required export.
- `deactivate()` — called when the Extension Host shuts down (graceful shutdown only). Optional.

## Loading mechanism

Extension entries are bundled to `dist/extensions/<id>.js` by `vite.extensions.config.ts` (per ADR-0004 and Decision 10). The Extension Host loads the bundle via dynamic `import()`. Extensions are authored in TypeScript but authors do not need to know about the bundler.

## Error handling

- Manifest validation failures are skipped at the discovery boundary with a console warning; the shell stays alive.
- Activation failures increment the registry's `crash_count` and auto-disable at `AUTO_DISABLE_CRASH_THRESHOLD = 3`.
- Command execution returns `{ executed: false, reason }` on transport failures; the renderer surfaces the reason in the status bar.

## Security model

- Extensions run in an isolated `utilityProcess` (no shared in-process module graph with Main or Renderer).
- All cross-extension traffic routes through Main via `finance.commands.execute()` and returns `null` on missing target.
- Direct database writes across extension boundaries are structurally impossible (DAO namespace enforcement).
- **Phase 5 hardening:** a per-extension command allowlist on the Main side (see `project_vision.md:46` and Self-Review §7).

## Working example

See [`extensions/salary-history/`](../extensions/salary-history/) — the Phase 3 mock extension declares one view (`salary-history`), two commands (`salary.showPayHistory`, `salary.showDeductions`), and activates on `onView:salary-history`. Phase 4 replaces the stub handlers with real payslip form logic.

## Phase 4+ migration notes

- `import * as finance from 'finance'` becomes available in Phase 4 when a multi-file extension is first built. The `FinanceApi` type contract in `src/types/finance.d.ts` is unchanged.
- `finance.db.table()` becomes a real DAO in Phase 4 with structural namespace enforcement (`finance.db.table('<extensionId>_<table>')`). No `finance.extensions.<id>.db.*` wrapper — the DAO path itself enforces isolation per Phase 4 Decision 1 (`docs/superpowers/plans/2026-07-04-phase4-shared-financial-data-salary-history.md`).
- `finance.ai.registerTool()` becomes executable in Phase 6 with tool-call routing through the AI Assistant panel.
