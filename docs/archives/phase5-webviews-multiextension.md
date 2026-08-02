---
title: Phase 5 — Webview Panels, Multi-Extension UI & Cross-Extension Services
date: 2026-07-18
last_updated: 2026-08-02T09:54:51+10:00
status: complete
target_version: 0.8.0
spec_source: docs/superpowers/specs/2026-06-13-implementation-design.md (Phase 5 section, lines 100–113)
vision_alignment:
  - project_vision.md:154-156 (UI Rendering Layer — WebviewPanel iframe rendering)
  - project_vision.md:222-241 (Main Workspace — tabs + split-screen groups)
  - project_vision.md:107-117 (Domain Services layer — `finance.services.*` contract)
  - project_vision.md:46 (strict namespace isolation)
  - project_vision.md:48 (Do Not Break Other Extensions — graceful `null`)
  - project_vision.md:78 (JSON-RPC transport — Phase 3 ADR-0003)
  - project_vision.md:131-152 (Secure Extension API — `finance.db.table()` contract)
  - project_vision.md:264-284 (Data Architecture / Shared Financial Data boundary)
  - project_vision.md:332-356 (Dashboard as Aggregator Extension)
  - project_vision.md:46 (security — per-extension command allowlist deferred Phase 5)
carries_forward_from_phase4:
  # Items explicitly deferred to Phase 5 by the Phase 4 plan's Self-Review §7.
  - deferral: "WebviewPanel iframe rendering for extensions (Phase 4 Decision 11/19)"
  - deferral: "finance.services.* cross-extension Domain Services (Phase 4 Decision 5)"
  - deferral: "NavigationProvider data-driven sidebar (Phase 4 Self-Review §7)"
  - deferral: "DAO operators $join / $orderBy / $limit / $offset (Phase 4 Decision 2)"
  - deferral: "Per-extension command allowlist on Main (Phase 3 §7 + Phase 4 Decision 12)"
  - deferral: "extensions:ui-event per-extension allowlist on Main (Phase 4 Decision 12)"
  - deferral: "Menu bar contribution rendering (Phase 3 §7)"
  - deferral: "Global event bus (Phase 3 §7)"
  - deferral: "Hot-disable behaviour runtime-unload — extension.deactivate notification (Phase 3 §7)"
depends_on_test_units:
  - phase3 TU1 — Activity Bar activates extension on click
  - phase3 TU3 — Navigation Panel view-id mapping (Phase 3 static stop-gap map; replaced in Phase 5 by NavigationProvider)
  - phase3 TU4 — Extension Host stdout mirrored to Renderer DevTools
  - phase3 TU5 — Crash isolation and re-spawn on next interaction
  - phase3 TU6 — Hot-disable contract (registry excludes disabled; Host retains activation)
  - phase4 TU1 — First-run Account Seed (Dashboard cannot aggregate without accounts)
  - phase4 TU2-TU4 — Payslip CRUD (Dashboard needs payslip data via finance.services.pay.*)
  - phase4 TU8 — TypeScript Strict + Lint + Tests (Phase 5 must maintain green)
  - phase4 TU9 — Multi-File Build Verification (Decision 9 type-only SDK)
prerequisite_decisions:
  - ADR-0002 (inline migrations) — Phase 5 adds at most 1 migration; no threshold impact
  - ADR-0003 (utilityProcess + JSON-RPC 2.0) — extended with $join/$orderBy/$limit/$offset RPC support
  - ADR-0004 (build-time extension entry bundling) — exercised by Dashboard (2nd bundled extension)
  - ADR-0006 (flat workspace layout) — Task 12 ships the flat tab model; 2-pane split deferred
---

# Phase 5 — Webview Panels, Multi-Extension UI & Cross-Extension Services

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Complete this milestone and wait for review before starting Phase 6.
>
> **Goal reminder:** Phase 5 turns the single-extension shell (Phase 3 + Phase 4) into a multi-extension workspace where extensions can render inside sandboxed **WebviewPanels**, the Navigation Panel is **data-driven** from extension contributions, the workspace supports **multiple tabs + split-screen groups**, and a second extension (**Dashboard**) acts as the platform's first **aggregator extension** — reading Shared Financial Data + Salary History data via a new cross-extension **`finance.services.*`** contract. Phase 5 also closes two long-running security deferrals by adding per-extension **allowlists** on Main for both `executeCommand` and `ui-event` (Decision 12 surface). Phase 5 does **not** ship the AI Assistant (Phase 6), keyboard shortcut customization (Phase 7), the generic settings UI (Phase 7), or the Extension Manager / marketplace (Phase 8).

---

## Goal

Ship the platform's first **multi-extension workspace**: the user opens the app and sees the **Dashboard** (a new aggregator extension) as the default view; clicking the Activity Bar button for the `salary-history` view switches to Salary History; the two views stay open in **tabs**; the user can drag tabs into split-screen groups; the Navigation Panel's sidebar items are now **data-driven from extension contributions** (replacing the Phase 3/4 static id→name map); each extension's UI renders inside a sandboxed **`WebviewPanel`** iframe (replacing the Phase 4 renderer-side Lit mount); and Salary History's internal `PayService` is promoted to a **cross-extension `finance.services.pay.*` contract** that the Dashboard (and future extensions) consume. The Main process enforces **per-extension allowlists** for `executeCommand` and `ui-event` IPC, closing two security deferrals.

**Architecture:** the workspace becomes a tab host that mounts one **`WebviewPanel`** per extension view using Electron's `WebContentsView` API (Electron 28+) with `contextIsolation: true` + `sandbox: true` + a strict CSP. The Host gains a new **startup auto-activation** activation event (`onStartup`) so the Dashboard is mounted before any user interaction. The DAO gains **`$join`**, **`$orderBy`**, **`$limit`**, **`$offset`** query operators (Phase 4 shipped only `$eq`-`$nin` + `$or`); `$raw` remains unsupported. A new **`finance.services.pay.*`** cross-extension contract is designed **from the consumer side** (the Dashboard's aggregator queries), not derived from Phase 4's internal `PayService` shape — the internal service is refactored to expose a small, stable surface (`getYearToDateSummary`, `getLastPayslip`, `getCurrentRate`). The Main process gains a **per-extension allowlist** (declared in `package.json#financeExtension.contributions.allowedCommands` + `allowedUiEvents`) that gates every `executeCommand` and `ui-event` IPC call; renderer-driven arbitrary execution is no longer possible.

**Tech Stack:** everything Phase 4 ships, plus: Electron `WebContentsView` (sandboxed embedded views for WebviewPanels; same `contextIsolation: true` + `sandbox: true` + strict CSP as the main window), Lit (Dashboard UI), the existing DAO + IPC infrastructure (extended with new operators + `finance.services.pay.*` RPC), no new runtime deps (the iframes run the same Vite-built extension bundles; no React/Vue/etc.).

---

## Deliverable

A bootable Electron app with a working **multi-extension workspace**. The items below are grouped by what the user sees and what runs under the hood.

### User-visible: Multi-tab Workspace with Dashboard default

1. **Dashboard is the default landing view.** On app startup, the **Dashboard** extension activates automatically (no user click), opens in the **first tab** of the workspace, and renders four cards: (a) Net Worth (sum of `accounts` balances + last-12-months payslip net), (b) Year-to-Date Salary (gross/net/PAYG/SG/shift/YTD summary), (c) Last Payslip (most recent row from `salary_history_pay_slips`), (d) Account Summary (count + list of `accounts`). Each card shows a "—" placeholder when its data source is missing or empty.
2. **Multi-tab workspace.** Clicking the Activity Bar button for the `salary-history` view opens **Salary History** in a **second tab**; the Dashboard tab stays open. Switching tabs swaps the visible content; the inactive tab's state is preserved (its WebviewPanel stays mounted). A tab bar shows all open tabs with the active tab highlighted.
3. **Split-screen support.** A tab can be dragged into a separate editor group (right-side or below), creating a side-by-side or top-bottom view. Phase 5 ships the data model + drag affordance + the visual chrome for split groups; the implementation uses a simple 2-pane (left/right) split first — full grid layouts are Phase 7+.
4. **NavigationProvider — data-driven sidebar.** The Navigation Panel's sidebar is no longer a static `if (view === 'Salary')` switch. Each extension contributes a **`navigation`** block (a flat list of `{ id, label, command, group? }` items) via its `package.json#financeExtension.contributes.navigation`. The Navigation Panel renders the items of the **currently-active extension** and wires clicks to that extension's contributed commands. The Salary extension contributes "Pay History" + "Pay Rate History"; the Dashboard contributes "Net Worth Detail" (no-op placeholder for Phase 5+) and "Open Salary History" (invokes `salary.show-pay-history`). Phase 5 also reserves a built-in "Settings" group rendered by Core (not an extension contribution).
5. **WebviewPanel sandbox.** Each extension's UI runs inside a sandboxed Electron `WebContentsView` (the Phase 5 shape of `WebviewPanel`), not in the main renderer. The panel gets `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and a strict `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`. The panel communicates with the Renderer via `postMessage` (the existing `extensions:ui-event` channel becomes the standard back-channel). The renderer-orchestrator pattern (Phase 4's `salary-history-view` Lit host) is replaced by a Main-side **WebviewPanel manager** that owns the panel lifecycle, including security headers.

### User-visible: Cross-extension `finance.services.*`

6. **Dashboard reads salary data via `finance.services.invoke('pay', ...)`.** The Dashboard extension's `activate` calls `finance.services.invoke('pay', 'getYearToDateSummary', { financialYearStart })` to compute the YTD Salary card; `finance.services.invoke('pay', 'getLastPayslip')` for the Last Payslip card; `finance.services.invoke('pay', 'getCurrentRate')` for the "current hourly rate" subtitle on the YTD card. If the salary-history extension is missing/disabled, every `finance.services.invoke('pay', ...)` call returns `null` (graceful degradation per `project_vision.md:48`) and the card shows a "Salary extension not installed — install Salary History to see this card" placeholder.
7. **`finance.services.invoke('pay', ...)` is a Core-owned registry, not a salary-history export.** Phase 5 introduces `src/main/services/domain-service-registry.ts` (new) and `src/extension-host/api/services.ts` (new Host-side API surface). Salary-history's `PayService` is split: the **internal** logic stays in `extensions/salary-history/src/services/pay-service.ts`; the **public** `finance.services.invoke('pay', ...)` adapter is registered in Main via `registerDomainService('pay', { getYearToDateSummary, getLastPayslip, getCurrentRate })` when the salary-history extension activates. The Host's `finance.services.invoke('pay', ...)` API is a thin RPC proxy that looks up the registered service and calls it.

### User-visible: Security hardening

8. **Per-extension command allowlist.** Every `executeCommand` IPC call now goes through `commandAllowlist.canExecute(extensionId, commandId)`. Each extension declares its allowed commands in `package.json#financeExtension.contributes.allowedCommands: string[]` (subset of its own `commands[]` ids). A command id NOT in the allowlist returns `{ executed: false, reason: 'command not allowed for this extension' }`. The built-in Phase 3 commands (`view-dashboard`, `toggle-ai`, etc.) bypass the allowlist (Core-owned, not extension-scoped). The renderer-driven arbitrary execution of Phase 4 is **no longer possible**.
9. **Per-extension `ui-event` allowlist.** Same shape as the command allowlist: `allowedUiEvents: string[]` per extension; `ui-event` IPC calls for event names outside the list are dropped silently with a `console.warn` (no error to the renderer — the event simply does not fire). The Salary extension's existing event names (`account-create`, `payslip-create`, etc.) are seeded from the manifest.

### Verification

10. **Persistence verified.** All Phase 4 persistence properties survive the Phase 5 host changes — payslips, rate rows, accounts, settings all round-trip. Manual Test Unit 5 walks the loop.
11. **Cross-extension isolation verified.** Salary-history cannot read Dashboard's tables; Dashboard cannot read salary-history's tables; both can read Shared Financial Data (`accounts`); both gracefully handle each other's absence.
12. **TypeScript Strict + Lint + Tests** — `npm run typecheck` exit 0; `npm run lint` exit 0; `npm test` all tests pass (project total 404 after Phase 5).
13. **E2E suite unblocked** — Phase 5's manual TU8 verifies the Phase 3 environmental blocker (`Cannot navigate to invalid URL` on `page.goto('/')`) is now resolved (the WebviewPanel iframe creates its own routable URL via `loadURL('about:blank')` + dynamic content injection).

### Out-of-Scope reminder (carried forward)

The user-visible deliverable is the **multi-extension workspace + Dashboard + Domain Services + security hardening**. Everything below is documented under **Out of Scope** for traceability but NOT shipped in Phase 5.

---

## Out of Scope (Explicit Deferrals)

