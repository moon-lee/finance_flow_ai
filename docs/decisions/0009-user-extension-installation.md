# ADR-0009: User Extension Installation — SDK, Installer, and Bundle Resolution

**Status:** Accepted
**Date:** 2026-08-20
**Context:** Phase 8 — Extension Ecosystem (`docs/superpowers/plans/2026-08-20-phase8-extension-ecosystem-sdk.md`).

## Context

Phases 1–7 built an extension platform where extensions ship *inside the app*: they live under `extensions/`, are bundled by `vite.extensions.config.ts` into `dist/extensions/<id>.js`, and are discovered at boot from `runtimeProfile.extensionsPath` (dev: workspace `extensions/`; packaged: `resources/extensions`, which `electron-builder` copies as `extraResources`).

The user's requirement for Phase 8 (single-user, local-first, VS Code-like):

> "If I need a new extension, I want to create a new project for that extension and then install it into the main app."

Nothing about the current architecture supports this:

1. **No user-writable extension location.** The discovery root is the workspace `extensions/` (dev) or the packaged `resources/` directory, which sits inside `app.asar` and is read-only at runtime. There is no place a user-installed extension can live.
2. **No runtime bundle resolution for installed extensions.** The Extension Host loads bundles from `dist/extensions/<id>.js` (computed relative to the Host bundle); the panel protocol serves `/extensions/<id>.js` from the same directory. A bundle stored elsewhere is unreachable.
3. **No installer.** Nothing creates tables for extension-declared data (built-in extensions rely on Core-owned migrations `003`–`007`), registers manifests at runtime, or manages install/uninstall/delete-data.
4. **No SDK.** Extension authors must edit files inside the app repo and rely on the app's own Vite config.

The original Phase 8 scope in `docs/archives/2026-06-13-implementation-design.md` also listed **digital signing**. The user explicitly cut it: *"it's just my local app and simple concept … I just create extension and use it."* Signing only matters when distributing to other people; this phase serves a single local user.

## Decision

### 1. User extensions directory

User-installed extensions live in a writable, profile-scoped directory:

