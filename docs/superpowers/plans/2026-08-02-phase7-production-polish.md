---
title: Phase 7 — Production Readiness & Polish
date: 2026-08-02
last_updated: 2026-08-02T11:50:20+10:00
status: ready for implementation
target_version: 0.9.0
spec_source: docs/superpowers/specs/2026-06-13-implementation-design.md (Phase 7 section, lines 123-127)
---

# Phase 7 — Production Readiness & Polish

> **Goal:** Turn the working Phase 5 platform into a production-ready application with a generic settings UI, keyboard shortcuts, backup/restore, encryption, grid layouts, event bus, and developer polish. No new extensions are built in Phase 7 — the platform becomes stable enough that building extensions (Budget, Tax, Cash Flow, etc.) is straightforward after this phase.

---

## Prerequisites

- Phase 5 complete (`docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md` — status: `complete`)
- App boots, extensions load, Dashboard + Salary History functional
- `npm run test:unit` passes (404 tests)
- `npm run typecheck` exit 0
- `npm run lint` exit 0

---

## Stage 1 — Settings & Keyboard (User-Facing)

### Task 1: Generic Settings UI Renderer

**What:** Build the actual settings screen that reads each extension's `contributes.configuration` manifest and renders a form. Today the keys exist (`dashboard.cardOrder`, `salary-history.paygToleranceDollars`, etc.) but users have no UI to edit them.

**Files to modify:**
- `src/renderer/components/settings-screen.ts` (new)
- `src/renderer/index.ts` (wire settings screen into renderer)
- `src/preload/preload.ts` (expose `extensions.list()` if not already)
- `src/types/finance.d.ts` (ensure `ManifestConfigurationContribution` is exported)
- `src/extension-host/manifest-schema.ts` (reference only — schema already exists)

**Where the data lives today:**
- Manifest `contributes.configuration` is validated by `manifest-schema.ts` lines 33–42
- Settings are stored/retrieved via `finance.settings.get/set` (`src/main/services/settings-service.ts`)
- The preload bridge already exposes `financeShell.settings` to both renderer and panels

**Implementation approach:**
1. Create `settings-screen.ts` as a LitElement that:
   - Calls `window.financeShell.extensions.list()` to get all active extensions + their `configuration` arrays
   - Renders one section per extension, with form fields matching each config item's `type` (`string` → text input, `boolean` → toggle, `enum` → dropdown, `number` → number input, `object` → textarea with JSON validation)
   - Reads current values via `financeShell.settings.get(key)` on mount
   - Writes values via `financeShell.settings.set(key, value)` on change (debounced 300ms)
   - Shows the extension's `label` as the section header
2. Add a "Settings" Activity Bar button that opens this screen (replace the current hardcoded placeholder nav items in `navigation-panel.ts` lines 83–86)
3. Wire it into `renderer/index.ts` so clicking Settings mounts the screen in the workspace

**Easy analogy:** Think of it like VS Code's Settings screen — each extension declares "I have these settings with these types and defaults," and Core builds the form automatically.

**Verification:** Open Settings → see sections for Dashboard and Salary History → change `dashboard.cardOrder` or `salary-history.paygToleranceDollars` → restart app → value persists.

---

### Task 2: Keyboard Shortcut Customization

**What:** Make keyboard shortcuts actually work + add a screen to customize them.

**Files to modify:**
- `src/main/main.ts` (register Electron `Menu` shortcuts on startup)
- `src/renderer/index.ts` (replace hardcoded `keydown` listeners with centralized shortcut registry)
- `src/renderer/components/shortcuts-screen.ts` (new)
- `src/main/services/shortcut-registry.ts` (new)
- `src/types/finance.d.ts` (export `ManifestCommandContribution` with `keybinding`)

**Where shortcuts live today:**
- Manifest declarations: `manifest-schema.ts` line 24 (`keybinding: z.string().optional()`)
- Hardcoded renderer bindings: `renderer/index.ts` lines 253–278
- Salary History commands declare `Ctrl+Alt+H` and `Ctrl+Alt+R` in `extensions/salary-history/package.json`

**Implementation approach:**
1. Create `shortcut-registry.ts` in Main:
   - On app ready, scan all loaded extensions' manifests for `commands[].keybinding`
   - Build a `Map<string, { commandId, extensionId, accelerator }>`
   - Register each with Electron's `Menu` and `globalShortcut`
   - On shortcut press → look up command → route through existing `extensions:execute-command` IPC (allowlist-aware)
   - Expose `list()`, `update(extensionId, commandId, newAccelerator)`, `reset()` to renderer via IPC
2. Create `shortcuts-screen.ts` in renderer:
   - Table/list of all registered shortcuts
   - Click a shortcut → prompt for new key combo → call registry `update()` → persist to `finance.settings`
   - "Reset to defaults" button per extension
3. Remove the hardcoded `keydown` listeners in `renderer/index.ts` (lines 253–278)

**Easy analogy:** Like VS Code's Keyboard Shortcuts settings — a searchable list where you can rebind any command.

**Verification:** Open Shortcuts screen → see `Ctrl+Alt+H` for "View: Pay History" → rebind to `Ctrl+Shift+H` → press new combo → command executes.

---

## Stage 2 — Security & Data Integrity

### Task 3: Main Renderer `'unsafe-eval'` CSP Removal

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

---

### Task 4: Database Backup/Restore + Encryption

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
3. Wire into the Settings screen or as standalone commands (`core.backup.export`, `core.backup.import`)

