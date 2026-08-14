---
title: Phase 7 — Production Readiness & Polish (master plan)
date: 2026-08-02
last_updated: 2026-08-08T12:45:00+10:00
status: ready for implementation
target_version: 0.9.0
spec_source: docs/superpowers/specs/2026-06-13-implementation-design.md (Phase 7 section, lines 123-127)
---

<!-- markdownlint-disable MD025 -->

# Phase 7 — Production Readiness & Polish

> **Goal:** Turn the working Phase 5 platform into a production-ready application with a generic settings UI, keyboard shortcuts, backup/restore, encryption, grid layouts, event bus, and developer polish. No new extensions are built in Phase 7 — the platform becomes stable enough that building extensions (Budget, Tax, Cash Flow, etc.) is straightforward after this phase.

---

## Prerequisites

- Phase 5 complete (`docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md` — status: `complete`)
- App boots, extensions load, Dashboard + Salary History functional
- `npm run test:unit` passes (404 tests)
- `npm run typecheck` exit 0
- `npm run lint` exit 0

## Existing Infrastructure (do not re-implement)

The following Phase 5 infrastructure already exists and handles the two-renderer layering problem. Do not re-litigate or re-implement these:

| Component | Purpose | File |
|---|---|---|
| `overlayCoordinator` (inline) | Reference-counts open main-renderer overlays (command palette only today) | `src/renderer/index.ts:70-84` |
| `WebviewPanelManager.hidePanelsForOverlay()` | Sets all `WebContentsView` panels `visible = false` when overlay opens | `src/main/services/webview-panel-manager.ts` |
| `WebviewPanelManager.restorePanels()` | Re-shows panels when overlay count reaches 0 | same |
| `panel-active` guard | Suppresses `panel:resize` and mount-fallback visibility changes while overlay is open | same |

**Why this matters for Phase 7:** The inline `overlayCoordinator` in `index.ts` only serves the command palette today. Task 0 extracts it into a reusable `OverlayCoordinator` class so that Shortcuts, Backup, and any future overlay can share correct reference-counted layering. Settings is a workspace view (not an overlay) and does not use the coordinator. Panels will hide/show automatically for true overlays. No CSS `z-index` work needed.

---

### Task 0: Extract OverlayCoordinator into Standalone Class

**Status:** Complete (2026-08-05). Inline `overlayCoordinator` extracted to `src/renderer/overlay-coordinator.ts`; `src/renderer/index.ts` uses `OverlayCoordinator` singleton; 9 unit tests pass; typecheck + lint pass. Known limitation: focus/shortcut propagation to `WebContentsView` panels is deferred to Task 4.

**What:** The Phase 5 implementation includes a working reference-counted overlay coordinator, but it is embedded as an inline object inside `src/renderer/index.ts` (lines 70–84). It is only used by the command palette. Before Phase 7 adds Keyboard Shortcuts and Backup screens — which are main-renderer overlays — the coordinator needs to be extracted into a proper reusable class. Settings is a workspace view and does not use the coordinator.

**Current status:**

- `src/renderer/index.ts:70-84` — `overlayCoordinator` is a plain object with `_refCount`, `show()`, and `hide()` methods
- It correctly uses reference counting: `show()` increments count and only hides panels when count transitions 0→1; `hide()` decrements and only restores panels when count transitions 1→0
- It is only called by `setCommandPaletteVisible()` at lines 86-92
- Other overlays do NOT use it — they would call `panel.hideForOverlay()` / `panel.restoreAfterOverlay()` directly, bypassing the ref count
- `src/main/services/webview-panel-manager.ts` still has `overlayActive: boolean` as a fast-path guard (lines 62, 412-426)

**Why this matters for Phase 7:**
The Phase 7 plan adds two new main-renderer overlays (Keyboard Shortcuts, Backup/Restore) and one workspace view (Settings). Users can open overlays in any combination (e.g., Settings → then Shortcuts on top). Without a centralized coordinator, each overlay would call hide/restore independently, causing panels to reappear while an underlying overlay is still open.

**Target state after Task 0:**

- `src/renderer/overlay-coordinator.ts` — standalone `OverlayCoordinator` class with `showOverlay(id)` / `hideOverlay(id)` API
- Any renderer overlay can register itself by ID; the coordinator tracks which overlays are active via reference counting
- `src/renderer/index.ts` — imports and uses `OverlayCoordinator` instead of inline object
- Command palette, Settings, Shortcuts, Backup, and any future overlay all use the same coordinator
- Main-process `WebviewPanelManager.hidePanelsForOverlay()` / `restorePanels()` remain unchanged; they are called by the coordinator via preload IPC

**Deliverables:**

- `src/renderer/overlay-coordinator.ts` — new file
  - `showOverlay(id: string): void` — registers an overlay, increments ref count, hides panels on first overlay (0→1 transition)
  - `hideOverlay(id: string): void` — unregisters an overlay, decrements ref count, restores panels when last overlay closes (1→0 transition)
  - `getOverlayCount(): number` — returns current active overlay count (for debugging/testing)
  - `isActive(): boolean` — returns whether any overlay is open
  - Guards against double-show / double-hide of same ID in dev
  - Unknown IDs passed to `hideOverlay` are ignored safely — no crash if hideOverlay is called with an ID that was never shown
- `src/renderer/index.ts` — replace inline `overlayCoordinator` object with import of `OverlayCoordinator`
- `src/renderer/components/command-palette.ts` — update to use `OverlayCoordinator.showOverlay('command-palette')` / `hideOverlay('command-palette')` instead of direct IPC calls

**Implementation approach:**

1. Create `src/renderer/overlay-coordinator.ts`:
   - Class with private `refCount: number` and private `activeIds: Set<string>`
   - `showOverlay(id)` — add id to set, increment count, if count === 1 send `panel:hide-overlay` via preload
   - `hideOverlay(id)` — remove id from set, decrement count, if count === 0 send `panel:restore-overlay` via preload
   - Guard against double-show / double-hide of same ID in dev
2. Update `src/renderer/index.ts`:
   - Remove inline `overlayCoordinator` object (lines 70-84)
   - Import `OverlayCoordinator` and instantiate as singleton
   - Update `setCommandPaletteVisible` to call `overlayCoordinator.showOverlay('command-palette')` / `.hideOverlay('command-palette')`
3. Update `src/renderer/components/command-palette.ts` if it directly calls hide/restore (verify it goes through `setCommandPaletteVisible`)

- [x] **Step 1: Write unit tests for OverlayCoordinator**

  New tests in `tests/unit/renderer/overlay-coordinator.test.ts`:
  - `showOverlay increments ref count and hides panels on first show` — verifies count goes 0→1 and `panel.hideForOverlay` is called
  - `showOverlay does not re-hide panels when already active` — verifies count goes 1→2 but `panel.hideForOverlay` is NOT called again
  - `hideOverlay decrements ref count and restores panels on last hide` — verifies count goes 2→1 and `panel.restoreAfterOverlay` is NOT called
  - `hideOverlay restores panels when count reaches 0` — verifies count goes 1→0 and `panel.restoreAfterOverlay` IS called
  - `getOverlayCount returns current ref count` — verifies count after multiple show/hide cycles
  - `isActive returns false when no overlays are open` — verifies initial state and after full hide cycle
  - `isActive returns true when at least one overlay is open` — verifies after showOverlay
  - `double hideOverlay for same id does not crash or go negative` — verifies ref count stays ≥ 0
  - `hideOverlay with unknown id is handled safely` — verifies no crash when id was never shown

  Run: `npm run test -- tests/unit/renderer/overlay-coordinator.test.ts`
   Expected: All new tests pass.

- [x] **Step 2: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

- [x] **Step 3: Manual verification**

   Manual verification deferred to full Stage 1 GUI pass. OverlayCoordinator behavior is covered by unit tests and the ref-counted guard is exercised by the existing command-palette flow.

---

## Stage 1 — Settings & Keyboard (User-Facing)

### Task 1: Settings Screen + Navigation Wiring

**Status:** Complete (implemented in the workspace). The Settings workspace view, navigation wiring, configuration aggregation, and Core-owned settings bridge are present and verified by unit tests and typecheck/lint.

**Prerequisites:**

- `extensions:list` IPC handler extended to return `configuration` arrays from each extension's manifest (not currently included in the `{ views, commands, navigation }` response)
- `settings-service.ts` initialized with `core` namespace registered
- `__settings__` early-return already wired in `view-changed` handler at `src/renderer/index.ts:157-160`
- `OverlayCoordinator` singleton available in `src/renderer/index.ts` for panel hide/restore

**What:** Build the Settings screen component and wire it into the main workspace via the Activity Bar and Navigation Panel.

**Deliverables:**

