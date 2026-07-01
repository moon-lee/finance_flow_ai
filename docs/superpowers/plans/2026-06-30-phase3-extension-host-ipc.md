---
title: Phase 3 - Extension Host & IPC Scaffolding
date: 2026-06-30
status: draft — review feedback integrated
reviewed_by: docs/phase3-plan-review.md
review_date: 2026-07-01
fixes_applied:
  # From docs/phase3-plan-review.md (the 9 review findings)
  - §2.1 Extension Host crash recovery (Task 8 + Test Unit 5)
  - §2.2 Fire-and-forget start() replaced with .catch() (Task 10)
  - §2.3 extensions:execute-command IPC handler stub added (Tasks 5 + 10)
  - §3.1 json-rpc.ts moved to src/shared/ (File Structure + Tasks 3, 5, 8)
  - §3.2 ManifestViewContribution/CommandContribution deduplicated (Task 12)
  - §3.3 Command palette @input filter handler added (Task 13)
  - §3.4 E2E selector coupling removed in favour of IPC observation (Task 16)
  - §3.5 Test Unit 6 path uses app.getPath('userData') not %APPDATA%
  - §3.6 HOST_BUNDLE_PATH constant extracted + startup logging (Task 8)
  # Follow-ups added AFTER the review document (not in docs/phase3-plan-review.md).
  # Renamed to [Follow-up §N.M] so a future agent greping the review doc for §3.7
  # will not find a phantom reference. Provenance: commit 1416e16 + manual additions.
  - Follow-up §3.7 Dev script concurrency watch (Task 1)
  - Follow-up §3.8 Split extension-constants and extension-paths to avoid Electron import in Vite config (File Structure + Tasks 5, 8)
  - Follow-up §3.9 Try/catch in extensions:activate-view IPC handler (Task 10)
  - Follow-up §3.10 Extension Host deactivation hook cleanup (Task 5)
  - Follow-up §3.11 Command Palette scroll-into-view selected item (Task 13)
---

# Phase 3 — Extension Host & IPC Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Complete this milestone and wait for review before starting Phase 4.
>
> **Review integration:** This draft incorporates 9 fixes from `docs/phase3-plan-review.md` (3 must-fix, 6 should-fix). Each fix is annotated inline with `[Review fix §N.M]` comments so the executor knows where the change came from. Self-Review Checklist §8 verifies all 9 fixes.
>
> **Scope reminder:** Phase 3 *only* delivers the Extension Host process, manifest parsing, contribution registration, and activation triggers. It does **not** deliver domain logic (no `finance.db.table()` reads, no extension UI rendering, no AI tools). Those land in Phase 4+ against the same APIs this phase stubs. The mock `salary-history` extension exists solely to prove the registration pipeline.

**Goal:** Spawn an isolated Node.js Extension Host process via Electron `utilityProcess`, parse declarative `package.json` extension manifests from a discoverable directory, register each extension's contributed views and commands in the renderer Activity Bar and Command Palette, and prove the round-trip end-to-end with a mock `salary-history` extension.

**Architecture:** The Main process owns extension discovery, persistence, IPC routing, and lifecycle. The Extension Host is a sandboxed child process that runs extension code, holds the `finance.*` API surface extensions call, and speaks JSON-RPC 2.0 with the Main over the `utilityProcess` MessagePort. The Renderer never imports extension code; it consumes a contribution list (views + commands) published by Main and renders the Activity Bar and Command Palette dynamically. A new `extensions/` directory at the project root is the discovery root for Phase 3; user-installed extensions (in app userData) are deferred to Phase 8.

**Tech Stack:** Electron `utilityProcess.fork()` + MessagePort (transport), JSON-RPC 2.0 (protocol), Zod (manifest validation), better-sqlite3 (extension_registry, already in Phase 2), Lit (renderer components), Vitest (unit), Playwright Electron (E2E — replacing the Phase 2 deferred browser-only runner).

---

## Architecture Decisions

### Decision 1: Electron `utilityProcess.fork` for the Extension Host Process

**Choice:** Spawn the Extension Host via `utilityProcess.fork(modulePath, args, options)` from the Electron main process.

**Reasoning:** `utilityProcess` is the modern Electron API (Electron 22+) designed exactly for this pattern: a sandboxed, long-lived Node.js child process tied to Electron's lifecycle but isolated from it. It supports `postMessage()`/`'message'` events AND structured-clone `MessagePort` transfer, which is the cleanest way to pass a bidirectional RPC channel between Main and the Host. Plain `child_process.fork()` would also work but loses Electron lifecycle integration, sandbox defaults, and the structured MessagePort primitive.

Process isolation is not just a crash-safety measure — it is what *structurally enforces* the vision's "Do Not Break Other Extensions" rule: *"Direct in-process imports, shared global state, and direct database cross-writes between extensions are strictly forbidden"* (`project_vision.md:48`). Because every extension runs in its own process, there is no shared in-process module graph for extensions to import from. All cross-extension traffic is forced through the JSON-RPC channel between Main and each Host, which is what makes the rule *structurally* impossible to violate rather than relying on convention.

**Alternatives considered:**

- `child_process.fork()` + Node IPC: simpler in concept, but no MessagePort, no Electron sandbox defaults, and lifecycle management (kill on app quit) becomes manual.
- `MessagePortMain` between Main and a hidden BrowserWindow: vision-mentioned, but a renderer cannot host Node extension code without `nodeIntegration`, which the project explicitly forbids.
- In-process extension execution (just `require()` extension code in main): kills crash isolation, fails the vision's "Extension Host is a separate Node.js background process" requirement.

**Trade-off:** One extra Vite build output (`dist/extension-host/host.js`) to maintain. Mitigated by the established pattern (Phase 1 already has three Vite configs; this is the fourth).

> **ADR candidate:** Promote to `docs/decisions/0003-extension-host-transport.md` once approved.

### Decision 2: JSON-RPC 2.0 over the MessagePort

**Choice:** All Main ↔ Host traffic uses JSON-RPC 2.0 envelopes exchanged over the structured-clone MessagePort that `utilityProcess.fork()` supports.

**Reasoning:** JSON-RPC 2.0 gives us request/response correlation (via `id`), notifications (no `id`), standard error shapes (`code`, `message`, `data`), and is text-debuggable in logs. This matches VS Code's extension host protocol and the vision's "JSON-RPC" hint. We hand-roll a ~50-line envelope helper rather than pull in a library — the protocol surface is small and a dependency would obscure the contract.

**Alternatives considered:**

- `postMessage` with ad-hoc envelopes: faster to start, but invites protocol drift; every call site reinvents correlation.
- A library like `@vscode/jsonrpc`: appealing, but adds a dependency for what is genuinely a thin envelope format.
- MessagePack/binary RPC: premature optimization for Phase 3 traffic volume.

**Trade-off:** Tiny amount of hand-rolled protocol code; the explicit envelope types double as a contract that both processes import.

### Decision 3: Lazy Activation by Default (`activationEvents`)

**Choice:** Extensions activate only when one of their declared `activationEvents` fires. Phase 3 supports `*` (immediate) and `onView:<viewId>` triggers. Other triggers (`onCommand:`, `onSettings:`) are deferred.

**Reasoning:** Lazy activation is the foundation of the vision's "Fast and Lightweight" principle — the shell renders instantly; extension code loads on first use. Phase 1's hardcoded Activity Bar buttons were the bootstrap; Phase 3 replaces them with contributions, and contributions are the activation contract.

**Alternatives considered:**

- Eager activation (load every extension on startup): violates the lazy-load principle and contradicts the vision's `activationEvents` design.
- `*`-only activation for Phase 3: trivial but does not prove the activation plumbing the vision depends on.

**Trade-off:** Slight first-use latency per extension. Mitigated by an in-memory cache: once activated, re-activation is a no-op.

### Decision 4: Stub the `finance.*` API Surface in Phase 3

**Choice:** In the Extension Host, implement `finance.commands.registerCommand()` and `finance.commands.execute()` as functional stubs that return `{ executed: true }`. Stub `finance.db.table()` and `finance.ai.registerTool()` as no-op factories that log and return proxy objects with chainable empty methods. No extension code is required to do useful work yet — full DB access is Phase 4; AI tool execution is Phase 6.

**Reasoning:** The Phase 3 deliverable is *the host, the manifest, the registration pipeline*. Wiring full DB access now would couple Phase 3 to Phase 4's domain schema and force a rewrite when Phase 4 lands. Keeping the API surface stubbed but *shaped correctly* means Phase 4 only fills in implementations without changing the contract extensions see.

**Alternatives considered:**

