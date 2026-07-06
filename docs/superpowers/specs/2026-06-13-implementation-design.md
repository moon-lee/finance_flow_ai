---
title: Finance Flow AI - Implementation Design
date: 2026-06-13
last_updated: 2026-07-06T12:46:07+10:00
status: active
---

# Implementation Design

## Architecture Approach

**Vertical Slice Model**: Complete a working Salary History (first extension) before building other extensions. Each extension owns its private data tables with no cross-extension dependencies initially.

## Implementation Phases (Sequential, Each Delivers Working Software)

### ✅ Phase 1: Core Shell Prototype (Complete — 0.5 Days)
- Electron scaffold with Activity Bar, Navigation Panel, Workspace tabs, AI Panel
- Mock static layout to validate UI/UX before wiring logic
- **Deliverable**: Bootable Electron app with styled panels and static Command Palette

### ✅ Phase 2: Database & Settings Backbone (Complete — 1 Day, 2026-06-21)
- SQLite connection with infrastructure tables (extension registry, settings, migration log)
- Namespaced settings service with `registerExtensionNamespace()` for Phase 4 extension adoption
- Window state persistence (500 ms debounced) with off-screen restore guard
- Theme persistence (dark/light) via `body.light-theme` CSS class
- AI panel collapsed state persistence
- 25 Vitest unit tests + Playwright E2E suite (deferred run — Phase 3)
- **Deliverable**: App persisting UI preferences and loading last window state. Schema, migration runner, settings table all verified; all 6 manual test units pass.
- **Post-release fixes (v0.4.1)**: data-loss bug in corrupt-DB recovery (now only triggers on `quick_check` failure), userData path alignment between dev/prod, automated ABI switching in npm scripts. Full write-up in `docs/superpowers/plans/2026-06-20-phase2-database-settings-backbone.md` under "Post-release Fixes".
- Plan: `docs/superpowers/plans/2026-06-20-phase2-database-settings-backbone.md`
- SQLite connection with infrastructure tables only (extension registry, migration log, settings)
- Settings service: app-wide preferences, window state, theme
- **Deliverable**: App persisting UI preferences and loading last window state