**Easy analogy:** Like exporting a backup in 1Password or Bitwarden — a simple file you can store safely.

**Verification:** Export unencrypted → file is valid SQLite → import on fresh app → data intact. Export encrypted → password-protected → import with wrong password → error.

---

### Task 5: `finance.events.*` Global Event Bus

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

---

## Stage 3 — Workspace & Memory

### Task 6: Full Grid Layout (3+ Panes, `version: 2`)

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

---

### Task 7: `host.shutdown` Graceful Draining

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

---

### Task 8: Lazy Unmount Timer Config + Memory Pooling

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

---

## Stage 4 — Extension Experience

### Task 9: `autoSaveDraft` Timeout Configurable

**What:** Make the 500ms `autoSaveDraft` timeout a user/extension setting.

**Files to modify:**
- `src/main/services/webview-panel-manager.ts` (read from settings instead of hardcoded 500)
- `src/types/finance.d.ts` (document the setting key)

**Current:** `Promise.race([autoSaveDraft(), timeout(500)])` in `webview-panel-manager.ts`

**Implementation:** Replace `500` with `getSetting<number>('core.workspace.autoSaveTimeout') ?? 500`. No UI needed — extensions can set it via `finance.settings.set`.

---

### Task 10: Per-Extension `keepAlive` Hint

**What:** Let extensions opt out of lazy unmount.

**Files to modify:**
- `src/extension-host/manifest-schema.ts` (add `keepAlive: z.boolean().optional()` to manifest)
- `src/main/services/webview-panel-manager.ts` (check manifest flag before unmounting)
- `src/main/services/extension-loader.ts` (pass manifest to panel manager)

**Implementation:** Extension adds `"keepAlive": true` to its `financeExtension` block → panel never auto-unmounts.

---

### Task 11: Wildcard `ui-event` Flag

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

---

### Task 12: `onStartupAfterReady` Activation Event

**What:** New activation event for extensions that need to delay their UI mount until after data loads.

**Files to modify:**
- `src/extension-host/manifest-schema.ts` (add `onStartupAfterReady` to `ActivationEvent` enum)
- `src/extension-host/host.ts` (emit new event after `host.ready` + extensions activated)
- `src/main/main.ts` (handle new event, activate after default view mounts)

**Current `onStartup`:** activates extensions immediately after Host is ready, before the window is fully painted.

**New `onStartupAfterReady`:** activates after the default view's panel is mounted and first paint is done. Use case: an extension that needs to load remote data before showing its UI.

---

### Task 13: VS Code-Style Tree Views / NavigationProvider Callback API

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

---

## Stage 5 — Developer Experience

### Task 14: Typed DAO Generation from Manifest Schemas

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

---

### Task 15: Drag-and-Drop Reorder + Versioned Settings

**What:** Add drag-and-drop to the navigation panel and settings UI; version settings to support migrations.

**Files to modify:**
- `src/renderer/components/navigation-panel.ts` (add drag handles + reorder logic)
- `src/renderer/components/settings-screen.ts` (drag reorder for `dashboard.cardOrder`)
- `src/main/services/settings-service.ts` (add version tracking + migration hooks)

**Implementation approach:**
1. Navigation panel: add `draggable` attribute + drag handlers to nav items; reorder the underlying `navigation` contribution array on drop
2. Settings screen: for `type: 'object'` settings like `dashboard.cardOrder` (array), render as a draggable list
3. Settings versioning: store `_version` per key; on read, if version < current, run migration function (future-proofs schema changes)

---

### Task 16: Real Component Library Integration

**What:** Add Storybook or Histoire for visual component development.

**Files to modify:**
- `package.json` (add dev dependency)
- `src/renderer/components/` (add `.stories.ts` files alongside each component)

**Implementation:** Add Storybook for Lit. This is a developer productivity tool — it doesn't change the app's behavior. Each component gets a `.stories.ts` file showing its different states (default, hover, active, disabled).

---

### Task 17: ESM-Friendly Production Source-Map Stripping

**What:** Strip source maps from production bundles to reduce file size and hide source code.

**Files to modify:**
- `vite.config.ts` + all 5 variant configs (set `build.sourcemap: false` for production)

**Current:** Vite emits sourcemaps by default in all modes.

**Implementation:** One-line change per Vite config: `sourcemap: mode === 'development'`.

---

### Task 18: Migration Runner Evaluation (Umzug)

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

---

## Execution Order

| Stage | Tasks | Duration | Rationale |
|---|---|---|---|
| **1** | 1, 2 | 3–4 days | User-facing settings + shortcuts are the most visible Phase 7 features |
| **2** | 3, 4, 5 | 4–5 days | Security (CSP), data safety (backup), and architecture (event bus) |
| **3** | 6, 7, 8 | 3.5–4.5 days | Workspace improvements + memory management |
| **4** | 9, 10, 11, 12, 13 | 3–4 days | Extension authoring experience improvements |
| **5** | 14, 15, 16, 17, 18 | 4.5–6 days | Developer tooling + polish |

**Total:** ~18–24 days

## Out of Scope for Phase 7

The following are deferred to Phase 8 or future:

- Extension Manager UI (runtime install/uninstall) → Phase 8
- Marketplace discovery + digital signing → Phase 8
- Typed SDK npm package → Phase 8
- AI Assistant (Ollama wiring) → Phase 6
- Row-level access control → future ADR
- Nested WebviewPanels → future