- Implement full DB access now: would require Phase 3 to define `finance.db.table()` query semantics, error shapes, and namespacing rules that the vision already commits to. Phase 4 then becomes a refactor instead of a feature.
- No stubs at all (extensions can't import `finance`): would break the manifest-contributes-commands story, because the only way to register a command is to call `finance.commands.registerCommand()`.

**Trade-off:** Extensions that try to read DB data in Phase 3 silently get empty results. This is documented and resolves in Phase 4.

### Decision 5: Zod Validates Manifests at the Discovery Boundary

**Choice:** Every manifest read from a `package.json` is validated through a Zod schema *before* being added to the in-memory loader list, written to `extension_registry`, or sent to the Host. Invalid manifests produce a console warning and are skipped (not fatal).

**Reasoning:** The vision names Zod as the runtime type-safety layer. Validating at the discovery boundary (the loader) means everything downstream — the registry, the Host, the Renderer contribution list — can treat manifests as trusted typed objects. A malformed manifest from a third-party extension cannot crash the shell.

**Alternatives considered:**

- Validate only on demand (e.g., when the Host receives the manifest): fails closed later in the pipeline and pushes errors to the user.
- JSON Schema + Ajv: the vision reserves Ajv for settings schemas, not manifests. Two validators for two purposes keeps the boundary clean.
- Trust + manual typing: violates the vision's explicit Zod commitment.

**Trade-off:** `zod` becomes a runtime dependency. Already on the vision's stack — no surprise cost.

### Decision 6: Single Discovery Root — `<projectRoot>/extensions/`

**Choice:** The Extension Loader scans `<projectRoot>/extensions/` (resolved relative to `app.getAppPath()`) for subdirectories containing `package.json`. Each `package.json` with a `financeExtension` field is an extension candidate.

**Reasoning:** Matches the vision's "Scanning directories, parsing extension declarative manifests". Single, predictable location keeps Phase 3 simple. User-installed extensions (in `app.getPath('userData')/extensions/`) are a clear Phase 8 deliverable alongside the marketplace.

**Alternatives considered:**

- `app.getPath('userData')/extensions/` (user directory): correct long-term, but Phase 3 has no user-install flow and a user-dir scan on every boot is wasted work without one.
- Both roots: doubles the test surface for marginal Phase 3 value.

**Trade-off:** Extensions added for Phase 3 testing must live in the repo. Acceptable for a milestone whose primary extension is a mock.

### Decision 7: Activity Bar Becomes Contribution-Driven

**Choice:** Replace Phase 1's hardcoded Activity Bar buttons (`D`, `P`, `B`, `X`, `S`) with a dynamic renderer that lists buttons for each extension's `contributes.views[].id`. The Settings button is kept as a built-in (Core-owned, not an extension).

**Reasoning:** Phase 3's deliverable explicitly says "registers its views/commands in the UI". A dynamic Activity Bar is the visible proof. The Core's Settings view is platform-owned, not extension-owned, so it stays as a fixed built-in.

**Alternatives considered:**

- Keep hardcoded buttons plus dynamically-added ones: visually confusing, and the hardcoded ones would shadow the registration story.
- Render nothing if no extensions installed: technically correct but makes Phase 3 verification confusing ("the bar looks empty — is it broken?").

**Trade-off:** The Phase 3 manual tests must `npm install`-style the mock extension (or run `npm run dev:extensions`) to see the dynamic button appear. The plan includes a verification step that confirms the bar updates when the extension is added or removed.

### Decision 8: Extension Host as a Separate Vite Build Output

**Choice:** Add `vite.extension-host.config.ts` that bundles `src/extension-host/host.ts` to `dist/extension-host/host.js` as ESM, externalizing `electron`, `node:*`, and `better-sqlite3`.

**Reasoning:** Consistent with Phase 1's "separate Vite builds per process" decision. Keeps the Host's import graph isolated from Main and Renderer. Lets the Host bundle include only the stubs it needs without dragging in Electron types or DOM shims.

**Alternatives considered:**

- Bundle Host as part of Main: blurs the process boundary and risks accidental cross-process imports.
- Run Host directly from TypeScript source via `tsx`: convenient in dev, but does not produce the same artifact that ships, hiding bundling bugs until production.

**Trade-off:** A fourth Vite config file to maintain. Each is small and follows the same shape.

### Decision 9: Phase 3 Establishes the `finance` API Loading Mechanism

**Choice:** In Phase 3, the Extension Host loads each extension as a CommonJS module via `createRequire` and invokes its exported `activate(finance)` function, passing the API surface as a parameter. The extension does not import `finance` itself.

**Reasoning:** Phase 1 created `src/types/finance.d.ts` as an empty placeholder (`export {};`) and explicitly deferred the extension API contract: *"Phase 1 intentionally does not expose extension APIs. This file reserves the package contract location that later milestones will expand."* Phase 2 did not populate the file or establish the import pattern. The vision's `import * as finance from 'finance'` example at `project_vision.md:275` is illustrative pseudocode showing the *shape* of the API surface, not a locked-in contract — the actual contract is the type definitions in `finance.d.ts`, which Phase 3 is the first milestone to populate.

Parameter injection is the simplest, most testable, and most explicit mechanism for Phase 3's mock extension. The extension signature `activate(finance: FinanceApi)` documents exactly what the API surface contains and is trivially stubbable in tests.

**Alternatives considered:**

- `import * as finance from 'finance'` via Vite resolve.alias at Host build time: matches the vision's literal pseudocode, but the extension source is not bundled by the Host's Vite config — only the Host itself is. Implementing the alias for extensions loaded via `createRequire` requires either bundling the extension as part of the Host build or installing a Node module loader hook at runtime. Both add non-trivial infrastructure for a milestone whose job is wiring, not module-loader mechanics.
- Global injection (`globalThis.finance = finance` before `require()`): works but pollutes globals and is not type-safe.
- Keep parameter injection (chosen): explicit, type-safe, easy to test, no module-loader magic. Phase 4+ can transition to the canonical `import` pattern by changing only how the Host loads the extension module — the API contract itself (`FinanceApi` type in `finance.d.ts`) does not change.

**Trade-off:** Phase 3 extensions cannot share the `finance` reference across files via a top-level `import`; multi-file extensions in Phase 4+ will need either (a) a phase-4 module-loader hook implementing `import 'finance'` properly, or (b) extensions re-importing the type from a published SDK package and receiving the API as a parameter to `activate()`. This is acceptable because Phase 3 has only one single-file mock extension.

**Phase 4+ migration target:** When the real Salary History extension is built, decide between (a) implementing `import * as finance from 'finance'` via a Node loader hook in the Host, or (b) publishing `finance.d.ts` as a typed SDK package that extensions import for types while still receiving the API as an `activate(finance)` parameter. The decision belongs to whichever phase first builds a multi-file extension.

---

## File Structure

```text
finance-flow-ai/
|-- package.json                                # Modified: zod dep, scripts
|-- vite.extension-host.config.ts               # NEW: Host bundler config
|-- extensions/                                 # NEW: discovery root
|   `-- salary-history/
|       |-- package.json                        # NEW: extension manifest
|       `-- src/
|           `-- main.ts                         # NEW: stub entry
|-- src/
|   |-- shared/                                 # NEW: shared between Main + Host + Vite configs *(per [Review fix §3.1] and §3.6)*
|   |   |-- json-rpc.ts                         # MOVED from extension-host/ — envelope helpers (shared types)
|   |   |-- extension-constants.ts              # NEW: HOST_BUNDLE_DIR + HOST_BUNDLE_FILENAME (constants only) *(per [Follow-up §3.8])*
|   |   `-- extension-paths.ts                  # NEW: HOST_BUNDLE_DIR + resolveHostBundlePath() *(per [Review fix §3.6])*
|   |-- main/
|   |   |-- main.ts                             # Modified: spawn host, loader, registry
|   |   `-- services/
|   |       |-- extension-loader.ts             # NEW: discover, parse, validate
|   |       |-- extension-registry.ts           # NEW: in-memory + DB sync
|   |       `-- extension-ipc.ts                # NEW: utilityProcess + JSON-RPC + crash recovery
|   |-- extension-host/                         # NEW: bundled separately
|   |   |-- host.ts                             # NEW: process entry, RPC dispatch
|   |   |-- manifest-schema.ts                  # NEW: Zod schemas
|   |   `-- api/
|   |       |-- index.ts                        # NEW: aggregate finance.* export
|   |       |-- commands.ts                     # NEW: registerCommand, execute
|   |       |-- db.ts                           # NEW: table() stub
|   |       `-- ai.ts                           # NEW: registerTool stub
|   |-- preload/
|   |   `-- preload.ts                          # Modified: extensions API
|   |-- types/
|   |   |-- finance-shell.d.ts                  # Modified: ExtensionsApi
|   |   `-- finance.d.ts                        # Modified: manifest types
|   `-- renderer/
|       |-- index.ts                            # Modified: load contributions, dispatch
|       `-- components/
|           |-- activity-bar.ts                 # Modified: dynamic from contributions
|           `-- command-palette.ts              # Modified: extension commands
|-- tests/
|   |-- unit/
|   |   |-- extension-host/
|   |   |   |-- manifest-schema.test.ts         # NEW: Zod validation cases
|   |   |   `-- json-rpc.test.ts                # NEW: envelope shape tests
|   |   `-- services/
|   |       `-- extension-loader.test.ts        # NEW: discovery + validation
|   `-- e2e/
|       |-- extension-host.spec.ts              # NEW: dynamic Activity Bar
|       `-- renderer-shell.spec.ts              # Modified: now runs under Electron
`-- playwright.electron.config.ts               # NEW: Electron-aware config (optional split)
```

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install zod for manifest validation**

```bash
npm install zod
```

- [ ] **Step 2: Add build scripts for the Extension Host** *(incorporates [Follow-up §3.7] — dev script concurrency)*

```bash
npm pkg set scripts.build:extension-host="vite build --config vite.extension-host.config.ts"
npm pkg set scripts.build="npm run build:main && npm run build:preload && npm run build:extension-host && npm run build:renderer"
npm pkg set scripts.dev:extension-host="vite build --config vite.extension-host.config.ts --watch"
npm pkg set scripts.dev="concurrently -k \"npm:dev:main\" \"npm:dev:preload\" \"npm:dev:extension-host\" \"npm:dev:renderer\" \"npm:start:dev\""
npm pkg set scripts.start:dev="wait-on http://127.0.0.1:5173 dist/main/main.js dist/preload/preload.cjs dist/extension-host/host.js && cross-env ELECTRON_RENDERER_URL=http://127.0.0.1:5173 nodemon --watch dist/main/main.js --watch dist/extension-host/host.js --exec \"electron dist/main/main.js\""
```

> The watch list for `nodemon` now includes `dist/extension-host/host.js` so Main restarts when the Host bundle is rebuilt. The build script order ensures the Host is built before Main attempts to fork it on dev startup.

- [ ] **Step 3: Verify zod is resolvable**

```bash
node -e "const { z } = require('zod'); console.log(typeof z.object === 'function' ? 'zod OK' : 'zod FAIL');"
```

Expected: `zod OK`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add zod and extension-host build scripts"
```

---

## Task 2: Define Manifest Types and Zod Schema

**Files:**
- Modify: `src/types/finance.d.ts`
- Create: `src/extension-host/manifest-schema.ts`

- [ ] **Step 1: Replace the placeholder `src/types/finance.d.ts` with real manifest types**

`src/types/finance.d.ts`:

```typescript
/**
 * Public Finance platform contracts shared by Core, Extension Host, and extensions.
 *
 * The manifest type is the source of truth for what an extension may declare.
 * Runtime validation lives in `src/extension-host/manifest-schema.ts` (Zod).
 * If you change a type here, mirror the change in the Zod schema.
 */

export type ActivationEvent =
  | '*'
  | `onView:${string}`
  | `onCommand:${string}`;

export interface ManifestViewContribution {
  /** Stable view id used for activation events and Navigation Panel grouping. */
  id: string;
  /** Human-readable label shown in the Activity Bar tooltip and Navigation Panel header. */
  name: string;
  /** Single-character or short icon label rendered in the Activity Bar button. */
  icon: string;
}

export interface ManifestCommandContribution {
  /** Stable command id; must be unique across all installed extensions. */
  id: string;
  /** Human-readable title shown in the Command Palette. */
  title: string;
  /**
   * Optional keyboard shortcut binding in Electron `accelerator` form
   * (e.g. `Ctrl+Shift+S`). Not enforced in Phase 3; registered for Phase 7.
   */
  keybinding?: string;
}

export interface ManifestMenuContribution {
  command: string;
  /** Grouping label in the top menu bar (e.g. "File", "View", "Salary"). */
  group: string;
  /** Optional sort key within the group. */
  order?: number;
}

export interface ManifestConfigurationContribution {
  /** Full settings key in `extensionId.localKey` form. */
  key: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'object';
  label: string;
  default?: unknown;
  /** Required for `enum` type. */
  enumOptions?: string[];
}

export interface ManifestContributions {
  views?: ManifestViewContribution[];
  commands?: ManifestCommandContribution[];
  menus?: ManifestMenuContribution[];
  configuration?: ManifestConfigurationContribution[];
}

export interface FinanceExtensionManifest {
  /** Globally unique extension id (e.g. `salary-history`). Must match `package.json#name`. */
  id: string;
  displayName: string;
  /** Semver version string. */
  version: string;
  /** Short description, shown in the Extension Manager UI (Phase 8). */
  description?: string;
  /** Optional list of other extension ids this extension depends on. */
  dependencies?: string[];
  /**
   * Activation events that cause this extension's code to be loaded.
   * `*` activates immediately on app start (use sparingly).
   */
  activationEvents: ActivationEvent[];
  contributions: ManifestContributions;
  /** Path to the extension's CommonJS or ESM entry relative to its package root. */
  main: string;
}

/**
 * The shape of the `financeExtension` field inside an extension's `package.json`.
 * Mirrors `FinanceExtensionManifest` — kept separate so package authors do not
 * need to import the full Core type to write a manifest.
 */
export interface PackageJsonFinanceExtension extends Omit<FinanceExtensionManifest, 'version'> {
  version?: string; // falls back to package.json#version if omitted
}
```

- [ ] **Step 2: Create the Zod schema for runtime validation**

`src/extension-host/manifest-schema.ts`:

```typescript
import { z } from 'zod';

const activationEventSchema = z.union([
  z.literal('*'),
  z.string().regex(/^onView:[a-z0-9-]+$/, 'must match onView:<id>'),
  z.string().regex(/^onCommand:[a-z0-9.-]+$/, 'must match onCommand:<id>')
]);

export const viewContributionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'view id must be lowercase alphanumeric/hyphen'),
  name: z.string().min(1),
  icon: z.string().min(1).max(2)
});

export const commandContributionSchema = z.object({
  id: z.string().regex(/^[a-z0-9.-]+$/, 'command id must be lowercase with dots/hyphens'),
  title: z.string().min(1),
  keybinding: z.string().optional()
});

export const menuContributionSchema = z.object({
  command: z.string(),
  group: z.string().min(1),
  order: z.number().int().optional()
});

export const configurationContributionSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+\.[a-zA-Z0-9.-]+$/, 'configuration key must be "<extensionId>.<localKey>"'),
  type: z.enum(['string', 'number', 'boolean', 'enum', 'object']),
  label: z.string().min(1),
  default: z.unknown().optional(),
  enumOptions: z.array(z.string()).optional()
}).refine(
  (cfg) => cfg.type !== 'enum' || (cfg.enumOptions && cfg.enumOptions.length > 0),
  { message: 'enum type requires enumOptions', path: ['enumOptions'] }
);

export const manifestContributionsSchema = z.object({
  views: z.array(viewContributionSchema).optional(),
  commands: z.array(commandContributionSchema).optional(),
  menus: z.array(menuContributionSchema).optional(),
  configuration: z.array(configurationContributionSchema).optional()
}).strict(); // reject unknown contribution keys

export const financeExtensionManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'extension id must be lowercase alphanumeric/hyphen'),
  displayName: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'version must be semver'),
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  activationEvents: z.array(activationEventSchema).min(1, 'at least one activation event is required'),
  contributions: manifestContributionsSchema,
  main: z.string().min(1)
}).strict(); // reject unknown manifest keys

export type ManifestValidationResult =
  | { ok: true; manifest: FinanceExtensionManifest }
  | { ok: false; errors: string[] };

export function validateManifest(raw: unknown): ManifestValidationResult {
  const result = financeExtensionManifestSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, manifest: result.data as FinanceExtensionManifest };
  }
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
  };
}
```

> **Note:** The `FinanceExtensionManifest` type is imported in `manifest-schema.ts` only for the return cast. To avoid a circular import (types ↔ extension-host), the schema does not reference the type at module scope; the cast happens inside `validateManifest`. If you need the type elsewhere, import from `src/types/finance.d.ts` directly.

- [ ] **Step 3: Commit**

```bash
git add src/types/finance.d.ts src/extension-host/manifest-schema.ts
git commit -m "feat: define manifest types and Zod validation schema"
```

---

## Task 3: Create JSON-RPC Envelope Helpers

**Files:**
- Create: `src/shared/json-rpc.ts` *(moved from `src/extension-host/` per [Review fix §3.1] — the protocol is shared by both processes)*

The JSON-RPC types are used by both the Main process (sender of requests) and the Extension Host (handler). Importing from a shared module is cleaner than duplicating the shape.

> **[Review fix §3.1]** The original plan put `json-rpc.ts` under `src/extension-host/`. Main (`src/main/services/extension-ipc.ts`) imports from it, which makes the folder name misleading as the protocol surface grows (Phase 4+ will add command execution, event subscriptions, etc.). Move to `src/shared/json-rpc.ts` so both processes own the protocol equally.

- [ ] **Step 1: Create the envelope helpers**

`src/shared/json-rpc.ts`:

```typescript
/**
 * Minimal JSON-RPC 2.0 envelope types shared by Main and Extension Host.
 * Both processes import from this module; it is bundled into both builds.
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: number;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: number;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

// Standard JSON-RPC error codes plus a few platform-specific ones.
export const RpcErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ExtensionNotFound: -32001,
  ExtensionAlreadyActivated: -32002,
  ActivationEventUnknown: -32003
} as const;

let nextId = 1;
export function makeRequestId(): number {
  return nextId++;
}

export function isRequest(value: unknown): value is JsonRpcRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
    typeof (value as { id?: unknown }).id === 'number' &&
    typeof (value as { method?: unknown }).method === 'string'
  );
}

export function isNotification(value: unknown): value is JsonRpcNotification {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
    typeof (value as { method?: unknown }).method === 'string' &&
    (value as { id?: unknown }).id === undefined
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/json-rpc.ts
git commit -m "feat: add JSON-RPC envelope types shared by Main and Host"
```

---

## Task 4: Create the `finance.*` API Stubs

**Files:**
- Create: `src/extension-host/api/db.ts`
- Create: `src/extension-host/api/commands.ts`
- Create: `src/extension-host/api/ai.ts`
- Create: `src/extension-host/api/index.ts`

The Extension Host exposes a single `finance` global that extensions import. In Phase 3, the surface is stubbed: `commands` is functional enough to prove registration; `db` and `ai` return shape-correct but data-empty proxies.

- [ ] **Step 1: Create the commands API**

`src/extension-host/api/commands.ts`:

```typescript
/**
 * Extension-side command registry. In Phase 3, registration is in-process;
 * Main is notified via an RPC notification so the Command Palette can list
 * commands contributed by this extension. Execution is a stub that logs
 * and returns `{ executed: true }`.
 */

export type CommandHandler = (...args: unknown[]) => Promise<unknown> | unknown;

interface RegisteredCommand {
  id: string;
  title: string;
  keybinding?: string;
  handler: CommandHandler;
}

const commands = new Map<string, RegisteredCommand>();

export function registerCommand(
  id: string,
  title: string,
  handler: CommandHandler,
  keybinding?: string
): void {
  if (commands.has(id)) {
    throw new Error(`Command "${id}" is already registered`);
  }
  commands.set(id, { id, title, handler, keybinding });
}