### ✅ Phase 3: Extension Host & IPC Foundation (Complete — 2026-07-04, shipped as 0.6.0)
- Isolated Node.js child process via Electron `utilityProcess.fork()` (not in-process; per `project_vision.md:48` "Process isolation makes in-process imports *structurally impossible*")
- JSON-RPC 2.0 over the child's MessagePort: request/response correlation with per-request timeouts, notifications, and standard error codes (`src/shared/json-rpc.ts` — moved from `src/extension-host/` per review fix §3.1 so Main and Host share ownership)
- Manifest types in `src/types/finance.d.ts` (`FinanceExtensionManifest`, `ActivationEvent`, `ManifestViewContribution/CommandContribution/MenuContribution/ConfigurationContribution`, `PackageJsonFinanceExtension`)
- Zod schema validation (`src/extension-host/manifest-schema.ts`): strict mode rejects unknown manifest keys; validates semver, enum types, activation-event regexes
- Extension Loader service (`src/main/services/extension-loader.ts`) scans `<appRoot>/extensions/` for subdirectories with `package.json#financeExtension`; validates each manifest; cross-checks `package.json#name` matches `financeExtension.id`; skips `node_modules/`, `dist/`, and malformed manifests with a `console.log` warning (now visible on stdout after the visibility fix in commit `563ccd3`)
- Extension Registry service (`src/main/services/extension-registry.ts`) backed by Phase 2's `extension_registry` SQLite table: idempotent `upsert`, `markActivated`, `isEnabled`/`setEnabled`, and aggregation helpers `views()`/`commands()`. Crash diagnostics: `recordCrash()`/`clearCrashes()` methods plus `crash_count`/`last_error` columns added via `002-extension-crash-tracking` migration; auto-disables at `AUTO_DISABLE_CRASH_THRESHOLD = 3`. DI seam: optional `Database` parameter (default `getDatabase()`) so unit tests use `getTestDatabase()` without touching production state.
- Extension IPC transport (`src/main/services/extension-ipc.ts`): spawns the Host, performs the `host.ready` handshake, exposes typed `request<T>()`/`notify()` API, tracks pending requests with timeouts, restarts on crash detection via `ensureRunning()`. Operational telemetry: `[extension-ipc] host spawned, pid=<N>` line per spawn (in the `'spawn'` event handler — `pid` is async-populated by Electron). Crash log also routed to main-process terminal: `[extension-ipc] Extension Host exited unexpectedly (code <N>)`.
- `finance.*` API stubs in the Host (`src/extension-host/api/`): functional `commands.registerCommand` and `commands.execute` (graceful `null` on missing); `db.table()` returns empty queryables; `ai.registerTool()` stores tool definitions. Phase 4 replaces DB stubs with real DAO access; Phase 6 replaces AI stubs with tool execution.
- Renderer Activity Bar rebuilt as contribution-driven Lit component (`src/renderer/components/activity-bar.ts`); removed Phase 1's hardcoded `D/P/B/X` buttons, kept built-in `S` (Settings). Defensive `event.isTrusted` gate on `@click` blocks synthetic clicks but allows real user clicks.
- Command Palette renders extension commands under an "Extensions" group label with `@input` filter and scroll-into-view selection (`src/renderer/components/command-palette.ts`).
- Host stdout mirrored to Renderer DevTools console: wraps `console.log`/`error`/`warn` in `src/extension-host/host.ts` to also `postMessage` a JSON-RPC `host.log` notification; `extension-ipc.ts` adds a typed `HostLogEntry` and `onHostLog()` API; `main.ts` forwards via new `extensions:host-log` IPC channel; preload exposes `extensions.onHostLog(callback)` on the `contextBridge`; renderer subscribes and dispatches to `console[level](...)` with a `[host log]` prefix.
- Host lifecycle status (`onHostStatus`) surfaced to DevTools: `HostStatus` type in `finance-shell.d.ts`; `onHostStatus(callback)` on `ExtensionsApi`; preload exposes `extensions.onHostStatus()`; renderer subscribes and dispatches `crashed`/`restart-failed` to `console.error`.
- Preload bridge exposes `financeShell.extensions.{list,activateView,executeCommand,onHostLog,onHostStatus}` (`src/preload/preload.ts` + `src/types/finance-shell.d.ts`)
- Vite build pipeline adds two new configs: `vite.extension-host.config.ts` (bundles `src/extension-host/host.ts` → `dist/extension-host/host.js`) and `vite.extensions.config.ts` (multi-entry bundler producing one ESM file per extension in `dist/extensions/<id>.js`, per ADR-0004 and Decision 10). ESM-compatible via `readFileSync`/`JSON.parse` instead of `require()` (per review fix §HOST-2).
- `src/shared/extension-constants.ts` exports `HOST_BUNDLE_DIR`, `HOST_BUNDLE_FILENAME`, `EXTENSIONS_BUNDLE_DIR`, `extensionBundleFilename()` — isolates build-time constants from runtime Electron imports so the Vite configs can import them as ESM.
- `src/shared/extension-paths.ts` uses `import.meta.url` + `fileURLToPath` for ESM-compatible runtime path resolution (no `electron` import).
- `scripts/rename-extension-bundles.mjs` post-build: renames `main.js` → `<id>.js` per extension; handles Vite's numeric-suffix scheme (main, main2, main3) when multiple extensions share an entry stem.
- Mock `extensions/salary-history/` placeholder extension: declares a `salary-history` view + two commands (`salary.show-pay-history`, `salary.show-deductions`); activates on `onView:salary-history`. Command ids lowercased from the original `salary.showPayHistory`/`salary.showDeductions` because the Zod regex `^[a-z0-9.-]+$` rejects uppercase.
- **Test results**: `npm run test:unit` → **65/65 pass** (10 manifest-schema + 7 JSON-RPC envelope + 6 extension-loader + 17 extension-registry hot-disable contract + 25 Phase 2). `npm run typecheck` exit 0. `npm run lint` exit 0. **E2E blocked** by environmental Playwright-electron config issue (`Cannot navigate to invalid URL` on `page.goto('/')`) — pre-existing, not part of Phase 3 verification surface; separately tracked.
- **Manual test units (1–8)**: All PASS via the running Electron app. Test Unit 1–4 verify the round-trip (Activity Bar click → activate → Command Palette → execute). Test Unit 5 verifies crash isolation (force-kill → re-spawn on next interaction with new PID). Test Unit 6 verifies disable/enable contract via 9 new unit tests. Test Unit 7 verifies malformed-manifest skip. Test Unit 8 verifies typecheck/lint/unit tests.
- **Plan**: `docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md` (2732 lines, 17 tasks, 8 manual test units, Self-Review Checklist with §1–§11 ticked; plan status now `shipped — Phase 3 implementation complete`, `shipped_date: 2026-07-04`).
- **Self-Review §7 explicit deferrals** (out of scope for Phase 3, scheduled in later milestones — NOT shipped, intentionally):
  - `contributes.configuration` settings UI renderer → **Phase 7**
  - Extension Manager UI (install/enable/disable/uninstall/delete data) → **Phase 8**
  - NavigationProvider pattern (data-driven side panel) → **Phase 5**
  - Menu bar contribution rendering → **Phase 5**
  - `import * as finance from 'finance'` canonical import pattern → **Phase 4+**
  - Global event bus (cross-process) → **Phase 5**
  - Renderer→executeCommand security hardening (per-extension command allowlist on Main side) → **Phase 5**
  - Hot-disable behaviour runtime-unload (`extension.deactivate` notification protocol) → **Phase 5**
  - Test database isolation helper → **Prerequisite satisfied in Phase 3** (`getTestDatabase()` shipped)
  - ESLint/tsconfig scope check → **Verified in Phase 3** (typecheck and lint both pass)
  - ExtensionRegistry unit tests → **Prerequisite satisfied in Phase 3** (8 new tests shipped)