- `src/renderer/components/settings-screen.ts` — LitElement that reads `contributes.configuration` from all extensions and renders a collapsible form
- `src/renderer/components/navigation-panel.ts` — replace `_coreItems` with single Settings item that dispatches `view-changed` with `view: '__settings__'`
- `src/renderer/index.ts` — mount `settings-screen` into workspace when `view === '__settings__'`
- `src/main/main.ts` — extend `extensions:list` IPC handler to include `configuration` in response
- `src/types/finance.d.ts` / preload types — extend `extensions.list` return type to include `configuration`

**Implementation approach:**

1. Extend `extensions:list` to include `configuration`:
   - In `src/main/main.ts`, add `configuration: extensionRegistry.configuration()` to the `extensions:list` IPC response
   - In `src/main/services/extension-registry.ts`, add a `configuration()` getter following the same pattern as `views()`, `commands()`, and `navigation()`
   - Update the preload type for `extensions.list` to include `configuration` in the return shape
   - This is a prerequisite for `settings-screen.ts` to render any settings sections

2. Create `settings-screen.ts`:
   - Calls `window.financeShell.extensions.list()` to get all active extensions + their `configuration` arrays
   - Renders one collapsible section per extension, with form fields matching each config item's `type`:
     - `string` → text input
     - `boolean` → toggle switch
     - `enum` → dropdown (`enumOptions` from manifest)
     - `number` → number input
     - `object` → textarea with JSON validation
   - Reads current values via `financeShell.settings.get(key)` on mount
   - Writes values via `financeShell.settings.set(key, value)` on change (debounced 300ms)
   - Shows the extension's `displayName` as the section header
   - All settings are persisted in a SQLite database at `<userData>/finance.db` in the `settings` table (`key TEXT PRIMARY KEY, value TEXT NOT NULL`). Values are JSON-stringified. The renderer reads/writes through the preload bridge (`financeShell.settings.get/set`), which calls through to `settings-service.ts` in Main.

3. Replace `_coreItems` in `navigation-panel.ts` (lines 83–86):

   ```ts
   private static readonly _coreItems: NavItem[] = [
     { extensionId: 'core', id: 'settings', label: 'Settings', command: '__settings__', group: 'General' },
   ];
   ```

   - Remove the existing `app-preferences` and `manage-extensions` entries. Their commands (`core.appPreferences`, `core.manageExtensions`) are no longer reachable from the nav panel; their functionality will be exposed as sections inside the Settings screen in a later task, or deferred to Phase 8.
   - Per the design mockup (`docs/design/phase7-settings/settings.html`), the Settings view nav panel will eventually contain three items: Settings, Keyboard Shortcuts, and Backup & Restore. Keyboard Shortcuts and Backup & Restore items will be added to `_coreItems` when their screens are built in Tasks 4 and 7.
   - Change `_onNav` so that when `cmd === '__settings__'`, it dispatches `view-changed` with `detail: { view: '__settings__', source: 'core' }` instead of `command-selected`

4. Wire `__settings__` into `renderer/index.ts`:
   - In the `view-changed` handler, when `view === '__settings__'`, append `<settings-screen>` into `#workspace` if not already present
   - Call `overlayCoordinator.showOverlay('settings')` to hide any open WebContentsView panels while Settings is active
   - When navigating away from Settings, remove `<settings-screen>` and call `overlayCoordinator.hideOverlay('settings')` to restore panels
   - Settings is a main-renderer workspace view rendered as a DOM overlay; panels are hidden during Settings to avoid the WebContentsView layering issue

5. The existing `financeShell.settings` bridge in both `preload.ts` and `panel-preload.ts` already works — no changes needed there

**Verification:**

1. Click Activity Bar Settings button → workspace shows Settings screen (Activity Bar highlights Settings)
2. Click Navigation Panel Settings → same screen opens (both paths converge on `view: '__settings__'`)
3. See sections for Dashboard and Salary History with correct input types
4. Change any setting → value saved immediately via `financeShell.settings.set`
5. Close and reopen Settings → value persisted
6. Restart app → value still persisted
7. Panel iframes can still read/write settings via `financeShell.settings` — unaffected

**Design mockup:** `docs/design/phase7-settings/settings.html`

- [x] **Step 1: Write unit tests for settings-service and navigation behavior**

  New tests in `tests/unit/services/extension-registry.test.ts`:
  - `configuration() returns config items from enabled extensions` — verifies `configuration()` returns `{ extensionId, configuration }` entries for extensions that declare `contributes.configuration`
  - `configuration() excludes disabled extensions` — verifies disabled extensions are not included
  - `configuration() returns empty array for extensions with no configuration` — verifies extensions without configuration contributions return nothing

  Existing tests in `tests/unit/services/settings-service.test.ts` already cover:
  - `stores and retrieves a namespaced setting key`
  - `rejects writes to unregistered namespaces`
  - `deletes a setting key`

  New tests in `tests/unit/renderer/navigation-panel.test.ts`:
  - `_getVisibleItems returns Settings nav item when currentView is __settings__` — nav panel shows only Settings item when Settings view is active
  - `built-in Settings group renders Settings item` — verifies the Settings section contains only the Settings nav item, not App Preferences or Manage Extensions
  - `clicking Settings nav item dispatches view-changed with __settings__` — click handler dispatches correct event (not `command-selected`)
  - `_onNav dispatches view-changed for __settings__ command` — Settings item routes through view system, not command system

  Run: `npm run test -- tests/unit/services/extension-registry.test.ts tests/unit/renderer/navigation-panel.test.ts`
  Expected: All new tests pass; all existing tests still pass.

- [x] **Step 2: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

 ---

### Task 1.5: Account Management

**Status:** Implemented with one remaining test failure in the current workspace. The Core-owned account management workspace view, main/preload IPC bridges, navigation wiring, and first-run account gate are present. The only outstanding issue from verification is a failing account-management unit test around deleting the last active account.

 **What:** Introduce a Core-owned account management workspace view with full CRUD, replace the one-off seed modal with a Core-level first-run gate, and expose a complete `AccountsApi` bridge.

 **Why this matters today:** Account creation is currently triggered only by the salary-history extension's first-run seed modal. There is no way to list, edit, or deactivate accounts after creation. The first-run check lives in extension code, so disabling salary-history also disables the only account-creation path. A Core-owned manager makes accounts a first-class platform resource.

 **Current state:**

- `accounts` table exists (`003-shared-accounts`) with `id`, `name`, `institution`, `is_active`, `created_at`
- Main IPC exposes only `accounts:create` and `accounts:count`
- Preloads expose `financeShell.accounts.create` and `financeShell.accounts.count`
- The seed modal (`extensions/salary-history/src/ui/accounts-seed-modal.ts`) is wired only into salary-history's orchestrator via `_resolveSeedView()` and `_onAccountCreate`
- No `accounts:list`, `accounts:update`, or `accounts:delete` IPC exists
- `notifyOpenDashboardAfterAccountChange()` refreshes open Dashboard panels after insert

 **Files to modify:**

- `src/main/main.ts` — add `accounts:list`, `accounts:update`, `accounts:delete` IPC handlers
- `src/types/finance-shell.d.ts` — extend `AccountsApi`
- `src/preload/preload.ts` — expose new `accounts.*` methods
- `src/preload/panel-preload.ts` — expose new `accounts.*` methods inside panels
- `src/renderer/components/navigation-panel.ts` — add Accounts nav item
- `src/renderer/index.ts` — wire `__accounts__` view into workspace + Core first-run gate
- `src/renderer/components/accounts-manager.ts` — new LitElement for account CRUD
- `extensions/salary-history/src/orchestrator.ts` — remove `_resolveSeedView()` and `_onAccountCreate`/`_onSeedDismiss` seed logic
- `extensions/salary-history/src/ui/accounts-seed-modal.ts` — deleted
- `extensions/salary-history/src/ui/index.ts` — remove modal import
- `extensions/salary-history/package.json` — remove `account-seed-*` from `allowedUiEvents`
- `src/main/resources/panel-bootstrap.ts` — remove `account-seed-*` from `FORWARDED_EVENTS`

 **Files created:**

