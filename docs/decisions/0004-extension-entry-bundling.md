# ADR-0004: Extension Entry Architecture — Build-Time Bundling

**Status:** Accepted
**Date:** 2026-07-03
**Context:** Phase 3 — Extension Host & IPC Scaffolding (`docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md`)

## Context

ADR-0003 settled *how* the Extension Host process communicates with Main (Electron `utilityProcess.fork` + JSON-RPC 2.0 over MessagePort). It left open *how the Host loads extension code at runtime*.

The Phase 3 plan (Task 5) and the original mock extension (Task 9) specify:

- Extensions live in `<projectRoot>/extensions/<extensionId>/` with their entry declared in `package.json#financeExtension.main`.
- The mock `salary-history` extension's entry is `src/main.ts` (TypeScript source).
- The Extension Host loads extensions via `createRequire(import.meta.url)(entryPath)` at runtime.

A second-pass review (`docs/phase3-plan-review.md` reviewer extension, 2026-07-03) identified a latent bug: **Node's `require()` cannot load `.ts` files without a transpilation hook.** `tsx`, `ts-node`, or a custom Node loader must be registered before `require()` can resolve TypeScript. Without it, `activateExtension` throws `ERR_MODULE_NOT_FOUND` / `ERR_REQUIRE_ESM`, the extension stays `active: false`, and the Phase 3 end-to-end proof (the whole point of the milestone) silently fails.

The TypeScript-vs-runtime mismatch is the immediate symptom. The deeper question is: **what *is* an extension, architecturally?** Is it source code the host interprets at runtime, or is it a build artifact the host loads like any other module?

## Decision

**Bundle extension entry points as part of the build pipeline.** Add a fifth Vite config (`vite.extensions.config.ts`) that produces one ESM bundle per installed extension in `dist/extensions/<extensionId>.js`. The Extension Host loads extensions from `dist/extensions/`, not from `extensions/` source. Extensions continue to be authored in TypeScript; the bundling step is invisible to extension authors.

**Build layout after this decision:**

