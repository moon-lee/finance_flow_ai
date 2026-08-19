---
title: Structured Logger Implementation Plan
date: 2026-08-20
last_updated: 2026-08-20T01:03:27+10:00
status: draft
---

# Structured Logger Implementation Plan

## Overview

Replace ad-hoc `console.*` calls with a centralized `Logger` class for the Core platform (main process, extension host, renderer) and a lightweight `ExtensionLogger` utility for extensions. All structured logs are published to the existing global event bus so the renderer can surface them in DevTools. Logs are also written to a rotating JSONL file on disk and loadable in-app via a Log Viewer screen.

**Target:** Phase 8 or standalone refactor. Not tied to Phase 7.

## Why

- Main-process `console.error`/`warn`/`log` only appear in the terminal. They are invisible when the app is packaged and run by end users.
- The renderer already has DevTools visibility. The visibility gap is **main-process** and **extension-host** logs.
- The existing event bus (`finance.events.*`) already routes messages across processes. Logging is a natural consumer.
- Consistent log structure enables future features: log filtering, status bar indicators, crash diagnostics, telemetry.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Main Process                          │
│                                                              │
│  Logger (src/main/services/logger.ts)                       │
│    ├── console.error / warn / info / debug                  │
│    ├── eventBus.publish('log.<level>', payload)             │
│    └── file transport (src/main/services/log-file-service.ts)│
│         └── <userData>/logs/app.log (JSONL, 5 MB rotation)  │
│                                                              │
│  Consumers:                                                  │
│    - main.ts                                                 │
│    - extension-ipc.ts                                        │
│    - webview-panel-manager.ts                                │
│    - settings-service.ts                                     │
│    - backup-service.ts                                       │
│    - account-management.ts                                   │
│    - event-bus.ts  (keeps its own console.error)            │
├─────────────────────────────────────────────────────────────┤
│                    Extension Host                            │
│                                                              │
│  ExtensionLogger (src/extension-host/api/logger.ts)         │
│    ├── console.error / warn / info / debug                  │
│    └── finance.events.emit('log', payload)                  │
│                                                              │
│  Host itself keeps its existing console.* calls.            │
│  The host.ts monkey-patch still forwards host logs to Main. │
├─────────────────────────────────────────────────────────────┤
│                      Renderer                                │
│                                                              │
│  Subscribes to:                                              │
│    - 'log.error'  → console.error                            │
│    - 'log.warn'   → console.warn                             │
│    - 'log.info'   → console.info                             │
│    - 'log.debug'  → console.debug                            │
│                                                              │
│  Renderer keeps its own console.* calls as-is.              │
│  New subscriber in src/renderer/index.ts                    │
│                                                              │
│  Log Viewer (src/renderer/components/log-viewer.ts)         │
│    - Mounted as __logs__ view via navigation panel           │
│    - Reads via financeShell.logs.list/read IPC              │
│    - Renders JSONL entries in scrollable panel              │
└─────────────────────────────────────────────────────────────┘
```

## Event Bus Topics

| Topic | Payload | Published By | Consumed By |
|---|---|---|---|
| `log.error` | `{ message, context, error, timestamp }` | Main `Logger.error()` | Renderer DevTools |
| `log.warn` | `{ message, context, timestamp }` | Main `Logger.warn()` | Renderer DevTools |
| `log.info` | `{ message, context, timestamp }` | Main `Logger.info()` | Renderer DevTools |
| `log.debug` | `{ message, context, timestamp }` | Main `Logger.debug()` | Renderer DevTools |
| `log` | `{ level, message, context, error, timestamp }` | Extension `ExtensionLogger.*()` | Optional future consumer |

**Design rules:**
- Main process publishes to `log.<level>`.
- Extensions publish to `log` with a `level` field (one topic, easier for extensions).
- The renderer subscribes to both patterns and normalizes to the appropriate `console.*` method.
- The event bus itself keeps its internal `console.error` — it is a bootstrap concern and not a candidate for the Logger.

## Logger Interface

### Main Logger (`src/main/services/logger.ts`)

```ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogPayload {
  level: LogLevel;
  message: string;
  context?: string;
  error?: string;
  timestamp: number;
}

export class Logger {
  constructor(
    private eventBus: EventBus | null,
    private minLevel: LogLevel = 'info'
  ) {}

  error(message: string, context?: string, error?: Error): void
  warn(message: string, context?: string): void
  info(message: string, context?: string): void
  debug(message: string, context?: string): void