- `src/renderer/components/accounts-manager.ts`
- `tests/unit/main/services/account-management.test.ts`
- `tests/unit/renderer/accounts-manager.test.ts`

 **Implementation approach:**

 1. **Extend Core account IPC + preload bridges:**
    - Add `accounts:list` — `SELECT id, name, institution, is_active, created_at FROM accounts ORDER BY created_at DESC`
    - Add `accounts:update` — `UPDATE accounts SET name=?, institution=?, is_active=? WHERE id=?`; validate `id` exists and `name` is non-empty
    - Add `accounts:delete` — `DELETE FROM accounts WHERE id=?`; guard against deleting the last active account; warn if referenced by `salary_history_pay_slips.account_id` but allow (historical payslips retain FK)
    - Expose all methods in both preloads and update `AccountsApi` in `finance-shell.d.ts`
 2. **Core-level first-run gate:**
    - In `src/renderer/index.ts`, on `DOMContentLoaded`, call `financeShell.accounts.count()`
    - If count is 0 and no view is active, dispatch `view-changed` to `__accounts__`
    - This removes the coupling between salary-history activation and account creation
 3. **Build `accounts-manager.ts`:**
    - List mode: rows with name, institution, active badge, created date, and action buttons (Edit, Deactivate/Activate, Delete)
    - Form mode: inline edit/create form with name (required), institution (optional), active toggle
    - Empty state: centered "Create your first account" prompt
    - Delete guard: refuse to delete the last active account
    - Data flow: reads via `financeShell.accounts.list()`, writes via `financeShell.accounts.create/update/delete`
    - Styling: follow existing dark Obsidian theme
 4. **Wire into workspace:**
    - `navigation-panel.ts`: add `{ extensionId: 'core', id: 'accounts', label: 'Accounts', command: '__accounts__', group: 'General' }` to `_coreItems`
    - `renderer/index.ts`: mount `accounts-manager` into `#workspace` when `view === '__accounts__'`
 5. **Remove the one-off seed modal:**
    - Delete `extensions/salary-history/src/ui/accounts-seed-modal.ts`
    - Remove modal import from `extensions/salary-history/src/ui/index.ts`
    - Remove `_resolveSeedView()`, `_onAccountCreate`, `_onSeedDismiss` from orchestrator
    - Remove `account-create`, `account-seed-skip`, `account-seed-cancel` bindings from `_bindEvents()`
    - Remove `account-seed-*` from `allowedUiEvents` in package.json
    - Remove `account-seed-*` from `FORWARDED_EVENTS` in `panel-bootstrap.ts`

 **Verification:**

 1. Fresh DB (`rm finance.db` → restart) → app opens Accounts view automatically (Core first-run gate)
 2. Accounts view shows empty state with "Create your first account" prompt
 3. Create account → row appears in list with active badge and correct timestamps
 4. Edit account → name/institution update in place
 5. Deactivate account → badge changes to inactive; row remains visible
 6. Reactivate account → badge changes back to active
 7. Attempt to delete last active account → guard message shown, delete blocked
 8. Delete inactive account → row removed
 9. Restart app → accounts persist and reload
 10. Disable salary-history extension → first-run account gate still works
 11. Dashboard + Salary History panels still read `accounts` via `finance.db.table('accounts')` — unaffected

- [x] **Step 1: Write unit tests for account management**

   New tests in `tests/unit/main/services/account-management.test.ts`:
  - `accounts:list returns all accounts sorted by created_at DESC`
  - `accounts:create inserts a new account and returns { id }`
  - `accounts:create rejects empty name`
  - `accounts:update modifies name, institution, and is_active`
  - `accounts:update rejects empty name`
  - `accounts:delete removes the account`
  - `accounts:delete blocks deleting the last active account`
  - `accounts:count returns the correct count after create/delete`

   New tests in `tests/unit/renderer/accounts-manager.test.ts`:
  - `renders empty state when no accounts exist`
  - `renders account rows with name, institution, active badge, and actions`
  - `create account submits form and refreshes list`
  - `edit account updates row in place`
  - `deactivate/activate toggle works`
  - `delete blocks last active account`
  - `delete removes inactive account`

   Run: `npm run test -- tests/unit/main/services/account-management.test.ts tests/unit/renderer/accounts-manager.test.ts`
   Expected: All new tests pass; all existing tests still pass.

- [x] **Step 2: Typecheck + lint**

   Run: `npm run typecheck`
   Expected: PASS — no errors.

   Run: `npm run lint`
   Expected: PASS — no new errors.

 ---

### Task 2: Core Financial Year Context

**What:** Add Core-owned financial year settings that all extensions read. No per-extension FY settings.

**Status:** Complete. The Settings screen renders `core.financialYear.current` and `core.financialYear.start` in the Core section. All extension-side migrations are done: salary-history and dashboard both read Core FY settings; per-extension FY keys are removed from manifests; `core.defaultCurrency` is also migrated to Core; extension namespace guard allows `core.*` reads; unit tests, typecheck, and lint pass.

**Deliverables:**

- `src/renderer/components/settings-screen.ts` — modified (created in Task 1): Core Financial Year section with `core.financialYear.current` and `core.financialYear.start`; also added `core.defaultCurrency`
- `src/main/services/extension-ipc.ts` — modified: `assertExtensionKey` allows `core.*` reads from extensions
- `extensions/salary-history/src/main.ts` — modified: reads `core.financialYear.start`, `core.financialYear.current`, and `core.defaultCurrency`; passes as `settingsMountData`
- `extensions/salary-history/src/ui/payslip-form.ts` — modified: reads `core.financialYear.start`, `core.financialYear.current`, and `core.defaultCurrency` from `finance.settings`; `paygTaxYear` derived from `core.financialYear.current`
- `extensions/salary-history/src/ui/payslip-list.ts` — modified: reads `core.financialYear.start` and `core.financialYear.current`; filters payslips by selected FY
- `extensions/salary-history/package.json` — modified: removed `salary-history.financialYearStart`, `salary-history.financeYear`, and `salary-history.defaultCurrency` from `configuration`
- `extensions/salary-history/src/services/pay-service.ts` — modified: `aggregateYearToDate` gains optional `financialYear` parameter
- `extensions/salary-history/src/services/public-pay-adapter.ts` — modified: `getYearToDateSummary` accepts `financialYear`
- `extensions/salary-history/src/services/payg-brackets.ts` — modified: comment updated to reference `core.financialYear.current`
- `extensions/dashboard/src/main.ts` — modified: reads `core.financialYear.start` and `core.financialYear.current`
- `extensions/dashboard/src/services/aggregator-service.ts` — modified: `DashboardSettings.financialYearCurrent` passed to `getYearToDateSummary`
- `extensions/dashboard/src/orchestrator.ts` — modified: reads Core FY keys, forwards `financialYearCurrent` to `dashboard-view`
- `extensions/dashboard/src/ui/dashboard-view.ts` — modified: `financialYearCurrent` property; `_fyLabel()` uses it as override
- `extensions/dashboard/package.json` — modified: `configuration` is empty; removed `dashboard.financialYearStart`
- `tests/unit/services/settings-service.test.ts` — modified: 2 new tests for `core.financialYear.current` and `core.financialYear.start`
- `tests/unit/extensions/dashboard/orchestrator.test.ts` — modified: updated to use Core FY keys and `financialYearCurrent`
- `tests/unit/extensions/dashboard/ui/dashboard-view.test.ts` — modified: uses `financialYearCurrent`
- `tests/unit/extensions/dashboard/aggregator-service.test.ts` — modified: `defaultSettings` includes `financialYearCurrent`
- No changes to `src/main/services/settings-service.ts`, `src/main/main.ts`, or `src/preload/preload.ts`

**Implementation approach:**

1. **`src/renderer/components/settings-screen.ts`** (created in Task 1, modified in Task 2) — Add Core Financial Year section:
   - Add a "Core" collapsible section at the top of the settings form
   - `core.financialYear.start` — render as a text input (type `text`, placeholder `MM-DD`, default `07-01`), read via `financeShell.settings.get('core.financialYear.start')`, write on change (debounced 300ms)
   - `core.financialYear.current` — render as a text input (`type text`, placeholder `YYYY-YYYY`) that auto-formats raw input (e.g. `20252026` → `2025-2026`) via `formatFinanceYear` in `settings-screen.ts`, defaulting to the current FY computed from today's date (`computeCurrentFinancialYear`); no DB query needed
      - Compute default in renderer: FY label from the reference date + `07-01` boundary, formatted as `YYYY-YYYY`
      - Read current value via `financeShell.settings.get('core.financialYear.current')` to populate the input
      - On change, format via `formatFinanceYear`, then write via `financeShell.settings.set('core.financialYear.current', formattedFy)`

2. **`extensions/dashboard/src/main.ts`** — Update `readSettings` to read from Core FY settings:
   - Replace `finance.settings?.get('dashboard.financialYearStart')` with `finance.settings?.get('core.financialYear.start')`
   - Replace any `dashboard.financialYearStart` references with `core.financialYear.start`
   - The `financialYearStart` default remains `'07-01'` (hardcoded, no fallback to extension settings)
   - Pass `core.financialYear.current` as the active FY context to `buildAggregator` so YTD cards respect the selected FY

3. **`extensions/dashboard/src/services/aggregator-service.ts`** — Update `DashboardSettings` and `buildAggregator`:
   - Change `DashboardSettings.financialYearStart` to `financialYearStart: string` (still from Core, but now explicitly named to reflect its Core origin)
   - Add `financialYearCurrent?: string` to `DashboardSettings` so the aggregator can filter YTD computation to the selected FY
   - Update `buildAggregator` to pass `financialYearCurrent` through to `aggregateYearToDate` so only payslips in the selected FY are included in YTD cards
   - The `YtdSalaryCard.financialYearStart` field remains for display purposes