- **Deliverable**: app launches, spawns Extension Host, dynamically reads mock manifest, registers views/commands, executes round-trip IPC for both `activateView` and `executeCommand`. Crash isolation verified. Hot-disable contract verified. All 56+ unit tests pass.

### Phase 4: Salary History Extension (Vertical Slice) + First Extension Domain Logic (Est: 6 – 8 Days)

> *Updated 2026-07-06: aligned with Phase 4 plan Decisions 1, 5, 14, 16, 17 and Plan Amendments 1 & 3. Pay slips are extension-private (not shared); cross-extension `finance.services.*` is deferred to Phase 5; DeductionService removed per Amendment 1.*

- **Shared Financial Data (Phase 4 ships one table):** `accounts` — owned by Core (platform-owned), extensions can read but not write. Per Phase 4 plan Decision 1 and Decision 4. The original "Shared Financial Data schemas: Accounts, PaySlips, Deductions" wording pre-dated `vision_review.md Issue #23` (Shared Financial Data layer) and Phase 4's namespace-isolation enforcement.
- **Extension-private data (Phase 4 ships two tables under the `salary-history_*` namespace):** `salary_history_pay_slips` (29 columns per Plan Amendment 3 — derivation-first with rate history + PAYG validation) and `salary_history_rate_history` (13 columns per Decision 16 — effective-dated rate rows). Pay slips are NOT shared in Phase 4 because no second consumer exists yet — Phase 5+ can promote them to shared ownership when Dashboard/Cash Flow/Budget need them.
- `finance.db.table()` API for typed table access with structural namespace enforcement (no raw SQL)
- **Extension-internal helpers (NOT `finance.services.*`):** PayService for payslip validation/breakdown calculation/aggregation, PayRateService for rate-history CRUD, PAYG validation module. Cross-extension `finance.services.*` is deferred to Phase 5 — the public API gets shaped by Phase 5's consumer call sites, not derived from this internal surface (per Plan Amendment 1 / Phase 4 Decision 5).
- Extension UI: payslip entry form (minimal entry + derived breakdown preview + PAYG validation), salary history list (with YTD summary footer), pay rate history view (admin via Command Palette), accounts seed modal (first-run), reorder sections modal, rate row form
- **Deliverable**: Fully functional salary history UI with persistent storage (SQLite via DAO); two views reachable via Activity Bar (pay history) and Command Palette (rate history); derivation-first calculation engine; settings namespace registration (`salary-history.*` keys)

### Phase 5: WebviewPanels & Multi-Extension UI (Est: 4 – 6 Days)
- Split-screen support, tab management
- Dashboard extension (aggregator, reads Shared Data via Domain Services)
- Navigation providers for sidebar trees
- **Deliverable**: Multiple tabs with live charts in Dashboard, Domain Services consumed consistently