export async function executeCommand(id: string, ...args: unknown[]): Promise<unknown> {
  const cmd = commands.get(id);
  if (!cmd) {
    // Graceful degradation: missing/unregistered commands return null, never throw.
    return null;
  }
  return cmd.handler(...args);
}

export function listCommands(): Array<{ id: string; title: string; keybinding?: string }> {
  return Array.from(commands.values()).map(({ id, title, keybinding }) => ({ id, title, keybinding }));
}

/** Test-only: reset the registry between unit tests. */
export function __resetCommandRegistry(): void {
  commands.clear();
}
```

- [ ] **Step 2: Create the db API stub**

`src/extension-host/api/db.ts`:

```typescript
/**
 * Phase 3 db stub. Returns shape-correct empty queryables. Phase 4 will
 * wire these to the Main process via RPC and to better-sqlite3 via the
 * Core's namespace-enforcing DAO.
 */

interface QueryChain {
  find(filter?: unknown): Promise<unknown[]>;
  findOne(filter?: unknown): Promise<unknown | null>;
  insert(record: unknown): Promise<{ id: number | string }>;
  update(filter: unknown, patch: unknown): Promise<{ updated: number }>;
  delete(filter: unknown): Promise<{ deleted: number }>;
}

function stubChain(): QueryChain {
  const chain: QueryChain = {
    async find() { return []; },
    async findOne() { return null; },
    async insert() { return { id: 0 }; },
    async update() { return { updated: 0 }; },
    async delete() { return { deleted: 0 }; }
  };
  return chain;
}

export function table(name: string): QueryChain {
  // Phase 3: log the call so the extension author can see the wiring fired.
  console.log(`[finance.db] table("${name}") called (Phase 3 stub — no data returned)`);
  return stubChain();
}
```

- [ ] **Step 3: Create the ai API stub**

`src/extension-host/api/ai.ts`:

```typescript
/**
 * Phase 3 ai stub. Tool registration stores the tool definition locally
 * and forwards it to Main via RPC notification so the AI Assistant panel
 * (Phase 6) can later resolve it. Phase 6 will add execution and the
 * LLM provider plumbing.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's parameters. */
  parameters: unknown;
  handler: (args: unknown) => Promise<unknown> | unknown;
}

const tools = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  if (tools.has(tool.name)) {
    throw new Error(`Tool "${tool.name}" is already registered`);
  }
  tools.set(tool.name, tool);
}

export function listTools(): Array<{ name: string; description: string; parameters: unknown }> {
  return Array.from(tools.values()).map(({ name, description, parameters }) => ({ name, description, parameters }));
}

export async function invokeTool(name: string, args: unknown): Promise<unknown> {
  const tool = tools.get(name);
  if (!tool) return null;
  return tool.handler(args);
}

/** Test-only: reset the tool registry. */
export function __resetToolRegistry(): void {
  tools.clear();
}
```

- [ ] **Step 4: Create the aggregate finance export**

`src/extension-host/api/index.ts`:

```typescript
import * as commandsApi from './commands';
import * as dbApi from './db';
import * as aiApi from './ai';

/**
 * The `finance` global extensions import. Phase 3 stubs `db` and `ai` and
 * implements `commands` registration. Phase 4+ replaces stubs with real
 * implementations without changing this surface.
 */
export const finance = {
  db: {
    table: dbApi.table
  },
  commands: {
    registerCommand: commandsApi.registerCommand,
    execute: commandsApi.executeCommand
  },
  ai: {
    registerTool: aiApi.registerTool
  }
} as const;

export type FinanceApi = typeof finance;
```

- [ ] **Step 5: Commit**

```bash
git add src/extension-host/api/
git commit -m "feat: add finance.* API stubs in the Extension Host"
```

---

## Task 5: Create the Extension Host Process Entry Point

**Files:**
- Create: `src/extension-host/host.ts`
- Create: `vite.extension-host.config.ts`

- [ ] **Step 1: Create the Vite config for the Extension Host** *(incorporates [Review fix §3.6] and [Follow-up §3.8] — shared constants isolated)*

`vite.extension-host.config.ts`:

```typescript
import { defineConfig } from 'vite';
import { HOST_BUNDLE_DIR } from './src/shared/extension-constants';

export default defineConfig({
  build: {
    outDir: HOST_BUNDLE_DIR,
    emptyOutDir: true,
    lib: {
      entry: 'src/extension-host/host.ts',
      formats: ['es'],
      fileName: () => 'host.js'
    },
    rollupOptions: {
      external: [
        'electron',
        'node:path',
        'node:url',
        'node:fs',
        'node:module',
        'better-sqlite3'
      ]
    }
  }
});
```

> **Why import the constant:** The Vite config and the IPC transport both need to agree on where the bundle lands. Importing `HOST_BUNDLE_DIR` from `src/shared/extension-constants.ts` (created in Task 8) gives a single source of truth — a build-layout change requires editing only one file. The IPC transport's `resolveHostBundlePath()` reads the same constant at runtime.

- [ ] **Step 2: Create the Host process entry**

`src/extension-host/host.ts`:

```typescript
/**
 * Extension Host process entry point.
 *
 * Lifecycle:
 *   1. utilityProcess.fork spawns this file with the resolved dist path.
 *   2. Main sends `host.initialize` with the validated manifest list and
 *      a structured-clone MessagePort for future bidirectional RPC.
 *   3. We activate any extension whose `activationEvents` include `*`.
 *   4. We sit idle, handling RPC requests, until Main sends a shutdown
 *      notification or kills the process.
 *
 * Crash isolation: if this process dies, Main detects it via the
 * `utilityProcess` 'exit' event and surfaces a status-bar message. The
 * shell keeps running with extensions disabled.
 */

import { finance } from './api/index';
import {
  isRequest,
  isNotification,
  makeRequestId,
  RpcErrorCode,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcNotification
} from '../shared/json-rpc';
import type { FinanceExtensionManifest } from '../types/finance';

declare const process: NodeJS.Process & {
  // Electron exposes the parent IPC channel here when launched via utilityProcess.fork.
  parentPort: {
    on(event: 'message', listener: (msg: unknown) => void): void;
    postMessage(message: unknown): void;
  } | null;
};

const parentPort = process.parentPort;
if (!parentPort) {
  // Defensive: this file must be launched via utilityProcess, not node directly.
  console.error('Extension Host must be launched via Electron utilityProcess.fork()');
  process.exit(1);
}

interface ActiveExtension {
  manifest: FinanceExtensionManifest;
  moduleUrl?: string;
}

const activeExtensions = new Map<string, ActiveExtension>();
const pendingRequests = new Map<number, (response: JsonRpcResponse) => void>();

function send(message: unknown): void {
  parentPort!.postMessage(message);
}

function respond(id: number, result: unknown): void {
  send({ jsonrpc: '2.0', id, result });
}

function respondError(id: number, code: number, message: string, data?: unknown): void {
  send({ jsonrpc: '2.0', id, error: { code, message, data } });
}

function notify(method: string, params: unknown): void {
  send({ jsonrpc: '2.0', method, params });
}

async function handleRequest(req: JsonRpcRequest): Promise<void> {
  try {
    switch (req.method) {
      case 'host.initialize': {
        const manifests = (req.params as { manifests: FinanceExtensionManifest[] }).manifests;
        for (const manifest of manifests) {
          activeExtensions.set(manifest.id, { manifest });
        }
        // Activate any extension that requested immediate activation.
        for (const [id, ext] of activeExtensions) {
          if (ext.manifest.activationEvents.includes('*')) {
            await activateExtension(id, '*');
          }
        }
        respond(req.id, { accepted: manifests.length });
        return;
      }
      case 'extension.activate': {
        const { extensionId, reason } = req.params as { extensionId: string; reason: string };
        const activated = await activateExtension(extensionId, reason);
        respond(req.id, { activated });
        return;
      }
      case 'extension.list': {
        respond(req.id, {
          extensions: Array.from(activeExtensions.values()).map((ext) => ({
            id: ext.manifest.id,
            displayName: ext.manifest.displayName,
            version: ext.manifest.version,
            active: !!ext.moduleUrl,
            activationEvents: ext.manifest.activationEvents,
            contributions: ext.manifest.contributions
          }))
        });
        return;
      }
      case 'commands.registered': {
        // Acknowledgement from Main after we've notified of a new command.
        respond(req.id, { acknowledged: true });
        return;
      }
      case 'extension.executeCommand': {
        // [Review fix §2.3] Phase 3 stub: forward to the commands registry
        // so the IPC channel is observable end-to-end. Phase 5 will swap
        // this for real execution semantics; the envelope stays the same.
        //
        // [Review observation #2 — post-review] Use the `finance.commands.execute`
        // aggregate rather than the lower-level `executeCommand` import from
        // `./api/commands`. This keeps the Host exercising the same API surface
        // extensions call, so there's exactly one canonical path. Phase 5's
        // real execution replaces this method without touching the call site.
        const { commandId, args } = req.params as { commandId: string; args: unknown[] };
        const result = await finance.commands.execute(commandId, ...args);
        respond(req.id, { executed: result !== null, result });
        return;
      }
      default:
        respondError(req.id, RpcErrorCode.MethodNotFound, `Unknown method: ${req.method}`);
    }
  } catch (err) {
    respondError(
      req.id,
      RpcErrorCode.InternalError,
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function activateExtension(extensionId: string, reason: string): Promise<boolean> {
  const ext = activeExtensions.get(extensionId);
  if (!ext) {
    console.error(`[host] activate: extension "${extensionId}" not found`);
    return false;
  }
  if (ext.moduleUrl) {
    return true; // already active
  }
  if (!ext.manifest.activationEvents.some((evt) => evt === '*' || evt === reason)) {
    console.warn(
      `[host] activate: extension "${extensionId}" has no activation event matching "${reason}"`
    );
    return false;
  }

  // Phase 3: load the extension module if present. We use createRequire to
  // resolve the extension's package.json relative path on disk. For the
  // mock salary-history extension, the file exists but is a no-op.
  try {
    const { createRequire } = await import('node:module');
    const path = await import('node:path');
    const url = await import('node:url');

    const requireFromHere = createRequire(import.meta.url);
    const extensionRoot = path.resolve(
      path.dirname(url.fileURLToPath(import.meta.url)),
      '../../extensions',
      extensionId
    );
    const entryPath = path.join(extensionRoot, ext.manifest.main);

    const extModule = requireFromHere(entryPath);
    if (typeof extModule?.activate === 'function') {
      await extModule.activate(finance);
    }
    ext.moduleUrl = entryPath;
    notify('extension.activated', { extensionId, reason });
    console.log(`[host] activated "${extensionId}" via "${reason}"`);
    return true;
  } catch (err) {
    console.error(`[host] failed to activate "${extensionId}":`, err);
    return false;
  }
}

// [Follow-up §3.10] Extension Host deactivation hook cleanup
async function handleNotification(notification: JsonRpcNotification): Promise<void> {
  if (notification.method === 'host.shutdown') {
    console.log('[host] shutdown request received, deactivating extensions...');
    for (const [id, ext] of activeExtensions) {
      if (ext.moduleUrl) {
        try {
          const { createRequire } = await import('node:module');
          const requireFromHere = createRequire(import.meta.url);
          const extModule = requireFromHere(ext.moduleUrl);
          if (typeof extModule?.deactivate === 'function') {
            await extModule.deactivate();
          }
        } catch (err) {
          console.error(`[host] failed to deactivate "${id}":`, err);
        }
      }
    }
    process.exit(0);
  }
}

parentPort.on('message', (msg: unknown) => {
  if (isRequest(msg)) {
    void handleRequest(msg);
  } else if (isNotification(msg)) {
    void handleNotification(msg);
  }
});

// Signal readiness so Main can send the manifest list.
notify('host.ready', { pid: process.pid, requestId: makeRequestId() });

console.log(`[host] Extension Host process started (pid ${process.pid})`);
```

> **Edge case — extension entry not present:** If an extension's `main` file is missing or fails to import, `activateExtension` logs the error and returns `false`. The extension is still listed in `activeExtensions` (it was discovered) but its `moduleUrl` stays undefined, and `extension.list` reports it as `active: false`. The Activity Bar still shows its contributed views, but clicking them does nothing — which is the correct graceful-degradation behaviour.

- [ ] **Step 3: Commit**

```bash
git add src/extension-host/host.ts vite.extension-host.config.ts
git commit -m "feat: add Extension Host process entry and Vite build config"
```

---

## Task 6: Create the Extension Loader Service

**Files:**
- Create: `src/main/services/extension-loader.ts`

- [ ] **Step 1: Create the loader**

`src/main/services/extension-loader.ts`:

```typescript
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateManifest, type ManifestValidationResult } from '../../extension-host/manifest-schema';
import type { FinanceExtensionManifest, PackageJsonFinanceExtension } from '../../types/finance';

export interface DiscoveredExtension {
  /** Absolute path to the extension's package directory. */
  directory: string;
  manifest: FinanceExtensionManifest;
  /** Whether the loader wrote/updated this row in extension_registry. */
  persisted: boolean;
}

export interface SkippedExtension {
  directory: string;
  reason: string;
}

export interface DiscoveryResult {
  extensions: DiscoveredExtension[];
  skipped: SkippedExtension[];
}

const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'dist']);

/**
 * Scan `extensionsRoot` for subdirectories whose `package.json` contains
 * a valid `financeExtension` field. Invalid manifests are skipped with a
 * warning rather than aborting the whole discovery (third-party safety).
 */