  setMinLevel(level: LogLevel): void
}
```

**Behavior per method:**
1. If `level` is below `minLevel`, return immediately.
2. Call the native `console.*` with the original formatting: `[${context}] ${message}`.
3. Publish to the event bus: `eventBus.publish('log.${level}', payload, 'main')`.
4. Write to the JSONL log file via `LogFileService`.

**File transport:**
- `LogFileService` writes logs to `<userData>/logs/app.log` (one JSON object per line).
- Rotation: when the file exceeds 5 MB, rename to `app.log.1`, `app.log.2`, etc., up to 10 files.
- Buffered writes: entries are queued and flushed every 500ms or immediately on `error` level.
- Sensitive data: `error.stack`, passwords, and tokens are stripped before write.

### Extension Logger (`src/extension-host/api/logger.ts`)

```ts
export class ExtensionLogger {
  constructor(private context: string) {}

  error(message: string, error?: Error): void
  warn(message: string): void
  info(message: string): void
  debug(message: string): void
}
```

**Behavior per method:**
1. Call the native `console.*` with the original formatting: `[${context}] ${message}`.
2. If `finance.events` is available, emit `log` with `{ level, message, context, error, timestamp }`.
3. Do not throw if the event bus is unavailable — logging must never break extension code.

## File Changes

### New Files

| File | Purpose |
|---|---|
| `src/main/services/logger.ts` | Main Logger class |
| `src/main/services/log-file-service.ts` | JSONL file transport with rotation |
| `src/extension-host/api/logger.ts` | ExtensionLogger utility |
| `src/renderer/components/log-viewer.ts` | Log viewer workspace view |

### Modified Files

| File | What Changes |
|---|---|
| `src/main/main.ts` | Instantiate `Logger`, pass `eventBus`, replace ~24 `console.*` calls |
| `src/main/services/extension-ipc.ts` | Replace ~8 `console.*` calls |
| `src/main/services/webview-panel-manager.ts` | Replace ~3 `console.*` calls |
| `src/main/services/extension-registry.ts` | Replace ~2 `console.*` calls |
| `src/main/services/database-service.ts` | Replace ~2 `console.*` calls |
| `src/main/services/event-bus.ts` | Keep its own `console.error` (bootstrap concern) |
| `src/main/services/backup-service.ts` | Replace ~4 `console.*` calls |
| `src/main/services/account-management.ts` | Replace `console.*` calls |
| `src/extension-host/host.ts` | Replace monkey-patch + ~12 `console.*` calls with `ExtensionLogger` |
| `src/extension-host/api/index.ts` | Export `ExtensionLogger` |
| `src/renderer/index.ts` | Add event bus subscriber for `log.*` topics |
| `src/renderer/components/navigation-panel.ts` | Add Logs nav item (`__logs__`) |
| `src/types/finance-shell.d.ts` | Add `LogsApi` with `list()` / `read(path)` |
| `src/preload/preload.ts` | Expose `financeShell.logs.*`; replace ~10 `console.log` debug statements |
| `src/preload/panel-preload.ts` | Replace ~1 `console.warn` |
| `src/shared/extension-paths.ts` | Replace ~1 `console.log` |
| `vite.extensions.config.ts` | Replace ~3 `console.warn` |
| `scripts/rename-extension-bundles.mjs` | Replace ~2 `console.log` |
| `extensions/salary-history/src/orchestrator.ts` | Replace ~8 `console.*` calls with `ExtensionLogger` |
| `extensions/salary-history/src/main.ts` | Replace ~5 `console.*` calls with `ExtensionLogger` |
| `extensions/salary-history/src/services/public-pay-adapter.ts` | Replace ~3 `console.*` calls with `ExtensionLogger` |
| `extensions/dashboard/src/orchestrator.ts` | Replace ~2 `console.*` calls with `ExtensionLogger` |
| `extensions/dashboard/src/main.ts` | Replace ~1 `console.*` calls with `ExtensionLogger` |

## Migration Scope

**Total `console.*` calls in source code: ~98**

| Layer | Count | Action |
|---|---|---|
| Main process | ~43 | Migrate to `Logger` |
| Extension Host | ~12 | Migrate to `ExtensionLogger` |
| Renderer | ~25 | Keep as-is (already visible in DevTools) |
| Extensions | ~18 | Migrate to `ExtensionLogger` |
| Preload/scripts/config | ~18 | Migrate to `Logger` or `ExtensionLogger` |
| event-bus.ts | 1 | Keep as-is (bootstrap) |
| **Total** | **~98** | **~97 migrate, 1 keep** |

## Implementation Order

### Step 1: Create Logger classes

1. Create `src/main/services/logger.ts` with `Logger` class.
2. Create `src/main/services/log-file-service.ts` with `LogFileService` class (JSONL writer, 5 MB rotation, 10-file retention).
3. Create `src/extension-host/api/logger.ts` with `ExtensionLogger` class.
4. Add `logger` to `src/extension-host/api/index.ts` exports.
5. Write unit tests:
   - `tests/unit/main/services/logger.test.ts` — verifies console output, event bus publish, min-level filtering
   - `tests/unit/main/services/log-file-service.test.ts` — verifies JSONL write, rotation trigger, retention limit
   - `tests/unit/extension-host/api/logger.test.ts` — verifies console output, event emission, graceful failure when bus is absent

### Step 2: Wire Logger into Main

1. In `src/main/main.ts`, after `eventBus` is created, instantiate:
   ```ts
   const logger = new Logger(eventBus, 'info');
   ```
2. Replace `console.*` calls in `main.ts` with `logger.*`.
3. Pass `logger` to services that need it, or have services import it directly.

**Decision point:** Should `Logger` be a singleton or injected? Recommendation: **singleton** for simplicity. Services import `logger` from `src/main/services/logger.ts` after initialization.

### Step 3: Migrate main-process services

Migrate in dependency order:

1. `src/main/services/extension-ipc.ts` — 8 calls
2. `src/main/services/webview-panel-manager.ts` — 3 calls
3. `src/main/services/extension-registry.ts` — 2 calls
4. `src/main/services/database-service.ts` — 2 calls
5. `src/main/services/backup-service.ts` — 4 calls
6. `src/main/services/account-management.ts` — replace existing calls
7. `src/main/services/settings-service.ts` — no console calls currently, but future-proof by importing logger
8. `src/main/resources/panel-bootstrap.ts` — 2 calls

### Step 4: Migrate extension host

1. In `src/extension-host/host.ts`:
   - Remove the `console.error` monkey-patch at lines 73-76.
   - Replace all `console.error`/`warn`/`log` calls with `new ExtensionLogger('host').error(...)` etc.
   - Keep the `forwardLog` call inside `ExtensionLogger.error` so host logs still reach Main via the existing `host.log` notification.
2. Other host files have no console calls.

### Step 5: Migrate extensions

Update each extension to import and use `ExtensionLogger`:

1. `extensions/salary-history/src/orchestrator.ts` — 8 calls
2. `extensions/salary-history/src/main.ts` — 5 calls
3. `extensions/salary-history/src/services/public-pay-adapter.ts` — 3 calls
4. `extensions/dashboard/src/orchestrator.ts` — 2 calls
5. `extensions/dashboard/src/main.ts` — 1 call

Pattern:
```ts
import { ExtensionLogger } from 'finance-shell/src/extension-host/api/logger';
const logger = new ExtensionLogger('salary-history');
```

### Step 6: Migrate preload and build scripts

1. `src/preload/preload.ts` — remove or downgrade debug `console.log` statements to `logger.debug`
2. `src/preload/panel-preload.ts` — replace `console.warn` with `logger.warn`
3. `src/shared/extension-paths.ts` — replace `console.log` with `logger.debug`
4. `vite.extensions.config.ts` — replace `console.warn` with `logger.warn`
5. `scripts/rename-extension-bundles.mjs` — replace `console.log` with `logger.info`

### Step 7: Renderer subscriber

In `src/renderer/index.ts`, add a single subscriber that routes event bus log entries to the appropriate console method:

```ts
const logHandlers: Record<string, (entry: LogPayload) => void> = {
  'log.error': (entry) => console.error(`[${entry.context}] ${entry.message}`, entry.error ?? ''),
  'log.warn': (entry) => console.warn(`[${entry.context}] ${entry.message}`),
  'log.info': (entry) => console.info(`[${entry.context}] ${entry.message}`),
  'log.debug': (entry) => console.debug(`[${entry.context}] ${entry.message}`),
};