4. **`extensions/salary-history/src/ui/payslip-list.ts`** — Add FY filter and read Core FY start:
   - Change the `financialYearStart` property default from `'07-01'` to read from `financeShell.settings.get('core.financialYear.start')` on mount (fallback to `'07-01'`)
   - Add a `financialYear` property that reads `financeShell.settings.get('core.financialYear.current')` and filters the payslip list to only show rows matching the selected FY
   - When `core.financialYear.current` changes (listen via `financeShell.settings.onChange` or re-fetch on `connectedCallback`), re-filter the table
   - The FY column in the table header and the `finance_year` cell in each row remain as-is; the filter is applied to the `payslips` array before rendering

5. **`extensions/salary-history/src/main.ts`** — Migrate mountData to read from Core FY settings:
   - Replace `finance.settings?.get('salary-history.financialYearStart')` with `finance.settings?.get('core.financialYear.start')` when constructing `settingsMountData`
   - Remove the `salary-history.financialYearStart` setting key from the extension's configuration (it is no longer used; Core owns the FY boundary)
   - The `financialYearStart` default remains `'07-01'` (hardcoded, no fallback to extension settings)
   - Add `financialYearCurrent` to `settingsMountData` by reading `finance.settings?.get('core.financialYear.current')` so the orchestrator and child components receive the active FY context

6. **`extensions/salary-history/src/ui/payslip-form.ts`** — Read Core FY start directly and add FY awareness:
   - Change the `financialYearStart` property to read from `financeShell.settings.get('core.financialYear.start')` on mount (fallback to `'07-01'`) instead of relying solely on mountData from the orchestrator
   - Add a `financialYear` property that reads `financeShell.settings.get('core.financialYear.current')` and re-computes the `finance_year` auto-fill when the FY changes
   - When `core.financialYear.current` changes (listen via `financeShell.settings.onChange` or re-fetch on `connectedCallback`), re-derive `finance_year` from `pay_date` + the Core FY boundary
   - The `computeFinanceYear(payDate, this.financialYearStart)` calls now use the Core boundary, ensuring FY auto-fill is consistent with the Core setting

7. **Override pattern enforcement** — Extensions do NOT declare their own `financialYearStart` or `financialYear.current` settings. Extensions that previously declared `financialYearStart` in their own namespace (e.g., `salary-history.financialYearStart`) must migrate to reading `core.financialYear.start` instead.

8. **No data migration needed** — If `core.financialYear.start` is not set, it falls back to `'07-01'` in the extension code. Existing `salary-history.financialYearStart` data in the settings database is simply ignored after the extension code migrates to read `core.financialYear.start`.

**Verification:**

1. Open Settings → Core section shows `core.financialYear.current` (text input defaulting to the current FY, auto-formats `YYYYYYYY` → `YYYY-YYYY`) and `core.financialYear.start` (text input)
2. Change `core.financialYear.current` → Dashboard YTD updates to that FY
3. Payslip list filters to the selected FY
4. No `financialYearStart` or `paygTaxYear` settings appear under Dashboard or Salary History sections
5. Extensions reading `financeShell.settings.get('core.financialYear.current')` get the correct value

- [x] **Step 1: Write unit tests for FY settings behavior**

   New tests in `tests/unit/services/settings-service.test.ts`:
      - `stores and retrieves core.financialYear.current` — FY label persists
      - `stores and retrieves core.financialYear.start` — FY boundary persists

   Run: `npm run test -- tests/unit/services/settings-service.test.ts`
   Expected: All new tests pass.

- [x] **Step 2: Typecheck + lint**

   Run: `npm run typecheck`
   Expected: PASS — no errors.

   Run: `npm run lint`
   Expected: PASS — no new errors.

---

### Task 2.5: Dashboard Financial Year Configuration (Consolidated under Core)

**What:** The original Task 2.5 planned to add per-extension dashboard FY config keys (`dashboard.financialYearStart`, `dashboard.financeYear`). Instead, these were consolidated under Core-owned settings: `core.financialYear.start` (FY boundary) and `core.financialYear.current` (FY label). The dashboard extension now reads both from Core, and `dashboard-view.ts` uses `financialYearCurrent` as the topbar FY override, falling back to auto-computation when empty. No dashboard-owned FY configuration keys exist.

**Relationship to Task 2 (Core Financial Year Context):** This task is now the dashboard-side tail of Task 2. The original separation between Task 2 (Core FY boundary) and Task 2.5 (dashboard FY override) is collapsed: both the boundary and the label are Core-owned, and dashboard simply consumes them.

**Deliverables:**

- `extensions/dashboard/package.json` — modified: `configuration` is empty; no dashboard-owned FY keys
- `extensions/dashboard/src/main.ts` — modified: `readSettings()` reads `core.financialYear.start` and `core.financialYear.current`
- `extensions/dashboard/src/services/aggregator-service.ts` — modified: `DashboardSettings.financialYearCurrent` passed to `getYearToDateSummary`
- `extensions/dashboard/src/orchestrator.ts` — modified: `_loadDashboardSettings()` reads Core FY keys; forwards `financialYearCurrent` to `dashboard-view`
- `extensions/dashboard/src/ui/dashboard-view.ts` — modified: property renamed to `financialYearCurrent`; `_fyLabel()` uses it as override when non-empty
- `tests/unit/extensions/dashboard/aggregator-service.test.ts` — modified: `defaultSettings` includes `financialYearCurrent`
- `tests/unit/extensions/dashboard/orchestrator.test.ts` — modified: mock uses `core.financialYear.current`; asserts `financialYearCurrent` forwarded
- `tests/unit/extensions/dashboard/ui/dashboard-view.test.ts` — modified: tests use `financialYearCurrent` property

**Implementation approach:**

1. **`extensions/dashboard/src/main.ts`** — `readSettings()` reads `core.financialYear.start` and `core.financialYear.current`, returns them in `DashboardSettings`
2. **`extensions/dashboard/src/services/aggregator-service.ts`** — `DashboardSettings` has `financialYearStart` + `financialYearCurrent`; `buildAggregator` passes `financialYearCurrent` to `getYearToDateSummary` as positional array args
3. **`extensions/dashboard/src/orchestrator.ts`** — `_loadDashboardSettings()` reads Core FY keys; `_mountChild()` sets `childEl.financialYearStart` and `childEl.financialYearCurrent`
4. **`extensions/dashboard/src/ui/dashboard-view.ts`** — `_fyLabel()` uses `financialYearCurrent` as override when set, otherwise auto-computes from `referenceDate` + `financialYearStart`

**Verification:**

1. Open Settings → Dashboard section has no FY settings (Core section owns them)
2. Set `core.financialYear.current` in Core settings → dashboard topbar shows `(FY YYYY-YYYY)`
3. Clear `core.financialYear.current` → topbar auto-computes from `referenceDate` + `core.financialYear.start`
4. Change `core.financialYear.start` → dashboard YTD aggregation uses new boundary
5. Restart app → values persist in Core settings

- [x] **Step 1: Write unit tests for FY config wiring**

   New tests in `tests/unit/extensions/dashboard/ui/dashboard-view.test.ts`:
      - `_fyLabel returns the financialYearCurrent override when set` — with `financialYearCurrent = '2025-2026'` the label renders as `2025-2026`
      - `_fyLabel auto-computes when financialYearCurrent is empty` — with no override the label derives from `referenceDate` + `financialYearStart`
      - `financialYearCurrent updates via mount-update` — dispatching `mount-update` with `financialYearCurrent` updates the property

   Modified tests in `tests/unit/extensions/dashboard/orchestrator.test.ts`:
      - `forwards financialYearStart and financialYearCurrent settings to the view` — mounting with settings returns a view whose `financialYearStart`/`financialYearCurrent` reflect the Core settings

   Run: `npm run test -- tests/unit/extensions/dashboard/orchestrator.test.ts tests/unit/extensions/dashboard/ui/dashboard-view.test.ts tests/unit/extensions/dashboard/aggregator-service.test.ts`
   Expected: All new tests pass; existing dashboard tests still pass.

- [x] **Step 2: Typecheck + lint**

   Run: `npm run typecheck`
   Expected: PASS — no errors.

   Run: `npm run lint`
   Expected: PASS — no new errors.

---

### Task 3: Array Settings Modals (Extension-Side)

**What:** Implement `dashboard.cardOrder` in the dashboard extension, mirroring the architectural pattern and logic used in the salary-history section ordering system. Card order is managed extension-side rather than being exposed as a generic Core setting.