### Phase 6: AI Assistant (Deferred until Phase 5 Complete) (Est: 3 – 5 Days)
- Ollama integration (default local only)
- Context building from Shared Financial Data
- Tool registry for extension-registered functions
- **Deliverable**: Chat panel with read-only data queries to local LLM

### Phase 7: Production Polish (Est: 3 – 4 Days)
- Database migrations, backup/restore, encryption
- Keyboard shortcuts, customizable settings
- Theme system, accessibility
- **Deliverable**: Stable release with backup/export capability

### Phase 8: Extension Ecosystem (Est: 3 – 5 Days)
- Extension packaging tooling (`finance.d.ts` type definitions)
- Dependency resolution, version management, digital signing
- **Deliverable**: Published extension SDK and installer

## Development Time Estimation

Based on a single full-time developer or agent working sequentially, the project is estimated to take **6 to 8 weeks (30 to 43 business days)**, including a buffer for integration testing and platform-specific compilation checks.

| Phase | Deliverable | Est. Time | Actual | Complexity |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | Core Shell Prototype | 1.5 – 2 Days | 0.5 Days | Low |
| **Phase 2** | Database & Settings Backbone | 2 – 3 Days | 1 Day | Medium |
| **Phase 3** | Extension Host & IPC Foundation | 5 – 7 Days | ~8 Days (incl. 5 review rounds, ESM bundling fix, post-test bug fixes) | High |
| **Phase 4** | Salary History Extension (Slice) | 6 – 8 Days | — | Medium |
| **Phase 5** | WebviewPanels & Multi-Extension UI | 4 – 6 Days | — | High |
| **Phase 6** | AI Assistant (Local-first) | 3 – 5 Days | — | Medium |
| **Phase 7** | Production Polish & Encryption | 3 – 4 Days | — | Medium |
| **Phase 8** | Extension Ecosystem & SDK | 3 – 5 Days | — | High |
| **Buffer** | Integration, build debugging, platform adjustments | 4 – 5 Days | — | - |
| **Total** | **Sleek Desktop Finance Workspace** | **30 – 43 Days** | **~9.5 Days so far** | **High** |

**Phase 3 actual breakdown** (estimate-vs-actual):
- Initial implementation (17-task plan executed): ~3 Days
- Review fix integration rounds (original + 2nd + 3rd + 4th + 5th-HOST): ~2 Days
- Manual testing & bug surfacing (Bug 1 `isTrusted`, Bug 2 idempotency, Issue 1 host.log forwarding, Issue 2 telemetry, Issue 3 nav panel view-id mapping, Test Unit 5 fixes): ~2 Days
- Lint cleanup + final docs/test wrap-up (Test Unit 3 wording, Test Unit 6 hot-disable contract tests, Test Unit 7 stdout fix, wrap-up commit, design-doc update): ~1 Day
- Phase 3 overran the 5–7 day estimate by ~1–3 days due to the late-discovered design gaps (renderer-side idempotency guard blocking re-spawn; `console.warn` going to stderr in some terminals; static NavigationPanel labels being misinterpreted as clickable commands). Each gap was a single targeted fix, but the cumulative rework time exceeded the original high-complexity estimate's upper bound.

### Key Complexity & Risk Drivers
- **Multi-Process IPC Boundary (Phase 3 & 5)**: Routing JSON-RPC requests across isolated Node process wrappers and sandboxed Webview iframes.
- **Dynamic Split layouts (Phase 5)**: Managing dynamic UI pane state without restarting iframe browser threads.
- **Cross-Platform Installers (Phase 8)**: Handling code-signing certificates and platform installers for Windows and macOS.


## Key Technical Decisions

- **No raw SQL in extensions** - only `finance.db.table('name').find()/insert()/update()` to enforce security boundaries
- **Graceful degradation** - missing extensions return `null`, never throw or crash
- **Shared Data ownership** - Platform layer owns Accounts/Transactions/Categories, extensions have read-only access
- **AI deferred** - no cloud providers until Phase 6; local-first with opt-in only

## Success Criteria

Each phase completes with:
1. Working Electron app that boots without errors
2. TypeScript compiles in strict mode
3. All existing tests pass
4. Deliverable matches specification above