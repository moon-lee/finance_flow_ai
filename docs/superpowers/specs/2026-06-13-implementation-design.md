---
title: Finance Flow AI - Implementation Design
date: 2026-06-13
last_updated: 2026-08-19T05:16:38+10:00
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

### Phase 4: Salary History Extension (Vertical Slice) + First Extension Domain Logic (Est: 6 – 8 Days) — **COMPLETE** (shipped_date: 2026-07-17; duration: 2026-07-04 → 2026-07-17, ~13 days; release: 0.7.0)

> *Updated 2026-07-06: aligned with Phase 4 plan Decisions 1, 5, 14, 16, 17 and Plan Amendments 1 & 3. Pay slips are extension-private (not shared); cross-extension `finance.services.*` is deferred to Phase 5; DeductionService removed per Amendment 1.*

- **Shared Financial Data (Phase 4 ships one table):** `accounts` — owned by Core (platform-owned), extensions can read but not write. Per Phase 4 plan Decision 1 and Decision 4. The original "Shared Financial Data schemas: Accounts, PaySlips, Deductions" wording pre-dated `vision_review.md Issue #23` (Shared Financial Data layer) and Phase 4's namespace-isolation enforcement.
- **Extension-private data (Phase 4 ships two tables under the `salary-history_*` namespace):** `salary_history_pay_slips` (28 columns per Plan Amendments 2 + 3 + 6 — derivation-first with rate history + PAYG validation; Amendment 6 drops `personal_leave_hours` and `holiday_hours` from storage and adds derived `personal_leave`) and `salary_history_rate_history` (16 columns per Decision 16 as amended by Plan Amendments 5 + 6 — effective-dated rate rows; Amendment 5 adds accrual columns, Amendment 6 adds `shift_allowance_hours_per_week`). Pay slips are NOT shared in Phase 4 because no second consumer exists yet — Phase 5+ can promote them to shared ownership when Dashboard/Cash Flow/Budget need them.
- `finance.db.table()` API for typed table access with structural namespace enforcement (no raw SQL)
- **Extension-internal helpers (NOT `finance.services.*`):** PayService for payslip validation/breakdown calculation/aggregation, PayRateService for rate-history CRUD, PAYG validation module. Cross-extension `finance.services.*` is deferred to Phase 5 — the public API gets shaped by Phase 5's consumer call sites, not derived from this internal surface (per Plan Amendment 1 / Phase 4 Decision 5).
- Extension UI: payslip entry form (minimal entry + derived breakdown preview + PAYG validation), salary history list (with YTD summary footer), pay rate history view (admin via Command Palette), accounts seed modal (first-run), reorder sections modal, rate row form
- **Deliverable**: Fully functional salary history UI with persistent storage (SQLite via DAO); two views reachable via Activity Bar (pay history) and Command Palette (rate history); derivation-first calculation engine; settings namespace registration (`salary-history.*` keys)
- **Out of Scope (Explicit Deferrals)** — documented for future phases; NOT shipped in Phase 4:
  - `WebviewPanel` iframe rendering for extensions → Phase 5 (per Decision 11; Phase 4 mounts UI as Lit elements in the workspace).
  - `finance.services.*` cross-extension Domain Services → Phase 5 (PayService is a Phase 4 internal helper per Decision 5; the cross-extension contract lands when a second consumer needs it).
  - NavigationProvider data-driven sidebar → Phase 5.
  - AI tools for Salary History (`finance.ai.registerTool` wiring) → Phase 6 (Phase 4's `ai.registerTool` remains a no-op stub).
  - Typed DAO generation from manifest schemas → Phase 7+.
  - Generic settings UI renderer → Phase 7 (only the reorder modal shipped as a settings surface).
  - Per-extension command allowlist on Main → Phase 5 (security hardening; Renderer can still drive arbitrary command execution in Phase 4).
  - `extensions:ui-event` per-extension allowlist on Main → Phase 5 (Decision 12's new writeback IPC bypasses the `executeCommand` path, so Phase 5 hardening must cover two surfaces).
  - ESM-friendly production source-map stripping → Phase 7.
  - Umzug migration runner adoption → Phase 8 evaluation (inline runner sufficient at 5 migrations).
  - Marketplace extension packaging/signing → Phase 8.
  - Phase 2/3 deferred E2E suite → unchanged (gated by Playwright-electron environmental blocker; tracked separately).
  - DAO query operators `$and` / `$join` / `$orderBy` / `$limit` / `$offset` → Phase 5+; `$raw` is **never** supported (the reason the DAO exists).
  - Transaction support → out of scope (extensions cannot begin transactions in Phase 4; atomicity is per-call).
  - Drizzle / Prisma schema-bound DAO generation → out of scope (Vision Issue #28).
  - Drag-and-drop reorder, versioned settings, real component library (Storybook/Histoire) → Phase 7+.
  - Row-level access control (e.g. "Tax can only read salary_history_pay_slips for tax year X") → future ADR.

### ✅ Phase 5: WebviewPanels & Multi-Extension UI (Complete — 2026-08-02, shipped as 0.8.0)

> *Carries forward 5+ deferred items from Phase 4 (see Phase 4 "Out of Scope" list): `WebviewPanel` rendering, `finance.services.*` Domain Services, NavigationProvider, DAO operators `$join`/`$orderBy`/`$limit`/`$offset`, and two Main-side security allowlists. Scope grew since the original plan — budget accordingly.*

- **Dashboard is the second extension (introduced in Phase 5).** Phase 4 ships only one extension (`salary-history`). Phase 5 authors the Dashboard extension — an aggregator that reads Shared Financial Data (`accounts`) and Salary History data via Domain Services and renders live charts. It becomes the app's default landing view, so Phase 5 takes the extension count from one to two and exercises the multi-extension host for the first time.
- **Startup auto-activation (default view).** Today the app boots with a built-in `Dashboard` *placeholder* tab (`navigation-panel.ts` defaults `_currentView = 'Dashboard'`; `workspace.ts` renders a static Dashboard tab), but no extension is auto-activated on startup — activation only fires on user click (Activity Bar / Command Palette), and `activeView` starts as `''`. Phase 5 must add an explicit **auto-activate-on-startup** path that mounts the Dashboard extension as the initial view *before* any user interaction (mirroring, but distinct from, the on-click `activateView` flow). This is a new host capability: the Extension Host currently has no "activate view at boot" entry point, so Phase 5 scopes both the Dashboard extension and the startup activation mechanism.
- **`finance.services.*` cross-extension Domain Services** — promotes Phase 4's internal `PayService` (Decision 5) into a public, cross-extension contract. The Dashboard (and later Tax/Cash Flow) consume Salary History data through this surface rather than reaching into `salary_history_*` tables directly.
- **Split-screen support, tab management** — multiple extension views open concurrently; workspace becomes a tab host.
- **Dashboard extension** — aggregator that reads Shared Financial Data (`accounts`) and Phase 4 extension data via Domain Services; live charts.
- **NavigationProvider data-driven sidebar** — replaces the static id→name map that Phase 3 introduced and Phase 4 extended for `salary-history` view ids; side-panel trees driven by extension contributions.
- **DAO operator expansion** — implements `$join` (cross-table aggregation for Dashboard), `$orderBy` / `$limit` / `$offset` (sort + paginate; Phase 4 `.find()` only returned PK-DESC). `$raw` remains unsupported.
- **Security hardening (two surfaces)** — Phase 4 opened a second writeback IPC path (`extensions:ui-event`, Decision 12) alongside `executeCommand`. Phase 5 adds a **per-extension allowlist on Main** for both commands *and* ui-events (closes the Phase 3 §7 / Phase 4 Review Finding 3 deferral).
- **WebviewPanel hosting model** — extensions render inside sandboxed `WebContentsView` iframes via custom `finance-shell://` protocol; panel preload exposes `financeShell.extensions.{list,executeCommand,uiEvent,readTable,writeTable,setDirty,autoSaveDraft}` + `financeShell.settings` + `financeShell.accounts` + `financeShell.onPanelInit/onNavigate/onMountUpdate`.
- **Dirty-state lifecycle** — `finance.ui.setDirty`, `finance.ui.autoSaveDraft`, `finance.ui.onBeforeUnmount` exposed to extensions; `autoSaveDraft` wrapped in 500 ms timeout; dirty panels protected from lazy unmount.
- **Overlay coordination** — centralized `OverlayCoordinator` hides `WebContentsView` panels when main-renderer DOM overlays (command palette, modals) are open and restores them on close.
- **Deliverable**: Multiple tabs with live charts in Dashboard; Domain Services consumed consistently across extensions; sandboxed WebviewPanel UI; navigation driven by contributions; hardened per-extension IPC allowlists; dirty-state protection; overlay coordination.

### Phase 6: AI Assistant (Deferred until Phase 5 Complete) (Est: 3 – 5 Days)
- Ollama integration (default local only)
- Context building from Shared Financial Data
- Tool registry for extension-registered functions
- **Deliverable**: Chat panel with read-only data queries to local LLM

### ✅ Phase 7: Production Polish (Complete — 2026-08-19, shipped as 0.9.0)
- Database backup/restore with AES-256-GCM encryption
- Settings screen + Core-owned configuration (financial year, theme, shortcuts, workspace timeouts)
- Account management workspace view with CRUD + first-run gate
- Keyboard shortcut customization + cross-process focus fix (`before-input-event` on all WebContents)
- Theme propagation to sandboxed WebContentsView panels
- Main renderer CSP hardened (`'unsafe-eval'` removed)
- Global event bus (`finance.events.*`) across Host, Main, and renderer
- Lazy unmount timer with dirty-state protection and configurable timeout
- Configurable `autoSaveDraft` timeout and per-extension `keepAlive` hint
- Toast/notification UI component with status bar integration
- Graceful host shutdown drain (finish in-flight RPC before exit)
- **Deliverable**: Stable 0.9.0 release with encrypted backup/restore, production-ready settings, and polished multi-extension UX

### Phase 8: Extension Ecosystem (Est: 3 – 5 Days) (Active — plan `docs/superpowers/plans/2026-08-20-phase8-extension-ecosystem-sdk.md`, ADR-0009)
- User-writable extensions directory (`<userData>/extensions`) discovered alongside the built-in `extensions/` root
- In-app Extension Manager (`__extensions__` view): install/uninstall/delete-data of self-contained extension folders or `.zip`; restart required to activate
- Install-time table DDL generation (extensions cannot ship migrations); dependency + version checks (no downgrades)
- SDK CLI (`node scripts/sdk/cli.mjs init|build`) scaffolding standalone extension projects with vendored `finance.d.ts` type definitions
- No digital signing (single local user per ADR-0009)
- **Deliverable**: Published extension SDK and in-app installer

## Development Time Estimation

Based on a single full-time developer or agent working sequentially, the project is estimated to take **6 to 8 weeks (30 to 43 business days)**, including a buffer for integration testing and platform-specific compilation checks.

| Phase | Deliverable | Est. Time | Actual | Complexity |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | Core Shell Prototype | 1.5 – 2 Days | 0.5 Days | Low |
| **Phase 2** | Database & Settings Backbone | 2 – 3 Days | 1 Day | Medium |
| **Phase 3** | Extension Host & IPC Foundation | 5 – 7 Days | ~8 Days (incl. 5 review rounds, ESM bundling fix, post-test bug fixes) | High |
| **Phase 4** | Salary History Extension (Slice) | 6 – 8 Days | ~13 Days (2026-07-04 → 2026-07-17, incl. 2 review rounds + doc/self-review) | Medium |
| **Phase 5** | WebviewPanels & Multi-Extension UI | 4 – 6 Days | ~4 Days (2026-07-18 → 2026-08-02, incl. planning + review + bug fixes) | High |
| **Phase 6** | AI Assistant (Local-first) | 3 – 5 Days | — | Medium |
| **Phase 7** | Production Polish & Encryption | 3 – 4 Days | ~17 Days (2026-08-02 → 2026-08-19, incl. planning, implementation, review, and testing across 14 tasks) | Medium |
| **Phase 8** | Extension Ecosystem & SDK | 3 – 5 Days | — | High |
| **Buffer** | Integration, build debugging, platform adjustments | 4 – 5 Days | — | - |
| **Total** | **Sleek Desktop Finance Workspace** | **30 – 43 Days** | **~43 Days so far** | **High** |

**Phase 3 actual breakdown** (estimate-vs-actual):
- Initial implementation (17-task plan executed): ~3 Days
- Review fix integration rounds (original + 2nd + 3rd + 4th + 5th-HOST): ~2 Days
- Manual testing & bug surfacing (Bug 1 `isTrusted`, Bug 2 idempotency, Issue 1 host.log forwarding, Issue 2 telemetry, Issue 3 nav panel view-id mapping, Test Unit 5 fixes): ~2 Days
- Lint cleanup + final docs/test wrap-up (Test Unit 3 wording, Test Unit 6 hot-disable contract tests, Test Unit 7 stdout fix, wrap-up commit, design-doc update): ~1 Day
- Phase 3 overran the 5–7 day estimate by ~1–3 days due to the late-discovered design gaps (renderer-side idempotency guard blocking re-spawn; `console.warn` going to stderr in some terminals; static NavigationPanel labels being misinterpreted as clickable commands). Each gap was a single targeted fix, but the cumulative rework time exceeded the original high-complexity estimate's upper bound.

**Phase 4 actual breakdown** (estimate-vs-actual):
- Initial implementation (20-task plan: Tasks 1–10 shared-data/DAO/UI foundation, Tasks 11–17 salary-history extension features, migrations 003–007): ~7 Days
- Review fix integration rounds (Plan Amendments 1–7, Review Findings 1–22, deferral resolutions, ADR-0002 addendum): ~3 Days
- Manual testing & bug surfacing (TU1–TU5 GUI walk-throughs; TU8 typecheck/lint/tests; TU9 build verification; leave-accrual self-reference fix, 2-decimal display, hour-input persistence, migration 006/007/008 fixes): ~2 Days
- Doc/self-review wrap-up (Task 18 self-review §1–§10, CHANGELOG 0.7.0 release, file-reference + ADR sync, design-doc update): ~1 Day
- Phase 4 overran the 6–8 day estimate by ~5 days. The bulk of the overrun was the review-finding churn (7 plan amendments + 22 review findings reshaping the data model, calculation engine, and migration set) and the manual test-unit pass, not the core implementation — the 17 architecture decisions were settled up front, so rework was targeted rather than architectural.

**Phase 5 actual breakdown** (estimate-vs-actual):
- Initial implementation (20-task plan: Tasks 1–17 multi-extension infrastructure, Dashboard extension, DAO operators, allowlists, CSP, ADRs): ~2 Days
- Review fix integration rounds (CSP fix for `javascript:` URLs, Activity Bar sync on panel focus, internal view highlighting, overlay coordinator): ~1 Day
- Manual testing & bug surfacing (CSP-safe Add Payslip button, Activity Bar highlight sync on restore, internal view parent-button mapping, `finance.ui` panel-context verification): ~1 Day
- Phase 5 came in within the 4–6 day estimate. The flat-workspace deviation (ADR-0006) eliminated the phantom split-tree rework that would have consumed the buffer.

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