**Status:** Complete. `DashboardOrchestrator` owns card-order state and persists `dashboard.cardOrder` via `finance.settings`. `reorder-cards-modal.ts` provides the Lit modal with up/down arrows, disabled edge states, green/purple borders, Save/Cancel/Reset, and `card-order-change`/`card-order-cancel` events. `dashboard-view.ts` dispatches `reorder-cards` from the topbar button. `dashboard/package.json` includes `card-order-change` in `allowedUiEvents` and has empty `configuration`. Typecheck, lint, and dashboard tests pass.

**Deliverables:**

- `extensions/dashboard/src/orchestrator.ts` — new lightweight orchestrator that loads `dashboard.cardOrder` from `finance.settings` on init, persists changes on save, and navigates between the dashboard view and the reorder modal
- `extensions/dashboard/src/ui/reorder-cards-modal.ts` — new Lit modal element with up/down arrows, reset-to-default, save/cancel, and `card-order-change`/`card-order-cancel` CustomEvents
- `extensions/dashboard/src/ui/dashboard-view.ts` — add "Reorder Cards" button that dispatches `reorder-cards` event; listens for orchestrator-driven navigation
- `extensions/dashboard/src/ui/index.ts` — import `reorder-cards-modal.js`
- `extensions/dashboard/src/main.ts` — refactor to instantiate `DashboardOrchestrator` instead of directly mounting the view
- `extensions/dashboard/package.json` — remove `dashboard.cardOrder` from `contributes.configuration`; add `card-order-change` to `allowedUiEvents`

**Implementation approach:**

1. Create `DashboardOrchestrator` in `extensions/dashboard/src/orchestrator.ts`:
   - Owns `_cardOrder` state, initialized to `CANONICAL_CARD_ORDER`
   - `_loadCardOrder()` reads `dashboard.cardOrder` from `finance.settings` on init, parses JSON, falls back to canonical on malformed data
   - `_bindEvents()` listens for `reorder-cards`, `card-order-change`, and `card-order-cancel` on the container
   - `_mountChild()` creates either `dashboard-view` or `reorder-cards-modal` and injects `cardOrder` as a property
   - `_onCardOrderChange` updates `_cardOrder`, persists via `finance.settings.set('dashboard.cardOrder', JSON.stringify(order))`, then navigates back to `dashboard-view`
   - `_onReorderCancel` navigates back to `dashboard-view` without persisting

2. Create `ReorderCardsModal` in `extensions/dashboard/src/ui/reorder-cards-modal.ts`:
   - Accepts `cardOrder` property (array of card IDs)
   - Renders 4 rows with up/down arrows; first row has disabled up + green left border, last row has disabled down + purple left border
   - Dispatches `card-order-change` (detail: `string[]`) on Save
   - Dispatches `card-order-cancel` on Cancel
   - Reset-to-default restores `CANONICAL_CARD_ORDER`

3. Update `dashboard-view.ts`:
   - Add "Reorder Cards" button that dispatches `reorder-cards` CustomEvent with `bubbles: true, composed: true`
   - Button styled with existing dark theme

4. Update `main.ts`:
   - Replace direct mount logic with `DashboardOrchestrator` instantiation
   - Orchestrator handles aggregator building and view mounting
   - `activate()` creates orchestrator, calls `init()`, which loads settings and renders the dashboard

5. Update `package.json`:
   - Remove `dashboard.cardOrder` from `contributes.configuration`
   - Add `"card-order-change"` to `allowedUiEvents`

**Verification:**

1. Open Dashboard → 4 cards render in default order
2. Click "Reorder Cards" → modal opens with current order
3. Move cards up/down → click Save → `dashboard.cardOrder` updated in settings
4. Click Cancel → no change
5. Restart app → cards render in persisted order
6. Malformed JSON in settings → falls back to canonical order without crash

- [x] **Step 1: Typecheck + lint**

    Run: `npm run typecheck`
    Expected: PASS — no errors.

    Run: `npm run lint`
    Expected: PASS — no new errors.

---

### Task 4: Keyboard Shortcut Customization + Focus Fix

**What:** Make keyboard shortcuts actually work from every focused surface (main renderer AND `WebContentsView` panels), then add a screen to customize them.

**Status:** Complete. Shortcut infrastructure (`shortcut-registry.ts`, `shortcuts-screen.ts`, preload bridge, IPC handlers) was implemented in prior work. Verification in this session confirmed:
- 15 shortcut-related unit tests pass
- `npm run typecheck` passes
- `npm run lint` passes
- Focus fix applied: `requestAnimationFrame` deferred `focusInput()` in `setCommandPaletteVisible()` to eliminate intermittent focus loss when opening the command palette via shortcut
- Bug fix: `onShortcut` was incorrectly placed under `panel` in `preload.ts` instead of `extensions`; renderer checks `window.financeShell?.extensions?.onShortcut`, so the handler was never registered. Moved to correct namespace. `PanelApi` extracted as separate interface in `finance-shell.d.ts`. Active `workspace:resize` listener also updated to use top-level `financeShell.panel`.

**Why this matters today:** The current shortcuts are hardcoded `keydown` listeners in `src/renderer/index.ts` lines 304–329. They only fire when the main renderer's DOM has focus. When a `WebContentsView` panel has focus, keyboard events go to that panel's `webContents`, so `Ctrl+Shift+P` (command palette), `Ctrl+J` (toggle AI), and `Ctrl+Alt+H`/`Ctrl+Alt+R` (extension commands) silently fail. Users must click back into the main shell before shortcuts work.

**Files to modify:**