window.financeShell?.events?.on('log.error', (entry) => logHandlers['log.error'](entry));
window.financeShell?.events?.on('log.warn', (entry) => logHandlers['log.warn'](entry));
window.financeShell?.events?.on('log.info', (entry) => logHandlers['log.info'](entry));
window.financeShell?.events?.on('log.debug', (entry) => logHandlers['log.debug'](entry));

// Extension log topic (single topic with level field)
window.financeShell?.events?.on('log', (entry) => {
  const handler = logHandlers[`log.${entry.level}`];
  if (handler) handler(entry);
});
```

Renderer-side `console.*` calls in `index.ts`, `workspace.ts`, and `settings-screen.ts` remain as-is.

### Step 7: Log file transport

1. `LogFileService` writes to `<userData>/logs/app.log` in JSONL format.
2. Rotation renames to `app.log.1` through `app.log.10` when size exceeds 5 MB.
3. `Logger` delegates to `LogFileService` after console + event bus publish.
4. Add `logs:list` and `logs:read` IPC handlers in `src/main/main.ts`:
   - `logs:list` returns `[{ path, size, mtime }]` for rotated log files
   - `logs:read` returns parsed JSONL entries for a given file path
5. Expose `financeShell.logs.list()` and `financeShell.logs.read(path)` in preload and types.

### Step 8: Log viewer UI

1. Create `src/renderer/components/log-viewer.ts`:
   - LitElement mounted as `__logs__` workspace view
   - Calls `financeShell.logs.list()` to show available log files
   - Calls `financeShell.logs.read(path)` to display entries in a scrollable, filterable list
   - Renders timestamp, level, context, message, and error stack
2. Add `Logs` nav item to `navigation-panel.ts` (`command: '__logs__'`, group: 'General')
3. Wire `__logs__` into `src/renderer/index.ts`:
   - Mount `log-viewer` into `#workspace` when `view === '__logs__'`
   - Call `overlayCoordinator.showOverlay('logs')` / `hideOverlay('logs')` if panels should hide while viewing logs