```text
finance-flow-ai/
|-- extensions/                       # Extension source (TypeScript, author-facing)
|   `-- salary-history/
|       |-- package.json              # Manifest with `"main": "src/main.ts"` (author-facing)
|       `-- src/
|           `-- main.ts               # TypeScript source
|-- dist/
|   |-- extension-host/               # The Host process (from ADR-0003)
|   |   `-- host.js
|   `-- extensions/                   # Bundled extension entries (runtime artifacts)
|       `-- salary-history.js         # One file per extension; ESM, externals resolved at runtime
`-- vite.extensions.config.ts         # NEW: multi-entry bundler config
```

The loader path in `host.ts` changes from `<projectRoot>/extensions/<id>/<main>` to `<projectRoot>/dist/extensions/<id>.js` (resolved via `app.getAppPath()` for dev and a packaged-app path for production).

## Reasoning

**Bundling establishes the correct precedent early.** Every real extension author will want TypeScript. Choosing plain JS for the stub to dodge the loader issue just kicks the problem to the first real extension, when refactoring the loader is expensive (it touches the contract every extension depends on). Bundling now means the contract is stable from day one.

**Bundled extensions are deployable artifacts.** A `.js` bundle is what gets shipped, signed, and versioned. Source maps point back to the original `.ts` for debugging. This matches VS Code's extension model and the project's eventual marketplace goals (Phase 8).

**Runtime loading stays simple.** `import('./dist/extensions/salary-history.js')` is a plain dynamic ESM import. No transpilation hooks, no `--require tsx`, no per-cold-start compilation cost. The Host's cold-start cost is `O(1)` per extension regardless of the extension's source language.

**Build complexity is bounded.** Vite's multi-entry config produces N output files from N source directories. The same pattern already exists for the Extension Host itself (`vite.extension-host.config.ts`); this is one more instance, not a new paradigm.

**Debugging is preserved.** Vite emits source maps by default. The bundled `.js` is debuggable against the original `.ts` in DevTools attached to the Host process.

## Alternatives considered

**Option A: Plain JS entry (`src/main.js` instead of `src/main.ts`).**
Pros: simplest possible fix; works today with zero infra.
Cons: forces every extension author to write JS, or forces a future migration to bundling when the first TS extension is built. The stub works; the *system* doesn't scale. Rejected because the stub is a one-time cost; the precedent is forever.

**Option B: Transpilation hook at Host startup (`NODE_OPTIONS=--import tsx` or `ts-node/esm`).**
Pros: keeps the entry as `.ts`; minimal config; works with existing source layout.
Cons: pushes transpilation cost onto every cold start (real cost for extensions with non-trivial import graphs); couples the Host to `tsx` as a runtime dep; obscures what code is actually running in production (the source `.ts` is not the same as the runtime artifact); fails the "what ships is what runs" principle that bundling satisfies. Rejected.

**Option C: Bundling (chosen).**
Pros: correct architectural foundation; sets the precedent for real extensions; bundled artifacts are signable / versionable / distributable; no runtime transpilation cost.
Cons: extra Vite config to maintain; extension authors must understand the build step (mitigated by `npm run build:extensions` being a single command); source map chain required for production debugging.

**Option D: Bundle extensions as part of the Host bundle.**
Pros: one fewer Vite config.
Cons: turns the Host into a monolithic bundle that knows about every extension at compile time — the opposite of the marketplace-friendly "load extensions dynamically" model. Defeats the purpose of having separate extensions.

## Consequences

**Positive:**
- Phase 3's end-to-end test (the salary-history extension activates when its view is clicked) actually works on the first try, not after a debugging session.
- Extension authors write TypeScript; the runtime contract is plain ESM.
- The `dist/extensions/` directory is the runtime extension registry — easy to inspect, sign, package, or strip for production builds.
- The Host's `activateExtension` stays a simple `import()` call; no module-loader magic.

**Negative / costs:**
- A fifth Vite config (`vite.extensions.config.ts`) joins the four already in the project. Total config surface is now: `vite.config.ts` (renderer), `vite.main.config.ts`, `vite.preload.config.ts`, `vite.extension-host.config.ts`, `vite.extensions.config.ts`. Each is small and follows the same shape; the cost is in remembering which is which, not in their individual complexity.
- The build pipeline has a new `build:extensions` step. `scripts.build` must run it before Main starts (Main needs to be able to find the bundles). `scripts.start:dev` must rebuild it on extension source changes (separate Vite watcher).
- Extension source maps must be preserved (Vite default) for production debugging; if anyone changes the Vite config later, they must keep `sourcemap: true`.
- The loader path is now build-layout-coupled. ADR-0003 already extracts `HOST_BUNDLE_DIR` to `src/shared/extension-constants.ts`; this ADR adds `EXTENSIONS_BUNDLE_DIR` and `EXTENSIONS_BUNDLE_FILENAME` to the same module. A build-layout change requires editing one file.

**Security note (forward-looking):**
For Phase 3, the renderer can call `financeShell.extensions.executeCommand(commandId, ...args)` for any command registered by any active extension. This is acceptable for Phase 3 because (a) everything runs locally, (b) extensions are developer-installed, not user-installed, and (c) the marketplace flow (Phase 8) is the natural place to add a command allowlist and signed-extension verification. Phase 5 hardening should add a per-extension command allowlist on the Main side before the renderer can drive arbitrary execution.

## Revisit triggers

Reconsider this decision when **any** of the following becomes true:

- More than ~20 extensions ship and the build time becomes a bottleneck (consider incremental bundling or a daemon-based watcher).
- Extensions need to load native code (a `.node` addon per extension would require a different externals strategy).
- The marketplace flow (Phase 8) requires extensions to be **signed bundles** distributed outside the repo — at which point bundling is no longer the build step but the packaging step.
- Web Workers become the preferred extension runtime (the security model inverts; extensions become untrusted-by-default and the bundling concern disappears).
- `import * as finance from 'finance'` (Decision 9's Phase 4+ migration target) becomes a requirement for extension authors. Bundling already produces ESM, so this transition is unaffected — but if extensions need to share code across files via Vite's chunking strategy, the config may need splitting.

## Related

- Plan: `docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md` (Decision 10 — added by this ADR)
- Code (planned): `vite.extensions.config.ts`, `src/extension-host/host.ts` (loader path change in `activateExtension`), `src/shared/extension-constants.ts` (new `EXTENSIONS_BUNDLE_DIR` constant)
- Review provenance: `docs/phase3-plan-review.md` reviewer extension (2026-07-03), §"🚨 Must-Fix: Extension entry is TypeScript, but `createRequire` can't load `.ts`"
- ADR-0003: Extension Host Transport — `utilityProcess.fork` + JSON-RPC 2.0 (the Host this loads extensions into)
- Vision: `project_vision.md:48` (process isolation — bundling does not affect this; extensions still run in the Host process, separate from Main)
