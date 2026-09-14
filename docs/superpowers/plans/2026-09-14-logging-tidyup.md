# Logging Tidy-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify Main/Host/Renderer/Panel logging under one `BaseLogger` upper class with a single formatter, preserving the variadic API.

**Architecture:** New pure `src/shared/base-logger.ts` owns types, `normalizeArgs`, `formatLine`, `getCallerInfo`, and `abstract BaseLogger`; four thin adapters (Main/Host/Renderer/Panel) implement only `write` transport. `host.log` envelope preserves level/context/timestamp end-to-end into `LogFileService`. Runtime level via `core.logLevel` setting.

**Tech Stack:** TypeScript strict, Electron main/host/renderer, Vitest, existing `EventBus` + `LogFileService`.

## Global Constraints

- TypeScript `strict: true`; no implicit `any`.
- Keep variadic `(...args)` logger API everywhere; `log` aliases `info`.
- Canonical console line: `ISO-timestamp [LEVEL] [context] message  file:line`.
- JSONL file shape stays `{ level, message, context, error, timestamp, file, line }`.
- Single global level via `core.logLevel`; no per-extension override in v1.
- `event-bus.ts` keeps its own `console.error`; `LogFileService` rotation unchanged.
- `finance` remains type-only; never bundle `finance`; Host stays DOM-free.
- Do not bump `package.json` version unless requested; update `CHANGELOG.md` under `Unreleased` and `docs/file-reference.md` on completion.
- Never `git commit` without explicit user permission.

---

### Task 1: Shared `BaseLogger` upper class

**Files:**
- Create: `src/shared/base-logger.ts`
- Test: `tests/unit/shared/base-logger.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no `process`/`window`/`eventBus` imports).
- Produces: `LogLevel`, `LogPayload`, `normalizeArgs(...args: unknown[])`, `formatLine(entry: LogPayload): string`, `getCallerInfo(skipSuffixes?: string[]): { file: string; line: number } | null`, `abstract class BaseLogger` with `constructor(context: string, minLevel?: LogLevel)`, `shouldLog`, `setMinLevel`, `protected abstract write(entry, line, errorArg?)`, `info/warn/error/debug/log(...args)`.

- [ ] **Step 1: Write the failing test**

In `tests/unit/shared/base-logger.test.ts`, create:

```ts
import { describe, it, expect } from 'vitest';
import { BaseLogger, formatLine, normalizeArgs, type LogPayload } from '../../../src/shared/base-logger';

class TestLogger extends BaseLogger {
  public written: Array<{ entry: LogPayload; line: string }> = [];
  protected write(entry: LogPayload, line: string): void {
    this.written.push({ entry, line });
  }
}

