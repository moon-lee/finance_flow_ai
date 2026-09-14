# Finance Extension API Reference

> **Status:** Phase 4 complete (`finance.db.*` is a real DAO). Phase 5 adds `finance.services.*`, `finance.ui.*`, `onStartup`, `navigation`, and per-extension allowlists. `finance.ai.*` remains a stub until Phase 6.

## Manifest schema

Every extension declares a `financeExtension` block in its `package.json`. The canonical TypeScript types live in [`src/types/finance.d.ts`](../types/finance.d.ts). Runtime validation is enforced by the Zod schema in [`src/extension-host/manifest-schema.ts`](../extension-host/manifest-schema.ts).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Lowercase alphanumeric/hyphen; must match `package.json#name`. |
| `displayName` | `string` | Human-readable name shown in the Extension Manager. |
| `version` | `string` | Semver (e.g. `0.1.0`). |
| `activationEvents` | `ActivationEvent[]` | At least one. `*` activates on startup; `onStartup` activates on startup and triggers a UI mount; `onView:<id>` and `onCommand:<id>` are lazy. |
| `themeColor` | `string` | Optional shared `#RRGGBB` accent for extension icons and panel accents. |
| `contributions` | `ManifestContributions` | `views`, `commands`, `menus`, `configuration`, `navigation`, `allowedCommands`, `allowedUiEvents`. |
| `main` | `string` | Path to the bundled ESM entry (relative to package root). |

### `themeColor`

Extensions may declare an optional shared accent color in `#RRGGBB` form:

```json
"themeColor": "#4EC9B0"
```

The color applies to the Activity Bar icon, tab icon, panel topbar actions, and
in-view accents already bound to `var(--ff-accent)`. An extension can declare
`<extensionId>.themeColor` in `contributes.configuration` with the same hex
pattern so users can override the author default from Settings. Resolution is
user setting, then manifest value, then the global accent. Missing or invalid
values fall back without throwing.

Panel extensions should use `var(--ff-accent)` for buttons, links, and focus
rings rather than hardcoding an accent hex. The panel bootstrap applies the
effective color before importing the extension bundle.

### `contributes.views`

Each view contributes one Activity Bar button — and one tab. Extensions that need multiple screens keep ONE `views[]` entry and host extra screens as child views inside a Lit orchestrator (see `extensions/salary-history/src/ui/salary-orchestrator.ts`): commands call `finance.ui.requestMount('<viewId>', { view: '<child-tag>' })` and the panel branch retargets in place via the `mount-update` event. Adding a second `views[]` entry opens a second tab — only do that for genuinely separate workspaces.

### Activity Bar icons

`contributes.views[].icon` accepts either a legacy one/two-character fallback or
an extension-relative `assets/*.svg` / `assets/*.png` path. Asset paths are
served only from the extension package and are rejected if they contain `..`,
absolute paths, protocols, or unsupported file types. Activity Bar renders the
asset at 28px; tabs are not affected by this setting. Activity Bar buttons
retain shared styling with no extension `themeColor` background.

### `contributes.commands`

Each command registers a Palette entry. Phase 3 wires execution end-to-end; the renderer invokes commands via `window.financeShell.extensions.executeCommand(id, ...args)`.

### `contributes.navigation` (Phase 5)

Each extension contributes sidebar items for the Navigation Panel:

```jsonc
"contributes": {
  "navigation": [
    {
      "id": "salary.pay-history",
      "label": "Pay History",
      "command": "salary.show-pay-history",
      "group": "Salary"
    }
  ]
}
```

Each item is `{ id, label, command, group? }`. Items in the same `group` are rendered under a section header. Items can reference any command in any active extension.

### `contributes.allowedCommands` (Phase 5)

A subset of `commands[].id` that external callers (other extensions, the renderer) are allowed to invoke on this extension's behalf. Commands not in this list are rejected by Main's `CommandAllowlist` before reaching the Host. The extension's own code can still call `finance.commands.execute()` for any of its registered commands internally.

```jsonc
"contributes": {
  "allowedCommands": ["salary.show-pay-history", "salary.show-pay-rate-history"]
}
```

### `contributes.allowedUiEvents` (Phase 5)

The event names this extension's UI is allowed to emit via `financeShell.extensions.uiEvent()` (or the Host-side equivalent). Events not in this list are silently dropped by Main's `UiEventAllowlist` with a `console.warn`.

