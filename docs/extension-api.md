# Extension API Reference

> **Status:** Phase 3 skeleton. Documents the API surface as it exists after Phase 3 (the Extension Host & IPC Scaffolding milestone). Phase 4+ will fill in the `finance.db.*` and `finance.ai.*` implementations; Phase 5 will harden the security model. Items marked **(stub)** are functional but return empty or no-op results in Phase 3.

This document is the canonical reference for extension authors. It covers:

1. [Manifest schema](#1-manifest-schema)
2. [Activation events](#2-activation-events)
3. [The `finance.*` API surface](#3-the-finance-api-surface)
4. [Lifecycle hooks](#4-lifecycle-hooks)
5. [Loading mechanism](#5-loading-mechanism)
6. [Error handling](#6-error-handling)
7. [Security model](#7-security-model)
8. [Working example: `salary-history`](#8-working-example-salary-history)
9. [Phase 4+ migration notes](#9-phase-4-migration-notes)

---

## 1. Manifest schema

Every extension has a `package.json` at its root with a `financeExtension` field. The full TypeScript type lives in [`src/types/finance.dts`](src/types/finance.d.ts); runtime validation lives in [`src/extension-host/manifest-schema.ts`](src/extension-host/manifest-schema.ts) (Zod, strict mode).

```typescript
interface FinanceExtensionManifest {
  id: string;                          // globally unique; lowercase + hyphen
  displayName: string;                 // human-readable
  version: string;                     // semver
  description?: string;
  dependencies?: string[];             // other extension ids
  activationEvents: ActivationEvent[]; // at least one required
  contributions: {
    views?: ManifestViewContribution[];
    commands?: ManifestCommandContribution[];
    menus?: ManifestMenuContribution[];           // (UI deferred to Phase 5)
    configuration?: ManifestConfigurationContribution[]; // (UI deferred to Phase 7)
  };
  main: string;                        // path to entry, relative to extension root
}
```

**Discovery rules** (enforced by `ExtensionLoader` in `src/main/services/extension-loader.ts`):

- `package.json#name` must equal `financeExtension.id`. Mismatches are skipped with a warning.
- `package.json#version` is used as the fallback if `financeExtension.version` is omitted.
- Directories named `node_modules` or `dist` are skipped.
- Invalid manifests (failed Zod validation) are skipped with a warning; other extensions still load.

**Manifests with unknown top-level keys are rejected** (strict mode). This prevents typos from silently no-op'ing.

---

## 2. Activation events

Extensions activate when one of their `activationEvents` fires. Phase 3 supports two trigger kinds:

| Pattern              | Fires when                                               |
| -------------------- | -------------------------------------------------------- |
| `*`                  | Immediately on app startup (use sparingly)               |
| `onView:<viewId>`    | The user activates a view with `<viewId>` in the Activity Bar |

Future trigger kinds (deferred to later phases):

- `onCommand:<commandId>` — Phase 4+
- `onSettings:<namespace>` — Phase 7
- `onWorkspaceOpen` — Phase 5

Once activated, an extension stays active until app shutdown. Re-activation is a no-op (the in-memory `activeExtensions` map dedupes by extension id).

---

## 3. The `finance.*` API surface

Extensions receive the `finance` object as the only argument to their `activate(finance)` function. The shape is:

```typescript
interface FinanceApi {
  commands: {
    registerCommand(id: string, title: string, handler: CommandHandler, keybinding?: string): void;
    execute(id: string, ...args: unknown[]): Promise<unknown>;
  };
  db: {
    table(name: string): QueryChain; // (stub in Phase 3)
  };
  ai: {
    registerTool(tool: ToolDefinition): void; // (stub in Phase 3)
  };
}
```

### 3.1 `finance.commands`

**`registerCommand(id, title, handler, keybinding?)`** — Register a command that the Command Palette can invoke. Phase 3 surfaces registered commands in the Command Palette under an "Extensions" group. The `keybinding` argument is accepted but **not enforced** in Phase 3; it is registered for Phase 7's keyboard-shortcut layer.

**Contract:**

- `id` must be unique across all installed extensions. Re-registering an existing id throws.
- `title` is the human-readable label shown in the Command Palette.
- `handler` receives the args passed to `execute(id, ...args)` and returns anything (sync or async).
- The `deactivate()` lifecycle hook can dispose of any side effects the handler set up.

**`execute(id, ...args)`** — Run a command by id. Returns the handler's return value, or `null` if the command is not registered. **Never throws** on missing commands — this is the vision's "graceful degradation" rule (`project_vision.md:46`). Other failures (handler throws) bubble up as a rejected promise.

### 3.2 `finance.db.table(name)` **(stub in Phase 3)**

Returns a query chain for the named table. Phase 3 returns shape-correct empty queryables; Phase 4 replaces them with real DAO access.

```typescript
interface QueryChain {
  find(filter?: unknown): Promise<unknown[]>;
  findOne(filter?: unknown): Promise<unknown | null>;
  insert(record: unknown): Promise<{ id: number | string }>;
  update(filter: unknown, patch: unknown): Promise<{ updated: number }>;
  delete(filter: unknown): Promise<{ deleted: number }>;
}
```

**Phase 4 will define** the filter semantics, the namespace isolation rules (per `project_vision.md:48`), and the error shapes. Extensions that call `finance.db.table()` in Phase 3 should treat the result as "empty for now" — Phase 4 changes the data, not the contract.

### 3.3 `finance.ai.registerTool(tool)` **(stub in Phase 3)**

Stores a tool definition so the future AI Assistant panel (Phase 6) can resolve it. Phase 3 logs the registration and stores it in-memory; Phase 6 adds execution and the LLM provider plumbing.

```typescript
interface ToolDefinition {
  name: string;         // unique tool id
  description: string;  // human-readable for the LLM prompt
  parameters: unknown;  // JSON Schema for the tool's args
  handler: (args: unknown) => Promise<unknown> | unknown;
}
```

---

## 4. Lifecycle hooks

Every extension exports two functions: `activate` (required) and `deactivate` (optional).

```typescript
export async function activate(finance: FinanceApi): Promise<void> {
  // One-time setup: register commands, register tools, initialise state.
}

export function deactivate(): void {
  // Cleanup: dispose of listeners, abort in-flight requests, flush buffers.
  // Called when the Extension Host receives a `host.shutdown` notification
  // (graceful app quit) or — in Phase 5+ — an `extension.deactivate`
  // notification (runtime disable from the Extension Manager UI).
}
```

**Activation is idempotent.** Calling `activate` twice for the same extension is a no-op (the second call short-circuits in `ExtensionHost.activateExtension`).

**Deactivation is best-effort.** If `deactivate` throws, the error is logged and other extensions still get their `deactivate` calls. The Host then exits.

---

## 5. Loading mechanism

Extensions are **bundled at build time** (Decision 10 + ADR-0004). The build pipeline produces `dist/extensions/<id>.js` from `extensions/<id>/src/main.ts`. The Extension Host loads each extension via dynamic `import()`:

```typescript
// In src/extension-host/host.ts (Phase 3)
const extensionsBundleRoot = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '..',
  'extensions'
);
const entryPath = path.join(extensionsBundleRoot, `${extensionId}.js`);
const extModule = await import(url.pathToFileURL(entryPath).href);
await extModule.activate(finance);
```

**Phase 3 contract:** extensions receive `finance` as a parameter to `activate()`. They do not `import 'finance'` themselves. The rationale is documented in the Phase 3 plan's Decision 9 and the handoff doc's "Decision 9 reframing".

**Phase 4+ migration target:** When a real multi-file extension is built, decide between (a) implementing `import * as finance from 'finance'` via a Node loader hook in the Host, or (b) publishing `finance.d.ts` as a typed SDK package that extensions import for types while still receiving the API as an `activate(finance)` parameter.

---

## 6. Error handling

| Failure mode                         | Behaviour                                                |
| ------------------------------------ | -------------------------------------------------------- |
| Missing manifest                     | Extension skipped at discovery; warning logged           |
| Invalid manifest (Zod failure)       | Extension skipped; other errors listed in warning        |
| `main` file missing or fails to load | `activateExtension` returns `false`; extension stays `active: false` |
| `activate` throws                    | Error logged; extension stays `active: false`; **crash count incremented** |
| `registerCommand` called with duplicate id | Throws synchronously inside `activate`              |
| `commands.execute(unknownId)`        | Returns `null`; never throws                             |
| Host process crashes                 | Main detects via `utilityProcess` 'exit' event; re-spawns on next interaction |

**Crash diagnostics (Phase 3+):** Activation failures increment `extension_registry.crash_count` and persist the error message in `last_error`. After `AUTO_DISABLE_CRASH_THRESHOLD = 3` consecutive crashes, the extension is auto-disabled (`enabled = 0`) and the renderer receives an `extensions:host-status` notification with `status: 'extension-auto-disabled'`. A successful activation calls `clearCrashes()` and resets the count.

This means **a flaky extension that recovers** (one good activation) does not stay on the brink of auto-disable — only persistent failure counts.

---

## 7. Security model

**Phase 3 posture (permissive):**

- Extensions run in a sandboxed `utilityProcess` child of Electron Main. They cannot read/write the host filesystem, cannot open network sockets, and cannot import `node:fs` / `node:net` directly (the Host bundle externalises only safe `node:*` built-ins).
- The renderer can call `financeShell.extensions.executeCommand(commandId, ...args)` for any command registered by any active extension. There is **no per-extension command allowlist** in Phase 3.
- Disabling an extension (`enabled = 0`) in the database removes its contributions on the next startup but does NOT unload an already-active extension until restart.

**Why permissive in Phase 3:**

- All extensions are developer-installed (no marketplace yet).
- The renderer is sandboxed from Node APIs via `contextBridge` (vision's `nodeIntegration: false` rule).
- Phase 8 ships the marketplace; Phase 5 ships the security hardening.

**Phase 5 hardening (deferred, documented in `docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md` Self-Review §7):**

- The Main-side `extensions:execute-command` handler validates the command against `extensionRegistry.commands()` and rejects commands whose extension is disabled or auto-disabled.
- The renderer can only invoke commands on the Main-side allowlist. Extensions opt-in to renderer-callable commands via a manifest field (proposal: `contributes.commands[].rendererCallable: boolean`).
- Runtime `setEnabled(false)` sends an `extension.deactivate` notification to the Host so the extension's `deactivate()` hook runs immediately, not on next startup.

---

## 8. Working example: `salary-history`

The Phase 3 mock extension at `extensions/salary-history/` proves the full pipeline. It is also the cleanest reference implementation:

```typescript
// extensions/salary-history/src/main.ts
import type { FinanceApi } from '../../src/types/finance';

export async function activate(finance: FinanceApi): Promise<void> {
  finance.commands.registerCommand('salary.showPayHistory', 'View: Pay History', () => {
    console.log('[salary-history] Pay History view requested');
    return { executed: true };
  });

  finance.commands.registerCommand('salary.showDeductions', 'View: Deductions', () => {
    console.log('[salary-history] Deductions view requested');
    return { executed: true };
  });
}

export function deactivate(): void {
  // Phase 4 will dispose of any listeners or active forms here.
}
```

```json
// extensions/salary-history/package.json
{
  "name": "salary-history",
  "version": "0.1.0",
  "main": "src/main.ts",
  "financeExtension": {
    "id": "salary-history",
    "displayName": "Salary History",
    "version": "0.1.0",
    "activationEvents": ["onView:salary-history"],
    "contributes": {
      "views": [{ "id": "salary-history", "name": "Salary", "icon": "P" }],
      "commands": [
        { "id": "salary.showPayHistory", "title": "View: Pay History" },
        { "id": "salary.showDeductions", "title": "View: Deductions" }
      ]
    }
  }
}
```

After `npm run build:extensions`, the bundler produces `dist/extensions/salary-history.js`. The Host loads it on `onView:salary-history` activation.

---

## 9. Phase 4+ migration notes

| Phase | What changes for extension authors                                       |
| ----- | ------------------------------------------------------------------------- |
| 4     | `finance.db.table()` becomes real. `finance.commands.registerCommand` supports an optional `category` for grouping. |
| 5     | Renderer-callable commands get the allowlist (see §7). Cross-process events. |
| 6     | `finance.ai.registerTool` becomes real. `finance.ai.invokeTool` exposed for direct calls. |
| 7     | Keyboard shortcuts via `keybinding` are enforced. Settings UI renderer reads `contributes.configuration`. |
| 8     | Marketplace flow. Signed extensions. `import * as finance from 'finance'` migration path becomes real (Node loader hook or SDK package). |

Extension authors writing against this Phase 3 surface should expect the **shape** to stay stable but the **behaviour** of `finance.db.*` and `finance.ai.*` to fill in. The `finance.commands` surface is the stable contract across all phases.