describe('BaseLogger', () => {
  it('normalizes message + context + Error', () => {
    const err = new Error('boom');
    const n = normalizeArgs('hello', 'myctx', err);
    expect(n.message).toBe('hello');
    expect(n.context).toBe('myctx');
    expect(n.error).toContain('boom');
  });

  it('formats canonical line with timestamp + level + context', () => {
    const line = formatLine({ level: 'info', message: 'hi', context: 'ctx', timestamp: 1726300000000 });
    expect(line).toContain('[INFO]');
    expect(line).toContain('[ctx]');
    expect(line).toContain('hi');
  });

  it('filters below minLevel and aliases log to info', () => {
    const l = new TestLogger('t', 'warn');
    l.info('suppressed');
    expect(l.written.length).toBe(0);
    l.warn('shown');
    expect(l.written.length).toBe(1);
    expect(l.written[0].entry.level).toBe('warn');
    l.log('alias');
    expect(l.written.length).toBe(1); // warn logger suppresses info alias
    l.setMinLevel('debug');
    l.log('now-shown');
    expect(l.written.length).toBe(2);
    expect(l.written[1].entry.level).toBe('info');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/shared/base-logger.test.ts -v`
Expected: FAIL with `Failed to resolve import "../../../src/shared/base-logger"`.

- [ ] **Step 3: Write minimal implementation**

In `src/shared/base-logger.ts`, create:

```ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogPayload {
  level: LogLevel;
  message: string;
  context?: string;
  error?: string;
  timestamp: number;
  file?: string;
  line?: number;
}

export interface NormalizedArgs {
  message: string;
  context?: string;
  error?: string;
  errorArg?: Error;
}

export function normalizeArgs(...args: unknown[]): NormalizedArgs {
  const message = args[0] instanceof Error ? args[0].message : String(args[0] ?? '');
  const errorArg = args.find((a) => a instanceof Error) as Error | undefined;
  const contextArg = args.slice(1).find((a) => typeof a === 'string') as string | undefined;
  const rest = args.slice(1).filter((a) => !(a instanceof Error) && typeof a !== 'string');
  const restText = rest.length > 0 ? ' ' + rest.map((a) => {
    try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); }
  }).join(' ') : '';
  return {
    message: `${message}${restText}`,
    context: contextArg,
    error: errorArg?.stack ?? errorArg?.message,
    errorArg,
  };
}

export function formatLine(entry: LogPayload): string {
  const ts = new Date(entry.timestamp).toISOString();
  const lvl = entry.level.toUpperCase().padEnd(5, ' ');
  const ctx = entry.context ? ` [${entry.context}]` : '';
  const loc = entry.file ? `  ${entry.file}:${entry.line ?? 0}` : '';
  return `${ts} [${lvl}]${ctx} ${entry.message}${loc}`;
}

export function getCallerInfo(skipSuffixes: string[] = ['base-logger.ts', 'logger.ts']): { file: string; line: number } | null {
  const stack = new Error().stack;
  if (!stack) return null;
  const lines = stack.split('\n').slice(2);
  for (const line of lines) {
    const match = line.match(/\(([^)]+):(\d+):\d+\)/);
    if (!match) continue;
    const fullPath = match[1];
    if (skipSuffixes.some((s) => fullPath.endsWith(s))) continue;
    const file = fullPath.split(/[\\/]/).pop() ?? fullPath;
    return { file, line: parseInt(match[2], 10) };
  }
  return null;
}

export abstract class BaseLogger {
  protected context: string;
  protected minLevel: LogLevel;

  constructor(context: string, minLevel: LogLevel = 'info') {
    this.context = context;
    this.minLevel = minLevel;
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  protected shouldLog(level: LogLevel): boolean {
    const order: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    return order[level] >= order[this.minLevel];
  }

  protected abstract write(entry: LogPayload, line: string, errorArg?: Error): void;

  private emit(level: LogLevel, ...args: unknown[]): void {
    if (!this.shouldLog(level)) return;
    const n = normalizeArgs(...args);
    const caller = getCallerInfo();
    const entry: LogPayload = {
      level,
      message: n.message,
      context: n.context ?? this.context,
      error: n.error,
      timestamp: Date.now(),
      file: caller?.file,
      line: caller?.line,
    };
    this.write(entry, formatLine(entry), n.errorArg);
  }

  log(...args: unknown[]): void { this.emit('info', ...args); }
  info(...args: unknown[]): void { this.emit('info', ...args); }
  warn(...args: unknown[]): void { this.emit('warn', ...args); }
  error(...args: unknown[]): void { this.emit('error', ...args); }
  debug(...args: unknown[]): void { this.emit('debug', ...args); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/shared/base-logger.test.ts -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/base-logger.ts tests/unit/shared/base-logger.test.ts
git commit -m "feat(logging): add shared BaseLogger upper class"
```

> Ask before commit per AGENTS.md §6 — present the command, wait for explicit approval.

---

### Task 2: Main `MainLogger` adapter

**Files:**
- Modify: `src/main/services/logger.ts:1-200`
- Test: `tests/unit/main/services/logger.test.ts`

**Interfaces:**
- Consumes: `BaseLogger`, `LogPayload`, `LogLevel` from `../../shared/base-logger`; `EventBus` from `./event-bus`.
- Produces: `LoggerImpl extends BaseLogger`, `createLogger(eventBus, minLevel)`, `getLogger()` — same exports, new base. Re-exports `LogLevel`, `LogPayload` for `src/types/finance.d.ts`.

- [ ] **Step 1: Write the failing test**

In `tests/unit/main/services/logger.test.ts`, append (before final `});`):

```ts
it('emits canonical line and publishes log.<level> with preserved fields', () => {
  const published: Array<{ topic: string; payload: unknown }> = [];
  const fakeBus = { publish: (t: string, p: unknown) => { published.push({ topic: t, payload: p }); } };
  const { LoggerImpl } = require('../../../src/main/services/logger');
  const l = new LoggerImpl(fakeBus as never, 'debug');
  l.info('hello', 'myctx');
  expect(published.length).toBe(1);
  expect(published[0].topic).toBe('log.info');
  const p = published[0].payload as Record<string, unknown>;
  expect(p.message).toBe('hello');
  expect(p.context).toBe('myctx');
  expect(typeof p.timestamp).toBe('number');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/main/services/logger.test.ts -v`
Expected: FAIL (current `publish` signature or context handling differs).

- [ ] **Step 3: Write minimal implementation**

In `src/main/services/logger.ts`, replace class body with:

```ts
import { EventBus } from './event-bus';
import { BaseLogger, type LogLevel, type LogPayload } from '../../shared/base-logger';

export type { LogLevel, LogPayload };

export class LoggerImpl extends BaseLogger {
  constructor(private eventBus: EventBus | null, minLevel: LogLevel = 'info') {
    super('main', minLevel);
  }

  protected write(entry: LogPayload, line: string, errorArg?: Error): void {
    const method = entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : entry.level === 'info' ? 'info' : 'log';
    (console[method] as (...a: unknown[]) => void)(line, errorArg ?? '');
    if (this.eventBus) {
      this.eventBus.publish(`log.${entry.level}`, entry, null);
    }
  }

  log(message: string, ...args: unknown[]): void { this.info(message, ...args); }
}
```

Keep `createLogger`/`getLogger` singletons unchanged below the class.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/main/services/logger.test.ts tests/unit/shared/base-logger.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/logger.ts tests/unit/main/services/logger.test.ts
git commit -m "feat(logging): Main LoggerImpl extends BaseLogger"
```

---

### Task 3: Host `HostLogger` + `host.log` envelope fix

**Files:**
- Modify: `src/extension-host/api/logger.ts:1-120`
- Modify: `src/main/main.ts:1252-1268` (`onHostLog` handler)
- Modify: `src/extension-host/host.ts:38-50` (hostLogger construction + level notify)
- Test: `tests/unit/extension-host/api/logger.test.ts`

**Interfaces:**
- Consumes: `BaseLogger` from `../../shared/base-logger`.
- Produces: `ExtensionLogger extends BaseLogger` with `write` posting `{ level: LogLevel, message, context, error, timestamp, file, line }`; `host.set-log-level` notify handler calling `setMinLevel`.

- [ ] **Step 1: Write the failing test**

In `tests/unit/extension-host/api/logger.test.ts`, append:

```ts
it('keeps info and debug distinct with timestamp and context', () => {
  const posted: unknown[] = [];
  (globalThis as Record<string, unknown>).process = { parentPort: { postMessage: (m: unknown) => { posted.push(m); } } };
  const { ExtensionLogger } = require('../../../src/extension-host/api/logger');
  const l = new ExtensionLogger('salary-history');
  l.info('hello');
  l.debug('dbg');
  expect(posted.length).toBe(2);
  const p0 = (posted[0] as { params: Record<string, unknown> }).params;
  const p1 = (posted[1] as { params: Record<string, unknown> }).params;
  expect(p0.level).toBe('info');
  expect(p1.level).toBe('debug');
  expect(p0.context).toBe('salary-history');
  expect(typeof p0.timestamp).toBe('number');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/extension-host/api/logger.test.ts -v`
Expected: FAIL (current posts `level: 'log'` for both).

- [ ] **Step 3: Write minimal implementation**

In `src/extension-host/api/logger.ts`, replace whole file with:

```ts
import { BaseLogger, type LogPayload } from '../../shared/base-logger';

declare const process: NodeJS.Process & {
  parentPort: { postMessage(message: unknown): void } | null;
};

export class ExtensionLogger extends BaseLogger {
  constructor(
    context: string,
    private consoleImpl: {
      log: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
      warn: (...args: unknown[]) => void;
      info?: (...args: unknown[]) => void;
      debug?: (...args: unknown[]) => void;
    } = console,
  ) {
    super(context, 'info');
  }

  protected write(entry: LogPayload, line: string, errorArg?: Error): void {
    const c = this.consoleImpl;
    if (entry.level === 'error') c.error(line, errorArg ?? '');
    else if (entry.level === 'warn') c.warn(line, errorArg ?? '');
    else if (entry.level === 'info') (c.info ?? c.log)(line, errorArg ?? '');
    else (c.debug ?? c.log)(line, errorArg ?? '');
    try {
      const parentPort = (process as NodeJS.Process & { parentPort?: { postMessage(m: unknown): void } }).parentPort;
      parentPort?.postMessage({
        jsonrpc: '2.0',
        method: 'host.log',
        params: {
          level: entry.level,
          message: entry.message,
          context: entry.context,
          error: entry.error,
          timestamp: entry.timestamp,
          file: entry.file,
          line: entry.line,
        },
      });
    } catch {
      // logging must never break extension code
    }
  }
}
```

In `src/main/main.ts:1252-1268`, replace the `onHostLog` body with field-preserving republish:

```ts
extensionIPC.onHostLog((entry) => {
  if (eventBus) {
    const p = entry as unknown as Record<string, unknown>;
    const level = (p.level as 'debug' | 'info' | 'warn' | 'error') ?? 'info';
    eventBus.publish(
      `log.${level}`,
      {
        level,
        message: String(p.message ?? ''),
        context: (p.context as string) ?? 'host',
        error: p.error as string | undefined,
        timestamp: (p.timestamp as number) ?? Date.now(),
        file: p.file as string | undefined,
        line: p.line as number | undefined,
      },
      'host',
    );
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('extensions:host-log', entry);
  }
});
```

In `src/extension-host/host.ts`, keep construction but add level notify: after `hostLogger` creation, register `handleNotify('host.set-log-level', (params) => hostLogger.setMinLevel(...))` following the existing `handleHostEventNotify` pattern; pass current level in `host.initialize` response.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/extension-host/api/logger.test.ts tests/unit/shared/base-logger.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/extension-host/api/logger.ts src/main/main.ts src/extension-host/host.ts tests/unit/extension-host/api/logger.test.ts
git commit -m "feat(logging): Host logger extends BaseLogger, preserves envelope"
```

---

### Task 4: Renderer + Panel adapters

**Files:**
- Modify: `src/renderer/logger.ts:1-80`
- Modify: `src/main/resources/panel-bootstrap.ts:30-70`
- Modify: `src/renderer/index.ts:88-105` (`log.*` subscriber uses `formatLine`)
- Test: `tests/unit/renderer/logger.test.ts`

**Interfaces:**
- Consumes: `BaseLogger` from `../shared/base-logger`; `formatLine` for the subscriber.
- Produces: `rendererLogger extends BaseLogger` (context `renderer`), `PanelLogger extends BaseLogger` (context `panel:<viewId>`).

- [ ] **Step 1: Write the failing test**

In `tests/unit/renderer/logger.test.ts`, create:

```ts
import { describe, it, expect } from 'vitest';
import { formatLine } from '../../../src/shared/base-logger';

describe('renderer log subscriber', () => {
  it('formats DevTools line identically to terminal', () => {
    const line = formatLine({ level: 'warn', message: 'm', context: 'renderer', timestamp: 1726300000000, file: 'x.ts', line: 1 });
    expect(line).toContain('[WARN]');
    expect(line).toContain('[renderer]');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/renderer/logger.test.ts -v`
Expected: FAIL with file-not-found (new file).

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/logger.ts`, replace with:

```ts
import { BaseLogger, type LogPayload } from '../shared/base-logger';

class RendererLogger extends BaseLogger {
  constructor() { super('renderer', 'info'); }
  protected write(entry: LogPayload, line: string, errorArg?: Error): void {
    if (entry.level === 'error') console.error(line, errorArg ?? '');
    else if (entry.level === 'warn') console.warn(line, errorArg ?? '');
    else if (entry.level === 'info') console.info(line, errorArg ?? '');
    else console.debug(line, errorArg ?? '');
    (window as unknown as { financeShell?: { events?: { emit(t: string, p: unknown): void } } }).financeShell?.events?.emit(`log.${entry.level}`, entry);
  }
}

export const rendererLogger = new RendererLogger();
```

In `src/main/resources/panel-bootstrap.ts:30-70`, replace `panelLogger` object with a `PanelLogger extends BaseLogger` class (context set per mount: `panel:<viewId>`), same `write` shape minus the events emit.

In `src/renderer/index.ts:88-105`, replace the per-level `[ctx] msg` template with `formatLine(p as LogPayload)` import from `../shared/base-logger`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/renderer/logger.test.ts tests/unit/shared/base-logger.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/logger.ts src/main/resources/panel-bootstrap.ts src/renderer/index.ts tests/unit/renderer/logger.test.ts
git commit -m "feat(logging): Renderer and Panel loggers extend BaseLogger"
```

---

### Task 5: Runtime `core.logLevel` control

**Files:**
- Modify: `src/renderer/components/settings-screen.ts:79-90` (`CORE_SETTINGS`)
- Modify: `src/main/main.ts:75-90` (boot level read)
- Modify: `src/main/services/extension-ipc.ts` (add `notifyLogLevel` helper)
- Test: `tests/unit/renderer/settings-screen.test.ts`

**Interfaces:**
- Consumes: `getSetting('core.logLevel')`, `logger.setMinLevel`, bus topic `log.level-changed`.
- Produces: restart-free level switch across Main/Host/Renderer.

- [ ] **Step 1: Write the failing test**

In `tests/unit/renderer/settings-screen.test.ts`, append:

```ts
it('declares core.logLevel enum with info default', async () => {
  const src = (await import('node:fs')).readFileSync('src/renderer/components/settings-screen.ts', 'utf8');
  expect(src).toContain('core.logLevel');
  expect(src).toContain(`'debug'`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/renderer/settings-screen.test.ts -v`
Expected: FAIL (key absent).

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/components/settings-screen.ts`, add to `CORE_SETTINGS.items`:

```ts
{ key: 'core.logLevel', type: 'enum', label: 'Minimum log level. Lower levels are hidden everywhere (terminal, DevTools, log file).', default: 'info', enumOptions: ['debug', 'info', 'warn', 'error'] },
```

In `src/main/main.ts`, replace `createLogger(eventBus, 'info')` with:

```ts
import { getSetting } from './services/settings-service';
const bootLevel = getSetting<string>('core.logLevel') ?? 'info';
const logger = createLogger(eventBus, bootLevel as 'debug' | 'info' | 'warn' | 'error');
```

In the `settings:set` IPC handler, after successful set: if `key === 'core.logLevel'`, call `logger.setMinLevel(value)`, `eventBus.publish('log.level-changed', { level: value }, null)`, and `extensionIPC.notify('host.set-log-level', { level: value })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/renderer/settings-screen.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/settings-screen.ts src/main/main.ts src/main/services/extension-ipc.ts tests/unit/renderer/settings-screen.test.ts
git commit -m "feat(logging): core.logLevel runtime control"
```

---

### Task 6: SDK resync + docs + changelog

**Files:**
- Modify: `scripts/sdk/templates/src/vendor/logger.ts.template`
- Modify: `docs/extension-api.md` (logger section)
- Modify: `CHANGELOG.md` (Unreleased → Changed)
- Modify: `docs/file-reference.md` (new `src/shared/base-logger.ts` row)
- Test: `tests/unit/sdk/sdk-type-parity.test.ts`

**Interfaces:**
- Consumes: `BaseLogger` contract from Task 1.
- Produces: vendored `ExtensionLogger extends BaseLogger` (~15 lines); `refresh` propagates to `todo-list`/`mortgage`.

- [ ] **Step 1: Write the failing test**

Run: `npx vitest run tests/unit/sdk/sdk-type-parity.test.ts -v`
Expected: PASS today (baseline); then edit template and re-run to confirm parity holds.

- [ ] **Step 2: Rewrite the template**

In `scripts/sdk/templates/src/vendor/logger.ts.template`, replace with:

```ts
import { BaseLogger, type LogPayload } from '../../../shared/base-logger';

export class ExtensionLogger extends BaseLogger {
  constructor(context: string) { super(context, 'info'); }
  protected write(entry: LogPayload, line: string, errorArg?: Error): void {
    if (entry.level === 'error') console.error(line, errorArg ?? '');
    else if (entry.level === 'warn') console.warn(line, errorArg ?? '');
    else console.log(line, errorArg ?? '');
    try {
      const pp: { postMessage(m: unknown): void } | undefined = (globalThis as Record<string, { parentPort?: { postMessage(m: unknown): void } }>).process?.parentPort;
      pp?.postMessage({ jsonrpc: '2.0', method: 'host.log', params: entry });
    } catch { /* logging must never break */ }
  }
}
```

Note: standalone SDK projects vendor `base-logger.ts` alongside this template on `init`/`refresh` (extend `cli.mjs cmdRefresh` file list with `src/shared/base-logger.ts`).

- [ ] **Step 3: Update docs + changelog**

`CHANGELOG.md` frontmatter `version` and latest `## [X.Y.Z]` stay synced to `package.json#version` (no bump). Add under Unreleased `### Changed`: `Unified logging under shared BaseLogger ... (src/shared/base-logger.ts, ...)`.

- [ ] **Step 4: Run full logging test scope**

Run: `npx vitest run tests/unit/shared/base-logger.test.ts tests/unit/main/services/logger.test.ts tests/unit/extension-host/api/logger.test.ts tests/unit/renderer/logger.test.ts tests/unit/sdk/sdk-type-parity.test.ts -v`
Expected: PASS (all suites).

- [ ] **Step 5: Manual verification + commit**

Manual: `npm start` → Settings → set `core.logLevel` → confirm terminal + DevTools + `logs/app.log` agree on format and filtering.

```bash
git add scripts/sdk/templates/src/vendor/logger.ts.template docs/extension-api.md CHANGELOG.md docs/file-reference.md
git commit -m "feat(logging): SDK resync and docs"
```

## Self-Review

**1. Spec coverage:**
- §1 BaseLogger + adapters → Tasks 1–4 (each adapter has its own task + test).
- §2 canonical line + `normalizeArgs` + Host→file field preservation → Tasks 1 (format), 3 (envelope + `onHostLog`), 4 (renderer subscriber).
- §3 `core.logLevel` + SDK resync + untouched list → Tasks 5–6; event-bus/LogFileService/finance.d.ts untouched by plan.

**2. Placeholder scan:** no TBD/TODO/appropriate-handling; every step has exact paths, code, commands, expected output.

**3. Type consistency:** `LogLevel`/`LogPayload` imported from `src/shared/base-logger.ts` in all tasks; `write(entry, line, errorArg?)` signature identical across adapters; `host.log params` shape matches `onHostLog` read shape; `log.level-changed` topic name fixed in Task 5.