```jsonc
"contributes": {
  "allowedUiEvents": [
    "payslip-create",
    "payslip-edit",
    "payslip-delete"
  ]
}
```

### `contributes.menus` (deferred)

Schema is defined; Electron `Menu` rendering is deferred to Phase 5.

### `contributes.configuration` (deferred)

Schema is defined; the generic settings UI renderer is deferred to Phase 7.

## Activation events

- `*` — load immediately on app start.
- `onStartup` — load immediately on app start and mount as a WebviewPanel. Use for extensions that should be visible on first launch (e.g. Dashboard). Only one `onStartup` extension should be the default view; the rest mount as background tabs.
- `onView:<viewId>` — load when the user activates the named view.
- `onCommand:<commandId>` — load when the named command is invoked.

## `finance.*` API surface

The `finance` global is parameter-injected into the extension's `activate(finance)` function. **Phase 3 does not implement canonical `import * as finance from 'finance'`** — the parameter-injection mechanism is the Phase 3 contract; Phase 4+ adds module-loader support for multi-file extensions without changing this signature.

### `finance.commands.registerCommand(id, title, handler, keybinding?)`

Register a command. Throws if `id` is already registered. `keybinding` is stored but not enforced until Phase 7.

### `finance.commands.execute(id, ...args)`

Execute a command. Returns `null` if the command is missing (graceful degradation per `project_vision.md:46`). Never throws.

### `finance.db.table(name)` (Phase 4 — real DAO)

Returns a typed `TableAccessor` whose `find` / `findOne` / `count` / `insert` / `update` / `delete` methods call through to the Core DAO with structural namespace enforcement (`<extensionId>_<table>` for extension tables; shared tables like `accounts` are read-only for extensions). Phase 5 extends `find` / `findOne` / `count` with an optional second `options` argument supporting `$join`, `$orderBy`, `$limit`, `$offset`.

### `finance.services.invoke(serviceName, method, params?)` (Phase 5)

Call a cross-extension domain service registered by another extension. Returns `null` if the service is not registered or the implementing extension is disabled or errored. Never throws.

```ts
const ytd = await finance.services.invoke('pay', 'getYearToDateSummary', { financialYearStart });
const lastPayslip = await finance.services.invoke('pay', 'getLastPayslip');
```

### `finance.services.register(serviceName, impl)` (Phase 5 — extension-internal)

Register this extension's implementation of a domain service. Called in `activate()`; unregister in `deactivate()`. The `impl` object's method names become the callable `method` strings for `finance.services.invoke`.

```ts
finance.services.register('pay', {
  getYearToDateSummary: (params) => adapter.getYearToDateSummary(params),
  getLastPayslip: () => adapter.getLastPayslip(),
  getCurrentRate: () => adapter.getCurrentRate()
});
```

### `finance.services.unregister(serviceName)` (Phase 5 — extension-internal)

Remove this extension's service registration. Called in `deactivate()`.

### `finance.ui.requestMount(viewId, mountData)` (Phase 5)

Request that Main mount this extension's view as a WebviewPanel. Called from `activate()` for `onStartup` extensions, or from command handlers for lazy views. `mountData` is an opaque object forwarded to the panel via `panel:init`.

### `finance.ui.pushData(viewId, mountData)` (Todo auto-refresh)

Push fresh `mountData` to an already-mounted panel WITHOUT showing or focusing it. Main sends `panel:mount-update` to the existing view only; if the panel was never mounted the push is dropped (use `requestMount` for first mount). Optional on all surfaces (Host `UiApi`, panel bootstrap stub, SDK types) so legacy mocks keep compiling. Used by the dashboard's `db-changed` auto-refresh to update its card while the user stays on the Todo List view.

### `finance.events.on(topic, handler)` / `finance.events.emit(topic, payload)` (Phase 7 Task 8)

Subscribe/publish on the global event bus. Host `emit` routes via the `event.publish` Host→Main RPC (`ExtensionIPC.handleEventPublish`); panel-side `finance` has no `events` (mutations there reach Core through the `extensions:write-table` IPC instead). Core-owned topics: `host:log`, `panel.lazy-unmount`, `panel.auto-save-failed`, `extension.host-status`, `settings.changed`, and `db-changed` (`{ extensionId, table, op }` after every extension-table write — consumers filter on `table`).

### `finance.ui.setDirty(dirty)` (Phase 5)

Tell Main that this panel has unsaved changes. Main shows the dirty indicator in the tab bar and defers auto-unmount.

### `finance.ui.autoSaveDraft()` (Phase 5)