- `src/main/main.ts` (attach `before-input-event` to main renderer `webContents` and every panel `webContents`)
- `src/main/services/webview-panel-manager.ts` (expose a `registerShortcutHandler` hook so Main can attach `before-input-event` to each panel's `webContents` when the panel is created)
- `src/renderer/index.ts` (remove hardcoded `keydown` listeners; receive shortcut commands from Main via IPC; mount/unmount `shortcuts-screen` with `OverlayCoordinator`)
- `src/renderer/components/shortcuts-screen.ts` (new)
- `src/main/services/shortcut-registry.ts` (new)
- `src/preload/preload.ts` (expose `financeShell.shortcuts` bridge to renderer)
- `src/types/finance-shell.d.ts` (add `ShortcutsApi` to `FinanceShellApi`)

**Pre-existing infrastructure (do not re-implement):**

- `ManifestCommandContribution.keybinding` already exists in `src/types/finance.d.ts:60-70`
- `manifest-schema.ts` line 24 already declares `keybinding: z.string().optional()`
- `extensions:list` IPC already returns `keybinding` via `extensionRegistry.commands()` — no main.ts or preload changes needed for data shape
- `preload.ts` and `panel-preload.ts` already include `keybinding?: string` in their commands types

**Where shortcuts live today:**

- Manifest declarations: `manifest-schema.ts` line 24 (`keybinding: z.string().optional()`)
- Hardcoded renderer bindings: `renderer/index.ts` lines 304–329
  - `Ctrl+Shift+P` — toggle Command Palette
  - `Ctrl+J` — toggle AI panel (`toggleAiPanel`)
  - `Ctrl+Alt+H` — View: Pay History (`salary.show-pay-history`)
  - `Ctrl+Alt+R` — View: Pay Rate History (`salary.show-pay-rate-history`)
- `toggle-ai` command handler: `renderer/index.ts` line 238 (`command-selected` listener)
- Salary History commands declare `Ctrl+Alt+H` and `Ctrl+Alt+R` in `extensions/salary-history/package.json`

**Implementation approach:**

1. Fix focus propagation using `before-input-event` (NOT `globalShortcut`):
   - In `src/main/main.ts`, attach `before-input-event` to the main renderer's `webContents` AND to every panel `webContents` created by `WebviewPanelManager`.
   - `WebviewPanelManager` gets a new `registerShortcutHandler(webContents: WebContents, handler: (accelerator: string) => void)` method called from `mount()` after the view is created.
   - On accelerator match, the handler sends a single IPC message to the main renderer (e.g., `shell:shortcut` with `{ accelerator }`) so the centralized registry in the renderer can execute the command regardless of which `WebContents` had focus.
   - This keeps all shortcut logic in Main and makes every `WebContents` a first-class citizen for shortcuts.

2. Create `shortcut-registry.ts` in Main:
   - `build()` scans all loaded extensions' manifests for `commands[].keybinding`
   - Builds a `Map<string, { commandId, extensionId, accelerator }>` keyed by accelerator
   - Exposes `list()`, `update(extensionId, commandId, newAccelerator)`, `reset()` to renderer via new IPC handlers (`shortcuts:list`, `shortcuts:update`, `shortcuts:reset`)
   - Persists custom accelerators in `finance.settings` under `core.shortcuts.<extensionId>.<commandId>`
   - On `before-input-event` match → sends `shell:shortcut` IPC to renderer with the matched accelerator

3. Create `shortcut-registry.ts` renderer-facing IPC bridge in `preload.ts`:
   - Add `financeShell.shortcuts` namespace with `list()`, `update(extensionId, commandId, accelerator)`, `reset(extensionId?)`
   - Add `ShortcutsApi` to `FinanceShellApi` in `src/types/finance-shell.d.ts`

4. Create `shortcuts-screen.ts` in renderer:
   - Table/list of all registered shortcuts grouped by extension
   - Click a shortcut → prompt for new key combo → call `financeShell.shortcuts.update()` → persist to `finance.settings`
   - "Reset to defaults" button per extension (and global reset)
   - Does NOT manage `OverlayCoordinator` itself; `renderer/index.ts` calls `overlayCoordinator.showOverlay('shortcuts')` when mounting and `hideOverlay('shortcuts')` when unmounting, following the same pattern as Settings and Accounts

5. Update `renderer/index.ts`:
   - Remove the hardcoded `keydown` listeners (lines 304–329), including `Ctrl+Shift+P`, `Ctrl+J`, `Ctrl+Alt+H`, `Ctrl+Alt+R`, and `Escape`
   - Add `shell:shortcut` IPC handler that looks up the accelerator in the renderer-side shortcut registry and dispatches the corresponding action:
     - `Ctrl+Shift+P` → `setCommandPaletteVisible(true)`
     - `Ctrl+J` → `toggleAiPanel()`
     - `Ctrl+Alt+H` → `executeExtensionCommand('salary.show-pay-history')`
     - `Ctrl+Alt+R` → `executeExtensionCommand('salary.show-pay-rate-history')`
     - `Escape` → `setCommandPaletteVisible(false)` (when command palette is open)
   - Add mount/unmount wiring for `shortcuts-screen` with `OverlayCoordinator`

6. Wire the centralized shortcut registry:
   - The `toggle-ai` command (currently hardcoded at line 238) is migrated to be dispatachable via the `shell:shortcut` IPC handler
   - Extension commands route through the existing `executeExtensionCommand` path

**Easy analogy:** Like VS Code's Keyboard Shortcuts settings — a searchable list where you can rebind any command, and shortcuts work whether you're typing in the editor, the sidebar, or a panel.

**Verification:**

1. Click inside a `WebContentsView` panel so it has OS focus
2. Press `Ctrl+Shift+P` → Command Palette opens (previously failed)
3. Press `Ctrl+J` → AI panel toggles (previously failed)
4. Press `Ctrl+Alt+H` → Pay History view activates (previously failed)
5. Open Shortcuts screen → rebind `Ctrl+Alt+H` to `Ctrl+Shift+H`
6. Press new combo from inside a panel → command executes

- [x] **Step 1: Write unit tests for shortcut-registry**

  New tests in `tests/unit/main/services/shortcut-registry.test.ts`:
  - `build() registers shortcuts from manifest keybindings` — verifies `build()` scans all loaded extensions' manifests and populates the registry Map
  - `looks up command by accelerator and routes through IPC` — verifies pressing a registered accelerator sends `shell:shortcut` to the renderer with the correct accelerator
  - `update() persists new accelerator to finance.settings` — verifies rebinding a shortcut writes the new accelerator to `core.shortcuts.<extensionId>.<commandId>`
  - `reset() restores defaults` — verifies reset clears custom accelerators and falls back to manifest defaults
  - `unregister on app quit` — verifies any per-webContents listeners are cleaned up on shutdown

  New tests in `tests/unit/renderer/shortcuts-screen.test.ts`:
  - `renders list of registered shortcuts grouped by extension`
  - `clicking a shortcut prompts for rebind and calls financeShell.shortcuts.update`
  - `reset to defaults clears custom bindings`

  Run: `npm run test -- tests/unit/main/services/shortcut-registry.test.ts tests/unit/renderer/shortcuts-screen.test.ts`
  Expected: All new tests pass.

- [x] **Step 2: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

### Task 5: Core Theme Propagation to Panels

**What:** When `core.theme` changes in the main renderer, propagate the theme to all active WebviewPanel iframes so the panel area also reflects the light/dark mode.

**Files to modify:**

- `src/renderer/index.ts` (broadcast theme change to panels)
- `src/preload/preload.ts` (expose `panel.broadcastTheme` to renderer)
- `src/preload/panel-preload.ts` (expose `theme` API to panel renderers)
- `src/main/services/webview-panel-manager.ts` (broadcast theme to all active panels)
- `src/main/resources/panel-bootstrap.ts` (apply theme class on panel load + listen for changes)
- `src/types/finance.d.ts` (add `theme` API to `FinanceApi` if exposed to extensions)

**Root cause:** The main renderer applies `body.light-theme` to its own `document.body` (lines 119–120 of `src/renderer/index.ts`). Panel iframes run in separate `WebContentsView` instances with their own DOM — they never receive the theme class toggle. The panel preload (`panel-preload.ts`) has no theme-related IPC channel, and the panel bootstrap (`panel-bootstrap.ts`) applies no theme on load.

**Implementation approach:**

  1. In `src/renderer/index.ts`, when `core.theme` changes (after `toggleTheme()` succeeds), call `window.financeShell?.panel?.broadcastTheme?.(newTheme)` — a new preload bridge method that delegates to Main
  2. In `src/main/main.ts`, add an IPC handler for `theme:broadcast` that calls `webviewPanelManager?.broadcastTheme(theme)`
  3. In `src/main/services/webview-panel-manager.ts`, add a `broadcastTheme(theme: string)` method that iterates all open panels and calls `panel.webContents.send('theme:changed', theme)`
     - This is the single source of truth for panel broadcast; the renderer does NOT iterate panels directly
  4. In `src/preload/panel-preload.ts`, add a `theme` namespace to the panel API:
    - `get(): Promise<string>` — reads current theme via existing `settings.get('core.theme')`
    - `onChange(callback: (theme: string) => void): () => void` — subscribes to `theme:changed` IPC events from Main
     - `broadcastTheme(theme: string): void` — tells Main to broadcast a theme change to all panels (renderer calls this after toggling theme)
  5. In `src/main/resources/panel-bootstrap.ts`, on panel init:

- Read current theme via `financeShell.theme.get()`
- Apply `document.body.classList.add('light-theme')` or remove it based on the theme value
- Subscribe to `financeShell.theme.onChange()` to apply future theme changes without reload

   6. In `src/types/finance.d.ts`, add `theme` to the `FinanceApi` interface exposed to extensions (optional — extensions can also read `core.theme` via `finance.settings.get`)

**Verification:**

1. Open Settings → toggle theme from Dark to Light → main renderer UI updates immediately
2. All active panel iframes also switch to light theme without reload
3. Switch back to Dark → panels update to dark theme
4. Open a new panel after theme change → new panel inherits the current theme
5. Restart app → panels load with the persisted theme applied

- [ ] **Step 1: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

## Stage 2 — Security & Data Integrity

### Task 6: Main Renderer `'unsafe-eval'` CSP Removal

**What:** Phase 5 closed the panel-side CSP gap. The main renderer still allows `'unsafe-eval'` because of blob-URL dynamic imports. Remove it.

**Files to modify:**

- `src/main/main.ts` (CSP header)
- `src/renderer/index.html` or CSP meta tag location
- `src/renderer/index.ts` (any `URL.createObjectURL` or blob imports)
- `src/preload/preload.ts` (if any eval-style bridges exist)

**Where the problem is today:**

- Phase 5 plan line 684: "The main renderer's CSP is unchanged from Phase 4... `'unsafe-eval'` remains because the renderer still uses blob URLs"
- The Phase 5 `panel-template.html` uses strict CSP (`script-src 'self'`); the main renderer's equivalent is still loose

**Implementation approach:**

1. Audit `src/renderer/` for any `new Function()`, `eval()`, `URL.createObjectURL(blob)`, or dynamic `import()` from blobs
2. Replace blob imports with static Vite-powered imports where possible
3. Tighten the main renderer's CSP header/meta tag to match the panel's strict policy
4. If any dynamic import is genuinely needed, use a nonce-based approach

**Verification:** Open DevTools → Application → Security → verify `'unsafe-eval'` is absent from script-src.

- [ ] **Step N: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

### Task 7: Database Backup/Restore + Encryption

**What:** Let users export/import their database with optional encryption.

**Files to modify:**

- `src/main/services/backup-service.ts` (new)
- `src/main/main.ts` (wire backup service, add menu items or commands)
- `src/renderer/components/backup-screen.ts` (new)
- `src/types/finance.d.ts` (add `finance.backup.*` API if exposed to extensions)

**Where the DB lives today:**

- `src/main/services/database-service.ts` — manages the SQLite file path, connection, and corrupt-DB recovery
- The DB file is at `<userData>/myfinance.db` (or similar)

**Implementation approach:**

1. Create `backup-service.ts`:
   - `exportDatabase()` → copy the SQLite file to a user-chosen location (via `dialog.showSaveDialog`)
   - `importDatabase(path)` → validate the file (SQLite magic bytes + schema version check), replace current DB, restart
   - `exportEncrypted(password)` → same as export but wrap with `crypto.createCipheriv` (AES-256-GCM)
   - `importEncrypted(path, password)` → decrypt + validate + replace
2. Create `backup-screen.ts` (or integrate into settings screen):
   - Export / Import buttons
   - Encryption toggle + password field
   - Last backup timestamp display
   - Register with `OverlayCoordinator` so panels hide when backup screen is open
3. Wire into the Settings screen or as standalone commands (`core.backup.export`, `core.backup.import`)

**Easy analogy:** Like exporting a backup in 1Password or Bitwarden — a simple file you can store safely.

**Verification:** Export unencrypted → file is valid SQLite → import on fresh app → data intact. Export encrypted → password-protected → import with wrong password → error.

- [ ] **Step N: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

### Task 8: `finance.events.*` Global Event Bus

**What:** Replace ad-hoc IPC channels with a proper cross-process pub/sub event bus.

**Files to modify:**

- `src/shared/json-rpc-methods.ts` (add `RPC_METHOD.EventSubscribe`, `RPC_METHOD.EventPublish`)
- `src/shared/json-rpc.ts` (add `RpcErrorCode` for event errors if needed)
- `src/main/services/event-bus.ts` (new)
- `src/extension-host/api/events.ts` (new)
- `src/extension-host/api/index.ts` (add `events` to `FinanceApi`)
- `src/preload/preload.ts` (expose `financeShell.events` to renderer)
- `src/types/finance.d.ts` (add `EventsApi` interface)

**Where ad-hoc channels exist today:**

- `extensions:ui-event` (panel → renderer → Host)
- `extensions:host-log` (Host stdout → renderer console)
- `panel:mount-update`, `panel:auto-save-failed`, `panel:resize`
- DOM `CustomEvent` in renderer (`view-changed`, `command-selected`, `workspace:focus-panel`)

**Implementation approach:**

1. Create `event-bus.ts` in Main:
   - `subscribe(topic, callback)` / `unsubscribe(topic, callback)`
   - `publish(topic, payload)` — routes to all subscribers across Host + renderer
   - Uses existing JSON-RPC infrastructure: Host publishes via `rpc.notify`, Main routes to renderer via `webContents.send`
2. Create `events.ts` in Host API:
   - `on(topic, handler)` / `off(topic, handler)` / `emit(topic, payload)`
3. Expose to renderer via preload: `financeShell.events.on/off/emit`
4. Migrate one existing channel (e.g., `extensions:host-log`) to the new bus as a proof of concept

**Easy analogy:** Like a chat room — extensions "subscribe" to topics they care about (e.g., `account:created`) and get notified when anyone "publishes" to that topic.

**Verification:** Extension A publishes `test.event` → Extension B receives it via `finance.events.on('test.event', handler)` → renderer also receives it.

- [ ] **Step N: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

## Stage 3 — Workspace & Memory

### Task 9: Full Grid Layout (3+ Panes, `version: 2`)

**What:** Replace the flat tab list with a VS Code-style `EditorGroup` model supporting 2x2 and 3-pane grids.

**Files to modify:**

- `src/renderer/components/workspace.ts` (rewrite)
- `src/renderer/components/split-pane.ts` (unimport → wire in)
- `src/renderer/components/tab-bar.ts` (update to work per-group)
- `src/renderer/styles/layout.css` (grid/splitter styles)
- `src/types/finance.d.ts` (add `WorkspaceLayout` types if needed)
- `src/main/services/webview-panel-manager.ts` (support multiple visible panels at once)

**Where the flat model lives today:**

- `workspace.ts` — `_tabs: Tab[]` + `_activePanelId`, persisted as `{ version: 1, tabs, activePanelId }`
- `split-pane.ts` — exists but unimported dead code with a 2-pane drag splitter
- Layout stored in `localStorage['core.workspace.layout']`

**Implementation approach:**

1. Define `version: 2` layout shape:

   ```ts
   interface EditorGroup {
     id: string;
     tabs: Tab[];
     activePanelId: string;
   }
   interface PersistedLayoutV2 {
     version: 2;
     groups: EditorGroup[];
     activeGroupId: string;
   }
   ```

2. Rewrite `workspace.ts`:
   - Root renders a flex row of `EditorGroup` components (each is a column or row, depending on split direction)
   - Each group has its own tab strip + content area
   - Dragging a tab to the edge of another group splits it (inserts a new group)
   - Closing the last tab in a group removes the group and merges its space back
3. Migration: on startup, if `version: 1` → wrap in a single `EditorGroup` and bump to `version: 2`
4. `webview-panel-manager.ts`: `show(panelId)` now shows the panel in its group's content area; `hide()` hides panels in non-active groups (optional: lazy-unmount off-screen groups)

**Easy analogy:** Like VS Code's editor groups — drag a tab to the right edge → split into two side-by-side panes, each with its own tab strip.

**Verification:** Drag Pay History tab to right edge → 2-pane split. Drag again → 3-pane. Close middle pane → remaining panes expand. Restart → layout persists.

- [ ] **Step N: Write unit tests for grid layout**

  New tests in `tests/unit/renderer/workspace.test.ts`:
  - `migrates version 1 layout to version 2` — verifies a `{ version: 1, tabs, activePanelId }` layout is wrapped in a single `EditorGroup` and bumped to `version: 2` on startup
  - `renders multiple editor groups` — verifies `render()` produces one group per entry in `groups[]`, each with its own tab strip
  - `drag-to-edge creates a new group` — verifies dragging a tab to the right edge of another group inserts a split and creates a new `EditorGroup`
  - `closing last tab in a group removes the group` — verifies the group is removed and remaining groups expand to fill the space
  - `persists and restores multi-group layout` — verifies the layout round-trips through `localStorage['core.workspace.layout']` without losing group structure

  Run: `npm run test -- tests/unit/renderer/workspace.test.ts`
  Expected: All new tests pass; existing workspace tests still pass.

- [ ] **Step N+1: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

### Task 10: `host.shutdown` Graceful Draining

**What:** Instead of a 1-second hard-kill, drain pending JSON-RPC requests before shutting down the Host.

**Files to modify:**

- `src/main/services/extension-ipc.ts` (modify `stop()` method)
- `src/extension-host/host.ts` (add graceful drain handler)

**Current behavior:**

- `main.ts` line 939: `app.on("will-quit", shutdownPersistence)`
- `shutdownPersistence()` calls `extensionIPC?.stop()` which sends `host.shutdown` then 1-second timeout then `host.kill`
- Host exits immediately on `host.shutdown` — any in-flight RPC requests are abandoned

**Implementation approach:**

1. In `extension-ipc.ts` `stop()`:
   - Set `shuttingDown = true`
   - Send `host.shutdown`
   - Wait for Host to acknowledge (new `host.shutdown.complete` message)
   - If no ack within 3 seconds → hard-kill (current behavior as fallback)
2. In `host.ts`:
   - On `host.shutdown`: finish processing current request, then send `host.shutdown.complete`
   - Reject new requests with "shutting down" error

**Verification:** Run a long-running extension command → quit app → Host finishes the request → exits cleanly within 3s.

- [ ] **Step N: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

### Task 11: Lazy Unmount Timer Config + Memory Pooling

**What:** Auto-unmount inactive panels after a configurable timeout, with dirty-state protection.

**Files to modify:**

- `src/main/services/webview-panel-manager.ts` (add lazy-unmount loop)
- `src/main/services/settings-service.ts` (register `core.workspace.lazyUnmountTimeout` setting)
- `src/renderer/components/workspace.ts` (optional: show "tab asleep" indicator)

**Current state:**

- `webview-panel-manager.ts` has `dirtyPanelIds: Set<string>` but no timer consults it
- `destroyAll()` exists for app quit but not for runtime unmount
- `autoSaveDraft` timeout is hardcoded 500ms

**Implementation approach:**

1. Add `startLazyUnmountTimer()` / `stopLazyUnmountTimer()` to `WebviewPanelManager`:
   - Every 30 seconds, iterate open panels
   - Skip dirty panels (`dirtyPanelIds.has(panelId)`)
   - Skip panels with `keepAlive: true` (from manifest, future-proofing)
   - Unmount panels inactive > `core.workspace.lazyUnmountTimeout` (default 5 min)
   - On unmount: call `autoSaveDraft` + `onBeforeUnmount` callbacks, then `view.destroy()`
2. Restart the timer on any panel activity (focus, mount, `panel:resize`)
3. In `workspace.ts`, if a tab's panel was lazy-unmounted, show a "click to restore" placeholder

**Verification:** Open 3 tabs → switch away from tab 2 → wait 5 min → tab 2's panel is destroyed → click tab 2 → panel remounts.

- [ ] **Step N: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

## Stage 4 — Extension Experience

### Task 12: `autoSaveDraft` Timeout Configurable

**What:** Make the 500ms `autoSaveDraft` timeout a user/extension setting.

**Files to modify:**

- `src/main/services/webview-panel-manager.ts` (read from settings instead of hardcoded 500)
- `src/types/finance.d.ts` (document the setting key)

**Current:** `Promise.race([autoSaveDraft(), timeout(500)])` in `webview-panel-manager.ts`

**Implementation:** Replace `500` with `getSetting<number>('core.workspace.autoSaveTimeout') ?? 500`. No UI needed — extensions can set it via `finance.settings.set`.

- [ ] **Step N: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

### Task 13: Per-Extension `keepAlive` Hint

**What:** Let extensions opt out of lazy unmount.

**Files to modify:**

- `src/extension-host/manifest-schema.ts` (add `keepAlive: z.boolean().optional()` to manifest)
- `src/main/services/webview-panel-manager.ts` (check manifest flag before unmounting)
- `src/main/services/extension-loader.ts` (pass manifest to panel manager)

**Implementation:** Extension adds `"keepAlive": true` to its `financeExtension` block → panel never auto-unmounts.

- [ ] **Step N: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

### Task 14: Wildcard `ui-event` Flag

**What:** Let extensions declare `"wildcard: true"` in `allowedUiEvents` to accept any event name without enumerating them all.

**Files to modify:**

- `src/extension-host/manifest-schema.ts` (allow `wildcard` in `allowedUiEvents` schema)
- `src/main/services/ui-event-allowlist.ts` (check wildcard flag before set lookup)

**Implementation:**

```ts
// In manifest:
"allowedUiEvents": ["*"]  // or keep explicit list
// In allowlist check:
  if (manifest.allowedUiEvents.wildcard) return true;
  ```

- [ ] **Step N: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

### Task 15: `onStartupAfterReady` Activation Event

**What:** New activation event for extensions that need to delay their UI mount until after data loads.

**Files to modify:**

- `src/extension-host/manifest-schema.ts` (add `onStartupAfterReady` to `ActivationEvent` enum)
- `src/extension-host/host.ts` (emit new event after `host.ready` + extensions activated)
- `src/main/main.ts` (handle new event, activate after default view mounts)

**Current `onStartup`:** activates extensions immediately after Host is ready, before the window is fully painted.

**New `onStartupAfterReady`:** activates after the default view's panel is mounted and first paint is done. Use case: an extension that needs to load remote data before showing its UI.

- [ ] **Step N: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

### Task 16: VS Code-Style Tree Views / NavigationProvider Callback API

**What:** Let extensions provide dynamic, context-sensitive navigation trees instead of static `navigation` arrays.

**Files to modify:**

- `src/renderer/components/navigation-panel.ts` (add tree view renderer)
- `src/types/finance.d.ts` (add `TreeViewProvider` API)
- `src/extension-host/api/navigation.ts` (new)
- `src/extension-host/api/index.ts` (add `navigation` to `FinanceApi`)
- `src/preload/preload.ts` (expose tree view events)

**Implementation approach:**

1. Add `finance.navigation.registerTreeView(id, provider)` to the Host API:

   ```ts
   interface TreeViewProvider {
     getChildren(elementId?: string): Promise<TreeNode[]>;
     onDidChangeTreeData?: (callback: (elementId: string) => void) => void;
   }
   ```

2. In `navigation-panel.ts`:
   - If active extension has registered a tree view → render collapsible tree
   - If static `navigation` array → render current flat list (fallback)
3. Tree nodes support: expand/collapse, click → command, badge counts, icon

**Easy analogy:** Like VS Code's Explorer panel — collapsible folders with files inside, not just a flat list of links.

- [ ] **Step N: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

## Stage 5 — Developer Experience

### Task 17: Typed DAO Generation from Manifest Schemas

**What:** Generate TypeScript types from manifest table declarations so extensions get compile-time type safety.

**Files to modify:**

- `src/types/finance.d.ts` (add generated types)
- `src/extension-host/api/db.ts` (add `typedTable<T>()` method)
- `src/main/services/table-schema-registry.ts` (emit TypeScript declaration files)

**Current:** `finance.db.table('salary_history_pay_slips').find({})` returns `Row[]` — you have to know the column names by heart.

**After:** `finance.db.typedTable<SalaryHistoryPaySlip>('salary_history_pay_slips').find({})` returns `SalaryHistoryPaySlip[]` with full type inference.

**Implementation approach:**

1. After manifest validation, write a `.d.ts` file per extension to `dist/extensions/<id>.d.ts`
2. The file exports interfaces matching the declared table columns
3. Extensions import their own types: `import type { SalaryHistoryPaySlip } from './extensions/salary-history.d.ts'`
4. Add `finance.db.typedTable<T>(name)` alongside the existing `finance.db.table(name)`

- [ ] **Step N: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

### Task 18: Drag-and-Drop Reorder + Versioned Settings

**What:** Add drag-and-drop to the navigation panel and settings UI; version settings to support migrations.

**Files to modify:**

- `src/renderer/components/navigation-panel.ts` (add drag handles + reorder logic)
- `src/renderer/components/settings-screen.ts` (drag reorder for `dashboard.cardOrder`)
- `src/main/services/settings-service.ts` (add version tracking + migration hooks)

**Implementation approach:**

1. Navigation panel: add `draggable` attribute + drag handlers to nav items; reorder the underlying `navigation` contribution array on drop
2. Settings screen: for `type: 'object'` settings like `dashboard.cardOrder` (array), render as a draggable list
3. Settings versioning: store `_version` per key; on read, if version < current, run migration function (future-proofs schema changes)

- [ ] **Step N: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

### Task 19: Real Component Library Integration

**What:** Add Storybook or Histoire for visual component development.

**Files to modify:**

- `package.json` (add dev dependency)
- `src/renderer/components/` (add `.stories.ts` files alongside each component)

**Implementation:** Add Storybook for Lit. This is a developer productivity tool — it doesn't change the app's behavior. Each component gets a `.stories.ts` file showing its different states (default, hover, active, disabled).

- [ ] **Step N: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

### Task 20: ESM-Friendly Production Source-Map Stripping

**What:** Strip source maps from production bundles to reduce file size and hide source code.

**Files to modify:**

- `vite.config.ts` + all 5 variant configs (set `build.sourcemap: false` for production)

**Current:** Vite emits sourcemaps by default in all modes.

**Implementation:** One-line change per Vite config: `sourcemap: mode === 'development'`.

- [ ] **Step N: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

### Task 21: Migration Runner Evaluation (Umzug)

**What:** Evaluate replacing the inline migration runner with Umzug.

**Files to modify:**

- `src/main/services/database-service.ts` (replace `registerMigration` + `migration_log` with Umzug)
- `src/main/services/infrastructure-migration.ts` (adapt to Umzug's `Migration` interface)
- All extension migration files (004–008) (adapt to Umzug format)

**Current:** Inline `registerMigration(name, up, down)` with `migration_log` table for idempotency.

**Why Umzug:** Provides up/down migrations, transaction wrapping, and a cleaner API. The current inline runner works but doesn't support down migrations.

**Implementation approach:**

1. Add `umzug` to dependencies
2. Replace `registerAllMigrations()` with Umzug's `createUmzug({ migrations: [...] })`
3. Run `umzug.up()` on startup instead of `initializeDatabase()`
4. Verify all 8 existing migrations still apply correctly

**Verification:** Fresh DB → all 8 migrations apply. Existing DB with migrations 001–004 applied → only 005–008 apply.

- [ ] **Step N: Typecheck + lint**

  Run: `npm run typecheck`
  Expected: PASS — no errors.

  Run: `npm run lint`
  Expected: PASS — no new errors.

---

## Execution Order

| Stage | Tasks | Duration | Rationale |
|---|---|---|---|
| **1** | 1, 1.5, 2, 2.5, 3, 4, 5 | 5–6 days | Settings UI, accounts, FY context, dashboard FY config, array modals, shortcuts, and theme propagation to panels |
| **2** | 6, 7, 8 | 4–5 days | Security (CSP), data safety (backup), and architecture (event bus) |
| **3** | 9, 10, 11 | 3.5–4.5 days | Workspace improvements + memory management |
| **4** | 12, 13, 14, 15, 16 | 3–4 days | Extension authoring experience improvements |
| **5** | 17, 18, 19, 20, 21 | 4.5–6 days | Developer tooling + polish |

**Total:** ~18–24 days

## Out of Scope for Phase 7

The following are deferred to Phase 8 or future:

- Extension Manager UI (runtime install/uninstall) → Phase 8
- Marketplace discovery + digital signing → Phase 8
- Typed SDK npm package → Phase 8
- AI Assistant (Ollama wiring) → Phase 6
- Row-level access control → future ADR
- Nested WebviewPanels → future