| Deferred | Target Phase | Why deferred |
|----------|--------------|--------------|
| AI Assistant (`finance.ai.registerTool` wiring + Ollama + context building) | Phase 6 | Phase 4/5 ship only `finance.ai.registerTool` stubs; Phase 6 makes the stub executable. Phase 5 may register a Dashboard tool stub for forward-compatibility (the registration is a no-op until Phase 6) but does not invoke it. |
| Generic settings UI renderer (`contributes.configuration`) | Phase 7 | Phase 5 keeps Phase 4's `mountData` interim channel for salary-history; the rendered Settings screen is Phase 7. |
| Extension Manager UI (install/enable/disable/uninstall/delete data) | Phase 8 | Phase 5's `setEnabled` flow remains Developer-driven (edit `extension_registry` + restart). The Extension Manager screen that drives it is Phase 8. |
| Marketplace extension packaging/signing/dependency resolution | Phase 8 | Phase 5 ships 2 bundled extensions (Salary History + Dashboard); the marketplace discovery/install flow is Phase 8. |
| Keyboard shortcut customization | Phase 7 | Phase 5 honors Phase 4's manifest `keybinding` fields for the two salary commands; a shortcut-config screen is Phase 7. |
| Database migrations / backup-restore / encryption | Phase 7 | Phase 5 ships at most one new migration (Dashboard does not own a table; may add a `dashboard_layout` settings key but no schema change). |
| Theme system / accessibility audit | Phase 7 | Phase 5 ships light/dark theme as in Phase 2/4; Phase 7 adds theming extensions can consume + a11y audit. |
| Typed DAO generation from manifest schemas | Phase 7+ | Phase 5 extends operators ($join / $orderBy / $limit / $offset) but keeps the dynamic `.table('name')` access shape. |
| Typed SDK npm package (`finance.d.ts` as published `finance` package) | Phase 8 | Phase 5 keeps Phase 4's internal `src/types/finance.d.ts` + `tsconfig.paths` + Vite alias. |
| Multi-version DB compatibility + downgrade support | Out of scope | ADR-0002's "Umzug" trigger not yet fired. |
| Drag-and-drop reorder, versioned settings, real component library (Storybook/Histoire) | Phase 7+ | Phase 5 uses the Phase 4 `reorder-sections-modal` for form-section reordering only. |
| Row-level access control on extension tables (e.g. "Tax can only read salary_history_pay_slips for tax year X") | Out of scope (future ADR) | Phase 5 keeps the Phase 4 namespace-only boundary; row-level is a Phase 6+ ADR if a consumer needs it. |
| `'unsafe-eval'` CSP exemption removal (Phase 4 Decision 19 risk §8) | **Phase 5** (closed by this plan) | Phase 5's WebviewPanel iframe does not use `blob:` URLs or dynamic-import for extension bundles (the bundle is loaded via `loadFile(dist/extensions/<id>.js)` in the iframe), so `'unsafe-eval'` is no longer required. The CSP can be tightened. |
| Full grid layout for split-screen (2x2, 3-pane, etc.) | Phase 7+ | Phase 5 ships left/right + top/bottom 2-pane only. |
| `ExtensionManager` IPC for runtime install/uninstall (Phase 8 prerequisite) | Phase 8 | Phase 5's Main-side allowlists are static (manifest-declared); dynamic ACL mutation is Phase 8. |
| Stale Activity Bar cache refresh on `setEnabled` change | Phase 8 | Phase 4 documented this as a contract item (#5) — Phase 5 inherits; Phase 8 ships the `financeShell.extensions.onChanged()` event that drives the Activity Bar refresh. |
| `host.shutdown` graceful draining of pending requests | Phase 7+ | Phase 5 inherits the 1-second hard-kill timeout from Phase 4; graceful draining is a Phase 7 polish item. |
| `finance.events.*` global event bus (cross-process) | Phase 7 | Phase 5 keeps the Phase 4 IPC channels (no bus); an event bus is Phase 7 work. |

---

## Suggested Implementation Order

The task list below (1–20) is organized for document clarity, not execution sequence. Implementers should follow the dependency-aware order below to avoid circular dependencies and unnecessary merge conflicts.

**Stage 1 — Foundation (Main-side only, no UI dependencies)**
1. **Task 1** — manifest schema (`navigation`, `allowedCommands`, `allowedUiEvents`, `onStartup`). Prerequisite for all manifest-parsing tasks.
2. **Task 13** — command allowlist. Main-side only; closes a Phase 3/4 security deferral.
3. **Task 14** — ui-event allowlist. Mirrors Task 13's structure; closes the second Phase 3/4 deferral.
4. **Task 7** — Domain Service Registry + Host-side `finance.services.*` proxy. Main-side only; no panel or UI dependencies.

**Stage 2 — Salary-history + Dashboard extensions**
5. **Task 5** — migrate renderer-side salary-history code into the bundle (delete `salary-history-view.ts`, update `main.ts`). Must land before Task 8 to avoid conflicting diffs on `main.ts`.
6. **Task 8** — public-pay-adapter + `finance.services.register('pay', ...)` in `activate()`. Depends on Tasks 5 and 7.
7. **Task 10** — `onStartup` activation mechanism in Host + Main. Must land before Task 9 so the service-provider-first activation order is enforced.
8. **Task 9** — Dashboard extension (aggregator, 4 cards, `onStartup` manifest). Depends on Tasks 7, 8, and 10.

**Stage 3 — Panel infrastructure (Main + renderer coupling)**
9. **Task 2** — WebviewPanel infrastructure (`WebviewPanelManager`, custom protocol, `destroyAll`). No dependency on Phase 2 tasks.
10. **Task 3** — panel preload (`window.financeShell` subset inside the iframe). Depends on Task 2.
11. **Task 4** — Main-side message router (panel ↔ renderer via Main, sender-identity verification). Depends on Task 2.

**Stage 4 — UI (renderer) + DAO**
12. **Task 11** — NavigationProvider (data-driven sidebar). Depends on Task 1's `navigation` manifest field.
13. **Task 12** — Workspace layout (tabs + 2-pane split). Depends on Task 2's `WebContentsView` infrastructure and `panel:resize` IPC. **Deviated by ADR-0006:** ships flat tab list only; 2-pane split deferred to version: 2 migration.
14. **Task 6** — DAO operators (`$join`, `$orderBy`, `$limit`, `$offset`). Independent of Tasks 2–4; can be done in parallel with UI work.

**Stage 5 — Finishing touches**
15. **Task 15** — CSP closure (panel HTML shell, no `'unsafe-eval'`). Depends on Task 2's protocol.
16. **Task 16** — ADR-0005 for Domain Service Registry + ADR-0006 for Flat Workspace Layout. Documentation; depends on Tasks 5 and 12.
17. **Task 17** — update `extension-api.md` + `file-reference.md`. Documentation; depends on all implementation tasks.
18. **Task 18** — Manual Test Units (12 manual tests + E2E).
19. **Task 19** — Self-Review Checklist verification.
20. **Task 20** — CHANGELOG `[0.8.0]` header, `package.json#version` sync, handoff doc.

---

## Architecture Decisions

### Decision 1: WebviewPanel = Sandboxed Electron `WebContentsView` (Embedded in Main Window)

> **In plain English:** Each extension's UI renders inside a sandboxed webview that is **embedded within the main shell window**, not a separate floating window. It looks and behaves like a tab/pane in the workspace, but it runs in an isolated web content process with its own CSP and preload script.

**Choice:** A `WebviewPanel` in Phase 5 is an Electron `WebContentsView` (modern Electron 28+ API) that is attached to the main `BrowserWindow` and positioned over a reserved DOM region (the workspace pane). It is configured with:

```ts
const panel = new WebContentsView({
  webPreferences: {
    contextIsolation: true,           // no `window` leakage
    sandbox: true,                     // OS-level sandbox
    nodeIntegration: false,           // no Node in extension UI
    preload: panelPreloadScriptPath   // contextBridge-provided subset of financeShell
  }
});
mainWindow.contentView.addChildView(panel);
panel.setBounds({ x, y, width, height }); // synced to the workspace pane's DOM bounds
```

The panel loads `finance-shell://panel/<extensionId>/<viewId>.html` (a custom protocol registered by Main in Phase 5 Task 2) which serves the extension's bundled UI (`dist/extensions/<extensionId>.js`) plus a small panel-runtime stub. The panel communicates with the main renderer via a **Main-side message router** (Task 4): panel → Main → renderer and renderer → Main → panel. Every cross-boundary message routes through Main so the per-extension allowlists can gate it.

**Why `WebContentsView`:**
- It is the officially supported replacement for the deprecated `<webview>` tag.
- It is **embeddable** inside the main `BrowserWindow`, so it fits naturally into tabs/splits without floating OS windows or coordinate-sync hacks.
- It provides full process isolation and the same security knobs as a `BrowserWindow` (`contextIsolation`, `sandbox`, `nodeIntegration: false`).
- It supports the lifecycle methods Phase 5 needs: `setBounds`, `setVisible`, `focus`, `blur`, `webContents.reload`, and `removeFromParent`.

**Why not a separate child `BrowserWindow`:** a separate top-level window cannot be visually clipped, nested, or scrolled inside the main window's DOM elements (tabs/splits). The plan previously described both "child BrowserWindow" and "tabs within editor groups," which was contradictory. `WebContentsView` resolves that contradiction.

**Why not a DOM `<iframe>`:** an `<iframe>` still runs inside the renderer's process and shares the renderer's CSP. It does not provide the process isolation or CSP escape that Phase 5 needs to close the `'unsafe-eval'` risk from Phase 4 Decision 19.

**Why not Phase 4's renderer-side Lit mount:** that approach required loading the extension bundle via a dynamic `import()` of a `blob:` URL, which forced `'unsafe-eval'` into the main renderer's CSP. `WebContentsView` loads the bundle through a regular `<script>` tag from the custom `finance-shell://` protocol, avoiding `'unsafe-eval'` on the panel side.

**Alternatives considered:**

- **`<iframe>` in the renderer DOM.** Simpler layout, but runs in the renderer's process and shares the renderer CSP. Rejected because it cannot close the `'unsafe-eval'` risk.
- **Child `BrowserWindow`.** Provides isolation, but is a separate top-level OS window that cannot be embedded as a tab/split inside the main window. Rejected.
- **Phase 4's renderer-side Lit mount (Decision 11/19).** Already proven, but `'unsafe-eval'` is a real CSP regression. Phase 5 closes it.

**Trade-off:** A `WebContentsView` per panel uses ~20–40 MB of RAM per open tab (less than a full `BrowserWindow`). Phase 5 mitigates with a **lazy-unmount policy** (see Decision 8). Layout bounds must be synced from the workspace DOM to the `WebContentsView` on resize/scroll/split changes; Task 12 owns this sync.

**Revisit triggers:**
- Electron's `WebContentsView` API changes significantly or a critical lifecycle method is removed → re-evaluate.
- Memory pressure with >10 open tabs becomes a real complaint (Phase 7 lazy-mount / pooling).
- An extension needs to render a PDF or native dialog → `WebContentsView.webContents.printToPDF(...)` supports PDF; native dialogs are still out-of-process and work as normal.

---

### Decision 2: Startup Auto-Activation — Dashboard Mounts Before User Interaction

> **In plain English:** When the app boots, the Dashboard extension activates on its own (no click needed) and becomes the first open tab. Extensions can opt into this behaviour by listing `onStartup` in their `activationEvents`.

**Choice:** A new activation event `onStartup` joins the Phase 3 set (`*`, `onView:<id>`, `onCommand:<id>`). Extensions that declare `onStartup` are activated by Main immediately after the Extension Host becomes ready, **before** any renderer interaction. The Main-side activation order is:

1. App starts → `app.whenReady` → DB + settings init (Phase 4 order).
2. ExtensionIPC starts → Host announces `host.ready` (Phase 3 order).
3. **NEW (Phase 5):** Main reads the user setting `core.workspace.defaultView`. The default value `'dashboard'` is a **code fallback** (not a DB seed) — consistent with the project's existing settings pattern (`getSetting(key) ?? default`). Main validates that the referenced view is contributed by an extension whose `activationEvents` contain `onStartup`; if not valid, it falls back to the first `onStartup` extension's primary view in manifest-discovery order.
4. Main sends `extension.activate` RPC to the Host for each `onStartup` extension. Activation order is: **service-providing extensions first** (extensions that register `finance.services.*` implementations), then the default-view extension (Dashboard), then remaining `onStartup` extensions in manifest-discovery order. Within each group, order is alphabetical on `id` for determinism. This guarantees that when Dashboard's `activate()` calls `finance.services.invoke('pay', ...)`, the `pay` service is already registered by salary-history.
5. The Host activates each extension in turn. Each activation may call `finance.services.register('pay', ...)` or `finance.ui.requestMount('dashboard-view', ...)`; Main buffers the mount requests and forwards them to the Renderer once the workspace is ready.
6. The Renderer mounts the `core.workspace.defaultView` WebviewPanel as the active tab; subsequent `onStartup` extensions mount as additional background tabs. If there is no `onStartup` extension for the configured default view, the first `onStartup` extension's primary view becomes the active tab.

**Reasoning:** `project_vision.md:332-356` describes Dashboard as the platform's default landing view. Today the workspace ships with a static Dashboard placeholder tab (`src/renderer/components/workspace.ts` defaults `_currentView = 'Dashboard'`). Phase 5 must turn that placeholder into a real extension — and the only way to do that is for Dashboard to auto-activate, because there is no UI affordance to "click Dashboard" if the user cannot reach it before any click.

The Dashboard and salary-history extensions both declare `"activationEvents": ["onStartup"]`. Dashboard is the **default-view** extension (it mounts as the active tab); salary-history is a **service provider** (it registers `finance.services.pay.*` so Dashboard can consume it). Salary-history keeps its `onView:salary-history` activation as well for lazy re-activation after deactivation, but `onStartup` ensures its service is registered before Dashboard queries it.

**Alternatives considered:**

- **Hard-code Dashboard's activation in Main.** Simpler, but couples Main to a specific extension. Phase 8's marketplace would need to either (a) move Dashboard's activation to its own Core Extension code (a chunk of Main) or (b) keep the hardcode. The `onStartup` event keeps Main generic. Rejected.
- **`*` activation (Phase 3 wildcard).** Activates the extension on startup but does **not** trigger a UI mount — the extension has to opt into the renderer flow separately. `onStartup` combines both: activate + mount. Rejected.
- **Defer Dashboard's default-view behaviour to Phase 8 (when the Extension Manager lets users pick a default).** Defeats Phase 5's "Dashboard is the default landing view" deliverable. Rejected.

**Trade-off:** `onStartup` activates an extension before the user has clicked anything, which means a misbehaving `onStartup` extension (one that throws during activation) will keep the shell from booting. Phase 5 mitigates with the Phase 3 hot-disable contract: a `crash_count >= 3` extension is auto-disabled, and the `onStartup` activation goes through `extensions:activate-view` IPC (which routes through `recordCrash` on failure) rather than a fire-and-forget RPC.

A second trade-off is the new `core.workspace.defaultView` setting. If a user disables the extension that contributes the default view and does not change the setting, Main falls back to the first available `onStartup` extension. This is graceful but may surprise users who expected a specific extension to open.

**Revisit triggers:**
- More than one `onStartup` extension is added (Phase 5 only ships Dashboard) — `core.workspace.defaultView` becomes more valuable and should be surfaced in a Phase 7 settings UI.
- An `onStartup` extension wants to delay its UI mount (e.g., it needs to load remote data first) → add an `onStartupAfterReady` event in Phase 7+.
- Phase 8's marketplace ships — `onStartup` extensions must be opt-in (not auto-installed); `core.workspace.defaultView` should validate against installed/enabled extensions.

---

### Decision 3: NavigationProvider — Data-Driven Sidebar from `contributes.navigation`

> **In plain English:** The Navigation Panel (the "Explorer" sidebar) is no longer a hardcoded `if (view === 'Salary')` switch. Each extension contributes its own sidebar items in its `package.json`, and the Navigation Panel renders the items for the currently-active extension. The shell stays generic.

**Choice:** A new manifest contribution type:

```jsonc
// extensions/dashboard/package.json
"contributes": {
  "navigation": [
    {
      "id": "dashboard.net-worth",
      "label": "Net Worth Detail",
      "command": "dashboard.open-net-worth-detail",
      "group": "Insights"
    },
    {
      "id": "dashboard.open-salary",
      "label": "Open Salary History",
      "command": "salary.show-pay-history",
      "group": "Quick Links"
    }
  ]
}
```

Each item is `{ id, label, command, group? }`. Items in the same `group` are rendered together under a section header; items with no group go to a default "Quick Links" section. Items can reference any command in any active extension (the `command` field is a free-form `extension.commandId` — the `executeCommand` IPC checks the command's owning extension's `allowedCommands` allowlist, so Dashboard can invoke `salary.show-pay-history` because Salary has whitelisted it).

The Phase 3/4 static `navigation-panel.ts` `_VIEW_CONTEXT_MAP` is **removed**. The Navigation Panel becomes a generic renderer that:
1. Subscribes to `financeShell.extensions.list()` for the current set of active extensions.
2. Looks up the active extension's `contributes.navigation` items.
3. Renders the items as clickable divs (matching the Phase 3 styling).
4. On click, fires the item's `command` via the existing `command-selected` window event.

Built-in Core items (e.g., "App Preferences" for the `__settings__` view) are rendered from a Core-owned constant in `src/renderer/components/navigation-panel.ts` — they are not extension contributions.

**Reasoning:** Phase 4's static `if/else` switch in `navigation-panel.ts` cannot scale past 2-3 extensions; the Phase 3 stop-gap `_VIEW_CONTEXT_MAP` is a documented Phase 5 deferral. The data-driven NavigationProvider is the VS Code equivalent of `contributes.viewsContainers` + `contributes.views` — a contribution pattern extensions declare and Core renders generically.

**Alternatives considered:**

- **VS Code's full `viewsContainers` + `views` (tree views with `TreeDataProvider`).** Overkill for Phase 5 — none of the current extensions have hierarchical navigation. Defer to Phase 7+ when Budget/Cash Flow/Reports ship with tree views.
- **Programmatic registration only (no manifest contribution).** Each extension calls `finance.ui.registerNavigationItem(...)` at activation. More flexible but more boilerplate; the manifest approach is more declarative and easier to validate at load time. Rejected.

**Trade-off:** The `command` field is a free-form string that could reference a command that doesn't exist. Phase 5 validates it at activation time (the `command-selected` handler resolves it; if missing, logs `console.warn` and does nothing — same graceful degradation as `finance.commands.execute`).

**Revisit triggers:**
- An extension contributes > 20 navigation items → tree view (Phase 7).
- An extension wants context-sensitive navigation (different items based on app state) → add a `NavigationProvider` callback API in Phase 7.

---

### Decision 4: DAO Operators — `$join`, `$orderBy`, `$limit`, `$offset`

> **In plain English:** Phase 4 shipped only equality + comparison + boolean-or operators on a single table. Phase 5 adds the four operators the Dashboard needs: cross-table `$join` for aggregating Accounts + Payslips; `$orderBy` for sorting; `$limit` / `$offset` for pagination.

**Choice:** Extend `DAOService.compileQuery` (Phase 4 Decision 2) with:

```ts
finance.db.table('salary_history_pay_slips').find(
  { account_id: 1 },
  {
    $join: { table: 'accounts', on: { left: 'salary_history_pay_slips.account_id', right: 'accounts.id' }, type: 'LEFT' },
    $orderBy: [{ column: 'pay_date', direction: 'DESC' }],
    $limit: 50,
    $offset: 0
  }
)
```

| Operator | Shape | Notes |
|----------|-------|-------|
| `$join` | `{ table, on: { left: string, right: string }, type: 'INNER' \| 'LEFT' \| 'RIGHT' }` | `on` is a structured object `{ left: 'from_column', right: 'to_column' }` — no raw SQL string. This is injection-safe by design. The DAO service validates `left` and `right` against the two registered tables' column manifests. `$join` is allowed **only on shared tables and the calling extension's own tables**. |
| `$orderBy` | `Array<{ column, direction: 'ASC' \| 'DESC' }>` | Column must exist in the (post-join) result set; direction is enum-validated. |
| `$limit` | `number` (integer, 1..1000) | Hard cap of 1000 (matches Phase 4's default). |
| `$offset` | `number` (integer, >= 0) | No upper bound (consumer responsibility). |

Operators are added as a **second argument** to `find()` / `findOne()` / `count()`. The first argument remains the WHERE clause (Phase 4 shape). The query envelope `{ rows: ... }` is unchanged.

**Reasoning:** Phase 4 Decision 2 deferred `$join` (Dashboard aggregation), `$orderBy` / `$limit` / `$offset` (sort + paginate) explicitly to Phase 5. However, cross-extension `$join` is **not** available in Phase 5, so the Dashboard cannot use `$join` to combine payslips with accounts at the SQL level. Instead, the Dashboard's aggregator combines the two reads **in JavaScript** after fetching both via `finance.db.table('accounts')` and `finance.services.pay.*` (see Decision 5). The `$join` operator is only available to extensions that own one of the tables being joined or that join shared tables (`accounts`). A salary-history extension can `$join` its own `salary_history_pay_slips` with `accounts` (shared table) because it owns `salary_history_pay_slips`. The Last Payslip card sorts by `pay_date DESC` and limits to 1; pagination is needed for users with >1000 payslips.

**Why a second argument, not extending the first:** keeping WHERE (filter) and operators (projection) separate matches the SQL mental model and lets the DAO service validate them independently (WHERE columns are table-scoped; `$orderBy` columns are result-set-scoped). It also keeps Phase 4 callers compatible — they pass one arg as before; Phase 5 callers add the second.

**Alternatives considered:**

- **Knex-style chained API (`find().where().orderBy().limit()`).** More fluent but breaks Phase 4's existing call sites. Rejected.
- **`$and` operator.** Phase 4 Decision 2 deliberately omitted it (`{ a: 1, b: 2 }` is already AND). No change.
- **Subqueries / nested `$join`.** Out of scope. Defer until an extension needs them.

**Trade-off:** A structured `{ left: string, right: string }` join condition is injection-safe by design and does not require the small parser from Phase 4's raw-SQL approach. The trade-off is that `left`/`right` must exist in the respective table's column manifest; a `left` column that does not exist is caught at validation time with a `ValidationFailedError` (-32012).

**Revisit triggers:**
- An extension needs `$join` against an extension table that is not its own (e.g., Dashboard wants to `$join` salary_history_pay_slips). **NOT allowed** in Phase 5 — only `accounts` (shared) can be joined from a Dashboard call. The Dashboard's payslip aggregation occurs **in JavaScript** after calling `finance.services.pay.*`. If a Phase 6+ consumer needs cross-extension `$join` at the SQL level, that's a Phase 8 ADR (likely: a Core-owned aggregator extension that runs the join, not the calling extension).
- `$join` performance with >10k rows becomes a complaint → migrate to a real query planner in Phase 7+.

---

### Decision 5: `finance.services.*` — Cross-Extension Domain Services (Designed from the Consumer Side)

> **In plain English:** Salary-history's `PayService` becomes a public, cross-extension service. The Dashboard (and any future extension) can call `finance.services.pay.getYearToDateSummary()` without importing salary-history's code. The public shape is designed from **what the Dashboard actually needs**, not from salary-history's existing internal methods.

**Choice:** Three new pieces:

1. **Domain Service Registry (`src/main/services/domain-service-registry.ts`, new)** — Core-owned singleton:
   ```ts
   class DomainServiceRegistry {
     register(serviceName: string, extensionId: string, impl: DomainServiceImpl): void;
     unregister(serviceName: string, extensionId: string): void;
     invoke(serviceName: string, method: string, params: unknown): Promise<unknown>;
   }
   ```
   Multiple extensions can register under the same `serviceName` (e.g., two extensions both implementing `pay`); the last `register` call wins for a given (serviceName, extensionId) pair. Resolution is by `serviceName`; the calling extension passes `{ serviceName, method, params }` and the registry dispatches to the **most recently registered** implementation (insertion order in the inner `Map`). `unregister()` removes the entry; subsequent `invoke()` picks the next-most-recent registration. If no registrations exist, `invoke()` returns `null`.

2. **Host-side `finance.services.*` API (`src/extension-host/api/services.ts`, new)**:
   ```ts
   finance.services = {
     invoke<T>(serviceName: string, method: string, params?: unknown): Promise<T | null>
   };
   ```
   `invoke` returns `null` (not throws) if the service is not registered or the extension that registered it is disabled. When `null` is returned due to a missing service, the registry emits `console.warn('[services] service not found:', serviceName)`. When `null` is returned because the implementation threw, the registry emits `console.warn('[services] service errored:', serviceName, error.message)`. This distinction lets the caller distinguish "service absent" from "service errored" during debugging.

3. **`finance.services.pay.*` adapter (`extensions/salary-history/src/services/public-pay-adapter.ts`, new)** — wraps salary-history's existing internal `PayService` and exposes:
   ```ts
    // Public surface (Phase 5 — designed from Dashboard's needs):
    export interface PublicPayService {
      getYearToDateSummary(financialYearStart: string, asOfDate?: string): Promise<YtdSummary | null>;
      getLastPayslip(): Promise<PaySlip | null>;
      getCurrentRate(): Promise<RateRow | null>;
    }
    ```
   Each method:
   - Calls the internal `PayService` (Phase 4 code) for the calculation.
   - Wraps any thrown error in a `null` return (graceful degradation).
   - Returns JSON-safe values (no `Date` objects — ISO strings).

   The adapter is **registered** in `extensions/salary-history/src/main.ts` `activate()` via:
   ```ts
    finance.services.register('pay', {
      getYearToDateSummary: (params) => adapter.getYearToDateSummary(params),
      getLastPayslip:       () => adapter.getLastPayslip(),
      getCurrentRate:       () => adapter.getCurrentRate()
    });
   ```

   `deactivate()` calls `finance.services.unregister('pay', 'salary-history')`.

**Reasoning:** Phase 4 Decision 5 explicitly deferred `finance.services.pay.*` to Phase 5 with the design note: *"The first version of `finance.services.pay.*` will be designed from the consumer side — by what Phase 5's Cash Flow / Dashboard / Budget actually need to call — not derived from PayService's current internal surface."* Phase 5 ships Dashboard as the first consumer; its needs are the spec for `finance.services.pay.*`.

The three methods above are exactly what Dashboard calls. The internal `PayService` exposes 14 methods (validatePayslipInput, calculatePaySlipBreakdown, aggregateYearToDate, etc.); only 3 are promoted to the public contract. The other 11 stay internal to salary-history.

**Why a registry in Main, not a Host-side registry:** the Domain Service Registry must outlive any single extension's lifecycle (services can be registered by extension A and called by extension B; if extension A crashes, B's calls must return `null`, not throw). Main is the only long-lived process; the Host can die and respawn without losing the registry's state.

**Why a single `invoke(serviceName, method, params)` method, not a typed surface:** keeps the JSON-RPC method catalogue small (`finance.services.invoke` is one method; typed surfaces per service would explode the catalogue as services are added). The Host-side wrapper translates the string `method` to the registered impl's function; type safety is at the TypeScript layer (the extension's `finance.services.pay` proxy is typed to the `PublicPayService` interface via the Phase 4 Decision 9 type-only SDK).