Trigger a draft save before the panel is unmounted. Main enforces a 500 ms timeout; on failure the panel is destroyed and a toast is shown.

### `finance.ui.onBeforeUnmount(callback)` (Phase 5)

Register a hook that Main drains before unmounting the panel. Use to persist form state. Callbacks are called in registration order; their aggregated result is passed to `autoSaveDraft`.

### `finance.ai.registerTool(definition)` (Phase 3 stub)

Stores the tool definition and forwards it to Main. Phase 6 wires execution.

## Logging

All tiers share one upper class, `BaseLogger` (`src/shared/base-logger.ts`): `LogLevel` (`debug|info|warn|error`), `LogPayload`, `normalizeArgs(...args)`, `formatLine(entry)`, and variadic `info/warn/error/debug/log(...args)` (`log` aliases `info`). Canonical console line: `ISO-timestamp [LEVEL] [context] message  file:line`. JSONL file shape stays `{ level, message, context, error, timestamp, file, line }`.

- **Main** — `LoggerImpl extends BaseLogger` (`src/main/services/logger.ts`): `write` → `console.*` + `eventBus.publish('log.<level>')`, which feeds `LogFileService` (`<userData>/logs/app.log`).
- **Host + extensions** — `ExtensionLogger extends BaseLogger` (`src/extension-host/api/logger.ts`, vendored as `src/vendor/logger.ts`): `write` → `console` + `parentPort.postMessage({ method: 'host.log', params: entry })`; Main republishes to `log.<level>` preserving level/context/timestamp. `info`/`debug` stay distinct end-to-end.
- **Renderer** — `rendererLogger` (`src/renderer/logger.ts`): `write` → `console.*` + `financeShell.events.emit('log.<level>')`.
- **Panels** — `PanelLogger extends BaseLogger` (`src/main/resources/panel-bootstrap.ts`, context `panel:<viewId>`): `write` → `console.*`.
- **Level control** — `core.logLevel` setting (`debug|info|warn|error`, default `info`); changing it in Settings applies immediately without restart across Main/Host/Renderer.
- **SDK** — `refresh` re-syncs `src/vendor/logger.ts` + `src/shared/base-logger.ts`; author code untouched.

## Lifecycle hooks

- `activate(finance)` — called when an activation event fires. Required export.
- `deactivate()` — called when the Extension Host shuts down (graceful shutdown only) or the extension is disabled. Optional. Use to unregister services and clean up timers.

## Loading mechanism

Extension entries are bundled to `dist/extensions/<id>.js` by `vite.extensions.config.ts` (per ADR-0004 and Decision 10). The extension UI bundle is loaded inside a sandboxed Electron `WebContentsView` via a `<script>` tag from the `finance-shell://` custom protocol. The Extension Host loads the Host-side bundle via dynamic `import()`. Extensions are authored in TypeScript but authors do not need to know about the bundler.

## Error handling

- Manifest validation failures are skipped at the discovery boundary with a console warning; the shell stays alive.
- Activation failures increment the registry's `crash_count` and auto-disable at `AUTO_DISABLE_CRASH_THRESHOLD = 3`.
- `finance.services.invoke` returns `null` (not throws) if the service is not registered or the implementing extension is disabled. The registry logs a distinct warning for "service not found" vs "service errored".
- Command execution returns `{ executed: false, reason }` on transport failures or allowlist rejection; the renderer surfaces the reason in the status bar.
- `finance.ui.autoSaveDraft` has a 500 ms timeout; on timeout the panel is destroyed and a `panel:auto-save-failed` toast is shown.

## Security model

- Extensions run in an isolated `utilityProcess` (no shared in-process module graph with Main or Renderer).
- All cross-extension traffic routes through Main via `finance.commands.execute()` or `finance.services.invoke()` and returns `null` on missing target.
- Direct database writes across extension boundaries are structurally impossible (DAO namespace enforcement).
- **Phase 5 hardening:** a per-extension command allowlist on the Main side gates every `executeCommand` IPC call (see `project_vision.md:46` and Self-Review §7).
- **Phase 5 hardening:** a per-extension `ui-event` allowlist on the Main side gates every `ui-event` IPC call; disallowed events are dropped with a `console.warn` (see Decision 7).

## Installing extensions (Phase 8 — SDK + Extension Manager)

> **Goal:** create a brand-new extension in its own folder, build it, and install it into the app — no code changes to the app itself.

**Create / Edit / Preview / Build:**