4. Add `LogsApi` to `src/types/finance-shell.d.ts`

### Step 9: Type definitions

1. Add `LogPayload` and `LogLevel` to `src/types/finance.d.ts` or `src/types/finance-shell.d.ts`.
2. Document `log.error`, `log.warn`, `log.info`, `log.debug`, and `log` event topics in `finance.d.ts`.

### Step 10: Tests

**Unit tests:**
- `tests/unit/main/services/logger.test.ts`:
  - `error publishes to eventBus with correct payload`
  - `warn publishes to eventBus with correct payload`
  - `info does not publish when minLevel is 'warn'`
  - `debug does not publish when minLevel is 'info'`
  - `setMinLevel changes filtering`

- `tests/unit/extension-host/api/logger.test.ts`:
  - `error logs to console and emits finance.events`
  - `warn logs to console`
  - `does not throw when finance.events is unavailable`

**Regression tests:**
- Run full test suite after migration: `npm run test`
- Verify no `console.*` calls remain in migrated files (grep check).

## Verification Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes (all existing tests + new logger + log-file-service tests)
- [ ] Manual: trigger a settings change → info toast appears → info log appears in renderer DevTools
- [ ] Manual: trigger an auto-save failure → error toast appears → error log appears in renderer DevTools
- [ ] Manual: disable an extension → warn log appears in renderer DevTools
- [ ] Manual: packaged app logs still appear in terminal (main process)
- [ ] Manual: extension host logs still appear in renderer DevTools via `[host log]` prefix
- [ ] Manual: `<userData>/logs/app.log` is created and contains JSONL entries
- [ ] Manual: trigger 10 MB of logs → verify `app.log.1` through `app.log.10` exist, older files deleted
- [ ] Manual: open Logs view in app → log files are listed, entries render with timestamp/level/message
- [ ] Manual: click a log file → entries load and scroll
- [ ] Grep check: no `console.error` / `console.warn` / `console.log` remain in `src/main/`, `src/extension-host/`, `extensions/`

## Out of Scope

- Do not migrate renderer `console.*` calls. They already reach DevTools.
- Do not remove the `host.ts` `host.log` forwarding path. `ExtensionLogger` coexists with it.
- Do not add log filtering UI, log search, or log export/sharing. Those are Phase 8+ features.
- Do not change `event-bus.ts`'s internal `console.error`. It is a bootstrap concern.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Logger initialization order — bus not ready when first log fires | Logger accepts `EventBus | null` and skips publish when null. Main initializes Logger after `eventBus` is created. |
| Extension `finance.events` not available during early activation | `ExtensionLogger` catches emit errors and falls back to `console.*` only. |
| Performance — high-frequency logs flooding the bus | `minLevel` defaults to `'info'`. Debug logs are suppressed in production. Consider adding a rate limiter if needed later. |
| Circular dependency — event-bus.ts uses `console.error` | `event-bus.ts` keeps its own `console.error`. Logger is a consumer, not a dependency. |
| Extensions break if `finance.events` API changes | `ExtensionLogger` is a thin wrapper. If the events API changes, only this file needs updating. |