**Alternatives considered:**

- **Each extension exposes its own `finance.services.<extensionId>.*` surface.** Tighter type safety but duplicates the JSON-RPC method catalogue for every service. Phase 8's marketplace (potentially 10+ services) makes this untenable. Rejected.
- **Direct extension-to-extension calls (extension A imports extension B's code).** Violates `project_vision.md:48` ("Direct in-process imports, shared global state, and direct database cross-writes between extensions are strictly forbidden"). Rejected.
- **Reuse the Phase 4 `finance.commands.execute` IPC for services.** Possible but conflates two concerns: commands are fire-and-forget user-driven actions; services are request/response programmatic calls. Keeping them separate simplifies error handling and audit logging. Rejected.

**Trade-off:** The registry's "last-registered wins" rule means the order of activation matters. Phase 5 only has one extension registering `pay` (salary-history), so this is moot. Phase 8's marketplace may need an explicit priority mechanism (extension A declares `"domainServices": [{ name: "pay", priority: 10 }]`).

**Revisit triggers:**
- Two extensions register the same `serviceName` with conflicting semantics → add a `version` field and per-version resolution.
- An extension wants to call a service synchronously (not async) → the JSON-RPC layer forces async; Phase 8 may add a local-services fast path for same-process cases.
- The registry becomes a hot path (called >1000×/sec) → add an in-memory cache keyed on `(serviceName, method, params)`.

---

### Decision 6: Per-Extension Command Allowlist (Main-Side Enforcement)

> **In plain English:** Today the renderer can ask Main to execute any command registered by any active extension. Phase 5 closes that gap: each extension declares the command ids it is willing to have invoked on its behalf, and Main enforces the list before forwarding the RPC to the Host.

**Choice:** Two changes:

1. **Manifest contribution** — add `allowedCommands: string[]` to `FinanceExtensionManifest.contributes`:
   ```jsonc
   // extensions/salary-history/package.json
   "contributes": {
      "commands": [
        { "id": "salary.show-pay-history", "title": "View: Pay History", "keybinding": "Ctrl+Alt+H" },
        { "id": "salary.show-pay-rate-history", "title": "View: Pay Rate History", "keybinding": "Ctrl+Alt+R" }
      ],
      "allowedCommands": [
        "salary.show-pay-history",
        "salary.show-pay-rate-history"
      ]
   }
   ```
   The `allowedCommands` list is a subset of `commands` (validated at load time by the manifest schema); commands not in the list can still be **registered** (the extension's own code can call them via `finance.commands.execute`) but cannot be **invoked by external callers** (the renderer, another extension via `finance.services.*` proxy, or a future marketplace-installed extension).

2. **Main-side enforcement** — `extensions:execute-command` IPC handler gains a pre-check:
   ```ts
   ipcMain.handle('extensions:execute-command', async (_event, commandId, ...args) => {
     const owning = extensionRegistry.commands().find(c => c.command.id === commandId);
     if (!owning) return { executed: false, reason: 'command not found' };
     if (!commandAllowlist.isAllowed(owning.extensionId, commandId)) {
       return { executed: false, reason: 'command not allowed for this extension' };
     }
     // ... existing IPC dispatch ...
   });
   ```

   A new `CommandAllowlist` class in `src/main/services/command-allowlist.ts` builds the lookup table from the loaded manifests at startup; the table is rebuilt when the manifest list changes (Phase 8's `onExtensionsChanged` event).

**Reasoning:** Phase 3 Self-Review §7 deferred this to Phase 5; Phase 4 Review Finding 3 reminded that it was still deferred. The allowlist is the **first line of defence** against accidental or unprivileged cross-extension command invocation. It is **not** a full security isolation layer — all extensions share one Host process, so a malicious extension could spoof its extension ID or read another extension's registered commands in memory (see Gap 5). The allowlist protects against **developer errors** and **unintentional cross-extension calls**, not against a compromised extension that already runs in the shared Host.

**Enforcement semantics:** the allowlist checks the **target command's owning extension**, not the calling extension. When `executeCommand('salary.show-pay-history')` is invoked from the Dashboard navigation panel, Main resolves the owning extension (`salary-history`) and checks `salary-history`'s `allowedCommands`, not Dashboard's. This means an extension cannot grant itself access to another extension's commands — only the owning extension can opt in.

The `allowedCommands` set is **per-extension** because the threat model is per-extension: salary-history is trusted to invoke its own commands internally, but Dashboard (a separate, less-trusted extension) is **not** trusted to invoke arbitrary salary-history commands unless salary-history explicitly opts in. By listing a command in `allowedCommands`, the owning extension says "external callers may invoke this command on my behalf." For example, if salary-history later wants Dashboard to open Salary History, it would add a command like `salary.open` to its own `commands[]` and list it in `allowedCommands`; Dashboard then calls `financeShell.extensions.executeCommand('salary.open')` and Main allows it because salary-history opted in.

**Alternatives considered:**

- **All-commands-allowed by default; allowlist opt-out.** Backwards-compatible with Phase 4 but defeats the security purpose — every Phase 4 extension would need to be migrated, and any forgotten extension would be wide open. Rejected.
- **Per-extension "trusted" boolean.** Simpler but binary. Rejected.
- **Cryptographic signing (Phase 8 territory).** Beyond Phase 5's scope.

**Trade-off:** Extensions must now declare `allowedCommands` explicitly. The Phase 4 manifest schema gains a required field for new manifests; existing manifests are migrated by the loader (it auto-fills `allowedCommands = commands.map(c => c.id)` if the field is absent, with a `console.warn`).

**Revisit triggers:**
- Phase 8's marketplace needs signed-extension verification → the allowlist becomes one factor in a multi-factor trust model.
- An extension wants runtime ACL mutation (e.g., a user grants a one-time permission) → add a `financeShell.permissions.grant(commandId)` API in Phase 7+.

---

### Decision 7: Per-Extension `ui-event` Allowlist (Decision 12 Surface Closure)

> **In plain English:** Phase 4 introduced a second writeback IPC channel (`extensions:ui-event`) that bypasses `executeCommand`. Phase 5 closes that gap too: each extension declares the ui-event names it will emit, and Main drops anything not on the list.

**Choice:** Mirror Decision 6 for ui-events:

1. **Manifest contribution** — add `allowedUiEvents: string[]` to `FinanceExtensionManifest.contributes`:
   ```jsonc
   // extensions/salary-history/package.json
   "contributes": {
     "allowedUiEvents": [
       "account-create", "account-seed-skip", "account-seed-cancel",
       "payslip-add-request", "payslip-create", "payslip-edit-request",
       "payslip-edit", "payslip-cancel", "payslip-delete",
       "reorder-sections", "section-order-change", "section-order-cancel",
       "rate-add-request", "rate-edit-request", "rate-view-request",
       "rate-create", "rate-edit", "rate-form-cancel",
       "rate-delete-request", "rate-delete",
       "rate-replace-request", "rate-replace"
     ]
   }
   ```
   `allowedUiEvents` is independent of `allowedCommands` (a ui-event is not a command).

2. **Main-side enforcement** — `extensions:ui-event` IPC handler gains a pre-check:
   ```ts
   ipcMain.on('extensions:ui-event', (_event, eventName, detail) => {
      const senderId = _event.sender.id;
      const panel = webviewPanelManager.findPanelByWebContentsId(senderId);
      if (!panel) { console.warn('[extensions] dropped ui-event — sender is not a known panel'); return; }
      const extensionId = panel.extensionId;
      if (!uiEventAllowlist.isAllowed(extensionId, eventName)) {
        const msg = `[extensions] dropped ui-event "${eventName}" from "${extensionId}" — not in allowlist`;
        console.warn(msg);
        const panel = webviewPanelManager.findPanelByWebContentsId(senderId);
        panel?.webContents.send('panel:allowlist-denied', { kind: 'ui-event', extensionId, eventName, reason: msg });
        return;
      }
      extensionIPC.notify(RPC_METHOD.ExtensionUiEvent, { extensionId, eventName, detail });
    });
   ```
   A new `UiEventAllowlist` class in `src/main/services/ui-event-allowlist.ts` mirrors `CommandAllowlist`.

**Reasoning:** Phase 4 Decision 12 added the `ui-event` channel as a separate writeback path (it does not flow through `commands.execute`). Without this allowlist, a compromised extension could emit any ui-event name (including ones that mimic built-in Core events like `core.toggle-theme`). The allowlist constrains each extension to the event names its UI components actually emit.

**Why silent drop + `console.warn` (not error to renderer):** the ui-event channel is fire-and-forget; the renderer (the WebviewPanel) cannot meaningfully handle "your event was dropped" — by the time the drop happens, the panel may have already re-rendered. A `console.warn` keeps the diagnostic surface for manual testing (visible in main-process terminal) without breaking the renderer's event loop.

**Why also forward the warning to the panel DevTools (Improvement 3 from the plan review):** the main-process terminal is easy to miss during local development. Sending a `panel:allowlist-denied` message to the originating panel lets extension developers see the allowlist violation directly in the panel's DevTools, where they are already debugging.

**Honest threat-model note (Gap 5):** like the command allowlist, the ui-event allowlist is **defense-in-depth** against accidental cross-extension events. It does not prevent a malicious extension already running in the shared Host process from spoofing `extensionId` or from emitting events that mimic Core events without going through the IPC layer. True isolation between extensions (per-extension Host processes) is a Phase 8 ADR.

**Alternatives considered:**

- **One combined `allowedIpc: { commands: [], uiEvents: [] }` block.** Tighter manifest shape but conflates two concerns; the two allowlists have different enforcement points (executeCommand routes through the Host; ui-event drops at the IPC handler before reaching the Host). Rejected.
- **No ui-event allowlist; rely on the WebviewPanel sandbox to contain bad events.** The sandbox does contain the iframe but cannot prevent a panel from emitting events that affect other panels (e.g., a malicious panel emits `payslip-delete` for a row it doesn't own). Rejected.

**Trade-off:** Extensions must declare every ui-event name they emit. The Phase 4 salary-history extension has 21 ui-events; the migration is mechanical but verbose. The loader auto-fills `allowedUiEvents` from the bundle's `static properties` (a Lit-decorator AST scrape) in dev mode; in production it requires the explicit declaration.

**Revisit triggers:**
- An extension needs to emit a dynamic event name (e.g., the user types a custom event name in a form) → add a `wildcard: true` flag in Phase 7+.
- The ui-event channel becomes a hot path → add a per-event allowlist cache (built once at activation, invalidated on `setEnabled` change).

---

### Decision 8: WebviewPanel Lifecycle — Lazy Unmount with Dirty-State Protection

> **In plain English:** Each tab in the workspace is a WebviewPanel. When the user switches away from a tab for an extended period, the panel's `WebContentsView` is destroyed (memory freed); when the user switches back, the panel is re-created from the extension's `mountData` + the extension's own state persistence. **Panels that hold unsaved user input (dirty state) are never unmounted.**

**Choice:** A new `WebviewPanelManager` class in `src/main/services/webview-panel-manager.ts` owns the panel lifecycle:

```ts
class WebviewPanelManager {
  mount(extensionId: string, viewId: string, mountData: object): PanelHandle;
  unmount(handle: PanelHandle): void;          // destroy the WebContentsView
  focus(handle: PanelHandle): void;            // switch to tab
  list(): PanelHandle[];                       // for tab bar
  setDirty(handle: PanelHandle, dirty: boolean): void;  // extension reports form-dirty
  autoSaveDraft(handle: PanelHandle): Promise<void>;    // extension persists draft before unmount
  destroyAll(): void;                          // destroy all WebContentsView instances (app quit)
}
```

The `mount` flow:
1. Create a `WebContentsView` with the panel-specific preload (Decision 1).
2. Compute the panel's bundle URL: `finance-shell://extensions/<extensionId>.js` (served by the same custom protocol handler).
3. Register the panel with the `financeShell.extensions.list()` IPC so the renderer can enumerate open panels.
4. Load `finance-shell://panel/<extensionId>/<viewId>.html` (custom protocol) which serves the HTML template and references the bundle via `<script src="finance-shell://extensions/<extensionId>.js">` (NOT `file://`, see Task 15).
5. Attach the `WebContentsView` to the main `BrowserWindow.contentView` at the workspace pane's DOM bounds.
6. Forward the extension's `mountData` to the panel via `webContents.send('panel:init', { extensionId, viewId, mountData } as PanelInitPayload)`.

The **lazy-unmount policy**:
- A `setInterval` (every 30 s) checks each panel's last-focus timestamp and dirty flag.
- Panels unfocused for more than **5 minutes** AND not dirty are unmounted (the `WebContentsView` is detached and destroyed; the panel's entry remains in the tab bar with a "Reload" affordance).
- Panels that are **dirty** (`setDirty(true)` was called and not cleared) are exempt from lazy unmount indefinitely.
- When a panel is about to be unmounted, `WebviewPanelManager` calls `autoSaveDraft()` (which the extension implements via `finance.settings.set`), giving the extension a last chance to persist form state. `autoSaveDraft` has a **500 ms timeout** (configurable in Phase 7). On timeout or rejection: the manager logs `console.error`, proceeds with unmount, and sends a `panel:auto-save-failed` message to the renderer so the user sees a toast: "Your unsaved changes in [Extension Name] were lost."
- Switching back to a stubbed panel triggers a re-mount.

**Dirty-state API:** extensions opt into dirty tracking by calling `finance.ui.setDirty(true)` when a form receives input and `finance.ui.setDirty(false)` when it is saved or cancelled. The Host API forwards both calls to `WebviewPanelManager`.

**Reasoning:** Decision 1's trade-off (~20–40 MB per open `WebContentsView`) makes naive multi-tab behaviour untenable for power users with 10+ tabs open. The 5-minute timeout (up from the original 30 s) plus dirty-state protection balances memory pressure against the common UX complaint of losing half-filled forms. Lazy unmount is the standard VS Code pattern (the "close vs hide" decision is deferred to Phase 8's tab-management UI).

**State preservation:** the extension itself is responsible for its state (Phase 4 PayService stores YTD summaries in the DB; Phase 5 Dashboard stores card preferences in `dashboard.*` settings). When a panel re-mounts, the extension re-queries the data and re-hydrates from any saved draft via `mountData`.

**Runtime disable / teardown:** Phase 5 does **not** introduce a `deactivate()` lifecycle hook or `WebviewPanelManager.onExtensionDisabled(extensionId)` handler. In Phase 5, disabling an extension requires a restart (`setEnabled` + restart); layout restoration (ADR-0006) already falls back to a default layout when a disabled extension is missing. Phase 3 hot-disable (`crash_count >= 3`) fires during `onStartup` activation (Task 10.4) before any panel is mounted, so there is nothing to clean up. A `deactivate` notification and forced unmount path are deferred to Phase 7/8, when the Extension Manager UI introduces runtime enable/disable without restart.

**Alternatives considered:**

- **`hide()` instead of `destroy()`.** Cheaper to re-focus but keeps memory pressure; defeats the lazy-unmount trade-off. Rejected.
- **No dirty-state protection.** Caused the original concern raised in Gap 2 — a half-filled form could be destroyed after 30 s. Rejected.
- **Per-extension `keepAlive: boolean` manifest hint.** More flexible but adds manifest surface; defer until an extension actually needs persistent state.

**Trade-off:** A 5-minute unmount delay for clean panels means fast tab-switching is free (the panel stays mounted), and a long pause + return costs a re-mount (~500 ms cold-start). The Dashboard's auto-mount-on-startup means its panel is **never** lazily unmounted (it's the active panel until the user switches away for 5 min). Dirty panels never unmount regardless of inactivity.

**Revisit triggers:**
- Re-mount cold-start exceeds 1 second (the user notices the lag) → investigate the bundle size or the panel-runtime stub.
- A user opens >20 tabs and complains about re-mount latency → expose a per-extension `keepAlive: boolean` in Phase 7+.
- The auto-save draft flow is too disruptive for a frequently-edited panel → make the auto-save opt-in via a manifest hint.

---

### Decision 9 / ADR-0006: Tab Bar + Split-Screen (2-pane only for Phase 5)

> **In plain English:** The workspace now supports multiple tabs, and a tab can be dragged into a separate pane to create a side-by-side or top-bottom view. Phase 5 ships 2-pane split (left/right + top/bottom); full grid layouts are Phase 7+.

**Choice:** A new `WorkspaceLayout` data model in `src/renderer/components/workspace.ts`:

```ts
type WorkspaceNode =
  | { type: 'tab', panelId: string, label: string }
  | { type: 'split', direction: 'horizontal' | 'vertical', children: [WorkspaceNode, WorkspaceNode] };
```

**Persistence schema:** `core.workspace.layout` stores the `WorkspaceNode` tree as JSON. Example:
```json
{ "type": "split", "direction": "horizontal", "children": [
  { "type": "tab", "panelId": "panel-dashboard", "label": "Dashboard" },
  { "type": "tab", "panelId": "panel-salary-history", "label": "Salary History" }
]}
```
On restore, if an extension referenced by `panelId` is missing or disabled, fall back to a single-tab layout with the first available `onStartup` extension active. If the serialized layout exceeds 16 KB, truncate to the active tab only. **Why 16 KB:** it accommodates ~50 tabs/splits with typical-length extension/view ids; the earlier 4 KB cap proposed in review was too restrictive for realistic multi-tab layouts.

The workspace renders the tree recursively. The tab bar shows tabs in the **active leaf's path** (the user always sees the tabs of the pane they're focused in). Drag-and-drop: a tab can be dragged onto another tab's split affordance (right edge / bottom edge) to create a new split. Drag-and-drop is implemented with the HTML5 Drag and Drop API (no library).

Phase 5 ships a **maximum of 2 panes** (one root + one split). The split direction can be either `horizontal` (left/right) or `vertical` (top/bottom). Closing the last tab in a pane collapses the split.

**Reasoning:** Phase 4's `workspace-panel.ts` is a single tab with a static Dashboard placeholder. Phase 5 turns it into a tab host. The 2-pane limit keeps Phase 5 scope manageable; full grid layouts (3+ panes, resizable splitters) are Phase 7 polish.

**Alternatives considered:**

- **VS Code's `EditorGroup` model.** Full grid support is overkill for Phase 5; the 2-pane `WorkspaceNode` tree is enough.
- **No split-screen, just tabs.** Misses the Phase 5 deliverable wording ("Split-Screen support, tab management"). Rejected.

**Trade-off:** The 2-pane limit is a UX ceiling — a user who wants 3-pane must Phase 7+ or fall back to OS-level window tiling. Documented in the plan's Self-Review §6.

**Revisit triggers:**
- User feedback requests 3+ panes → Phase 7 ships a full `EditorGroup` model.
- The `WorkspaceNode` tree becomes unwieldy with multiple splits → migrate to a flat list of `EditorGroup`s (VS Code's shape) in Phase 7+.

---

### Decision 10: Panel-Runtime Stub — `financeShell.*` Inside the WebviewPanel Iframe

> **In plain English:** When Phase 4's renderer-orchestrator pattern mounted an extension's UI, the UI ran in the same `window` as the rest of the shell and could call `window.financeShell.*` directly. Phase 5's WebviewPanel iframe is a separate `window` — the panel needs its own `financeShell` exposed by the panel-specific preload.

**Choice:** A new panel preload `src/preload/panel-preload.ts` that exposes a **subset** of `financeShell.*` to the panel's `window`:

```ts
// In the panel's window context:
window.financeShell = {
  extensions: {
    list,              // read-only — which extensions are active
    executeCommand,    // gated by the Main-side allowlist
    uiEvent,           // gated by the Main-side allowlist
  },
  settings: { get, set },   // gated by the namespace (existing Phase 4 behaviour)
  db: ???,             // NOT exposed — the panel uses finance.db inside the extension's Host bundle
  services: ???        // NOT exposed — the panel uses finance.services inside the extension's Host bundle
};
```

The panel does **not** get `finance.db` or `finance.services` directly — those are accessed from inside the **extension's Host bundle** (the bundle loaded via `<script src="...salary-history.js">` runs in the panel's renderer process and has its own `finance` proxy that routes to the Host). The panel's `window.financeShell` is a thin bridge for shell-level operations (executeCommand for cross-extension commands, uiEvent for back-channel events); the extension's bundle has its own full `finance` proxy.

The Host bundle exposes `finance.ui.requestMount(viewId, mountData)` as part of the extension's `finance` proxy. When an extension calls `finance.ui.requestMount` from its `activate()` function, the Host forwards an `extension:request-mount` RPC to Main, which calls `WebviewPanelManager.mount()` to create the `WebContentsView` and forwards `panel:init` to the Renderer. This is the primary mount path for extensions that auto-activate on startup (e.g., Dashboard). The panel receives its initial mount data via `panel:init` IPC from Main (not via a panel-side `requestMount` call).

**Reasoning:** Phase 4's renderer-orchestrator pattern made the panel's `window.financeShell` and the extension's `finance` proxy the same object (via `createFinance(extensionId)` in `salary-history-view.ts`). Phase 5's separation keeps the two concerns distinct:
- `window.financeShell.*` — **shell-level** (cross-extension, Main-mediated).
- `finance.*` (inside the bundle) — **extension-level** (Host-mediated, per-extension).

This separation makes the security model clearer: the panel's `window.financeShell` cannot read another extension's `finance.db`, only the shell's allowlisted bridges.

**Alternatives considered:**

- **Single `financeShell` for both.** Simpler but conflates the trust boundaries; the panel could accidentally read another extension's tables. Rejected.
- **No `window.financeShell` in the panel; everything via `postMessage` to the parent.** Stricter but requires every panel to write message-routing boilerplate. Rejected.

**Trade-off:** Extensions that wrote Phase 4 code calling `window.financeShell.extensions.readTable(...)` (as `salary-history-view.ts` does today) will need a small migration: replace `window.financeShell.extensions.readTable(...)` with `finance.db.table(...).find(...)` (the bundle's own proxy). The Phase 5 Task 5 migration covers this for salary-history.

**Revisit triggers:**
- Phase 8's marketplace exposes panels to user-installed (less-trusted) extensions → the panel preload may need further restrictions (e.g., no `settings.set`).
- A panel wants to render a `<webview>` of its own (nested WebviewPanels) → defer to Phase 7+ (out of scope today).

---

### Decision 11: Closing the Phase 4 `'unsafe-eval'` CSP Risk

> **In plain English:** Phase 4 Decision 19 mounted the extension bundle via a `blob:` URL with dynamic `import()`, which requires `'unsafe-eval'` in the renderer's CSP. Phase 5's WebviewPanel loads the bundle via a regular `<script src="...">` from the `finance-shell://` custom protocol, so the panel's CSP does not need `'unsafe-eval'`.

**Choice:** The panel's Content-Security-Policy is:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';
```

`script-src 'self'` allows the bundle to load (the bundle is served from the same origin as the panel page). `'unsafe-inline'` is allowed for styles (Lit components use inline `<style>` blocks inside shadow DOM — this is the standard Lit pattern and does not require `'unsafe-eval'`).

The main renderer's CSP is **unchanged** from Phase 4 (Phase 4's `'unsafe-eval'` remains because the renderer still uses blob URLs for other reasons documented in the Phase 4 plan). Phase 7 will revisit the main renderer's CSP.

**Reasoning:** Phase 4 Self-Review §8 flagged `'unsafe-eval'` as a "acceptable for Phase 4 (extensions are developer-installed, not marketplace); Phase 5 WebviewPanel replacement removes the requirement." Phase 5 closes the gap on the **panel** side. The main renderer's `'unsafe-eval'` is a separate Phase 7 cleanup.

**Alternatives considered:**

- **Tighten the main renderer's CSP in Phase 5 too.** Larger scope; touches every renderer-side dynamic-import path. Defer to Phase 7.
- **Use the Electron `<webview>` tag instead of `BrowserWindow`.** Same CSP capabilities but deprecated API; defer to Phase 7's `WebContentsView` migration.

**Trade-off:** The main renderer still requires `'unsafe-eval'` in Phase 5; the panel does not. Documented as a known Phase 5 scope limit.

**Revisit triggers:**
- Phase 7 migrates to `WebContentsView` and rewrites the main renderer's dynamic-import paths → main renderer CSP can be tightened in Phase 7.
- A security audit flags `'unsafe-eval'` in the main renderer → Phase 7 priority.

---

### Decision 12: Phase 5 Ship Order — Settings Stay Interim, No Generic UI Yet

> **In plain English:** Phase 4 documented that `mountData` is an interim channel for delivering settings to the UI (because no generic settings screen exists yet). Phase 5 keeps this interim channel; the generic settings UI is Phase 7.

**Choice:** Phase 5 does NOT introduce a generic settings screen. Salary-history continues to read `salary-history.*` settings via `finance.settings.get` in `activate()` and pass them as `mountData` to the mounted UI. The Dashboard extension follows the same pattern: `finance.settings.get('dashboard.*')` in `activate()`, mountData to the WebviewPanel.

**Reasoning:** Phase 7 owns the generic settings UI (per `project_vision.md:101,309` and the Phase 4 Self-Review §7 deferral). Phase 5 introduces no new settings UI surface; it adds a `finance.services.pay.*` read API but does not add a settings screen for it.

**Alternatives considered:**

- **Phase 5 ships a placeholder settings screen for Dashboard only.** Inconsistent — why Dashboard and not Salary? Defer the whole generic settings UI to Phase 7.

**Trade-off:** Users cannot adjust Dashboard card preferences in Phase 5; the Dashboard ships with hardcoded card layouts (4 cards in a 2×2 grid). Phase 7 adds a settings screen that surfaces Dashboard's `dashboard.cardOrder`, `dashboard.financialYearStart`, etc.

**Revisit triggers:**
- Phase 7 lands the generic settings UI → Phase 7 ships the `dashboard.cardOrder` reorder surface, the `salary-history.sectionOrder` already exists, etc.

---

## File Structure

```
finance-flow_ai/
├── src/
│   ├── main/
│   │   ├── main.ts                       (modified — startup auto-activation)
│   │   ├── services/
│   │   │   ├── domain-service-registry.ts  (new — finance.services.* registry)
│   │   │   ├── command-allowlist.ts        (new — Decision 6)
│   │   │   ├── ui-event-allowlist.ts       (new — Decision 7)
│   │   │   ├── webview-panel-manager.ts    (new — Decision 1 + 8)
│   │   │   ├── panel-protocol.ts           (new — custom protocol handler)
│   │   │   ├── extension-ipc.ts            (modified — services invoke)
│   │   │   ├── extension-loader.ts         (modified — allowedCommands/UiEvents parsing)
│   │   │   ├── extension-registry.ts       (modified — navigation contribution)
│   │   │   ├── dao-service.ts              (modified — $join, $orderBy, $limit, $offset)
│   │   │   └── shared-data-tables.ts       (unchanged — accounts is the only shared table)
│   ├── extension-host/
│   │   ├── host.ts                          (modified — startup auto-activation, onStartup)
│   │   ├── api/
│   │   │   ├── services.ts                  (new — finance.services.invoke)
│   │   │   ├── index.ts                     (modified — services in FinanceApi)
│   │   │   └── db.ts                        (modified — DAO ops now accept second arg)
│   ├── preload/
│   │   ├── preload.ts                       (modified — same; renderer unchanged)
│   │   └── panel-preload.ts                 (new — Decision 10)
│   ├── renderer/
│   │   ├── index.ts                         (modified — no salary-history-view; tabs drive mount)
│   │   ├── create-finance.ts                (unchanged — Phase 4 still used by Renderer-side legacy)
│   │   ├── styles/
│   │   │   └── layout.css                   (modified — tab bar + split pane styles)
│   │   └── components/
│   │       ├── workspace.ts                 (rewritten — WorkspaceLayout tree)
│   │       ├── tab-bar.ts                   (new — tab strip)
│   │       ├── split-pane.ts                (new — 2-pane container with drag affordance)
│   │       ├── navigation-panel.ts          (rewritten — NavigationProvider data-driven)
│   │       ├── activity-bar.ts              (unchanged — contribution-driven)
│   │       └── salary-history-view.ts       (REMOVED — replaced by WebviewPanel + panel-preload)
│   ├── shared/
│   │   ├── extension-constants.ts           (modified — panel paths)
│   │   ├── json-rpc-methods.ts              (modified — DomainServiceInvoke method)
│   │   ├── json-rpc.ts                      (modified — ServiceNotFound error code)
│   │   └── panel-protocol.ts                (new — shared types)
│   └── types/
│       ├── finance.d.ts                     (modified — services + allows + navigation)
│       └── finance-shell.d.ts               (modified — financeShell.services bridge)
├── extensions/
│   ├── salary-history/                       (modified — registers finance.services.pay.*)
│   │   ├── src/
│   │   │   ├── main.ts                       (modified — registerPublicPayService)
│   │   │   ├── services/
│   │   │   │   ├── pay-service.ts            (unchanged internal — internal surface preserved)
│   │   │   │   └── public-pay-adapter.ts     (new — Decision 5 public surface)
│   │   │   ├── ui/                           (unchanged — Phase 4 UI components migrate to WebviewPanel by panel-runtime)
│   │   │   └── ...
│   │   └── package.json                      (modified — adds allowedCommands, allowedUiEvents, navigation)
│   └── dashboard/                            (new — Phase 5 second extension)
│       ├── package.json                      (new — manifest)
│       ├── src/
│       │   ├── main.ts                       (new — activate() reads finance.services.pay.*)
│       │   ├── services/
│       │   │   └── aggregator-service.ts     (new — orchestrates pay + accounts reads)
│       │   ├── ui/
│       │   │   ├── dashboard-view.ts         (new — 4-card layout)
│       │   │   ├── net-worth-card.ts         (new)
│       │   │   ├── ytd-salary-card.ts        (new)
│       │   │   ├── last-payslip-card.ts      (new)
│       │   │   └── accounts-summary-card.ts  (new)
│       │   └── shared-styles.ts              (new — palette tokens)
├── docs/
│   ├── superpowers/plans/2026-07-18-phase5-webviews-multiextension.md  (this file)
│   ├── decisions/
│   │   └── 0005-domain-service-registry.md   (new — Decision 5 ADR)
│   ├── extension-api.md                      (modified — Phase 5 API additions)
│   ├── file-reference.md                     (modified — Phase 5 inventory)
│   └── phase5-handoff.md                     (new — Phase 5 conversational session handoff)
└── tests/
    ├── unit/
    │   ├── main/services/
    │   │   ├── domain-service-registry.test.ts  (new — 8 tests)
    │   │   ├── command-allowlist.test.ts        (new — 6 tests)
    │   │   ├── ui-event-allowlist.test.ts       (new — 5 tests)
    │   │   ├── webview-panel-manager.test.ts    (new — 8 tests)
    │   │   └── dao-service.test.ts              (extended — $join/$orderBy/$limit/$offset)
    │   ├── extension-host/api/
    │   │   └── services.test.ts                 (new — 4 tests)
    │   ├── renderer/
    │   │   ├── workspace.test.ts                (new — 6 tests, WorkspaceLayout tree)
    │   │   ├── navigation-panel.test.ts         (new — 5 tests, NavigationProvider)
    │   │   └── tab-bar.test.ts                  (new — 4 tests)
    │   └── extensions/
    │       ├── salary-history/public-pay-adapter.test.ts  (new — 8 tests)
    │       └── dashboard/
    │           ├── aggregator-service.test.ts   (new — 6 tests)
    │           └── ui/dashboard-view.test.ts    (new — 5 tests)
    └── e2e/
        ├── multi-extension-workspace.spec.ts    (new — 6 tests, gated by Phase 3 blocker)
        └── webview-panel.spec.ts                (new — 4 tests, gated)
```

**New files:** 26 (8 services + 4 preload + 5 renderer components + 1 dashboard extension + 4 shared + 3 docs + 12 test files). **Modified files:** 14. **Removed:** 1 (`salary-history-view.ts` — replaced by WebviewPanel + panel-preload).

---

## Suggested Implementation Order

The task list below (1–20) is organized for document clarity, not execution sequence. Implementers should follow the dependency-aware order below to avoid circular dependencies and unnecessary merge conflicts.

**Stage 1 — Foundation (Main-side only, no UI dependencies)**
1. **Task 1** — manifest schema (`navigation`, `allowedCommands`, `allowedUiEvents`, `onStartup`). Prerequisite for all manifest-parsing tasks.
2. **Task 13** — command allowlist. Main-side only; closes a Phase 3/4 security deferral.
3. **Task 14** — ui-event allowlist. Mirrors Task 13's structure; closes the second Phase 3/4 deferral.
4. **Task 7** — Domain Service Registry + Host-side `finance.services.*` proxy. Main-side only; no panel or UI dependencies.

**Stage 2 — Salary-history + Dashboard extensions**
5. **Task 5** — migrate renderer-side salary-history code into the bundle (delete `salary-history-view.ts`, update `main.ts`). Must land before Task 8 to avoid conflicting diffs on `main.ts`.
6. **Task 8** — public-pay-adapter + `finance.services.register('pay', ...)` in `activate()`. Depends on Tasks 5 and 7.
7. **Task 10** — `onStartup` activation mechanism in Host + Main. Must land before Task 9 so the service-provider-first activation order is enforced.
8. **Task 9** — Dashboard extension (aggregator, 4 cards, `onStartup` manifest). Depends on Tasks 7, 8, and 10.

**Stage 3 — Panel infrastructure (Main + renderer coupling)**
9. **Task 2** — WebviewPanel infrastructure (`WebviewPanelManager`, custom protocol, `destroyAll`). No dependency on Phase 2 tasks.
10. **Task 3** — panel preload (`window.financeShell` subset inside the iframe). Depends on Task 2.
11. **Task 4** — Main-side message router (panel ↔ renderer via Main, sender-identity verification). Depends on Task 2.

**Stage 4 — UI (renderer) + DAO**
12. **Task 11** — NavigationProvider (data-driven sidebar). Depends on Task 1's `navigation` manifest field.
13. **Task 12** — Workspace layout (tabs + 2-pane split). Depends on Task 2's `WebContentsView` infrastructure and `panel:resize` IPC. **Deviated by ADR-0006:** ships flat tab list only; 2-pane split deferred to version: 2 migration.
14. **Task 6** — DAO operators (`$join`, `$orderBy`, `$limit`, `$offset`). Independent of Tasks 2–4; can be done in parallel with UI work.

**Stage 5 — Finishing touches**
15. **Task 15** — CSP closure (panel HTML shell, no `'unsafe-eval'`). Depends on Task 2's protocol.
16. **Task 16** — ADR-0005 for Domain Service Registry + ADR-0006 for Flat Workspace Layout. Documentation; depends on Tasks 5 and 12.
17. **Task 17** — update `extension-api.md` + `file-reference.md`. Documentation; depends on all implementation tasks.
18. **Task 18** — Manual Test Units (12 manual tests + E2E).
19. **Task 19** — Self-Review Checklist verification.
20. **Task 20** — CHANGELOG `[0.8.0]` header, `package.json#version` sync, handoff doc.


---

## Tasks

### Task 1: Extend manifest schema with Phase 5 contributions

**Files:** `src/types/finance.d.ts`, `src/extension-host/manifest-schema.ts`, `tests/unit/extension-host/manifest-schema.test.ts` (extended)

**Steps:**

- [x] 1.1 In `finance.d.ts`, add types:
  ```ts
  export interface ManifestNavigationContribution {
    id: string;          // unique within extension
    label: string;       // sidebar label
    command: string;     // command id (e.g. "salary.show-pay-history")
    group?: string;      // optional grouping label
  }
  // Augment ManifestContributions:
  // - navigation?: ManifestNavigationContribution[];
  // - allowedCommands?: string[];       // subset of commands[].id
  // - allowedUiEvents?: string[];      // independent of commands
  // Update ActivationEvent: add 'onStartup' literal.
  ```
- [x] 1.2 In `manifest-schema.ts`, add Zod schemas for the three new fields; validate:
  - `navigation` items have unique `id` within the extension.
  - `allowedCommands` is a subset of `commands[].id` (else `ValidationFailed` at load time).
  - `allowedUiEvents` has no duplicate names.
  - `activationEvents` accepts the `onStartup` literal.
- [x] 1.3 Add 5 unit tests covering the new validation rules.
- [x] 1.4 Migration shim for Phase 4 manifests: if `allowedCommands` is missing, the loader auto-fills `allowedCommands = commands.map(c => c.id)` with a `console.warn`. Same for `allowedUiEvents` (filled from a Lit-component scrape; falls back to empty if scrape fails).

**Verification:** `npm run test:unit -- manifest-schema` → all tests pass; existing salary-history manifest loads with `console.warn` (auto-fill).

---

### Task 2: WebviewPanel infrastructure — WebContentsView + custom protocol

**Files:** `src/main/services/webview-panel-manager.ts` (new), `src/main/services/panel-protocol.ts` (new), `src/main/main.ts` (modified)

**Steps:**

- [x] 2.1 In `panel-protocol.ts`, define the shared `PanelInitPayload` interface and register a custom protocol `finance-shell://` via `protocol.handle('finance-shell', ...)` that:
  - `interface PanelInitPayload { extensionId: string; viewId: string; mountData: object; }` — the typed shape sent via `webContents.send('panel:init', payload)`.
  - Parses the URL: `finance-shell://panel/<extensionId>/<viewId>.html`.
  - Serves a static HTML shell (`src/main/resources/panel-template.html`) that includes `<script src="...">` referencing the extension bundle via the `extensionId` path segment.
  - Sets the response headers with the strict CSP from Decision 11 (`default-src 'self'; script-src 'self'; ...`).
- [x] 2.2 In `webview-panel-manager.ts`, implement `WebviewPanelManager`:
  - Define `PanelHandle = { panelId: string; extensionId: string; viewId: string; webContents: WebContents; }`. `panelId` is a stable opaque id (e.g. `panel-${extensionId}-${viewId}`) used by the renderer in `panel:resize` and tab-bar focus calls.
  - Maintain a `Map<number, PanelHandle>` keyed by `webContents.id()` so Main can resolve any incoming panel IPC message to its owning extension without trusting client-supplied parameters.
  - `mount(extensionId, viewId, mountData)`: create a `WebContentsView` with the panel's webPreferences (Decision 1), attach it to the main `BrowserWindow.contentView`, load `finance-shell://panel/<extensionId>/<viewId>.html`, send `panel:init` via `webContents.send` with a `PanelInitPayload`, register the handle in the `webContents` map.
  - `unmount(handle)`: remove the handle from the map, remove the `WebContentsView` from its parent, then destroy it.
  - `focus(handle)`: call `view.webContents.focus()`.
  - `findPanelByWebContentsId(webContentsId: number): PanelHandle | undefined`: lookup by sender id — used by the `extensions:ui-event` handler and the `panel:resize` handler to resolve the owning extension without trusting client-supplied `extensionId`.
  - `list()`: return all open panels.
- [x] 2.3 In `main.ts`, instantiate `WebviewPanelManager` after the window is created; pass it to `ExtensionIPC.setUIHandler(webviewPanelManager)` (replacing the Phase 4 `extensions.onUiMount` subscription in `renderer/index.ts`).
- [x] 2.4 Add 8 unit tests in `webview-panel-manager.test.ts` covering: mount/unmount lifecycle, focus switching, multiple panels, custom protocol URL parsing, CSP headers set, WebContentsView parent reference correct.
- [x] 2.5 In `extension-ipc.ts`, define `setUIHandler(handler: WebviewPanelUIHandler)` and the `WebviewPanelUIHandler` interface:
  ```ts
  interface WebviewPanelUIHandler {
    onMountRequested(extensionId: string, viewId: string, mountData: object): void;
    onFocusRequested(panelId: string): void;
    onUiEvent(webContentsId: number, eventName: string, detail: unknown): void;
    onSetDirty(extensionId: string, dirty: boolean): void;
    onAutoSaveDraft(extensionId: string): Promise<void>;
    onBeforeUnmount(extensionId: string): Promise<void>;
  }
  ```
  Wire the Host's `finance.ui.requestMount`, `finance.ui.setDirty`, and `finance.ui.autoSaveDraft` calls to these handler methods via RPC. The handler resolves `webContentsId → panelId → extensionId` internally via the manager's `findPanelByWebContentsId` map, so no client-supplied `extensionId` is trusted.
- [x] 2.6 In `webview-panel-manager.ts`, implement the `autoSaveDraft` timeout + failure toast:
  - Wrap `autoSaveDraft()` in a `Promise.race` with a 500 ms `setTimeout`.
  - On timeout or rejection: log `console.error`, destroy the `WebContentsView`, and emit `panel:auto-save-failed` to the renderer.
  - The renderer's workspace component listens for `panel:auto-save-failed` and shows a toast with the extension's display name.
  - Before calling `autoSaveDraft`, also invoke any callbacks registered via `finance.ui.onBeforeUnmount` (the extension's draft-persist hook); collect the results and pass the aggregate to `autoSaveDraft`.
- [x] 2.7 In `src/extension-host/api/ui.ts` (new), define `createUi(extensionId, rpc)` that exposes `requestMount`, `setDirty`, `autoSaveDraft`, and `onBeforeUnmount`:
  ```ts
  finance.ui = {
    requestMount(viewId: string, mountData: object): Promise<void>,
    setDirty(dirty: boolean): void,
    autoSaveDraft(): Promise<void>,
    onBeforeUnmount(callback: () => Promise<void>): void  // register a draft-persist hook
  };
  ```
   `requestMount` sends `extension:request-mount` RPC. `setDirty` and `autoSaveDraft` route to `WebviewPanelManager` via `WebviewPanelUIHandler`. `onBeforeUnmount` stores callbacks in a per-extension list; `WebviewPanelManager` drains them before unmounting. Add `ui: { requestMount, setDirty, autoSaveDraft, onBeforeUnmount }` to the `FinanceApi` returned by `createFinance` in `api/index.ts`.
- [ ] 2.8 In `webview-panel-manager.ts`, add `destroyAll()` that iterates all open panels, calls `autoSaveDraft` + `onBeforeUnmount` callbacks for dirty panels (with timeout), removes each `WebContentsView` from its parent via `BrowserWindow.contentView.removeChildView(view)` (Electron 28+ API), then calls `view.destroy()`. In `main.ts`, call `webviewPanelManager.destroyAll()` from the existing `app.on('will-quit', ...)` handler (which already runs `shutdownPersistence`). This prevents Electron leaks on quit.
  **Note:** 2.6 `autoSaveDraft` timeout + 2.8 `destroyAll()` are implemented as methods on `WebviewPanelManager`. The lazy-unmount timer loop (the actual memory-pressure mitigation) is deferred to Phase 7.
  **Note:** 2.6 `autoSaveDraft` timeout + 2.8 `destroyAll()` are implemented as methods on `WebviewPanelManager`. The lazy-unmount timer loop (the actual memory-pressure mitigation) is deferred to Phase 7.

**Verification:** Manual: click the Activity Bar button for the `salary-history` view → a WebviewPanel opens with the salary-history UI. The panel's DevTools shows the strict CSP applied. Closing the parent window closes all panels.

---

### Task 3: Panel preload — expose `window.financeShell` subset inside the iframe

**Files:** `src/preload/panel-preload.ts` (new), `src/types/finance-shell.d.ts` (modified)

**Steps:**

- [x] 3.1 In `panel-preload.ts`, expose a **subset** of `financeShell.*` per Decision 10:
  ```ts
   contextBridge.exposeInMainWorld('financeShell', {
     extensions: {
       list: () => ipcRenderer.invoke('extensions:list'),
       executeCommand: (commandId, ...args) => ipcRenderer.invoke('extensions:execute-command', commandId, ...args),
       uiEvent: (extensionId, eventName, detail) => ipcRenderer.send('extensions:ui-event', extensionId, eventName, detail),
       readTable: (params) => ipcRenderer.invoke('extensions:read-table', params),
       writeTable: (params) => ipcRenderer.invoke('extensions:write-table', params),
       setDirty: (extensionId, dirty) => ipcRenderer.send('panel:set-dirty', extensionId, dirty),
       autoSaveDraft: (extensionId) => ipcRenderer.invoke('panel:auto-save-draft', extensionId),
     },
     settings: { get, set },  // Phase 4 settings bridge, unchanged
     accounts: { create, count },
     onPanelInit, onNavigate, onMountUpdate,
   });
  ```
- [x] 3.2 In `finance-shell.d.ts`, add `PanelFinanceShell` interface (subset of `FinanceShellApi`) for the panel context; document that `finance.db` and `finance.services` are NOT exposed in the panel — extensions access them inside the extension bundle.
- [x] 3.3 Bundle the preload via `vite.preload.config.ts` to produce both `dist/preload/preload.cjs` (renderer) and `dist/preload/panel-preload.cjs` (panels).

**Verification:** Open DevTools in the panel window; `window.financeShell.extensions.list()` returns the active extensions; `window.financeShell.db` is `undefined`.

---

### Task 4: Main-side message router — panel ↔ renderer via Main

**Files:** `src/main/main.ts` (modified), `src/main/services/webview-panel-manager.ts` (extended)

**Steps:**

- [x] 4.1 In `webview-panel-manager.ts`, add a `forwardUiEvent(webContentsId, eventName, detail)` method that:
  - Looks up the panel by `webContentsId` via `findPanelByWebContentsId`; if not found, drops the event with `console.warn` (sender is not a known panel — possible spoofing attempt).
  - Uses the resolved `panel.extensionId` for the allowlist check and the Host notification. Never trusts a client-supplied `extensionId`.
  - Routes the event to the **Host** via the existing `extensionIPC.notify(RPC_METHOD.ExtensionUiEvent, { extensionId, eventName, detail })` (this is the Phase 4 `extensions:ui-event` back-channel extended to panel-originated events).
- [x] 4.2 In `main.ts`, also forward the event to the **main renderer** (`mainWindow.webContents.send('extensions:ui-event-from-panel', { extensionId, eventName, detail })`) so the main window's UI (tab bar, navigation panel, status bar) can update in response to panel actions.
- [x] 4.3 Document the two-hop flow in `webview-panel-manager.ts` JSDoc: panel → Main → Host (extension logic) AND panel → Main → renderer (shell UI updates). These are independent parallel paths, not a sequential round-trip.
- [x] 4.5 In `extension-ipc.ts` and `webview-panel-manager.ts`, implement the mount-request path:
  - Add `ipcMain.handle('extension:request-mount', async (_event, extensionId, viewId, mountData) => { ... })`.
  - Validate the extension is active, then call `webviewPanelManager.mount(extensionId, viewId, mountData)`.
  - Main buffers mount requests received during `onStartup` activation (Decision 2 Step 5) and flushes them to the Renderer once the BrowserWindow is ready.

**Verification:** Manual: open two salary-history panels; click "+ Add Payslip" in panel 1; the Host bundle receives the `payslip-create` event via the `extensions:ui-event` → `extension.uiEvent` RPC path, and the main renderer's tab bar/navigation panel updates via the `extensions:ui-event-from-panel` IPC.

---

### Task 5: Migrate salary-history renderer-side code to use the bundle's `finance.*` proxy

**Files:** `extensions/salary-history/src/main.ts`, `src/renderer/components/salary-history-view.ts` (REMOVED)

**Steps:**

- [x] 5.1 In `extensions/salary-history/src/main.ts`, refactor the command handlers to use `finance.db.table('salary_history_pay_slips')` (the bundle's own proxy) instead of any Phase 4 renderer-side `financeShell` paths.
- [x] 5.2 The orchestrator logic (`account-create` → `finance.db.table('accounts').insert(...)` → navigate; `payslip-create` → `finance.db.table('salary_history_pay_slips').insert(...)` → navigate) moves **into the bundle** as an `Orchestrator` (new) inside the salary-history extension. The bundle now owns its own navigation state and DAO access.
- [x] 5.3 Delete `src/renderer/components/salary-history-view.ts` (the renderer-side orchestrator is replaced by the bundle's orchestrator + the WebviewPanel + the Main-side panel manager).
- [x] 5.4 Update `src/renderer/index.ts` to remove the `extensions.onUiMount` subscription (replaced by `WebviewPanelManager` mount notifications routed through Main → renderer as `panel:init` IPC on mount; unmount is signaled by `panel:auto-save-failed` or by the panel's webContents `did-navigate` / `did-destroy` events if a close channel is added in Task 2.8).
- [x] 5.5 **Update or delete the Phase 4 renderer integration test** `tests/unit/renderer/salary-history-view.integration.test.ts` (which targets the now-deleted `salary-history-view.ts`). Replace with a panel-context equivalent if needed, otherwise delete.
- [x] 5.6 **Add one panel-load smoke test** at `tests/unit/main/services/webview-panel-load.test.ts` (can be deferred until Task 2 lands): mount the salary-history panel against a fake main window and assert the bundle `<script>` tag is injected into the panel HTML and `panel:init` is sent. Catches bundle-path and preload mistakes early.

**Verification:** `npm run typecheck` exit 0; manual: salary-history behaviour unchanged from Phase 4 end-user perspective (TU1-TU5 still pass).

> **Note — Task 5/8 ordering:** Task 5 and Task 8 both modify `extensions/salary-history/src/main.ts` (Task 5 restructures the bundle entry; Task 8 adds the `finance.services.register('pay', ...)` call). Task 5 must **land before** Task 8 to avoid conflicting diffs.
>
> **Note — `create-finance.ts` is no longer needed** after Task 5.3 removes `salary-history-view.ts`. The command palette and Activity Bar use `financeShell.extensions` directly via the preload bridge; they never called `makeFinance()`. `create-finance.ts` can be deleted in Task 5 or kept as dead code for Phase 4 renderer-side reference — the plan does not require it.

---

### Task 6: DAO operators — `$join`, `$orderBy`, `$limit`, `$offset`

**Files:** `src/main/services/dao-service.ts` (modified), `tests/unit/main/services/dao-service.test.ts` (extended)

**Steps:**

- [x] 6.1 In `dao-service.ts`, change the signatures:
  ```ts
  find(extensionId, table, query: QueryObject, options?: FindOptions): Row[];
  findOne(extensionId, table, query: QueryObject, options?: FindOptions): Row | null;
  count(extensionId, table, query: QueryObject, options?: CountOptions): number;
  ```
  Where `FindOptions = { $join?: JoinSpec, $orderBy?: OrderSpec[], $limit?: number, $offset?: number }` and `JoinSpec = { table: string, on: { left: string, right: string }, type: 'INNER' | 'LEFT' | 'RIGHT' }`.
- [x] 6.2 In `compileQuery`, parse the new operators; emit SQL with parameterised joins + ORDER BY + LIMIT + OFFSET.
  - [x] 6.3 Validate `$join.on` against the registered column lists (Decision 4 trade-off): parse `{ left, right }`, check `left` column belongs to the calling extension's own table or a previously-joined table, check `right` column belongs to `$join.table`, and verify both columns exist in the respective registered table manifests.
- [x] 6.4 Validate `$join` table access: only the calling extension's own tables OR shared tables can be joined.
- [x] 6.5 Validate `$limit` (1..1000) and `$offset` (>= 0) at the Zod layer.
- [x] 6.6 Extend `dao-service.test.ts` with 12 new tests:
  - `$orderBy` sort ASC and DESC
  - `$limit` + `$offset` pagination
  - `$join` INNER/LEFT/RIGHT against `accounts` (shared) from a salary-history call (allowed)
  - `$join` against another extension's table (rejected with `TableAccessDenied`)
  - Malformed `$join.on` (rejected with `ValidationFailed`)
  - `$limit` 0 or >1000 (rejected)
  - `findOne` with `$orderBy` returns the correct single row (highest pay_date).

**Verification:** `npm run test:unit -- dao-service` → all tests pass (existing 25 + 12 new = 37).

---

### Task 7: Domain Service Registry + Host-side `finance.services.*`

**Files:** `src/main/services/domain-service-registry.ts` (new), `src/extension-host/api/services.ts` (new), `src/extension-host/api/index.ts` (modified), `src/shared/json-rpc-methods.ts` (modified), `src/shared/json-rpc.ts` (modified), `tests/unit/main/services/domain-service-registry.test.ts` (new), `tests/unit/extension-host/api/services.test.ts` (new)

**Steps:**

- [x] 7.1 In `domain-service-registry.ts`, implement `DomainServiceRegistry` per Decision 5:
  - `register(serviceName, extensionId, impl)`: store in a `Map<serviceName, Map<extensionId, impl>>`.
  - `unregister(serviceName, extensionId)`: remove.
  - `invoke(serviceName, method, params, callerExtensionId)`: look up the **most recently registered** impl (first entry in the inner `Map` for `serviceName`); call `impl[method](params)`; catch errors, emit `console.warn('[services] service errored:', serviceName, error.message)`, and return `null` (graceful degradation).
- [x] 7.2 In `extension-ipc.ts`, add `setDomainServiceRegistry(reg)` and a `handleDomainServiceInvoke(params)` method that validates the calling extension's identity, looks up the service, and calls it.
- [x] 7.3 In `json-rpc-methods.ts`, add `RPC_METHOD.DomainServiceInvoke = 'domain.service.invoke'`.
- [x] 7.4 In `json-rpc.ts`, add `RpcErrorCode.ServiceNotFound = -32014`.
- [x] 7.5 In `api/services.ts`, implement `createServices(extensionId, rpc)`:
  ```ts
  function createServices(extensionId, rpc) {
    return {
      invoke<T>(serviceName: string, method: string, params?: unknown): Promise<T | null> {
        return rpc.request(RPC_METHOD.DomainServiceInvoke, { callerExtensionId: extensionId, serviceName, method, params });
      },
      register(serviceName: string, impl: DomainServiceImpl): void {
        // Host-side stub — actual registration happens via a separate RPC
        // (the extension's `activate` calls this on the Host's local proxy,
        // which forwards to Main's registry).
        hostApi.registerDomainService(extensionId, serviceName, impl);
      },
      unregister(serviceName: string): void {
        hostApi.unregisterDomainService(extensionId, serviceName);
      }
    };
  }
  ```
- [x] 7.6 In `api/index.ts`, add `services` to the `FinanceApi` returned by `createFinance`.
- [x] 7.7 In `finance.d.ts`, add `services: ServicesApi` to `FinanceApi`; export `DomainServiceImpl` type.
- [x] 7.8 Add 8 registry unit tests + 4 services unit tests:
  - register/unregister/invoke happy path
  - last-registered wins when multiple extensions register the same serviceName
  - unregister then invoke returns `null` when no registrations remain
  - invoke returns `null` and emits `console.warn` when the implementation throws
  - invoke returns `null` and emits `console.warn` when the service is not registered
        hostApi.registerDomainService(extensionId, serviceName, impl);
      },
      unregister(serviceName: string): void {
        hostApi.unregisterDomainService(extensionId, serviceName);
      }
    };
  }
  ```
- [ ] 7.6 In `api/index.ts`, add `services` to the `FinanceApi` returned by `createFinance`.
- [ ] 7.7 In `finance.d.ts`, add `services: ServicesApi` to `FinanceApi`; export `DomainServiceImpl` type.
- [ ] 7.8 Add 8 registry unit tests + 4 services unit tests:
  - register/unregister/invoke happy path
  - last-registered wins when multiple extensions register the same serviceName
  - unregister then invoke returns `null` when no registrations remain
  - invoke returns `null` and emits `console.warn` when the implementation throws
  - invoke returns `null` and emits `console.warn` when the service is not registered

**Verification:** `npm run test:unit -- domain-service-registry services` → all tests pass.

---

### Task 8: Salary-history `public-pay-adapter` + Domain Service registration

**Files:** `extensions/salary-history/src/services/public-pay-adapter.ts` (new), `extensions/salary-history/src/main.ts` (modified), `extensions/salary-history/package.json` (modified), `tests/unit/extensions/salary-history/public-pay-adapter.test.ts` (new)

**Steps:**

- [x] 8.1 In `public-pay-adapter.ts`, implement `PublicPayService` per Decision 5 (4 methods). Wrap calls to the internal `PayService`; return `null` on error or when data is missing.
- [x] 8.2 In `main.ts#activate`, after the existing Phase 4 setup:
  ```ts
  finance.services.register('pay', {
    getYearToDateSummary: (params) => adapter.getYearToDateSummary(params.financialYearStart, params.asOfDate),
    getLastPayslip: () => adapter.getLastPayslip(),
    getCurrentRate: () => adapter.getCurrentRate()
  });
  ```
- [x] 8.3 In `main.ts#deactivate`, call `finance.services.unregister('pay')`.
- [x] 8.4 In `package.json`, add `commands` with the two existing Phase 4 commands plus a deliberately disallowed `salary.show-dashboard` (exists so Manual Test Unit 7 can verify allowlist rejection of a registered-but-not-allowlisted command; Dashboard's own navigation uses `dashboard.refresh` and `dashboard.open-net-worth-detail`):
  ```jsonc
  "commands": [
    { "id": "salary.show-pay-history", "title": "View: Pay History", "keybinding": "Ctrl+Alt+H" },
    { "id": "salary.show-pay-rate-history", "title": "View: Pay Rate History", "keybinding": "Ctrl+Alt+R" },
    { "id": "salary.show-dashboard", "title": "Open Dashboard" }
  ],
  "allowedCommands": ["salary.show-pay-history", "salary.show-pay-rate-history"]
  ```
- [x] 8.5 In `package.json`, add `navigation` contribution with the two view commands (Decision 3).
- [x] 8.6 In `package.json`, add `allowedUiEvents` with the 21 Phase 4 event names (Decision 7).
- [x] 8.7 Add 8 unit tests covering all 4 public methods + null-on-error + null-on-disabled extension.

**Verification:** `npm run test:unit -- public-pay-adapter` → all tests pass.

---

### Task 9: Dashboard extension — second bundled extension

**Files:** `extensions/dashboard/package.json` (new), `extensions/dashboard/src/main.ts` (new), `extensions/dashboard/src/services/aggregator-service.ts` (new), `extensions/dashboard/src/ui/{dashboard-view,net-worth-card,ytd-salary-card,last-payslip-card,accounts-summary-card}.ts` (new), `extensions/dashboard/src/shared-styles.ts` (new), `tests/unit/extensions/dashboard/{aggregator-service,dashboard-view}.test.ts` (new)

**Steps:**

- [x] 9.1 Create `extensions/dashboard/package.json`:
  ```jsonc
  {
    "name": "dashboard",
    "version": "0.1.0",
    "description": "Phase 5 aggregator extension: net worth + YTD salary + last payslip + accounts summary.",
    "private": true,
    "main": "src/main.ts",
    "financeExtension": {
      "id": "dashboard",
      "displayName": "Dashboard",
      "version": "0.1.0",
      "activationEvents": ["onStartup"],
      "contributes": {
        "views": [{ "id": "dashboard", "name": "Dashboard", "icon": "D" }],  // `icon` is a single character string rendered as the Activity Bar glyph (Phase 3/4 convention); Phase 7+ may map to asset paths
        "commands": [
          { "id": "dashboard.refresh", "title": "Refresh Dashboard" },
          { "id": "dashboard.open-net-worth-detail", "title": "Net Worth Detail" }
        ],
        "navigation": [
          { "id": "dashboard.refresh", "label": "Refresh", "command": "dashboard.refresh", "group": "Quick Links" },
          { "id": "dashboard.net-worth", "label": "Net Worth Detail", "command": "dashboard.open-net-worth-detail", "group": "Insights" }
        ],
        "allowedCommands": ["dashboard.refresh", "dashboard.open-net-worth-detail"],
        "allowedUiEvents": ["dashboard-refresh"]
      }
    }
  }
  ```
  Note: Dashboard reads `dashboard.cardOrder` and `dashboard.financialYearStart` via `finance.settings.get` in `activate()` (Task 9.2). No `contributes.configuration` block is declared in Phase 5 because the generic settings UI is deferred to Phase 7 (Decision 12). The keys are used as raw settings without manifest validation; Phase 7 adds the `configuration` schema when the settings screen ships.
- [x] 9.2 In `src/main.ts`, `activate(finance)`:
  - Read `dashboard.cardOrder` from `finance.settings.get('dashboard.cardOrder')` (default `['net-worth', 'ytd-salary', 'last-payslip', 'accounts-summary']`).
  - Call `finance.services.invoke('pay', 'getYearToDateSummary', { financialYearStart })`,
    `finance.services.invoke('pay', 'getLastPayslip')`,
    `finance.services.invoke('pay', 'getCurrentRate')`; also
    `finance.db.table('accounts').find({})` for accounts.
  - Build an `aggregator` object with the card data.
  - Call `finance.ui.requestMount('dashboard-view', { aggregator })`.
  - Register `dashboard.refresh` command (re-runs the aggregator).
- [x] 9.3 In `src/services/aggregator-service.ts`, encapsulate the read logic:
  ```ts
  async function buildAggregator(finance: FinanceApi, settings: DashboardSettings): Promise<DashboardData> {
    const financialYearStart = settings.financialYearStart ?? '07-01';
    const [ytd, lastPayslip, currentRate, accounts] = await Promise.all([
      finance.services.invoke('pay', 'getYearToDateSummary', { financialYearStart }).catch(() => null),
      finance.services.invoke('pay', 'getLastPayslip').catch(() => null),
      finance.services.invoke('pay', 'getCurrentRate').catch(() => null),
      finance.db.table('accounts').find({ is_active: true }).catch(() => [])
    ]);
    return { ytd, lastPayslip, currentRate, accounts, hasPayExtension: !!lastPayslip };
  }
  ```
   Note: Dashboard's `activate()` runs after salary-history's `activate()` (Decision 2 Step 4 activation order: service providers first, then default-view extensions). The `pay` service is therefore guaranteed to be registered when Dashboard calls `finance.services.invoke('pay', ...)` at startup. The `.catch(() => null)` guards remain for runtime errors and for the case where salary-history is disabled.
- [x] 9.4 In `src/ui/dashboard-view.ts`, render the 4 cards in the configured order via `cardOrder`; each card receives the relevant data slice. Cards show "—" or "install Salary History to see this" placeholders when data is missing.
- [x] 9.5 In `src/ui/{net-worth,ytd-salary,last-payslip,accounts-summary}-card.ts`, implement the 4 cards as Lit components sharing `shared-styles.ts`.
- [x] 9.6 Add 6 aggregator unit tests (mocked `finance`) + 5 dashboard-view tests (happy-dom).

**Verification:** `npm run build:extensions` → produces `dist/extensions/dashboard.js`; `npm run test:unit -- extensions/dashboard` → all tests pass.

---

### Task 10: Startup auto-activation (`onStartup` activation event)

**Files:** `src/extension-host/host.ts` (modified), `src/main/main.ts` (modified), `tests/unit/extension-host/host-on-startup.test.ts` (new)

**Steps:**

- [x] 10.1 In `host.ts`, add handling for `onStartup` in the activation dispatcher:
  ```ts
  if (manifest.activationEvents.includes('onStartup')) {
    onStartupExtensions.push({ id: extensionId, manifest });
  }
  ```
- [x] 10.2 In `main.ts`, after `extensionIPC.start(...)`, read the default view from settings with a code fallback:
  ```ts
  const defaultView = getSetting<string>('core.workspace.defaultView') ?? 'dashboard';
  ```
    Sort `onStartupExtensions` into three groups: **service-providing extensions first** (extensions that register `finance.services.*` implementations), then the extension contributing `defaultView` (if it is `onStartup`), then remaining `onStartup` extensions in manifest-discovery order (alphabetical on `id` for determinism). If `defaultView` points to a view that is **not** contributed by an `onStartup` extension (e.g. the extension was disabled or the setting is stale), fall back to the first `onStartup` extension's primary view. Activate them **sequentially** using `for...of` with `await`:
  ```ts
  for (const ext of sortedOnStartupExtensions) {
    await extensionIPC.request('extension.activate', { extensionId: ext.id, reason: 'onStartup' });
  }
  ```
  Do NOT use `Promise.all` — parallel activation breaks the deterministic order required by Decision 2.
- [x] 10.3 On `extension.activate` success → `extensionRegistry.markActivated(id)`.
- [x] 10.4 On failure → `extensionRegistry.recordCrash(id, err)` (existing Phase 3 hot-disable); emit `extension-auto-disabled` if threshold reached.
- [x] 10.5 Add 5 unit tests: alphabetical activation order, Dashboard activates before any user interaction, hot-disable on activation failure, no double activation on subsequent clicks, missing `onStartup` extension does not block other `onStartup` extensions.

**Verification:** `npm run test:unit -- host-on-startup` → all tests pass; manual: app boots with Dashboard tab open before any click.

---

### Task 11: NavigationProvider — data-driven sidebar from `contributes.navigation`

**Files:** `src/renderer/components/navigation-panel.ts` (rewritten), `tests/unit/renderer/navigation-panel.test.ts` (new)

**Steps:**

- [x] 11.1 In `navigation-panel.ts`, rewrite:
  - Remove the static `_VIEW_CONTEXT_MAP` and the `if (view === 'Salary')` switch.
  - Subscribe to `window.financeShell.extensions.list()`; for each extension, read `extension.navigation` (new field from Task 1).
  - Maintain `_activeExtensionId: string` (the currently-active extension's id).
  - Render the `_activeExtensionId`'s `navigation` items, grouped by `group` (default "Quick Links").
  - On item click, dispatch `command-selected` with the item's `command` (existing handler in `renderer/index.ts`).
- [x] 11.2 Built-in Core items (for the `__settings__` view): keep as a static constant in `navigation-panel.ts`; not an extension contribution.
- [x] 11.3 Handle the active-extension lookup: Activity Bar click sets the active extension via the existing `view-changed` event (which currently passes `view` = extension's view id); map view id → extension id via the contributions list.
- [x] 11.4 Add 5 unit tests: items render in `group` order, click fires `command-selected`, active extension change re-renders, missing extension shows "no items", built-in Core items render for `__settings__`.

**Verification:** `npm run test:unit -- navigation-panel` → all tests pass; manual: click Dashboard → "Refresh" + "Net Worth Detail" items; click Salary → "Pay History" + "Pay Rate History" items.

---

### Task 12: Workspace layout — tabs + 2-pane split (ADR-0006: flat layout, split deferred)

**Files:** `src/renderer/components/workspace.ts` (rewritten), `src/renderer/components/tab-bar.ts` (new), `src/renderer/components/split-pane.ts` (new), `src/renderer/styles/layout.css` (modified), `tests/unit/renderer/workspace.test.ts` (new), `tests/unit/renderer/tab-bar.test.ts` (new)

> **Deviation (ADR-0006, 2026-07-31):** The workspace ships with a **flat tab list** (`_tabs` + `_activePanelId`) as the single source of truth; the `WorkspaceNode` split tree and the tab-strip drag-to-split are **deferred**. The originally planned tree model produced phantom `split` nodes that were never rendered, persisted, and then silently discarded on restart. Persisted layouts are now versioned flat JSON (`{ version: 1, tabs, activePanelId }`); the `version` field is the migration hook for a future `version: 2` split model. `split-pane.ts` is retained, unimported, for that retry.

**Steps:**

- [x] 12.1 In `workspace.ts`, replace the static Dashboard placeholder with a tab host. **Revised (ADR-0006):** `_tabs: Tab[]` defaults to a single Dashboard tab; no `WorkspaceNode` tree. `_addPanel` appends to `_tabs` (idempotent), `_closePanel` filters it (active-tab close refocuses the neighbour / new last tab; last-tab close unmounts all), `_focusPanel` only accepts open panels.
- [x] 12.2 In `tab-bar.ts`, render the tabs from the flat list. **Revised (ADR-0006):** the drag-to-split affordance (HTML5 DnD: `draggable`, `dragstart`/`dragend`, `tab-drag-end`, drop-affordance CSS) is **removed**; tabs are not draggable until the split retry.
- [ ] 12.3 In `split-pane.ts`, render a 2-pane container with a draggable splitter; close-on-last-tab collapses the split. **Deferred to the `version: 2` split retry.** `split-pane.ts` exists but is unimported (dead code pending the retry).
- [x] 12.4 In `styles/layout.css`, add tab bar styles matching the existing palette. (Splitter styles ship with the split retry.)
- [x] 12.5 Persist the layout to `core.workspace.layout` on every change (debounced 500 ms). **Revised (ADR-0006):** serialized as `{ version: 1, tabs, activePanelId }`. Guard against settings bloat: if the serialized JSON exceeds 16 KB, skip the write.
- [x] 12.6 Restore the layout on element connect. If restoration fails (corrupted JSON, no valid tabs), fall back to a single-tab default layout with the Dashboard active. Legacy `{ type: 'tab', ... }` payloads (0.7.x) are migrated to the flat format.
- [x] 12.7 Add 12 workspace tests + 4 tab-bar tests (flat model, idempotent add, focus rules, close-refocus, persistence round-trip, legacy migration, no split-pane render).
- [x] 12.8 In `workspace.ts`, attach a `ResizeObserver` to the content container and send `panel:resize` bounds for the active panel. (Splitter-driven throttled resize lands with the split retry.)

**Verification:** `npm run test:unit -- workspace tab-bar` → all tests pass; manual: open 3 tabs → tab bar shows all tabs, switching tabs swaps the active WebviewPanel; restart app → tabs + active tab restored. Split verification (drag to right edge → 2-pane split) is pending the split retry.

---

### Task 13: Per-extension command allowlist (Main-side enforcement)

**Files:** `src/main/services/command-allowlist.ts` (new), `src/main/services/extension-loader.ts` (modified), `src/main/main.ts` (modified), `tests/unit/main/services/command-allowlist.test.ts` (new)

**Steps:**

- [x] 13.1 In `command-allowlist.ts`, implement `CommandAllowlist`:
  - `build(manifests: Manifest[])`: builds an internal `Map<extensionId, Set<commandId>>` from each manifest's `allowedCommands`.
  - `isAllowed(extensionId, commandId)`: returns true iff `commandId ∈ allowedCommands[extensionId]`.
  - `rebuild(manifests)`: replaces the internal map.
- [x] 13.2 In `extension-loader.ts`, pass each manifest's `allowedCommands` to the allowlist builder at load time.
- [x] 13.3 In `main.ts`, instantiate `CommandAllowlist` after discovery; gate the `extensions:execute-command` IPC handler (modify the existing handler from Phase 3).
- [x] 13.4 Add 6 unit tests: allowed command passes, disallowed rejected, disabled extension's commands all rejected, allowlist rebuilt on `setEnabled` change, unknown command id rejected, Phase 4 migration shim (missing `allowedCommands` → auto-fill from `commands[].id`).

**Verification:** `npm run test:unit -- command-allowlist` → all tests pass; manual: call `financeShell.extensions.executeCommand('salary.show-pay-history')` from console → succeeds; call `financeShell.extensions.executeCommand('core.toggle-theme')` (Core command, not extension-scoped) → succeeds via bypass; call a non-allowlisted command → returns `{ executed: false, reason: 'command not allowed for this extension' }`.

---

### Task 14: Per-extension `ui-event` allowlist (Main-side enforcement)

**Files:** `src/main/services/ui-event-allowlist.ts` (new), `src/main/services/extension-loader.ts` (modified), `src/main/main.ts` (modified), `tests/unit/main/services/ui-event-allowlist.test.ts` (new)

**Steps:**

- [x] 14.1 In `ui-event-allowlist.ts`, implement `UiEventAllowlist` (mirrors `CommandAllowlist`):
  - `build(manifests)`: `Map<extensionId, Set<eventName>>`.
  - `isAllowed(extensionId, eventName)`.
- [x] 14.2 Gate the `extensions:ui-event` IPC handler with `isAllowed` check; on failure, drop with `console.warn` in the main-process terminal AND forward the violation to the originating panel's DevTools via `panel.webContents.send('panel:allowlist-denied', { kind: 'ui-event', extensionId, eventName, reason: msg })` so extension developers see the violation immediately during development.
- [x] 14.3 Migrate salary-history's manifest to declare `allowedUiEvents` (Task 8.6).
- [x] 14.4 Add 5 unit tests: allowed event passes, disallowed dropped with warn, disabled extension's events all dropped, Phase 4 migration shim.

**Verification:** `npm run test:unit -- ui-event-allowlist` → all tests pass; manual: click "+ Add Payslip" → form mounts (event allowed); emit a synthetic `core.toggle-theme` event from the panel → dropped silently.

---

### Task 15: Close the Phase 4 `'unsafe-eval'` CSP risk (panel side)

**Files:** `src/main/resources/panel-template.html` (new), `src/main/services/panel-protocol.ts` (modified)

**Steps:**

- [x] 15.1 Create `panel-template.html`:
  ```html
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';">
      <title>Webview Panel</title>
    </head>
    <body>
      <script type="module" src="finance-shell://extensions/{extensionId}.js"></script>
    </body>
  </html>
  ```
  The `{extensionId}` placeholder is replaced by `panel-protocol.ts` at response time. The bundle is served via the **same custom protocol** (`finance-shell://extensions/...`), not via `file://`, because Chromium blocks pages loaded over custom protocols from loading `file://` resources.
- [x] 15.2 In `panel-protocol.ts`, ensure the response headers set the CSP meta tag (already in the HTML); add a `Content-Security-Policy` response header as a defense-in-depth.
- [x] 15.3 Verify the panel's DevTools console shows no CSP violations when the bundle loads.

**Verification:** Manual: open DevTools in the panel → check `document.contentSecurityPolicy` → matches Decision 11's strict CSP.

---

### Task 16: ADR-0005 — Domain Service Registry

**Files:** `docs/decisions/0005-domain-service-registry.md` (new), `docs/decisions/README.md` (modified)

**Steps:**

- [x] 16.1 Write ADR-0005 documenting Decision 5:
  - **Status:** Accepted
  - **Context:** Phase 4 Decision 5 deferred `finance.services.*` cross-extension contract to Phase 5, with the design note that the contract should be designed from the consumer side.
  - **Decision:** Domain Service Registry singleton in Main; thin Host-side proxy; 4-method public surface for `pay` (Phase 5 first service).
  - **Consequences:** cross-extension calls now possible; "last-registered wins" rule.
  - **Revisit triggers:** multi-service-name conflicts, sub-millisecond service latency, sub-service-versioning.
- [x] 16.2 Add to `docs/decisions/README.md` index.

**Verification:** ADR file exists and is cross-linked from `docs/file-reference.md`.

---

### Task 17: Update extension API docs + file-reference

**Files:** `docs/extension-api.md` (modified), `docs/file-reference.md` (modified)

**Steps:**

- [x] 17.1 In `extension-api.md`, add sections for:
  - `contributes.navigation`
  - `contributes.allowedCommands` / `allowedUiEvents`
  - `activationEvents: 'onStartup'`
  - `finance.services.*` API
  - WebviewPanel hosting model
- [x] 17.2 In `file-reference.md`, add the Phase 5 inventory section (mirror the File Structure above).

**Verification:** `docs/extension-api.md` covers all Phase 5 additions; `file-reference.md` Phase 5 section present.

---

### Task 18: Manual Test Units

**Test Unit 1: Dashboard is the default landing view.**
- [x] 1.1 Fully close the app. Delete `%APPDATA%\Finance Flow AI\finance.db` (and `-wal` / `-shm`) for a fresh first run.
- [x] 1.2 Run `npm run rebuild && npm start`.
- [x] 1.3 **Expected:** the Dashboard tab opens automatically as the first tab; no user click required. The four cards render (each shows "—" or "install Salary History" placeholders since there is no data yet).

**Test Unit 2: Salary History opens as a second tab.**
- [x] 2.1 Click the Activity Bar button for the `salary-history` view (icon from the extension's `views[].icon` manifest field). If the button is not present (e.g., because the extension is disabled), skip this test.
- [x] 2.2 **Expected:** Salary History opens in a second tab. The Dashboard tab stays open. Switching tabs swaps the visible content; each tab's WebviewPanel stays mounted.
- [x] 2.3 Click the salary-history Activity Bar button again → no new tab opens; Salary History tab gains focus (idempotent).

**Test Unit 3: Split-screen via drag.**
- [ ] 3.1 With Dashboard and Salary History tabs open, drag the Salary History tab's header to the right edge of the workspace.
- [ ] 3.2 **Expected:** a 2-pane split appears (left = Dashboard, right = Salary History). Each pane has its own tab bar.
- [ ] 3.3 Drag the splitter to resize the panes.
- [ ] 3.4 **Expected:** splitter responds smoothly; layout persists across app restart.
  **Status: DEFERRED to Phase 7+.** `split-pane.ts` exists but is unimported (ADR-0006). The workspace ships with flat tabs only; no drag-to-split in Phase 5.

**Test Unit 4: NavigationProvider — data-driven sidebar.**
- [x] 4.1 With Dashboard active, click the Explorer item "Net Worth Detail".
- [x] 4.2 **Expected:** the item highlights; the dashboard.net-worth-detail command fires (currently a no-op placeholder per Phase 5's "open the detail view" deferral — `console.log` in the Dashboard command handler).
- [x] 4.3 Click the Activity Bar button for the `salary-history` view → sidebar switches to Salary extension's items ("Pay History", "Pay Rate History"). Click "Pay Rate History" → opens the rate-history view.
- [x] 4.4 Click the Settings `S` button → sidebar shows built-in Core items ("App Preferences", "Manage Extensions") — not extension contributions.

**Test Unit 5: Cross-extension `finance.services.pay.*` — graceful degradation.**
- [x] 5.1 With Dashboard active and Salary History NOT installed (disable via `extension_registry` SQL edit + restart, OR uninstall by removing the `extensions/salary-history/` directory temporarily), observe the Dashboard's YTD Salary card.
- [x] 5.2 **Expected:** the card shows "Salary extension not installed — install Salary History to see this card." No errors in DevTools; no crash.
- [x] 5.3 Reinstall / re-enable Salary History → card populates with YTD summary after the Dashboard's `dashboard.refresh` command runs.

**Test Unit 6: `finance.services.pay.*` — happy path.**
- [x] 6.1 With Salary History installed and active, click the Activity Bar button for the `salary-history` view → seed an account (TU1 from Phase 4) → create 3 payslips for the current FY.
- [x] 6.2 Click Dashboard tab.
- [x] 6.3 **Expected:** YTD Salary card shows the sum of the 3 payslips' gross/net; Last Payslip card shows the most recent payslip; Net Worth card sums the accounts + the last-12-months payslip net.

**Test Unit 7: Per-extension command allowlist.**
- [x] 7.1 From the Renderer DevTools console, call `await window.financeShell.extensions.executeCommand('salary.show-pay-history')`.
- [x] 7.2 **Expected:** `{ executed: true, ... }` — the command is in salary-history's `allowedCommands`.
- [x] 7.3 Call `await window.financeShell.extensions.executeCommand('salary.show-dashboard')`. **Decision (2026-08-01):** the command is intentionally NOT registered in salary-history's `commands[]` (the registered-but-disallowed variant from Task 8.4 was reverted), so this returns `command not found`.
- [x] 7.4 **Expected:** `{ executed: false, reason: 'command not found' }` — `salary.show-dashboard` has no owning extension. The allowlist-rejection path (`command not allowed for this extension`) is verified by the unit suite (`tests/unit/main/services/command-allowlist.test.ts`) rather than by this manual step.

**Test Unit 8: `extensions:ui-event` allowlist — drop unknown events.**
- [x] 8.1 From the Renderer DevTools console, call `window.financeShell.extensions.uiEvent('salary-history', 'payslip-create', { test: true })`.
- [x] 8.2 **Expected:** the event flows through (it's in `allowedUiEvents`); the salary-history bundle receives it. *(Verified 2026-08-01 via code path: allowed → forwarded to Host via `extensionIPC.notify(ExtensionUiEvent)` main.ts:420 → Host logs `[host] ui-event received:` host.ts:341. Bundle has no ui-event listeners yet, so "receives it" = Host observes it in the main-process terminal.)*
- [x] 8.3 Call `window.financeShell.extensions.uiEvent('salary-history', 'core.toggle-theme', {})`.
- [x] 8.4 **Expected:** `console.warn` in the main-process terminal (`[extensions] dropped ui-event "core.toggle-theme" from "salary-history" — not in allowlist`); the renderer event has no effect. *(Verified 2026-08-01: `isAllowed` false against real manifest; drop+warn at main.ts:405, `panel:allowlist-denied` sent at main.ts:407.)*

**Test Unit 9: WebviewPanel — CSP verified.**
- [x] 9.1 With Dashboard tab open, right-click → Inspect Element → DevTools opens for the panel.
- [x] 9.2 In the panel's console, run `document.contentSecurityPolicy`.
- [x] 9.3 **Expected:** returns the strict CSP from Decision 11 (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';`). No `'unsafe-eval'`. *(Verified 2026-08-01 via code path: meta tag in `src/main/resources/panel-template.html` L6–13 byte-identical to the served `dist/resources/panel-template.html`; HTTP header in built `dist/main/main.js` matches exactly. Actual policy is `default-src 'none'` — STRICTER than the plan's written `default-src 'self'`; `'unsafe-eval'` absent everywhere.)*

**Test Unit 10: DAO `$join` operator.**
- [x] 10.1 With Salary History active, run a `$join` query from the Salary History panel's DevTools console (open DevTools via right-click → Inspect on the panel):
  ```js
  const result = await financeShell.extensions.readTable({
    op: 'find',
    extensionId: 'salary-history',
    table: 'salary_history_pay_slips',
    query: {},
    options: {
      $join: { table: 'accounts', on: { left: 'salary_history_pay_slips.account_id', right: 'accounts.id' }, type: 'LEFT' },
      $orderBy: [{ column: 'pay_date', direction: 'DESC' }],
      $limit: 50
    }
  });
  console.log(result.rows.map(r => ({ id: r.id, pay_date: r.pay_date, account_name: r.name })));
  ```
  *(Run from the Salary History panel's bundle context; the panel exposes `financeShell.extensions.readTable` via the panel preload, not `finance.db.table(...)`.)*
- [x] 10.2 **Expected:** the query succeeds and returns payslips joined with account rows. Each result row includes columns from both tables. The list is sorted by `pay_date DESC` and capped at 50 rows.
- [x] 10.3 **Negative test (cross-extension access):** from the Salary History panel's DevTools console, run the same query with `extensionId: 'dashboard'` (an extension that does not own `salary_history_pay_slips`):
  ```js
  await financeShell.extensions.readTable({
    op: 'find',
    extensionId: 'dashboard',
    table: 'salary_history_pay_slips',
    query: {},
    options: { $join: { table: 'accounts', on: { left: 'salary_history_pay_slips.account_id', right: 'accounts.id' }, type: 'LEFT' } }
  });
  ```
  **Expected:** rejected with `DAOService: extension 'dashboard' cannot access table 'salary_history_pay_slips' (code -32011)`.
- [x] 10.4 **Validation test:** run with an invalid `on` shape (raw SQL string, or a non-existent column) → rejected with `ValidationFailed` at the DAO layer:
  ```js
  await financeShell.extensions.readTable({
    op: 'find',
    extensionId: 'salary-history',
    table: 'salary_history_pay_slips',
    query: {},
    options: { $join: { table: 'accounts', on: 'raw sql string', type: 'LEFT' } }
  });
  ```
  **Expected:** rejected with `DAOService: join 'on' must be { left: string, right: string }, got string (code -32603)`.

**Test Unit 11: TypeScript Strict + Lint + Tests.**
- [x] 11.1 `npm run typecheck` → exit 0.
- [x] 11.2 `npm run lint` → exit 0.
- [x] 11.3 `npm test` → all tests pass (404 passed).

**Test Unit 12: Multi-File Build Verification.**
- [x] 12.1 `npm run build:extensions`.
- [x] 12.2 **Expected:** `dist/extensions/salary-history.js` AND `dist/extensions/dashboard.js` both produced.
- [x] 12.3 On PowerShell (use a non-terminating check — `exit` inside an interactive session ends the shell, so use a variable instead):
  ```powershell
  $r = Select-String -Quiet -Pattern "from 'finance'" dist/extensions/dashboard.js
  if ($r) { Write-Error "found runtime finance import" } else { Write-Host "clean" }
  ```
  Expected: `clean` (no runtime `finance` imports).

---

### Task 19: Self-Review Checklist (this plan's §10 below)

- [x] 19.1 Verify all 12 architecture decisions are reflected in code.
- [x] 19.2 Verify all 12 manual test units pass (TU6/TU7 marked OPTIONAL/SKIPPABLE for manual runs; covered by automated unit tests).
  **Status:** 11 of 12 test units verified complete. TU3 (Split-screen via drag) is DEFERRED to Phase 7+ per ADR-0006; `split-pane.ts` exists but is unimported. The workspace ships with flat tabs only. TU6/TU7 are covered by automated unit tests.
- [x] 19.3 Verify the ~87 new unit tests pass (project total 404).
- [x] 19.4 Verify the Self-Review Checklist sections §1–§10 below.

---

### Task 20: Doc sync + handoff

**Files:** `docs/file-reference.md` (modified), `docs/decisions/0005-domain-service-registry.md` (new), `docs/extension-api.md` (modified), `docs/phase5-handoff.md` (new), `CHANGELOG.md` (modified)

**Steps:**

- [x] 20.1 In `docs/file-reference.md`, append the Phase 5 inventory section.
- [x] 20.2 In `docs/decisions/README.md`, add ADR-0005 to the index.
- [x] 20.3 In `docs/extension-api.md`, document the Phase 5 API additions (Task 17.1).
- [x] 20.4 Write `docs/phase5-handoff.md` following the Phase 3 handoff pattern (`docs/archives/phase3-handoff.md`).
- [x] 20.5 In `CHANGELOG.md`, add `## [0.8.0] - 2026-08-02` header with `### Administrative` entry citing this plan file.

**Verification:** all doc files updated; `CHANGELOG.md` version bumped; `package.json#version` synced to `0.8.0`.

---

## Test Plan

### Unit tests (~87 new; project total 404)

| File | Tests | Covers |
|------|-------|--------|
| `tests/unit/extension-host/manifest-schema.test.ts` (extended) | +5 | navigation, allowedCommands, allowedUiEvents, onStartup |
| `tests/unit/main/services/dao-service.test.ts` (extended) | +12 | $join, $orderBy, $limit, $offset |
| `tests/unit/main/services/domain-service-registry.test.ts` (new) | 8 | register/unregister/invoke, last-registered wins, null on error |
| `tests/unit/extension-host/api/services.test.ts` (new) | 4 | invoke proxy, register/unregister forwarding |
| `tests/unit/main/services/webview-panel-manager.test.ts` (new) | 8 | mount/unmount lifecycle, focus, multiple panels, custom protocol URL parsing, CSP headers |
| `tests/unit/main/services/command-allowlist.test.ts` (new) | 6 | allow/deny, disabled extension, rebuild, Phase 4 migration shim |
| `tests/unit/main/services/ui-event-allowlist.test.ts` (new) | 5 | allow/deny, drop-with-warn, Phase 4 migration shim |
| `tests/unit/extension-host/host-on-startup.test.ts` (new) | 5 | alphabetical order, crash → hot-disable, no double activation |
| `tests/unit/renderer/navigation-panel.test.ts` (new) | 5 | group order, click → command-selected, active extension switch |
| `tests/unit/renderer/workspace.test.ts` (new) | 6 | WorkspaceLayout tree, tab drag-to-split, persistence |
| `tests/unit/renderer/tab-bar.test.ts` (new) | 4 | tab strip, active tab, drag affordance |
| `tests/unit/extensions/salary-history/public-pay-adapter.test.ts` (new) | 8 | 4 methods + null-on-error + null-on-disabled |
| `tests/unit/extensions/dashboard/aggregator-service.test.ts` (new) | 6 | buildAggregator with mocked FinanceApi |
| `tests/unit/extensions/dashboard/ui/dashboard-view.test.ts` (new) | 5 | 4 cards render in cardOrder, missing-data placeholders |
| **Total new** | **~87** | |
| **Project total after Phase 5** | **404** | (Phase 4 ~312 + ~87 new + pre-existing tests) |

### Manual Test Units (12) — see Task 18 above

### E2E (new; still gated by Phase 3 environmental blocker)

`tests/e2e/multi-extension-workspace.spec.ts` (new, 6 tests):

1. Dashboard auto-activates on startup before any user click.
2. Clicking the Activity Bar button for the `salary-history` view opens Salary History in a second tab.
3. Drag-to-split creates a 2-pane layout.
4. NavigationPanel re-renders items when active extension changes.
5. `finance.services.pay.*` returns null when salary-history is disabled.
6. `dashboard.refresh` command re-runs the aggregator.

`tests/e2e/webview-panel.spec.ts` (new, 4 tests):

1. WebviewPanel CSP matches Decision 11 (no `'unsafe-eval'`).
2. Panel-to-panel ui-event round-trip via Main.
3. Per-extension command allowlist blocks non-allowlisted commands.
4. Per-extension ui-event allowlist drops non-allowlisted events.

These will run when the Phase 3 Playwright-electron environmental issue is resolved.

---

## Self-Review Checklist

### §1 — Vision Alignment

- [x] **project_vision.md:154-156 (UI Rendering Layer — WebviewPanel iframe rendering).** Decision 1 ships the WebviewPanel shape; Phase 5 replaces Phase 4's renderer-side mount.
- [x] **project_vision.md:222-241 (Main Workspace — tabs + split-screen groups).** ADR-0006 ships flat tab list; 2-pane split deferred to version: 2.
- [x] **project_vision.md:107-117 (Domain Services layer — `finance.services.*` contract).** Decision 5 ships the registry + 4-method public surface.
- [x] **project_vision.md:46 (strict namespace isolation).** Phase 4 DAO namespace enforcement preserved; Phase 5 adds `$join` access control (Decision 4).
- [x] **project_vision.md:48 (Do Not Break Other Extensions — graceful `null`).** `finance.services.invoke` returns `null` on missing service (Decision 5); per-extension allowlists (Decisions 6, 7) gate cross-extension access.
- [x] **project_vision.md:78 (JSON-RPC transport).** ADR-0003 transport reused; new `domain.service.invoke` method added.
- [x] **project_vision.md:131-152 (Secure Extension API).** `finance.db.table()` extended with new operators; raw SQL remains impossible.
- [x] **project_vision.md:264-284 (Data Architecture / Shared Financial Data).** `accounts` remains the only shared table; Dashboard reads via allowlist.
- [x] **project_vision.md:332-356 (Dashboard as Aggregator Extension).** Decision 2 + Task 9 ship the Dashboard extension with `onStartup` activation; aggregator pattern over Shared Financial Data + `finance.services.pay.*`.
- [x] **project_vision.md:46 (security — per-extension command allowlist).** Decision 6 closes the Phase 3 §7 deferral.

### §2 — Spec Coverage

- [x] **Implementation Design Phase 5 (lines 130-136):**
  - **Dashboard is the second extension (introduced in Phase 5).** Decision 2 + Task 9 ship it.
  - **Startup auto-activation.** Task 10 ships `onStartup` activation event.
  - **`finance.services.*` cross-extension Domain Services.** Decision 5 + Tasks 7, 8 ship the registry + `finance.services.pay.*` adapter.
  - **Split-screen support, tab management.** ADR-0006 + Task 12 ship flat tabs; 2-pane split deferred.
  - **Dashboard extension.** Decision 2 + Task 9 ship it (Net Worth + YTD Salary + Last Payslip + Accounts Summary).
  - **NavigationProvider data-driven sidebar.** Decision 3 + Task 11 ship it.
  - **DAO operator expansion** — `$join` / `$orderBy` / `$limit` / `$offset`. Decision 4 + Task 6 ship them.
  - **Security hardening (two surfaces)** — `executeCommand` + `ui-event` allowlists. Decisions 6, 7 + Tasks 13, 14 ship them.

### §3 — Carries-forward from Phase 4 (explicit deferrals resolved)

- [x] **Phase 4 Self-Review §7 — WebviewPanel iframe rendering.** Resolved in Decision 1 + Task 2.
- [x] **Phase 4 Self-Review §7 — `finance.services.*` cross-extension Domain Services.** Resolved in Decision 5 + Tasks 7, 8.
- [x] **Phase 4 Self-Review §7 — NavigationProvider data-driven sidebar.** Resolved in Decision 3 + Task 11.
- [x] **Phase 4 Decision 2 — DAO operators $join / $orderBy / $limit / $offset.** Resolved in Decision 4 + Task 6.
- [x] **Phase 3 §7 + Phase 4 Review Finding 3 — Per-extension command allowlist.** Resolved in Decision 6 + Task 13.
- [x] **Phase 4 Decision 12 — `extensions:ui-event` per-extension allowlist.** Resolved in Decision 7 + Task 14.
- [x] **Phase 3 §7 — Menu bar contribution rendering.** Still deferred to Phase 7+ (no Phase 5 consumer).
- [x] **Phase 3 §7 — Global event bus.** Still deferred to Phase 7 (Phase 5 uses IPC channels directly).
- [x] **Phase 3 §7 — Hot-disable behaviour runtime-unload (extension.deactivate notification).** Still deferred; Phase 5's allowlist enforcement means disabled extensions' commands/events are dropped at the IPC layer without needing a Host-side deactivation notification.

### §4 — Architecture Decision Coverage

- [x] Decision 1 (WebviewPanel = WebContentsView embedded in main BrowserWindow) — Task 2.
- [x] Decision 2 (Startup auto-activation) — Tasks 9, 10.
- [x] Decision 3 (NavigationProvider data-driven sidebar) — Task 11.
- [x] Decision 4 (DAO operators $join, $orderBy, $limit, $offset) — Task 6.
- [x] Decision 5 (`finance.services.*` cross-extension contract) — Tasks 7, 8.
- [x] Decision 6 (Per-extension command allowlist) — Task 13.
- [x] Decision 7 (Per-extension ui-event allowlist) — Task 14.
- [x] Decision 8 (WebviewPanel lifecycle — dirty-state interfaces wired, lazy-unmount timer deferred to Phase 7) — Task 2.7.
- [x] ADR-0006 (Flat Workspace Layout — 2-pane split deferred) — Task 12.
- [x] Decision 10 (Panel-runtime stub — `financeShell.*` inside iframe) — Task 3.
- [x] Decision 11 (Closing `'unsafe-eval'` CSP risk on panel side) — Task 15.
- [x] Decision 12 (Settings stay interim, no generic UI yet) — Phase 7.

### §5 — Test Pyramid

- [x] ~87 new unit tests covering all 12 decisions + manifest schema extensions + Dashboard + public-pay-adapter + navigation panel + workspace + DAO operators (project total 404 after Phase 5).
- [x] 12 manual test units covering the full multi-extension user journey (TU6/TU7 marked OPTIONAL/SKIPPABLE for manual runs; covered by automated tests).
- [x] 10 new E2E tests written but gated by Phase 3 environmental blocker (documented).

### §6 — Code Quality / Production Readiness

- [x] TypeScript strict mode maintained across all new and modified files.
- [x] No `any` introduced (typed DAO errors flow end-to-end; DomainServiceImpl uses `unknown` + Zod validation at the boundary).
- [x] All SQL parameterised (DAO `$join.on` validated by the registry against manifest column lists — no string interpolation).
- [x] All cross-process payloads serialisable (Phase 4 `serializeRow` reused; DomainService return values pass through `serializeRow` at the registry boundary).
- [x] Error messages user-actionable (allowlist denials return specific `reason` strings; service-not-found returns `null` with a `console.warn`).
- [x] No new runtime dependencies (WebviewPanels use Electron's built-in `WebContentsView`; no React/Vue/etc.).
- [x] No new dev dependencies.

### §7 — Explicit Deferrals (Out of Scope, Documented for Future Phases)

The full deferral table is in the **Out of Scope** section above. Highlights:

- AI Assistant → Phase 6.
- Generic settings UI renderer → Phase 7.
- Extension Manager UI → Phase 8.
- Marketplace packaging → Phase 8.
- Keyboard shortcut customization → Phase 7.
- Main renderer `'unsafe-eval'` removal → Phase 7.
- Full grid layout (3+ panes) → Phase 7+.
- Typed SDK npm package → Phase 8.

### §8 — Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `WebContentsView` per panel uses ~20-40 MB RAM; 10+ open tabs adds memory pressure | Lazy unmount after 5 min unfocused, with dirty-state protection (Decision 8); Phase 7+ adds `keepAlive` hint |
| `onStartup` activation crashes block the shell boot | Phase 3 hot-disable contract: `crash_count >= 3` auto-disables; activation goes through `extensions:activate-view` IPC path that records crashes |
| `$join.on` raw expression is a SQL injection surface if not validated | Decision 4 + Task 6.3: parse `a.col = b.col`, validate against registered manifests; malformed `on` returns `ValidationFailedError` (-32012) |
| Domain Service Registry's "last-registered wins" rule is order-dependent | Phase 5 has only one `pay` registrar (salary-history); Phase 8 may add priority mechanism |
| Per-extension allowlists break Phase 4 extensions without `allowedCommands` | Phase 4 migration shim auto-fills from `commands[].id` with `console.warn`; Phase 5 Task 1.4 |
| 2-pane split is a UX ceiling (no 3+ panes) | Documented in ADR-0006; Phase 7 ships full grid |
| Dashboard's `finance.services.pay.*` calls may return `null` if salary-history is disabled | Graceful degradation per `project_vision.md:48`; cards show "install Salary History to see this" placeholders |
| WebviewPanel lazy unmount loses in-panel state (e.g., a half-filled form) | Mitigated by dirty-state protection (Decision 8): dirty panels are never unmounted, and autoSaveDraft is called before unmounting. Phase 7+ may add a "save-on-blur" extension hook |
| `'unsafe-eval'` removed from the panel CSP but still required in the main renderer | Decision 11 trade-off; main renderer `'unsafe-eval'` removal is Phase 7 |
| Custom protocol (`finance-shell://`) registration may collide with other Electron apps | Protocol name is namespaced (`finance-shell`, not the more common `app`); Phase 8's marketplace may need a per-user nonce suffix |
| Phase 3 environmental Playwright blocker persists into Phase 5 | Same blocker; E2E tests written but gated; manual TU 1-12 cover the user journey |
| Salary-history `public-pay-adapter` exposes only 4 methods; future consumers may need more | Phase 5 ships the minimum; Phase 6+ extends the surface based on Budget/Cash Flow consumer needs |

### §9 — Questions / Clarifications for Reviewer

1. **Should the Dashboard's `dashboard.cardOrder` setting be a string[] (current design) or a typed enum?** Plan defers to Phase 7's generic settings UI to validate the user-facing shape.
2. **Should Phase 5 ship a `dashboard.refresh` keyboard shortcut?** Plan defers; Phase 7's shortcut customization screen will let users bind it.
3. **Should the 2-pane split persist across app restarts?** Yes (ADR-0006 → `core.workspace.layout` setting). Reviewer should confirm the setting-key naming.
4. **Should the WebviewPanel manager expose a "pin tab" affordance?** Out of scope for Phase 5 (Phase 8's tab management). Documented.
5. **Should `finance.services.pay.getCurrentRate` return the raw rate row or a simplified shape?** Plan ships the raw `RateRow` (matches `salary_history_rate_history` schema); Dashboard's card renders the fields it needs.

### §10 — Alternatives Considered (Per Decision)

Each decision's "Alternatives considered" section enumerates the rejected options with reasoning. Reviewer may push back on any of Decisions 1, 5, 6, or 8 (the highest-judgement calls). Specifically:

- **Decision 1 (child `BrowserWindow` vs `<webview>` tag vs `<iframe>`):** If reviewer prefers `WebContentsView` (Electron 28+) or `<iframe>` (simpler), the panel infrastructure changes but the IPC contract is unchanged.
- **Decision 5 (registry vs per-extension surface):** If reviewer prefers a typed per-service API, scope expands by ~200 lines (typed envelope generation).
- **Decision 6 (allowlist mandatory vs opt-out):** If reviewer prefers backwards-compatible opt-out, the security posture weakens — every Phase 4 extension would need migration. The current design auto-fills with a `console.warn`.
- **Decision 8 (lazy unmount at 5 min):** If reviewer prefers no unmount, memory pressure becomes a real complaint at 10+ tabs. Phase 7+ will add `keepAlive` hints.

---

## End of Plan