- **Development:** `<userData>/extensions` where `userData = %APPDATA%\Finance Flow AI Dev` (the existing dev profile from ADR-0007).
- **Packaged product:** `<product-folder>\data\extensions` (`join(userDataPath, 'extensions')`, where `userDataPath` comes from ADR-0007's `resolveRuntimeProfile`).

Built-in extensions remain at `runtimeProfile.extensionsPath`. The app discovers **both** roots at boot and merges the results. A user-installed extension whose id collides with a built-in extension is **rejected** (built-ins cannot be overridden).

### 2. Installable artifact and bundle layout

The SDK's `build` command produces a self-contained folder:

```text
build/extension/
  package.json        # the financeExtension manifest
  <id>.js             # ESM bundle (lib-mode, externals resolved at runtime)
  <id>.js.map         # source map (debugging)
```

"Install" copies the **contents** of that folder into `<userExtensionsRoot>/<id>/`, creates the physical SQLite tables the manifest declares, and upserts the extension registry. Resulting layout:

```text
<userExtensionsRoot>/<id>/
  package.json
  <id>.js
```

### 3. Bundle resolution order

Both the Extension Host (`activateExtension`) and the panel protocol (`/extensions/<id>.js`) resolve a bundle by trying, in order:

1. `<root>/<id>.js` (built-in style — unchanged, `dist/extensions/<id>.js`)
2. `<root>/<id>/<id>.js` (installed style)

across the roots `[userExtensionsRoot, builtinRoot]`. The logic lives in one pure, unit-tested function, `resolveExtensionBundlePath(extensionId, roots)`, in `src/shared/extension-paths.ts`.

### 4. Runtime table creation

Built-in extension tables are created by Core migrations. User extensions cannot ship migrations (ADR-0002's "extension ships its own migration" trigger remains unmet — a single user installs extensions locally), so Core creates the physical tables at install time from the manifest's `tables[]` declarations via a new DDL generator (`src/main/services/table-ddl.ts`). The DAO's existing namespace enforcement still governs runtime access.

### 5. Install/uninstall/delete-data semantics (per `project_vision.md:54-58`)

- **Install:** copy files + create tables + upsert registry. Requires an app restart for the extension to be activatable (discovery runs at boot; hot-injecting manifests into the running Host is deferred).
- **Uninstall:** removes the extension's folder and registry row; **preserves user data**.
- **Delete data:** a separate, explicit, confirmed action that drops the extension's tables and deletes its settings namespace.

### 6. Dependency and version checks (lightweight)

At install, Core validates the manifest, rejects id collisions with built-ins, checks that every declared `dependencies[]` id is already installed, and compares semver against the installed version (refusing downgrades). The Host already topologically sorts activation by `dependencies` (`host.ts` `sortByDependencies`), so dependency ordering works with zero extra runtime work.

### 7. Registry persistence fix

`ExtensionRegistry.upsert()` currently sets `enabled = 1` on `ON CONFLICT`, which re-enables a disabled extension on every restart. The new upsert updates `name`/`version` on conflict but **leaves `enabled` unchanged**, so the Extension Manager's enable/disable state persists.

### 8. SDK CLI (`scripts/sdk/cli.mjs`)

Two subcommands, run from the app repo (Vite resolves from the app's `node_modules`):

- `init <extension-id>` — scaffolds a standalone project (manifest, `tsconfig`, `src/main.ts`, a sample Lit view, a vendored self-contained `src/finance.d.ts`, README).
- `build <project-dir>` — reads the manifest and runs Vite's JS API (lib mode, the app's externals list, `<id>.js` naming) producing the installable `build/extension/` folder.

The vendored SDK type file is a self-contained declaration mirroring the canonical `src/types/finance.d.ts` surface. A parity test (running `tsc --noEmit` on a fixture that assigns SDK types to canonical types) guards against drift.

## Consequences

**Positive:**

- The user can create, build, and install extensions without touching the app repo — the exact workflow requested.
- Built-in and user extensions coexist; built-ins stay protected from accidental override.
- Data-safety semantics match the vision (uninstall ≠ delete data).
- No signing/installer work — the highest-risk, lowest-value part of the original Phase 8 scope for a single local user.
- Bundle resolution and DDL generation are pure, unit-testable functions.

**Negative / costs:**

- Activation changes (install/uninstall/delete-data) require an app restart. Hot-reload of the extension catalog is not implemented.
- The vendored SDK `finance.d.ts` can drift from the canonical types without the parity test; that test is the safety net.
- Extensions that declare no `tables[]` cannot persist domain data (unchanged from today — tables are opt-in).
- The installer lives in Core (not the Extension Host); file I/O and table DDL execute in the Main process, which is appropriate for a trusted single-user install path but is a deliberate trust boundary.

## Alternatives considered

- **Install into `dist/extensions/` directly.** Rejected: `dist/` is inside `app.asar` in the packaged product and is read-only at runtime; also mixes build output with user data.
- **A per-extension subprocess that owns its tables.** Rejected: violates ADR-0002 (extensions shipping migrations) for no benefit at one user; the DAO already enforces the namespace boundary.
- **Zip-only installer (`extract-zip` dependency).** Folded in as an optional install path alongside folder install; folder install avoids a new runtime dependency and is sufficient for the primary local workflow.
- **Hot-inject manifests into the running Host after install.** Deferred: requires re-running discovery + registry + table registration live and re-sending the manifest catalog over JSON-RPC; restart is simpler, predictable, and matches VS Code's "Reload Window" model.
- **Digital signing / code-signing certificates.** Explicitly dropped by the user. Revisit only if extensions are ever distributed to other machines.

## Revisit triggers

- Extensions are distributed beyond this machine (then add signing, a manifest signature scheme, and a marketplace).
- Hot install/uninstall without restart becomes a requirement (then design the live catalog refresh protocol).
- An installed extension needs to ship a migration independent of Core (then revisit ADR-0002's trigger and give extensions a migration mechanism).
- A second user profile or multi-user data directory appears (then the `<userData>/extensions` root becomes per-profile by construction).

## Related

- Plan: `docs/superpowers/plans/2026-08-20-phase8-extension-ecosystem-sdk.md`
- Vision: `project_vision.md:54-58` (extension lifecycle), `:574-584` (Phase 8 deliverable)
- ADR-0002: Inline Migration Runner (extension-shipped-migrations trigger)
- ADR-0004: Extension Entry Bundling (the `dist/extensions/<id>.js` layout this extends)
- ADR-0007: Local Product Deployment Profile (`userDataPath` / `extensionsPath` roots)
- Code: `src/shared/extension-paths.ts`, `src/extension-host/host.ts`, `src/main/services/panel-protocol.ts`, `src/main/services/extension-loader.ts`, `src/main/services/extension-registry.ts`