```bash
node scripts/sdk/cli.mjs init todo-list [D:\my-extensions]  # → D:\my-extensions\todo-list\ (package.json, src/main.ts, src/ui/<id>-view.ts, src/mock/finance-mock.ts, AGENTS.md)
cd D:\my-extensions\todo-list
npm install
npm run dev    # http://localhost:5173 with mock FinanceApi + HMR (in-memory Map + __mockServices)
# edit src/main.ts (activate + finance.services.register) and src/ui/<id>-view.ts (Lit + sharedStyles)
node D:/finance_flow_ai/scripts/sdk/cli.mjs build .  # → build/extension/<id>.js (+ ui-*.js if code-split)
# or from the app folder: node scripts/sdk/cli.mjs build D:\my-extensions\todo-list
```

- `tables` in `package.json` `financeExtension` must be `{{ID_SNAKE}}_items` (`{{ID}}` with `-`→`_`, e.g. `todo-list`→`todo_list_items`) with columns `{ name, type, nullable, default, min, max }` (see `src/finance.d.ts` `ColumnManifest`). Validated by `manifest-schema.ts:177` `^[a-z][a-z0-9_]*$` and `extension-installer.ts:80` prefix check.
- `finance` is type-only (`import type { FinanceApi } from 'finance'`), `finance-logger` shim is bundled.
- `npm run dev` DB is ephemeral (Map); real SQLite (`better-sqlite3`) only after Install+restart.

**Refresh after app updates:**

```bash
node D:/finance_flow_ai/scripts/sdk/cli.mjs refresh D:\my-extensions\todo-list  # re-syncs src/finance.d.ts + vendor/logger.ts + styles/*
```

**App-side Extension Manager (Workspace `__extensions__`):** Activity Bar → **Extensions** → **Install Folder** / **Install Zip** (via `dialog.showOpenDialog`), **Enable/Disable**, **Uninstall** (removes folder + registry, keeps tables), **Delete Data** (confirmed → `DROP TABLE` + `deleteNamespace` + `rmSync` + `registry.remove`). All 5 actions auto-restart the app (`app:restart` IPC). Dependency/version checks (`compareVersions`, no downgrades) and `builtinIds` collision guard enforced by `ExtensionInstaller` (`src/main/services/extension-installer.ts`).

**Working example**

See [`extensions/salary-history/`](../extensions/salary-history/) — declares one view (`salary`), two commands (`salary.show-pay-history`, `salary.show-pay-rate-history`), and activates on `onStartup` + `onView:salary`. Both nav items retarget the single `salary` panel in place via `mount-update`; child views (`payslip-list`, `pay-rate-history-view`, forms) are hosted by a Lit `salary-orchestrator`. Phase 5 adds `allowedCommands`, `allowedUiEvents`, and a `finance.services.pay.*` public adapter registered in `activate()`.

**SDK template reference:** `docs/sdk-templates.md` documents the full template inventory and `init` vs `refresh` maintenance workflow.

## Phase 4+ migration notes

- `import * as finance from 'finance'` becomes available in Phase 4 when a multi-file extension is first built. The `FinanceApi` type contract in `src/types/finance.d.ts` is unchanged.
- `finance.db.table()` becomes a real DAO in Phase 4 with structural namespace enforcement (`finance.db.table('<extensionId>_<table>')`). No `finance.extensions.<id>.db.*` wrapper — the DAO path itself enforces isolation per Phase 4 Decision 1 (`docs/superpowers/plans/2026-07-04-phase4-shared-financial-data-salary-history.md`). Phase 5 extends `find`/`findOne`/`count` with `$join`, `$orderBy`, `$limit`, `$offset`.
- `finance.services.invoke()` and `finance.services.register()` are new in Phase 5. Extensions that want to expose data to other extensions register a service in `activate()` and unregister in `deactivate()`.
- `finance.ui.requestMount`, `finance.ui.setDirty`, `finance.ui.autoSaveDraft`, and `finance.ui.onBeforeUnmount` are new in Phase 5. Extensions that render inside a WebviewPanel use these to coordinate their lifecycle with Main.
- `onStartup` is a new activation event in Phase 5. Extensions that declare it are activated and mounted automatically on app boot, before any user interaction.
- `contributes.navigation`, `contributes.allowedCommands`, and `contributes.allowedUiEvents` are new manifest fields in Phase 5.
- `finance.ai.registerTool()` becomes executable in Phase 6 with tool-call routing through the AI Assistant panel.
