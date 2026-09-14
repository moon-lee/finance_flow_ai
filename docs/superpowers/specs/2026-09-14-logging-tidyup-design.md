---
version: 0.1.0
created: 2026-09-14
last_updated: 2026-09-14T12:00:00+10:00
status: draft
---

# Logging Tidy-Up — Design

## Problem

Three logging tiers drifted apart:

1. Main — `src/main/services/logger.ts` (`LoggerImpl`, `LogPayload`, `createLogger`/`getLogger`)
2. Host + extensions — `src/extension-host/api/logger.ts` (`ExtensionLogger`) plus vendored copies in `todo-list`/`mortgage` `src/vendor/logger.ts` and `scripts/sdk/templates/src/vendor/logger.ts.template`
3. Renderer + panels — `src/renderer/logger.ts` (`rendererLogger`) + inline `panelLogger` in `src/main/resources/panel-bootstrap.ts`

Drift symptoms: `info`/`debug` collapse to `log` in Host (`api/logger.ts:info/debug → log`), `host:log` envelope `{ level: 'log'|'warn'|'error', args: string[] }` loses level/context/timestamp, `main.ts:onHostLog` rewrites the message (`[host] args.join(' ')`) instead of preserving fields, console lines lack timestamps, and each tier hand-builds its own `[context] message  file:line` string with a duplicated stack parser (4 copies).

## Confirmed decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Pain scope | All four: format, level control, file management, API |
| 2 | Control priority | Shared format + types, simpler extension API |
| 3 | Tier identity | (1) Main `logger.ts`, (2) Host+extensions `api/logger.ts`, (3) Renderer `logger.ts` + `panel-bootstrap` |
| 4 | Line shape | Timestamp + level + context + message |
| 5 | Unify source | Yes — single shared formatter |
| 6 | API shape | Keep variadic `(...args)`, fix bugs |
| 7 | Level control | Settings UI (`core.logLevel`), restart-free |
| 8 | Structure | Upper-class `BaseLogger` + shared formatter + thin adapters |

Approach A (shared formatter + adapters) approved over B (options-object rewrite) and C (in-place sync without shared file).

## §1 — `BaseLogger` upper class (shared)

New pure file `src/shared/base-logger.ts`. No `process`, `window`, or `eventBus` imports, so Main, Host, Renderer, Panel, and SDK vendored copies can all use it.

Base owns once:

- types `LogLevel` (`debug|info|warn|error`), `LogPayload` (`level, message, context?, error?, timestamp, file?, line?`)
- `normalizeArgs(...args)` — one rule: first `Error` → `error` (stack preferred); first `string` after message → context override, else constructor context; remaining args safe-stringified and appended to `message`
- `formatLine(entry)` — `ISO-timestamp [LEVEL] [context] message  file:line`
- `getCallerInfo(skipFiles)` — single stack parser replacing 4 copies
- `abstract class BaseLogger`:
  - `constructor(context: string, minLevel: LogLevel = 'info')`
  - `shouldLog(level)`, `setMinLevel(level)`
  - `protected abstract write(entry: LogPayload, line: string, errorArg?: Error): void`
  - `info/warn/error/debug/log(...args)` — variadic kept; `log` aliases `info`

Adapters (transport only):

- `MainLogger extends BaseLogger` — `write` → `console.*` + `eventBus.publish('log.<level>')`
- `HostLogger extends BaseLogger` — `write` → `consoleImpl.*` + `parentPort.postMessage({ method: 'host.log' })`
- `RendererLogger extends BaseLogger` — `write` → `console.*` + `financeShell.events.emit('log.<level>')`
- `PanelLogger extends BaseLogger` — `write` → `console.*` (context `panel:<viewId>`)

## §2 — Shared line format + Host→file wiring

Canonical console line (identical in all tiers):

```text
2026-09-14T12:00:00.000Z [INFO] [host:salary-history] payslip created  pay-slips.ts:41
```

- `level` upper-cased; `context` defaults to constructor context.
- JSONL file shape stays `{ level, message, context, error, timestamp, file, line }` — pretty line for console, object for file, no fork.
- New `host.log` envelope: `{ level: LogLevel, message, context, error?, timestamp, file?, line? }` built by `HostLogger.write`. Removes the `'log'→'info'` remap and the `[host] args.join(' ')` rewrite in `main.ts:onHostLog`; republish preserves all fields and still fans out to legacy `extensions:host-log`.
- File path: Host `write` → `host.log` → `eventBus.publish('log.<level>')` → existing `LogFileService.enqueue` subscriber (`main.ts:995-1012`). No new subscription.
- Renderer `log.*` subscriber switches to `formatLine` so DevTools and terminal match.

## §3 — Runtime level control + SDK resync

- New `CORE_SETTINGS` entry `{ key: 'core.logLevel', type: 'enum', enumOptions: ['debug','info','warn','error'], default: 'info' }` (follows `core.theme` pattern in `settings-screen.ts:87`).
- Boot reads `getSetting('core.logLevel') ?? 'info'` into `createLogger` (replaces hardcoded `'info'` at `main.ts:86`).
- Restart-free: `settings:set` for `core.logLevel` calls `logger.setMinLevel(next)` + publishes `log.level-changed { level }`; renderer flips its threshold; `ExtensionIPC.notify('host.set-log-level', { level })` flips Host instances. Single global level, no per-extension override in v1. `Host.initialize` carries the current level for late activation.
- SDK: rewrite `scripts/sdk/templates/src/vendor/logger.ts.template` once as `ExtensionLogger extends BaseLogger` (~15 lines); `refresh` propagates to `todo-list`/`mortgage`. Zero author-code churn.
- Untouched: `event-bus.ts` internal `console.error`, `LogFileService` rotation, `finance.d.ts` re-export path.

## Files to touch (implementation, not this doc)

- New: `src/shared/base-logger.ts`
- Modify: `src/main/services/logger.ts`, `src/extension-host/api/logger.ts`, `src/renderer/logger.ts`, `src/main/resources/panel-bootstrap.ts`, `src/main/main.ts` (`onHostLog`, boot level, `settings:set` hook), `src/renderer/components/settings-screen.ts` (`CORE_SETTINGS`), `src/extension-host/host.ts` (level notify), `scripts/sdk/templates/src/vendor/logger.ts.template`, `docs/extension-api.md` (logger section), `tests/*` (new base-logger + adapter tests)

## Tests

- `base-logger.test.ts`: normalize rules, format line shape, level filtering, `log`→`info` alias
- Adapter tests: Main publishes `log.<level>` with preserved fields; Host envelope keeps `info`/`debug` distinct; renderer emits matching `formatLine`
- `manifest`/settings test: `core.logLevel` enum validates, invalid falls back to `info`
- Manual: `npm start`, set level in Settings, confirm terminal + DevTools + `logs/app.log` agree

## Self-review

1. **Placeholder scan:** no TBD/TODO; all file paths and handler names verified against current source (`main.ts:86`, `main.ts:995-1012`, `main.ts:1252`, `settings-screen.ts:87`).
2. **Internal consistency:** variadic API kept everywhere (§1) matches confirmed vote; timestamp line (§2) matches format vote; single global level (§3) matches control vote; no section contradicts another.
3. **Scope check:** single design, one implementation plan; no DAO/service/schema/UI changes.
4. **Ambiguity check:** `normalizeArgs` rule ordered (Error → context string → rest-append); `host.log` envelope field list exact; `log.level-changed` topic name fixed; SDK propagation via existing `refresh` only.