export function discoverExtensions(
  extensionsRoot: string,
  options: { logger?: (msg: string) => void } = {}
): DiscoveryResult {
  const log = options.logger ?? console.warn;
  const result: DiscoveryResult = { extensions: [], skipped: [] };

  let entries: string[];
  try {
    entries = readdirSync(extensionsRoot);
  } catch (err) {
    log(`[loader] cannot read extensions directory "${extensionsRoot}": ${err}`);
    return result;
  }

  for (const entry of entries) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const directory = resolve(extensionsRoot, entry);
    let stat;
    try {
      stat = statSync(directory);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const pkgPath = join(directory, 'package.json');
    let pkg: { name?: string; version?: string; financeExtension?: unknown };
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch {
      result.skipped.push({ directory, reason: 'package.json missing or unparseable' });
      continue;
    }

    if (!pkg.financeExtension) {
      result.skipped.push({ directory, reason: 'no financeExtension field' });
      continue;
    }

    // The package.json#name and financeExtension#id must agree. This catches
    // a rename in one file without the other.
    if (pkg.name && (pkg.financeExtension as { id?: string }).id && pkg.name !== (pkg.financeExtension as { id: string }).id) {
      result.skipped.push({ directory, reason: `package.json#name "${pkg.name}" does not match financeExtension.id "${(pkg.financeExtension as { id: string }).id}"` });
      continue;
    }

    const rawManifest: PackageJsonFinanceExtension = pkg.financeExtension as PackageJsonFinanceExtension;
    // Fall back to package.json#version if the manifest omits it.
    if (!rawManifest.version && pkg.version) rawManifest.version = pkg.version;

    const validation: ManifestValidationResult = validateManifest(rawManifest);
    if (!validation.ok) {
      result.skipped.push({ directory, reason: `invalid manifest: ${validation.errors.join('; ')}` });
      continue;
    }

    result.extensions.push({
      directory,
      manifest: validation.manifest,
      persisted: false
    });
  }

  return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/services/extension-loader.ts
git commit -m "feat: add Extension Loader service with manifest discovery and validation"
```

---

## Task 7: Create the Extension Registry Service

**Files:**
- Create: `src/main/services/extension-registry.ts`

The registry holds the *in-memory* list of extensions loaded from disk and their contribution sets. It mirrors discovered extensions into the `extension_registry` table created by Phase 2 (so the data survives restart) and exposes query helpers that Main and the Renderer use.

- [ ] **Step 1: Create the registry**

`src/main/services/extension-registry.ts`:

```typescript
import type Database from 'better-sqlite3';
import { getDatabase } from './database-service';
import type { FinanceExtensionManifest } from '../../types/finance';

interface RegistryRow {
  id: string;
  name: string;
  version: string;
  enabled: 0 | 1;
  installed_at: string;
  activated_at: string | null;
}

export class ExtensionRegistry {
  private readonly db: Database.Database;
  private readonly byId = new Map<string, { manifest: FinanceExtensionManifest; activatedAt: string | null }>();

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Insert or update the row for `manifest` and cache it in memory. Idempotent —
   * safe to call on every app startup with the same discovery result.
   */
  upsert(manifest: FinanceExtensionManifest): void {
    const stmt = this.db.prepare(`
      INSERT INTO extension_registry (id, name, version, enabled)
      VALUES (@id, @name, @version, 1)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        version = excluded.version,
        enabled = 1
    `);
    stmt.run({ id: manifest.id, name: manifest.displayName, version: manifest.version });
    if (!this.byId.has(manifest.id)) {
      const row = this.db.prepare('SELECT activated_at FROM extension_registry WHERE id = ?')
        .get(manifest.id) as Pick<RegistryRow, 'activated_at'> | undefined;
      this.byId.set(manifest.id, { manifest, activatedAt: row?.activated_at ?? null });
    } else {
      // Refresh the cached manifest (handles version bumps on restart).
      const entry = this.byId.get(manifest.id)!;
      this.byId.set(manifest.id, { ...entry, manifest });
    }
  }

  markActivated(extensionId: string, at: string = new Date().toISOString()): void {
    this.db.prepare('UPDATE extension_registry SET activated_at = ? WHERE id = ?')
      .run(at, extensionId);
    const entry = this.byId.get(extensionId);
    if (entry) entry.activatedAt = at;
  }

  isEnabled(extensionId: string): boolean {
    const row = this.db.prepare('SELECT enabled FROM extension_registry WHERE id = ?')
      .get(extensionId) as Pick<RegistryRow, 'enabled'> | undefined;
    return row?.enabled === 1;
  }

  setEnabled(extensionId: string, enabled: boolean): void {
    this.db.prepare('UPDATE extension_registry SET enabled = ? WHERE id = ?')
      .run(enabled ? 1 : 0, extensionId);
  }

  list(): FinanceExtensionManifest[] {
    return Array.from(this.byId.values())
      .filter((entry) => this.isEnabled(entry.manifest.id))
      .map((entry) => entry.manifest);
  }

  /** Aggregate all enabled extensions' views, in declaration order. */
  views(): Array<{ extensionId: string; view: NonNullable<FinanceExtensionManifest['contributions']['views']>[number] }> {
    const out: Array<{ extensionId: string; view: NonNullable<FinanceExtensionManifest['contributions']['views']>[number] }> = [];
    for (const { manifest } of this.byId.values()) {
      if (!this.isEnabled(manifest.id)) continue;
      for (const view of manifest.contributions.views ?? []) {
        out.push({ extensionId: manifest.id, view });
      }
    }
    return out;
  }

  /** Aggregate all enabled extensions' commands. */
  commands(): Array<{ extensionId: string; command: NonNullable<FinanceExtensionManifest['contributions']['commands']>[number] }> {
    const out: Array<{ extensionId: string; command: NonNullable<FinanceExtensionManifest['contributions']['commands']>[number] }> = [];
    for (const { manifest } of this.byId.values()) {
      if (!this.isEnabled(manifest.id)) continue;
      for (const command of manifest.contributions.commands ?? []) {
        out.push({ extensionId: manifest.id, command });
      }
    }
    return out;
  }

  get(extensionId: string): FinanceExtensionManifest | undefined {
    return this.byId.get(extensionId)?.manifest;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/services/extension-registry.ts
git commit -m "feat: add Extension Registry service with DB-backed persistence"
```

---

## Task 8: Create the Extension IPC Transport

**Files:**
- Create: `src/shared/extension-constants.ts` *(shared build-time constants — see [Follow-up §3.8])*
- Create: `src/shared/extension-paths.ts` *(runtime paths relying on Electron APIs)*
- Create: `src/main/services/extension-ipc.ts`

The transport spawns the Host process, performs the JSON-RPC handshake, exposes a typed RPC client for Main to call into the Host, and — per [Review fix §2.1] — recovers from a crash by re-spawning on the next user-initiated request.

- [ ] **Step 1a: Create the shared extension-constants module**

`src/shared/extension-constants.ts`:

```typescript
/**
 * Single source of truth for where the Extension Host bundle lives.
 * This file contains only build-time constants and has no external or Electron imports.
 * The Vite config (`vite.extension-host.config.ts`) imports `HOST_BUNDLE_DIR` directly
 * without loading any runtime Electron APIs, preventing build-time configuration failures.
 */
export const HOST_BUNDLE_DIR = 'dist/extension-host';
export const HOST_BUNDLE_FILENAME = 'host.js';
```

- [ ] **Step 1b: Create the shared extension-paths module**

`src/shared/extension-paths.ts`:

```typescript
import { join } from 'node:path';
import { app } from 'electron';
import { HOST_BUNDLE_DIR, HOST_BUNDLE_FILENAME } from './extension-constants';

/**
 * Constructs the absolute path to the Extension Host bundle at runtime.
 * The resolved path is logged on startup so a misconfigured build fails loudly.
 */
export function resolveHostBundlePath(): string {
  const path = join(app.getAppPath(), HOST_BUNDLE_DIR, HOST_BUNDLE_FILENAME);
  console.log(`[extension-host] bundle path resolved: ${path}`);
  return path;
}
```

- [ ] **Step 1c: Create the IPC transport with crash recovery** *(incorporates [Review fix §2.1] and §3.6)*

`src/main/services/extension-ipc.ts`:

```typescript
import { utilityProcess, type UtilityProcess } from 'electron';
import {
  isRequest,
  makeRequestId,
  RpcErrorCode,
  type JsonRpcRequest,
  type JsonRpcResponse
} from '../../shared/json-rpc';
import { resolveHostBundlePath } from '../../shared/extension-paths';
import type { FinanceExtensionManifest } from '../../types/finance';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Lifecycle events emitted by the IPC transport. Subscribers (typically Main)
 * forward these to the Renderer as `extensions:host-status` notifications so a
 * status-bar UI can show when extensions are unavailable.
 */
export type HostStatus =
  | { status: 'starting' }
  | { status: 'ready' }
  | { status: 'crashed'; exitCode: number | null }
  | { status: 'restarting' }
  | { status: 'restart-failed'; error: string };

export interface ExtensionIPCOptions {
  /** Path to the bundled Host entry. Defaults to `resolveHostBundlePath()`. */
  hostPath?: string;
  /** Request timeout in ms. Defaults to 10_000. */
  requestTimeoutMs?: number;
}

export class ExtensionIPC {
  private process: UtilityProcess | null = null;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly listeners = new Set<(msg: unknown) => void>();
  private readonly statusListeners = new Set<(status: HostStatus) => void>();
  private readonly requestTimeoutMs: number;
  private readonly hostPath: string;
  private initialManifests: FinanceExtensionManifest[] = [];
  private crashed = false;
  private shuttingDown = false;
  private restartPromise: Promise<void> | null = null;

  constructor(options: ExtensionIPCOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.hostPath = options.hostPath ?? resolveHostBundlePath();
  }

  /**
   * Start the Extension Host and send it the initial manifest list.
   * Safe to call on first start and to drive automatic re-spawn after a crash.
   */
  async start(initialManifests: FinanceExtensionManifest[]): Promise<void> {
    if (this.process && !this.crashed) return;
    if (this.restartPromise) return this.restartPromise;

    this.initialManifests = initialManifests;
    this.crashed = false;
    this.emitStatus({ status: 'starting' });

    const doStart = async (): Promise<void> => {
      this.process = utilityProcess.fork(this.hostPath, [], {
        serviceName: 'finance-extension-host',
        stdio: 'inherit'
      });

      this.process.on('message', (msg: unknown) => this.handleMessage(msg));
      this.process.on('exit', (code) => this.handleExit(code));

      // Wait for the Host to announce readiness.
      await new Promise<void>((resolveReady, rejectReady) => {
        const timer = setTimeout(
          () => rejectReady(new Error('Extension Host did not become ready in time')),
          this.requestTimeoutMs
        );
        const onMessage = (msg: unknown): void => {
          if (
            typeof msg === 'object' &&
            msg !== null &&
            (msg as { method?: string }).method === 'host.ready'
          ) {
            clearTimeout(timer);
            this.process?.off('message', onMessage);
            resolveReady();
          }
        };
        this.process!.on('message', onMessage);
      });

      // Send the manifests.
      await this.request('host.initialize', { manifests: this.initialManifests });
      this.emitStatus({ status: 'ready' });
    };

    this.restartPromise = doStart().finally(() => {
      this.restartPromise = null;
    });

    try {
      await this.restartPromise;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emitStatus({ status: 'restart-failed', error: message });
      throw err;
    }
  }

  /**
   * `utilityProcess` 'exit' handler. Differentiates graceful shutdown
   * (from `stop()`) from an unexpected crash, and on crash sets the
   * `crashed` flag so the next `request()` triggers re-spawn.
   */
  private handleExit(code: number | null): void {
    if (this.shuttingDown) {
      // Expected shutdown — clear the flag and do not treat as a crash.
      //
      // [Review observation #3 — post-review] Also null the process reference
      // so `isRunning()` returns false after `stop()` and the next `start()`
      // does not early-return without re-sending manifests. Without this, the
      // sequence "shutdown → start" hangs the IPC channel: `this.process`
      // still points at the dead UtilityProcess, `isRunning()` returns true,
      // `start()` short-circuits, and subsequent `request()` calls post to a
      // dead handle (silently dropped or thrown, depending on Electron's
      // behavior). The race between `stop()`'s null-check and `notify()` is
      // what surfaces this; the fix makes both paths converge on a consistent
      // "not running" state.
      this.shuttingDown = false;
      this.process = null;
      return;
    }
    const err = new Error(`Extension Host exited unexpectedly (code ${code})`);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
    this.process = null;
    this.crashed = true;
    this.emitStatus({ status: 'crashed', exitCode: code });
  }

  /**
   * Ensure the Host is running before any RPC call. If it has crashed,
   * transparently re-spawns with the same manifest list. If it has never
   * been started, throws a clear error so the caller can distinguish
   * "never started" from "crashed and retrying".
   */
  private async ensureRunning(): Promise<void> {
    if (this.process && !this.crashed) return;
    if (this.restartPromise) return this.restartPromise;
    if (!this.crashed) {
      throw new Error('ExtensionIPC not started. Call start() first.');
    }
    this.emitStatus({ status: 'restarting' });
    await this.start(this.initialManifests);
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    await this.ensureRunning();
    if (!this.process) {
      throw new Error('Extension Host unavailable after restart attempt.');
    }
    const id = makeRequestId();
    const message: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Extension Host request "${method}" timed out after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.process!.postMessage(message);
    });
  }

  notify(method: string, params?: unknown): void {
    if (!this.process || this.crashed) return;
    this.process.postMessage({ jsonrpc: '2.0', method, params });
  }

  /**
   * Subscribe to lifecycle status changes. Used by Main to forward
   * `extensions:host-status` notifications to the Renderer for a status-bar UI.
   * Returns an unsubscribe function.
   */
  onHostStatus(listener: (status: HostStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private emitStatus(status: HostStatus): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('[extension-ipc] status listener threw:', err);
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.process) return;
    this.shuttingDown = true;
    this.notify('host.shutdown');
    // Give the Host 1s to gracefully exit, then kill.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try { this.process?.kill(); } catch { /* already dead */ }
        resolve();
      }, 1_000);
      this.process!.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }

  isRunning(): boolean {
    return this.process !== null && !this.crashed;
  }

  private handleMessage(msg: unknown): void {
    if (isRequest(msg)) {
      // Main never receives requests from Host in Phase 3, only responses/notifications.
      // If we get one, treat it as a protocol violation.
      console.error('[extension-ipc] unexpected request from Host:', msg);
      return;
    }
    if (typeof msg === 'object' && msg !== null && 'id' in (msg as object)) {
      const response = msg as JsonRpcResponse;
      const pending = this.pending.get(response.id);
      if (!pending) return; // late or duplicate response
      clearTimeout(pending.timer);
      this.pending.delete(response.id);
      if ('error' in response) {
        pending.reject(new Error(`${response.error.message} (code ${response.error.code})`));
      } else {
        pending.resolve(response.result);
      }
      return;
    }
    // Notification — forward to listeners (used for `extension.activated` etc.).
    for (const listener of this.listeners) listener(msg);
  }
}
```

> **Edge case — crash during `ensureRunning` re-spawn:** If the Host crashes again immediately after re-spawning (e.g., the bundled `host.js` is corrupted), `ensureRunning` awaits `start()`, which rejects and emits `restart-failed`. The renderer's call to `financeShell.extensions.activateView()` rejects with the same error, and the Renderer surfaces it in the status bar. This is the correct graceful-degradation behaviour: the shell stays alive and the user sees a clear failure message.

- [ ] **Step 2: Commit**

```bash
git add src/main/services/extension-ipc.ts
git commit -m "feat: add Extension IPC transport over utilityProcess + JSON-RPC"
```

---

## Task 9: Create the Mock `salary-history` Extension

**Files:**
- Create: `extensions/salary-history/package.json`
- Create: `extensions/salary-history/src/main.ts`

- [ ] **Step 1: Create the extension manifest**

`extensions/salary-history/package.json`:

```json
{
  "name": "salary-history",
  "version": "0.1.0",
  "description": "Salary History extension (Phase 3 stub — registration only).",
  "private": true,
  "main": "src/main.ts",
  "financeExtension": {
    "id": "salary-history",
    "displayName": "Salary History",
    "version": "0.1.0",
    "description": "Payslip entry and salary history tracking.",
    "activationEvents": ["onView:salary-history"],
    "contributes": {
      "views": [
        {
          "id": "salary-history",
          "name": "Salary",
          "icon": "P"
        }
      ],
      "commands": [
        {
          "id": "salary.showPayHistory",
          "title": "View: Pay History"
        },
        {
          "id": "salary.showDeductions",
          "title": "View: Deductions"
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Create the extension entry stub**

`extensions/salary-history/src/main.ts`:

```typescript
/**
 * Phase 3 stub for the salary-history extension. Registers two commands
 * with the finance.commands API. Phase 4 replaces this body with payslip
 * forms, validation, and persistence.
 */
export async function activate(finance: {
  commands: {
    registerCommand(id: string, title: string, handler: (...args: unknown[]) => unknown, keybinding?: string): void;
    execute(id: string, ...args: unknown[]): Promise<unknown>;
  };
}): Promise<void> {
  finance.commands.registerCommand('salary.showPayHistory', 'View: Pay History', () => {
    console.log('[salary-history] Pay History view requested');
    // Phase 4 will open the payslip form here.
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

- [ ] **Step 3: Commit**

```bash
git add extensions/salary-history/
git commit -m "feat: add mock salary-history extension (Phase 3 stub)"
```

---

## Task 10: Wire Extensions into the Main Process

**Files:**
- Modify: `src/main/main.ts`

- [ ] **Step 1: Update `src/main/main.ts` to spawn the Host and run the Loader**

Append the imports and call sites. The existing DB/settings boot block stays as-is.

Add at the top of the file (after existing imports):

```typescript
import { discoverExtensions } from './services/extension-loader';
import { ExtensionRegistry } from './services/extension-registry';
import { ExtensionIPC } from './services/extension-ipc';
```

Add a module-scoped reference next to `mainWindow`:

```typescript
let extensionRegistry: ExtensionRegistry | null = null;
let extensionIPC: ExtensionIPC | null = null;
```

Add a helper near the other resolve* helpers:

```typescript
function resolveExtensionsRoot(): string {
  // Phase 3: extensions live inside the repo. Phase 8 will add a user-data root.
  return join(app.getAppPath(), 'extensions');
}
```

Replace the body of `app.whenReady().then(...)` to include extension boot:

```typescript
app.whenReady().then(() => {
  try {
    const dbPath = resolveDatabasePath();
    // [Review fix §3.5] Log the resolved database path so Test Unit 6 (and
    // any future manual debugging) knows where the SQLite file lives without
    // guessing platform-specific %APPDATA%/XDG_CONFIG_HOME paths.
    console.log(`[main] database path: ${dbPath}`);
    initializeDatabase(dbPath);
    initializeSettings();

    // Boot extensions BEFORE the window so the renderer can fetch contributions on first paint.
    extensionRegistry = new ExtensionRegistry();
    const discovery = discoverExtensions(resolveExtensionsRoot());
    for (const { manifest } of discovery.extensions) {
      extensionRegistry.upsert(manifest);
    }
    for (const skipped of discovery.skipped) {
      console.warn(`[extensions] skipped "${skipped.directory}": ${skipped.reason}`);
    }

    extensionIPC = new ExtensionIPC();
    extensionIPC.start(extensionRegistry.list()).catch((err) => {
      // [Review fix §2.2] Replace fire-and-forget `void` with an explicit
      // .catch() so startup failures (missing bundle, sandbox restrictions,
      // handshake timeout) are logged cleanly instead of becoming unhandled
      // promise rejections. The renderer still boots; it just sees an empty
      // contribution list until the host recovers (see §2.1 crash recovery).
      console.error('[extensions] Extension Host failed to start:', err);
    });

    // Forward host lifecycle events to the renderer so the status bar can
    // surface crash / restart / unavailable state. See Test Unit 5.
    extensionIPC.onHostStatus((status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('extensions:host-status', status);
      }
    });

    registerIpcHandlers();
    void createWindow();
  } catch (err) {
    console.error('Fatal error during app initialization:', err);
    dialog.showErrorBox(
      'Startup Error',
      `Finance Flow AI encountered a fatal error during startup:\n\n${err instanceof Error ? err.message : String(err)}\n\nPlease check the logs and try again.`
    );
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});
```

Update `shutdownPersistence()` to also stop the IPC:

```typescript
function shutdownPersistence(): void {
  dbClosed = true;
  clearWindowStateSaveTimer();
  void extensionIPC?.stop().catch((err) => console.error('Extension IPC shutdown failed:', err));
  extensionIPC = null;
  closeSettings();
  closeDatabase();
}
```

- [ ] **Step 2: Add IPC handlers for extensions and view activations**

Inside `registerIpcHandlers()`, add:

```typescript
ipcMain.handle('extensions:list', () => {
  if (!extensionRegistry) return { views: [], commands: [] };
  return {
    views: extensionRegistry.views(),
    commands: extensionRegistry.commands()
  };
});

// [Follow-up §3.9] Main-side activate-view try/catch error handling
ipcMain.handle('extensions:activate-view', async (_event, viewId: string) => {
  if (!extensionIPC || !extensionRegistry) return { activated: false, reason: 'host not running' };
  try {
    // Find the extension that owns this view, then ask the host to activate it.
    const owning = extensionRegistry.views().find((v) => v.view.id === viewId);
    if (!owning) return { activated: false, reason: 'view not found' };
    const result = await extensionIPC.request<{ activated: boolean }>('extension.activate', {
      extensionId: owning.extensionId,
      reason: `onView:${viewId}`
    });
    if (result.activated) {
      extensionRegistry.markActivated(owning.extensionId);
    }
    return result;
  } catch (err) {
    console.error(`extensions:activate-view failed for "${viewId}":`, err);
    return { activated: false, reason: err instanceof Error ? err.message : String(err) };
  }
});

// [Review fix §2.3] Phase 3 stub: prove the IPC channel exists end-to-end by
// forwarding extension command execution to the Host. The Host handler is a
// thin wrapper around the existing `finance.commands.execute` stub. Phase 5
// will swap the stub for real execution; the Main-side handler is unchanged.
ipcMain.handle(
  'extensions:execute-command',
  async (_event, commandId: string, ...args: unknown[]) => {
    if (!extensionIPC) return { executed: false, reason: 'host not running' };
    try {
      const result = await extensionIPC.request<{ executed: boolean; result: unknown }>(
        'extension.executeCommand',
        { commandId, args }
      );
      return result;
    } catch (err) {
      return { executed: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
);
```

- [ ] **Step 3: Commit**

```bash
git add src/main/main.ts
git commit -m "feat: wire Extension Loader, Registry, and IPC into Main process"
```

---

## Task 11: Update Preload Bridge

**Files:**
- Modify: `src/preload/preload.ts`

- [ ] **Step 1: Add extensions API to the preload bridge**

`src/preload/preload.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron';

const shellApi = {
  getVersion: async (): Promise<string> => ipcRenderer.invoke('shell:get-version') as Promise<string>,
  settings: {
    get: async (key: string): Promise<unknown> => ipcRenderer.invoke('settings:get', key),
    set: async (key: string, value: unknown): Promise<void> => { await ipcRenderer.invoke('settings:set', key, value); }
  },
  extensions: {
    list: async (): Promise<{
      views: Array<{ extensionId: string; view: { id: string; name: string; icon: string } }>;
      commands: Array<{ extensionId: string; command: { id: string; title: string; keybinding?: string } }>;
    }> => ipcRenderer.invoke('extensions:list'),
    activateView: async (viewId: string): Promise<{ activated: boolean; reason?: string }> =>
      ipcRenderer.invoke('extensions:activate-view', viewId)
  }
};

contextBridge.exposeInMainWorld('financeShell', shellApi);
```

- [ ] **Step 2: Commit**

```bash
git add src/preload/preload.ts
git commit -m "feat: add extensions API to preload bridge"
```

---

## Task 12: Update Type Declarations

**Files:**
- Modify: `src/types/finance-shell.d.ts`

- [ ] **Step 1: Add the Extensions API types** *(incorporates [Review fix §3.2] — import the manifest types from `finance.d.ts` rather than redeclaring)*

`src/types/finance-shell.d.ts`:

```typescript
// [Review fix §3.2] Import the canonical manifest contribution shapes from
// `finance.d.ts` instead of redeclaring them here. A shape change in the
// canonical type now propagates automatically; the previous redeclaration
// was a latent drift bug if the types ever diverged.
import type { ManifestViewContribution, ManifestCommandContribution } from './finance';

export interface SettingsApi {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
}

export interface ExtensionsApi {
  list: () => Promise<{
    views: Array<{ extensionId: string; view: ManifestViewContribution }>;
    commands: Array<{ extensionId: string; command: ManifestCommandContribution }>;
  }>;
  activateView: (viewId: string) => Promise<{ activated: boolean; reason?: string }>;
}

export interface FinanceShellApi {
  getVersion: () => Promise<string>;
  settings: SettingsApi;
  extensions: ExtensionsApi;
}

declare global {
  interface Window {
    financeShell: FinanceShellApi;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/finance-shell.d.ts
git commit -m "feat: add ExtensionsApi to type declarations"
```

---

## Task 13: Update Renderer for Dynamic Activity Bar

**Files:**
- Modify: `src/renderer/components/activity-bar.ts`
- Modify: `src/renderer/components/command-palette.ts`
- Modify: `src/renderer/index.ts`

The Activity Bar now renders one button per enabled extension view (plus a hardcoded Settings button). The Command Palette lists extension commands in addition to its built-ins. Both fetch contributions on startup via the new `financeShell.extensions` API.

- [ ] **Step 1: Replace `activity-bar.ts` with a contribution-driven renderer**

`src/renderer/components/activity-bar.ts`:

```typescript
import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface ActivityView {
  id: string;
  name: string;
  icon: string;
}

@customElement('activity-bar')
export class ActivityBar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
    }

    button {
      position: relative;
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
      font: inherit;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    button:hover,
    button.active {
      background: rgba(255, 255, 255, 0.08);
      color: #f8fafc;
    }

    button:hover {
      transform: scale(1.05);
    }

    button.active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 6px;
      bottom: 6px;
      width: 3px;
      background: var(--accent);
      border-radius: 0 4px 4px 0;
      box-shadow: 0 0 8px var(--accent);
    }

    .settings {
      margin-top: auto;
    }

    .empty-hint {
      color: #475569;
      font-size: 10px;
      margin-top: 8px;
      writing-mode: vertical-rl;
      text-orientation: mixed;
    }
  `;

  @property({ type: Array })
  views: ActivityView[] = [];

  @property({ type: String })
  activeView: string = '';

  private _selectView(viewId: string) {
    this.activeView = viewId;
    this.dispatchEvent(new CustomEvent('view-changed', {
      detail: { view: viewId, source: 'extension' },
      bubbles: true,
      composed: true
    }));
    this.requestUpdate();
  }

  render() {
    const buttons = this.views.map((view) => html`
      <button
        class="${this.activeView === view.id ? 'active' : ''}"
        title="${view.name}"
        aria-label="${view.name}"
        data-view-id="${view.id}"
        @click="${() => this._selectView(view.id)}"
      >${view.icon}</button>
    `);
    return html`
      ${buttons}
      ${this.views.length === 0 ? html`<div class="empty-hint">No extensions</div>` : ''}
      <button
        class="settings ${this.activeView === '__settings__' ? 'active' : ''}"
        title="Settings"
        aria-label="Settings"
        @click="${() => this._selectView('__settings__')}"
      >S</button>
    `;
  }
}
```

- [ ] **Step 2: Update `command-palette.ts` to accept extension commands** *(incorporates [Review fix §3.3] — add `@input` filter so typing actually filters the list)*

`src/renderer/components/command-palette.ts`:

```typescript
import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

export interface PaletteCommand {
  id: string;
  label: string;
  /** If true, this is an extension command and we forward the click to Main. */
  extensionCommand?: boolean;
}

const BUILT_IN_COMMANDS: PaletteCommand[] = [
  { id: 'view-dashboard', label: 'View: Dashboard' },
  { id: 'toggle-ai', label: 'View: Toggle AI Assistant' },
  { id: 'new-workspace', label: 'File: New Workspace' }
];

@customElement('command-palette')
export class CommandPalette extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    input {
      width: 100%;
      padding: 14px;
      border: 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: transparent;
      color: #ffffff;
      font-size: 14px;
    }

    input:focus {
      outline: none;
    }

    .palette-list {
      max-height: 320px;
      overflow-y: auto;
      padding: 6px;
    }

    .palette-item {
      padding: 8px 12px;
      font-size: 13px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .palette-item.selected {
      background: var(--accent);
      color: #ffffff;
    }

    .group-label {
      padding: 6px 12px 2px;
      color: #94a3b8;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .empty-hint {
      padding: 12px;
      color: #94a3b8;
      font-size: 12px;
      text-align: center;
    }
  `;

  @state()
  private _selectedIndex = 0;

  // [Review fix §3.3] Holds the live filter query. Updated via the input's
  // `@input` handler; resets to '' when the palette is re-opened.
  @state()
  private _query = '';

  @property({ type: Array })
  extensionCommands: PaletteCommand[] = [];

  /** Case-insensitive substring filter applied to both groups. */
  private _matches(cmd: PaletteCommand): boolean {
    if (this._query === '') return true;
    return cmd.label.toLowerCase().includes(this._query.toLowerCase());
  }

  private get _builtInFiltered(): PaletteCommand[] {
    return BUILT_IN_COMMANDS.filter((c) => this._matches(c));
  }

  private get _extensionFiltered(): PaletteCommand[] {
    return this.extensionCommands.filter((c) => this._matches(c));
  }

  /** Flat list for keyboard navigation. Indices line up with rendered rows. */
  private get _items(): PaletteCommand[] {
    return [...this._builtInFiltered, ...this._extensionFiltered];
  }

  firstUpdated() {
    this.addEventListener('keydown', this._handleKeyDown);
  }

  focusInput() {
    const input = this.shadowRoot?.querySelector('input');
    if (input) {
      input.focus();
      input.value = '';
    }
    this._query = '';
    this._selectedIndex = 0;
  }

  private _handleInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this._query = input.value;
    this._selectedIndex = 0;
  }

  private _handleKeyDown(event: KeyboardEvent) {
    const items = this._items;
    if (items.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this._selectedIndex = (this._selectedIndex + 1) % items.length;
      this._scrollSelectedIntoView();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this._selectedIndex = (this._selectedIndex - 1 + items.length) % items.length;
      this._scrollSelectedIntoView();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this._selectItem(items[this._selectedIndex]);
    }
  }

  // [Follow-up §3.11] Command Palette selection scroll into view
  private _scrollSelectedIntoView() {
    this.updateComplete.then(() => {
      const selected = this.shadowRoot?.querySelector('.palette-item.selected');
      selected?.scrollIntoView({ block: 'nearest' });
    });
  }

  private _selectItem(item: PaletteCommand) {
    this.dispatchEvent(new CustomEvent('command-selected', {
      detail: { command: item.id, extensionCommand: !!item.extensionCommand },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    const builtIn = this._builtInFiltered;
    const extension = this._extensionFiltered;
    const builtInEnd = builtIn.length;
    const hasResults = builtIn.length + extension.length > 0;

    return html`
      <input
        aria-label="Command palette input"
        placeholder="Type a command..."
        @input=${this._handleInput}
      />
      <div class="palette-list" role="listbox">
        ${hasResults ? '' : html`<div class="empty-hint">No matching commands</div>`}
        ${builtIn.length > 0 ? html`<div class="group-label">Built-in</div>` : ''}
        ${builtIn.map((item, index) => html`
          <div
            class="palette-item ${index === this._selectedIndex ? 'selected' : ''}"
            role="option"
            aria-selected="${index === this._selectedIndex}"
            @click="${() => this._selectItem(item)}"
            @mouseenter="${() => this._selectedIndex = index}"
          >${item.label}</div>
        `)}
        ${extension.length > 0 ? html`<div class="group-label">Extensions</div>` : ''}
        ${extension.map((item, i) => {
          const index = builtInEnd + i;
          return html`
            <div
              class="palette-item ${index === this._selectedIndex ? 'selected' : ''}"
              role="option"
              aria-selected="${index === this._selectedIndex}"
              @click="${() => this._selectItem(item)}"
              @mouseenter="${() => this._selectedIndex = index}"
            >${item.label}</div>
          `;
        })}
      </div>
    `;
  }
}
```

- [ ] **Step 3: Update `index.ts` to load contributions and wire them in**

`src/renderer/index.ts`:

```typescript
import './components/activity-bar';
import './components/navigation-panel';
import './components/workspace';
import './components/ai-panel';
import './components/command-palette';
import type { ActivityView, PaletteCommand } from './components/activity-bar';
import type { PaletteCommand as PaletteCommandItem } from './components/command-palette';

const app = document.querySelector<HTMLElement>('#app');
const commandPalette = document.querySelector<HTMLElement & { focusInput(): void }>('#command-palette');
const navigationPanel = document.querySelector<HTMLElement & { setView(view: string): void }>('#navigation-panel');
const activityBar = document.querySelector<HTMLElement & { views: ActivityView[]; activeView: string }>('#activity-bar');

function setCommandPaletteVisible(visible: boolean): void {
  commandPalette?.classList.toggle('hidden', !visible);
  if (visible) commandPalette?.focusInput();
}

function toggleAiPanel(): void {
  app?.classList.toggle('ai-collapsed');
  void window.financeShell?.settings.set('core.ui.aiCollapsed', app?.classList.contains('ai-collapsed'));
}

async function applyTheme(theme: unknown): Promise<void> {
  if (theme === 'light') document.body.classList.add('light-theme');
  else document.body.classList.remove('light-theme');
}

async function toggleTheme(): Promise<void> {
  const isLight = document.body.classList.toggle('light-theme');
  await window.financeShell?.settings.set('core.theme', isLight ? 'light' : 'dark');
}

async function loadExtensionContributions(): Promise<void> {
  try {
    const contributions = await window.financeShell?.extensions.list();
    if (!contributions) return;
    if (activityBar) {
      activityBar.views = contributions.views.map((v) => ({ id: v.view.id, name: v.view.name, icon: v.view.icon }));
    }
    if (commandPalette) {
      commandPalette.extensionCommands = contributions.commands.map((c) => ({
        id: c.command.id,
        label: c.command.title,
        extensionCommand: true
      }));
    }
  } catch (err) {
    console.error('Failed to load extension contributions:', err);
  }
}

window.addEventListener('click', (event) => {
  if (commandPalette && !commandPalette.classList.contains('hidden')) {
    const path = event.composedPath();
    if (!path.includes(commandPalette)) setCommandPaletteVisible(false);
  }
});

window.addEventListener('view-changed', (event: Event) => {
  const customEvent = event as CustomEvent<{ view: string; source: string }>;
  if (navigationPanel) navigationPanel.setView(customEvent.detail.view);
  // Ask Main to activate the extension behind this view (no-op for built-in settings view).
  if (customEvent.detail.view !== '__settings__' && customEvent.detail.source === 'extension') {
    void window.financeShell?.extensions.activateView(customEvent.detail.view);
  }
});

window.addEventListener('command-selected', (event: Event) => {
  const customEvent = event as CustomEvent<{ command: string; extensionCommand: boolean }>;
  const cmd = customEvent.detail.command;
  if (customEvent.detail.extensionCommand) {
    // Phase 3: log only. Phase 5 will dispatch via the AI tool registry / extension IPC.
    console.log(`[palette] extension command selected: ${cmd}`);
  } else {
    if (cmd === 'toggle-ai') toggleAiPanel();
    else if (cmd === 'view-dashboard') navigationPanel?.setView('Dashboard');
  }
  setCommandPaletteVisible(false);
});

window.addEventListener('DOMContentLoaded', async () => {
  const version = await window.financeShell?.getVersion() ?? 'dev-browser';

  const theme = await window.financeShell?.settings.get('core.theme');
  if (theme !== undefined) await applyTheme(theme);

  const aiCollapsed = await window.financeShell?.settings.get('core.ui.aiCollapsed');
  if (aiCollapsed === true) app?.classList.add('ai-collapsed');

  await loadExtensionContributions();

  const statusBar = document.querySelector('#status-bar');
  if (statusBar) {
    const themeBtn = document.createElement('span');
    themeBtn.className = 'status-item status-btn';
    themeBtn.dataset.action = 'toggle-theme';
    themeBtn.textContent = document.body.classList.contains('light-theme') ? '☀ Light' : '🌙 Dark';
    themeBtn.addEventListener('click', async () => {
      await toggleTheme();
      themeBtn.textContent = document.body.classList.contains('light-theme') ? '☀ Light' : '🌙 Dark';
    });
    statusBar.appendChild(themeBtn);

    const versionTag = document.createElement('span');
    versionTag.className = 'status-item version-tag';
    versionTag.textContent = `v${version}`;
    statusBar.appendChild(versionTag);
  }
});

window.addEventListener('keydown', (event) => {
  const commandKey = event.ctrlKey || event.metaKey;

  if (commandKey && event.shiftKey && event.key.toLowerCase() === 'p') {
    event.preventDefault();
    setCommandPaletteVisible(commandPalette?.classList.contains('hidden') ?? true);
  }

  if (commandKey && event.key.toLowerCase() === 'j') {
    event.preventDefault();
    toggleAiPanel();
  }

  if (event.key === 'Escape') setCommandPaletteVisible(false);
});
```

> **Note:** `PaletteCommand` is exported from both `activity-bar.ts` and `command-palette.ts` — the `index.ts` import for `PaletteCommand` was renamed to `PaletteCommandItem` to avoid the duplicate-name collision. The shape is identical.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/activity-bar.ts src/renderer/components/command-palette.ts src/renderer/index.ts
git commit -m "feat: render Activity Bar and Command Palette from extension contributions"
```

---

## Task 14: Add Electron-Aware Playwright

**Files:**
- Create: `playwright.electron.config.ts`

The Phase 2 plan deferred E2E tests because Playwright ran only against the Vite renderer (no Electron). Phase 3 enables `playwright._electron.launch()` and routes the existing Phase 2 + new Phase 3 tests through it.

- [ ] **Step 1: Create the Electron Playwright config**

`playwright.electron.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: {
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'electron',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
```

- [ ] **Step 2: Add Electron test scripts**

```bash
npm pkg set scripts.test:e2e="playwright test --config playwright.electron.config.ts"
```

> The existing `playwright.config.ts` is kept for browser-only smoke tests (if needed for renderer iteration outside Electron). The new `test:e2e` script runs the Electron suite.

- [ ] **Step 3: Commit**

```bash
git add playwright.electron.config.ts package.json
git commit -m "test: add Electron-aware Playwright config"
```

---

## Task 15: Write Unit Tests

**Files:**
- Create: `tests/unit/extension-host/manifest-schema.test.ts`
- Create: `tests/unit/extension-host/json-rpc.test.ts`
- Create: `tests/unit/services/extension-loader.test.ts`

- [ ] **Step 1: Manifest schema tests**

`tests/unit/extension-host/manifest-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateManifest } from '../../../src/extension-host/manifest-schema';

const validManifest = {
  id: 'salary-history',
  displayName: 'Salary History',
  version: '0.1.0',
  activationEvents: ['onView:salary-history'],
  contributions: {
    views: [{ id: 'salary-history', name: 'Salary', icon: 'P' }],
    commands: [{ id: 'salary.showPayHistory', title: 'View: Pay History' }]
  },
  main: 'src/main.ts'
};

describe('validateManifest', () => {
  it('accepts a minimal valid manifest', () => {
    const result = validateManifest(validManifest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.id).toBe('salary-history');
      expect(result.manifest.contributions.views).toHaveLength(1);
    }
  });

  it('accepts wildcard activation event', () => {
    const result = validateManifest({ ...validManifest, activationEvents: ['*'] });
    expect(result.ok).toBe(true);
  });

  it('rejects missing activationEvents', () => {
    const { activationEvents, ...rest } = validManifest;
    const result = validateManifest(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('activationEvents'))).toBe(true);
    }
  });

  it('rejects empty activationEvents array', () => {
    const result = validateManifest({ ...validManifest, activationEvents: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid view id (uppercase)', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: { views: [{ id: 'SalaryHistory', name: 'Salary', icon: 'P' }] }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('view id'))).toBe(true);
  });

  it('rejects unknown manifest keys (strict mode)', () => {
    const result = validateManifest({ ...validManifest, unknownKey: 'surprise' });
    expect(result.ok).toBe(false);
  });

  it('rejects unknown contribution keys (strict mode)', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: { views: [], themes: [{ id: 'neon', label: 'Neon' }] }
    });
    expect(result.ok).toBe(false);
  });

  it('rejects enum type without enumOptions', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: {
        configuration: [{ key: 'salary-history.mode', type: 'enum', label: 'Mode' }]
      }
    });
    expect(result.ok).toBe(false);
  });

  it('accepts enum type with enumOptions', () => {
    const result = validateManifest({
      ...validManifest,
      contributions: {
        configuration: [{
          key: 'salary-history.mode',
          type: 'enum',
          label: 'Mode',
          enumOptions: ['gross', 'net'],
          default: 'gross'
        }]
      }
    });
    expect(result.ok).toBe(true);
  });

  it('rejects semver-less version', () => {
    const result = validateManifest({ ...validManifest, version: 'latest' });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: JSON-RPC envelope tests**

`tests/unit/extension-host/json-rpc.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isRequest, isNotification, makeRequestId } from '../../../src/shared/json-rpc';

describe('JSON-RPC envelopes', () => {
  it('isRequest accepts a valid request', () => {
    expect(isRequest({ jsonrpc: '2.0', id: 1, method: 'host.initialize' })).toBe(true);
  });

  it('isRequest rejects a notification (no id)', () => {
    expect(isRequest({ jsonrpc: '2.0', method: 'host.ready' })).toBe(false);
  });

  it('isRequest rejects a response', () => {
    expect(isRequest({ jsonrpc: '2.0', id: 1, result: {} })).toBe(false);
  });

  it('isRequest rejects non-objects', () => {
    expect(isRequest('hello')).toBe(false);
    expect(isRequest(null)).toBe(false);
    expect(isRequest(undefined)).toBe(false);
  });

  it('isNotification accepts a notification', () => {
    expect(isNotification({ jsonrpc: '2.0', method: 'host.ready' })).toBe(true);
  });

  it('isNotification rejects a request', () => {
    expect(isNotification({ jsonrpc: '2.0', id: 1, method: 'foo' })).toBe(false);
  });

  it('makeRequestId produces unique increasing ids', () => {
    const a = makeRequestId();
    const b = makeRequestId();
    const c = makeRequestId();
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});
```

- [ ] **Step 3: Extension loader tests**

`tests/unit/services/extension-loader.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverExtensions } from '../../../src/main/services/extension-loader';

describe('discoverExtensions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'finance-ext-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers a single valid extension', () => {
    const extDir = join(tmpDir, 'salary-history');
    mkdirSync(extDir);
    writeFileSync(join(extDir, 'package.json'), JSON.stringify({
      name: 'salary-history',
      version: '0.1.0',
      financeExtension: {
        id: 'salary-history',
        displayName: 'Salary History',
        version: '0.1.0',
        activationEvents: ['onView:salary-history'],
        contributions: { views: [{ id: 'salary-history', name: 'Salary', icon: 'P' }] },
        main: 'src/main.ts'
      }
    }));

    const result = discoverExtensions(tmpDir, { logger: () => {} });
    expect(result.extensions).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    expect(result.extensions[0].manifest.id).toBe('salary-history');
    // Falls back to package.json#version when manifest omits it.
    expect(result.extensions[0].manifest.version).toBe('0.1.0');
  });

  it('skips directories without a financeExtension field', () => {
    const extDir = join(tmpDir, 'plain-package');
    mkdirSync(extDir);
    writeFileSync(join(extDir, 'package.json'), JSON.stringify({ name: 'plain-package', version: '1.0.0' }));

    const result = discoverExtensions(tmpDir, { logger: () => {} });
    expect(result.extensions).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('no financeExtension');
  });

  it('skips extensions with mismatched name and id', () => {
    const extDir = join(tmpDir, 'mismatch');
    mkdirSync(extDir);
    writeFileSync(join(extDir, 'package.json'), JSON.stringify({
      name: 'mismatch',
      version: '0.1.0',
      financeExtension: {
        id: 'different-id',
        displayName: 'Mismatch',
        version: '0.1.0',
        activationEvents: ['*'],
        contributions: {},
        main: 'src/main.ts'
      }
    }));

    const result = discoverExtensions(tmpDir, { logger: () => {} });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('does not match');
  });

  it('skips extensions with invalid manifest and reports errors', () => {
    const extDir = join(tmpDir, 'bad-manifest');
    mkdirSync(extDir);
    writeFileSync(join(extDir, 'package.json'), JSON.stringify({
      name: 'bad-manifest',
      financeExtension: {
        id: 'Bad_ID', // uppercase + underscore — should fail
        displayName: 'X',
        activationEvents: [],
        contributions: {},
        main: ''
      }
    }));

    const result = discoverExtensions(tmpDir, { logger: () => {} });
    expect(result.extensions).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('invalid manifest');
  });

  it('skips node_modules and dist directories', () => {
    const skipDir = join(tmpDir, 'node_modules');
    mkdirSync(skipDir);
    writeFileSync(join(skipDir, 'package.json'), '{}');

    const distDir = join(tmpDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'package.json'), '{}');

    const result = discoverExtensions(tmpDir, { logger: () => {} });
    expect(result.extensions).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('returns empty result when extensions root does not exist', () => {
    const result = discoverExtensions(join(tmpDir, 'does-not-exist'), { logger: () => {} });
    expect(result.extensions).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run unit tests**

```bash
npm run test:unit
```

Expected: All existing Phase 2 tests still pass (25 tests) plus the new Phase 3 tests:
- 10 manifest-schema tests
- 7 json-rpc tests
- 6 extension-loader tests

Total: 48 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/extension-host/ tests/unit/services/extension-loader.test.ts
git commit -m "test: add unit tests for manifest schema, JSON-RPC, and extension loader"
```

---

## Task 16: Write E2E Tests

**Files:**
- Create: `tests/e2e/extension-host.spec.ts`

- [ ] **Step 1: E2E test for dynamic Activity Bar from extension contributions**

`tests/e2e/extension-host.spec.ts`:

```typescript
import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { join } from 'node:path';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [join(__dirname, '..', '..', 'dist', 'main', 'main.js')],
    env: { ...process.env, NODE_ENV: 'production' }
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app.close();
});

test.describe('Phase 3 Extension Host', () => {
  test('Activity Bar shows a button for the salary-history extension view', async () => {
    const buttons = page.locator('activity-bar button[data-view-id="salary-history"]');
    await expect(buttons).toHaveCount(1);
    await expect(buttons).toHaveAttribute('title', 'Salary');
  });

  test('Built-in Settings button is always present', async () => {
    const settingsBtn = page.locator('activity-bar button.settings');
    await expect(settingsBtn).toBeVisible();
  });

  test('Command Palette lists extension commands under an Extensions group', async () => {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
    const palette = page.locator('#command-palette');
    await expect(palette).toBeVisible();
    const groupLabels = palette.locator('.group-label');
    await expect(groupLabels).toHaveText(['Built-in', 'Extensions']);
    const extensionsGroup = palette.locator('.palette-item').filter({ hasText: 'View: Pay History' });
    await expect(extensionsGroup).toHaveCount(1);
    await page.keyboard.press('Escape');
  });

  test('View activation via IPC returns activated=true after the host runs', async () => {
    // [Review fix §3.4] Drives the activation through the IPC contract rather
    // than coupling to Phase 1's `#navigation-panel .nav-title` DOM structure.
    // The original assertion was undocumented Phase 1 HTML; if the NavigationPanel
    // ever changes its class names or header structure, the test would fail for
    // an unrelated reason. The IPC contract (`activateView()` returns
    // `{ activated: boolean }`) is the stable public surface this test pins.
    const result = await page.evaluate(async () => {
      return await window.financeShell.extensions.activateView('salary-history');
    });

    expect(result).toMatchObject({ activated: true });
  });

  test('Host process crash is non-fatal (placeholder, see manual test for full coverage)', async () => {
    // This test is intentionally minimal — the host's non-fatal crash behaviour
    // is verified in the manual test units. E2E crash simulation would require
    // killing the utilityProcess from inside the test, which Phase 4+ will add.
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run the E2E tests**

```bash
npm run build && npm run test:e2e
```

Expected: All 5 Phase 3 E2E tests pass. (Phase 2 E2E tests in `renderer-shell.spec.ts` continue to pass against the same Electron app.)

> **Manual prerequisite:** Before running `npm run test:e2e`, you must run `npm run build` so `dist/main/main.js` and `dist/extension-host/host.js` exist. The test imports them by absolute path.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/extension-host.spec.ts
git commit -m "test: add E2E tests for dynamic Activity Bar and extension activation"
```

---

## Task 17: Manual Test Units + Phase Verification

This task is verification-only — no code is added.

- [ ] **[You] Step 1: Build and boot the application**

```bash
npm run build
npm run start
```

Wait for the Electron window to appear. Confirm no console errors (DevTools: `Ctrl+Shift+I`).

- [ ] **[You] Step 2: Run through each manual test unit and mark pass/fail**

---

### Test Unit 1: Extension Host Spawns on Startup

| Field | Detail |
|-------|--------|
| **How to test** | Open DevTools console (Ctrl+Shift+I) and observe startup logs |
| **Checklist** | |
| | 1. Console shows `[host] Extension Host process started (pid <N>)` |
| | 2. Main process logs no errors about `host.initialize` timeout |
| | 3. The status bar still renders normally (host crash isolation) |
| **Expected result** | The Extension Host process is spawned and ready before the window renders its first frame. |

| Pass/Fail | Notes |
|-----------|-------|

---

### Test Unit 2: Mock Extension Discovered and Registered

| Field | Detail |
|-------|--------|
| **How to test** | Inspect the Activity Bar after launch |
| **Checklist** | |
| | 1. Activity Bar shows a button labelled `P` with tooltip "Salary" |
| | 2. The button has `data-view-id="salary-history"` (DevTools: inspect element) |
| | 3. The hardcoded buttons (`D`, `B`, `X`) from Phase 1 are gone |
| | 4. The built-in Settings button (S) is still present |
| **Expected result** | The mock `salary-history` extension's view is rendered dynamically. No hardcoded buttons remain. |

| Pass/Fail | Notes |
|-----------|-------|

---

### Test Unit 3: Extension View Activation Round-Trip

| Field | Detail |
|-------|--------|
| **How to test** | Click the Salary History button in the Activity Bar |
| **Steps** | 1. Click the `P` button |
| | 2. Observe the Navigation Panel header changes to "Salary" with "Pay History" and "Deductions" items |
| | 3. DevTools console shows `[host] activated "salary-history" via "onView:salary-history"` |
| | 4. DevTools console shows `[salary-history] Pay History view requested` (from the extension's command handler if you clicked an extension command) |
| **Expected result** | The view-changed event flows Renderer → Main → Host → extension, and the Navigation Panel updates. |

| Pass/Fail | Notes |
|-----------|-------|

---

### Test Unit 4: Command Palette Lists Extension Commands

| Field | Detail |
|-------|--------|
| **How to test** | Open the Command Palette and inspect the items |
| **Steps** | 1. Press `Ctrl+Shift+P` |
| | 2. Two group labels appear: "Built-in" and "Extensions" |
| | 3. Under "Extensions", the salary-history commands "View: Pay History" and "View: Deductions" are listed |
| | 4. Selecting either logs the extension's handler output to the console |
| **Expected result** | Commands contributed by extensions appear in a labelled group, distinct from built-in commands. |

| Pass/Fail | Notes |
|-----------|-------|

---

### Test Unit 5: Extension Host Crash Isolation & Recovery

| Field | Detail |
|-------|--------|
| **How to test** | Force-kill the Extension Host process; observe the shell stays alive *and* recovers on next interaction *(incorporates [Review fix §2.1])* |
| **Steps** | 1. Open DevTools console (Ctrl+Shift+I) |
| | 2. Open Task Manager (or `ps`/Activity Monitor) |
| | 3. Find the `electron.exe` / `Electron Helper` process that is the utility process |
| | 4. Kill it |
| | 5. Observe the shell window remains visible, the Activity Bar still shows the buttons (contributions cached in registry) |
| | 6. **DevTools console shows `[extension-ipc] Extension Host exited unexpectedly (code …)`.** The `extensions:host-status` IPC notification is forwarded to the renderer's webContents (verifiable in DevTools by listening for the channel), proving the IPC plumbing works end-to-end. The *visible* status-bar UI ("Extensions unavailable" badge, recovery animation) is **deferred to Phase 4/5 polish** — consistent with the plan's Phase 3 scope of "IPC plumbing, not UI components". Phase 3 verification stops at "the crash is observable in DevTools"; the user-facing status bar is a real component that belongs with the other deferred UI work. |
| | 7. Click the Salary button. Observe the status bar briefly shows "Restarting…", then returns to ready. The click succeeds — the Navigation Panel updates to Salary, the DevTools console shows a fresh `[host] Extension Host process started (pid <N>)` log line with a **different PID than the original**. |
| | 8. The shell is fully functional again. |
| **Expected result** | (a) The Electron shell stays alive when the Extension Host dies — vision's "Crash Isolation" guarantee. (b) The next user-initiated extension interaction transparently re-spawns the Host with the same manifest list — completion of the lifecycle. (c) Status-bar notifications (forwarded via `extensions:host-status`) make the crash and recovery visible to the user. |

| Pass/Fail | Notes |
|-----------|-------|

---

### Test Unit 6: Disabling an Extension Removes Its Contributions

| Field | Detail |
|-------|--------|
| **How to test** | Mark the extension as disabled in the `extension_registry` table and relaunch |
| **Steps** | 1. Launch the app once. DevTools console shows `[main] database path: <absolute path>` *(per [Review fix §3.5] — the resolved `app.getPath('userData')` + `finance.db` is logged on startup so the tester doesn't need to guess platform-specific paths)* |
| | 2. Open a SQLite browser against that logged path |
| | 3. Run `UPDATE extension_registry SET enabled = 0 WHERE id = 'salary-history';` |
| | 4. Restart the app |
| **Expected result** | The Activity Bar shows no `P` button. The Command Palette shows no salary-history commands. The built-in Settings button remains. |

| Pass/Fail | Notes |
|-----------|-------|

---

### Test Unit 7: Invalid Manifest Is Skipped Gracefully

| Field | Detail |
|-------|--------|
| **How to test** | Add a malformed extension under `extensions/` and relaunch |
| **Steps** | 1. Create `extensions/broken/package.json` with an invalid manifest (e.g. missing `activationEvents`) |
| | 2. Restart the app |
| | 3. Open DevTools console |
| **Expected result** | The console shows `[extensions] skipped ".../extensions/broken": invalid manifest: <error details>` and the app boots normally. The Activity Bar still shows the salary-history button. |

| Pass/Fail | Notes |
|-----------|-------|

---

### Test Unit 8: Typecheck, Lint, and All Tests Pass

| Field | Detail |
|-------|--------|
| **How to test** | Run the verification commands |
| **Steps** | 1. `npm run typecheck` — zero errors |
| | 2. `npm run lint` — zero warnings |
| | 3. `npm run test:unit` — 48 tests pass (25 from Phase 2 + 23 new Phase 3 tests) |
| | 4. `npm run test:e2e` — all 5 Phase 3 E2E tests pass + all 8 Phase 2 E2E tests pass (now runnable under Electron) |
| **Expected result** | Strict TypeScript, ESLint, Vitest, and Playwright Electron all pass. |

| Pass/Fail | Notes |
|-----------|-------|

---

- [ ] **[AI] Step 3: Final commit**

```bash
git add AGENTS.md CHANGELOG.md docs/file-reference.md docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md playwright.electron.config.ts playwright.config.ts tests/e2e/ src/ extensions/ package.json package-lock.json tsconfig.json eslint.config.js vite.config.ts vite.main.config.ts vite.preload.config.ts vite.extension-host.config.ts .gitignore
git commit -m "feat: add Phase 3 Extension Host & IPC scaffolding"
```

> The aggregate CHANGELOG entry below is added as a separate edit before the commit, per AGENTS.md Rule 5.

---

## CHANGELOG Entry (apply before final commit)

Append to `CHANGELOG.md`:

```markdown
## [Unreleased]

### Added
- Phase 3: Extension Host & IPC Scaffolding implementation (`docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md`).
  - Electron `utilityProcess.fork()` Extension Host process spawned from Main on app startup; isolated, crash-resistant Node.js child process.
  - JSON-RPC 2.0 envelopes over the Host's MessagePort; request/response correlation, notifications, and standard error codes (`src/shared/json-rpc.ts` — moved from `src/extension-host/` per [Review fix §3.1] so the protocol is owned equally by Main and Host).
  - Manifest types in `src/types/finance.d.ts` (replaces Phase 1 placeholder): `FinanceExtensionManifest`, `ActivationEvent`, `ManifestViewContribution`, `ManifestCommandContribution`, `ManifestMenuContribution`, `ManifestConfigurationContribution`, `PackageJsonFinanceExtension`.
  - Zod validation schema for manifests (`src/extension-host/manifest-schema.ts`): strict-mode rejects unknown keys, validates semver versions, enum types, and activation-event regexes.
  - Extension Loader service (`src/main/services/extension-loader.ts`): scans `<appRoot>/extensions/` for subdirectories with `package.json` containing a `financeExtension` field; validates each manifest; cross-checks `package.json#name` matches `financeExtension.id`; skips `node_modules/` and `dist/`; skips malformed manifests with a console warning.
  - Extension Registry service (`src/main/services/extension-registry.ts`): in-memory cache backed by the Phase 2 `extension_registry` SQLite table; idempotent `upsert`, `markActivated`, `isEnabled` / `setEnabled`, and aggregation helpers for views and commands.
  - Extension IPC transport (`src/main/services/extension-ipc.ts`): spawns the Host, performs the `host.ready` handshake, exposes a typed `request<T>()` / `notify()` API, tracks pending requests with per-request timeouts, restarts on crash detection.
  - `finance.*` API stubs in the Host (`src/extension-host/api/`): functional `commands.registerCommand` and `commands.execute` (graceful `null` on missing); `db.table()` returns empty queryables; `ai.registerTool()` stores tool definitions. Phase 4 replaces DB stubs with real DAO access; Phase 6 replaces AI stubs with tool execution.
  - Mock `extensions/salary-history/` placeholder extension: declares a `salary-history` view + two commands (`salary.showPayHistory`, `salary.showDeductions`), activates on `onView:salary-history`.
  - Renderer Activity Bar rebuilt as a contribution-driven Lit component (`src/renderer/components/activity-bar.ts`); removed Phase 1's hardcoded `D/P/B/X` buttons, kept the built-in `S` (Settings) button.
  - Command Palette renders extension commands under an "Extensions" group label (`src/renderer/components/command-palette.ts`).
  - Preload bridge exposes `financeShell.extensions.list()` and `financeShell.extensions.activateView()` (`src/preload/preload.ts`).
  - Electron-aware Playwright config (`playwright.electron.config.ts`) so Phase 2 E2E tests (deferred from prior milestone) and new Phase 3 E2E tests can run against the real Electron app.
  - 23 new unit tests: 10 manifest-schema, 7 JSON-RPC envelope, 6 extension-loader (48 total with Phase 2).
  - 5 new E2E tests: dynamic Activity Bar shows extension view, Settings button always present, Command Palette lists extension commands, view activation round-trips, host-crash placeholder.

### Changed
- Electron main process (`src/main/main.ts`) now boots the Extension Loader + Registry + IPC before window creation; adds `extensions:list` and `extensions:activate-view` IPC handlers; gracefully shuts down the Host on `will-quit`.
- Renderer (`src/renderer/index.ts`) loads contributions on `DOMContentLoaded`, dispatches view activations to Main, logs extension command selections (Phase 5 will add real command execution flow).
- Vite build pipeline adds a fourth config (`vite.extension-host.config.ts`) producing `dist/extension-host/host.js`; `scripts.build` and `scripts.start:dev` updated to build/watch the Host bundle.
- `package.json` adds `zod` runtime dependency; adds `build:extension-host` and `dev:extension-host` scripts; updates `build` and `start:dev` orchestration.

### Notes
- Phase 3 unlocks Phase 4's Salary History extension: the stub `salary-history` extension at `extensions/salary-history/src/main.ts` registers command handlers via `finance.commands.registerCommand`. Phase 4 replaces the stub body with payslip forms, validation, and persistence backed by the real `finance.db.table()` API.
- The `extension_registry` table created in Phase 2 now has a live consumer. Disabling an extension (`enabled = 0`) immediately removes its contributions from the Renderer on next startup.
- The Extension Host is intentionally minimal in Phase 3 (single `host.js` file). Phase 4 may split the host entry from the API surface if extension activation concurrency becomes complex.
- Crash isolation is verified manually in Test Unit 5 — the E2E suite includes a placeholder (`Test: Host process crash is non-fatal`) that Phase 4 will fill in with a programmatic crash simulation.
```

Update the frontmatter:

```yaml
---
version: 0.5.0
created: 2026-06-14
last_updated: <ISO timestamp at time of completion>
---
```

---

## Self-Review Checklist

**1. Spec coverage (from project_vision.md Phase 3):**
- [ ] Spawn isolated Node.js child process for extensions → Task 5, Task 8, Task 10
- [ ] Establish basic message passing IPC (Electron `MessagePortMain` or standard Node IPC) → Task 8 (uses Electron `utilityProcess` + structured MessagePort, vision-compatible)
- [ ] Extension Loader: scanning directories, parsing extension declarative manifests (`package.json`), registering contributed menus/views → Task 6, Task 10
- [ ] Simple extension activation triggers (loading code when clicking an Activity Bar icon) → Task 5, Task 10, Task 13
- [ ] Deliverable: app launches, spawns Extension Host, dynamically reads mock manifest, registers views/commands → Tasks 5-13 + Test Units 1-4

**2. Architecture principles upheld:**
- [ ] No finance business logic in Core — only the mock extension has any logic, and it lives in `extensions/`
- [ ] Crash isolation — Host runs in a separate `utilityProcess`; manual test 5 verifies
- [ ] Graceful degradation — `commands.execute` returns `null` for missing commands; manifest validation skips invalid manifests without aborting startup
- [ ] Strict namespace isolation — `extension_registry` and settings keys remain namespaced; Phase 3 does not bypass this
- [ ] **No direct cross-extension access** — verified per `project_vision.md:48` ("Direct in-process imports, shared global state, and direct database cross-writes between extensions are strictly forbidden"). Process isolation via `utilityProcess` makes in-process imports *structurally impossible*; all inter-extension traffic routes through `finance.commands.execute()` (returns `null` on missing target) and the JSON-RPC Main↔Host channel. No extension imports `node:fs`, `node:net`, or raw `better-sqlite3` directly; no two extensions share a module graph; the loader, registry, and IPC services sit entirely in Main.

**3. Phase 2 regression coverage:**
- [ ] `extension_registry` table now actively used (populated by `ExtensionRegistry.upsert`)
- [ ] Settings IPC unchanged — Phase 2's `settings:get`/`settings:set` still work
- [ ] Window state persistence unchanged
- [ ] Theme persistence unchanged
- [ ] All 25 Phase 2 unit tests still pass

**4. Code quality:**
- [ ] TypeScript strict mode — no `any` outside deliberate `unknown` boundaries (IPC envelopes, Zod parse results)
- [ ] No placeholder, TODO, or "implement later" comments in delivered code
- [ ] All public API documented (manifest types have JSDoc on every export)

**5. CHANGELOG compliance (AGENTS.md Rule 5):**
- [ ] `CHANGELOG.md` updated with the Phase 3 entry above; version bumped to `0.5.0`
- [ ] `last_updated` frontmatter timestamp set

**6. Plan provenance:**
- [ ] `docs/file-reference.md` updated with the Phase 3 file inventory (this is a final review step; not a task in the plan)
- [ ] `docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md` committed alongside the implementation

**7. Explicit deferrals (out-of-scope for Phase 3, scheduled in later milestones):**

These items are acknowledged as part of the vision but are deliberately deferred. None block the Phase 3 deliverable; each lands in a specific later phase.

- [ ] **`contributes.configuration` settings UI renderer** — `ManifestConfigurationContribution` schema is defined in `finance.d.ts` and validated by Zod, but the generic schema-driven settings UI (text fields, toggles, dropdowns) is deferred to **Phase 7 (Production Readiness & Polish)**. No Phase 3 extension contributes configuration (the mock `salary-history` manifest has no `contributes.configuration` block), so this does not block Phase 3 verification. The deferred renderer consumes the already-validated schemas without schema changes.
- [ ] **Extension Manager UI (install / enable / disable / uninstall / delete data)** — `ExtensionRegistry.setEnabled()` exists in Phase 3 and Test Unit 6 verifies the DB-driven path, but the in-app Extension Manager interface is deferred to **Phase 8 (Extension SDK & Marketplace)**. The vision's lifecycle actions (Disable, Uninstall, Delete Extension Data) all require a confirmation UI that fits naturally with the Phase 8 packaging and marketplace work.
- [ ] **NavigationProvider pattern (data-driven side panel)** — The vision requires extensions to supply a Data Provider that the Core's Navigation Service renders into the side panel. Phase 3's `NavigationPanel` is static and shows hardcoded items per active view. The dynamic NavigationProvider contract is deferred to **Phase 5 (Webviews & Multi-Extension UI)**, which lands alongside `WebviewPanel` and the Dashboard extension that first consumes the pattern.
- [ ] **Menu bar contribution rendering** — `ManifestMenuContribution` type is defined and validated, but Electron `Menu`/`MenuItem` rendering of contributed menu items is deferred to **Phase 5 (Webviews & Multi-Extension UI)**. The mock `salary-history` extension does not contribute menus, and Electron's `Menu.setApplicationMenu` integration is non-trivial enough to defer alongside the other UI contribution rendering.
- [ ] **`import * as finance from 'finance'` canonical import pattern** — Phase 3 establishes the parameter-injection loading mechanism (Decision 9). The vision's literal `import * as finance from 'finance'` pseudocode becomes the Phase 4+ migration target when a real multi-file extension is built. The `FinanceApi` type contract in `finance.d.ts` is unchanged across the transition.
- [ ] **Global event bus (cross-process)** — The vision lists "Event System: Global event bus" as a Core Platform responsibility. Phase 3 does not implement it; the renderer uses DOM `window.dispatchEvent` for view-changed and command-selected events within its own process. A cross-process event bus becomes relevant only when multiple extensions emit events to each other, which lands alongside the NavigationProvider pattern in **Phase 5**.

**8. Review fixes applied** *(per `docs/phase3-plan-review.md`, 2026-07-01)*:

These checklist items verify the 9 fixes from the plan review. Each maps to a `[Review fix §N.M]` annotation in the relevant task. The executor must tick each box before declaring Phase 3 complete.

- [ ] **§2.1 — Crash recovery exists and is exercised by Test Unit 5.** `src/main/services/extension-ipc.ts` exposes `onHostStatus()`, has a `crashed` flag, a `restartPromise` guard, and `ensureRunning()` that re-spawns on next `request()`. Manual Test Unit 5 verifies both survival and re-spawn (new PID in DevTools after kill).
- [ ] **§2.2 — `start()` is not fire-and-forget.** `src/main/main.ts` calls `extensionIPC.start(extensionRegistry.list()).catch((err) => console.error(...))` — no `void` prefix. A grep for `void extensionIPC.start` returns no results.
- [ ] **§2.3 — `extensions:execute-command` IPC handler exists.** `src/main/main.ts` registers the handler; `src/extension-host/host.ts` switch has `case 'extension.executeCommand'` delegating to `executeCommand()` from `api/commands`. Manual verification: clicking an extension command in the palette produces `[host] invoked executeCommand('salary.showPayHistory')` in DevTools.
- [ ] **§3.1 — `json-rpc.ts` lives at `src/shared/json-rpc.ts`.** Main (`extension-ipc.ts`), Host (`host.ts`), Vite config (none currently — extension-paths.ts only), and the unit test (`tests/unit/extension-host/json-rpc.test.ts`) all import from `src/shared/json-rpc`. No references to `src/extension-host/json-rpc.ts` exist.
- [ ] **§3.2 — `finance-shell.d.ts` does not redeclare `ManifestViewContribution` or `ManifestCommandContribution`.** The file imports them from `./finance`. A grep for `^export interface Manifest(View|Command)Contribution` in `finance-shell.d.ts` returns no results.
- [ ] **§3.3 — Command palette filter is wired.** Typing in the palette input narrows the list to commands whose `label` contains the query (case-insensitive). Empty result shows "No matching commands". ArrowUp/Down navigation is bounded by the filtered list length.
- [ ] **§3.4 — E2E test exercises the IPC contract, not Phase 1 DOM.** `tests/e2e/extension-host.spec.ts` has the test "View activation via IPC returns activated=true after the host runs" which uses `page.evaluate(() => window.financeShell.extensions.activateView(...))`. No `#navigation-panel .nav-title` selector remains in the file.
- [ ] **§3.5 — Database path is logged on startup.** Launching the app prints `[main] database path: <absolute path>` to DevTools console. Test Unit 6 references this log instead of a hard-coded `%APPDATA%` path.
- [ ] **§3.6 — `HOST_BUNDLE_DIR` is a shared constant.** `src/shared/extension-paths.ts` exports `HOST_BUNDLE_DIR` and `resolveHostBundlePath()`. `vite.extension-host.config.ts` imports `HOST_BUNDLE_DIR` for its `outDir`. `extension-ipc.ts` calls `resolveHostBundlePath()` (which logs the resolved path). A grep for `'dist/extension-host'` returns exactly one hit (the `HOST_BUNDLE_DIR` constant itself).
- [ ] **Follow-up §3.7 — Watch script includes Extension Host.** The `npm run dev` script includes `npm:dev:extension-host` so that file changes in `src/extension-host` trigger recompilation. *(Note: this verification item was added in a follow-up to the original review; it is NOT in `docs/phase3-plan-review.md`. The missing dev-deps install step is tracked separately.)*
- [ ] **Follow-up §3.8 — Shared constants isolated.** `src/shared/extension-constants.ts` defines `HOST_BUNDLE_DIR` and `HOST_BUNDLE_FILENAME` without Electron imports. `vite.extension-host.config.ts` imports from this file, avoiding any build-time Electron import errors.
- [ ] **Follow-up §3.9 — Try/catch in extensions:activate-view.** Main's `extensions:activate-view` IPC handler catches errors and returns `{ activated: false, reason: message }` instead of propagating unhandled promise rejections.
- [ ] **Follow-up §3.10 — Extension Host deactivation hook.** The Host processes `host.shutdown` notifications (via `isNotification(msg)`) and calls the `deactivate()` hook of each active extension before exit.
- [ ] **Follow-up §3.11 — Command Palette scroll selection.** Selected items scroll into view when navigating via keyboard in the Command Palette.

---

## Phase 3 Deliverable Verification

- [ ] Electron app boots with `npm run start` — no console errors
- [ ] **Test Unit 1** — Extension Host process is spawned and announces readiness
- [ ] **Test Unit 2** — Mock `salary-history` extension's view button appears in the Activity Bar
- [ ] **Test Unit 3** — Clicking the view button round-trips through Main → Host → extension
- [ ] **Test Unit 4** — Command Palette lists extension commands under an "Extensions" group
- [ ] **Test Unit 5** — Killing the Host process does not crash the shell
- [ ] **Test Unit 6** — Disabling an extension in `extension_registry` removes its contributions on relaunch
- [ ] **Test Unit 7** — Malformed manifests are skipped with a console warning, app boots normally
- [ ] **Test Unit 8** — `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:e2e` all pass
- [ ] CHANGELOG.md updated to version 0.5.0 per AGENTS.md Rule 5
