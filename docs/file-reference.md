# File Reference

## Phase 1 — Core Shell Prototype

| File | Purpose |
|------|---------|
| `src/main/main.ts` | Electron bootstrap, window creation, IPC handler |
| `src/preload/preload.ts` | Secure `contextBridge` with allowlisted `shell:get-version` |
| `src/types/finance-shell.d.ts` | Window global types for preload API |
| `src/types/finance.d.ts` | Future extension API placeholder |
| `src/renderer/index.html` | Shell layout with 5 regions + command palette |
| `src/renderer/styles/layout.css` | Obsidian dark theme, CSS grid layout |
| `src/renderer/components/activity-bar.ts` | 5-button Activity Bar with view switching |
| `src/renderer/components/navigation-panel.ts` | Context-sensitive sidebar |
| `src/renderer/components/workspace.ts` | Tab bar + placeholder content |
| `src/renderer/components/ai-panel.ts` | Collapsible AI Assistant panel |
| `src/renderer/components/command-palette.ts` | Full keyboard-navigable command palette |
| `src/renderer/index.ts` | Keybindings, IPC version display, event wiring |
| `tests/e2e/renderer-shell.spec.ts` | 6 Playwright smoke tests (optional) |
| `vite.config.ts` | Renderer dev/build config |
| `vite.main.config.ts` | Main process build config |
| `vite.preload.config.ts` | Preload build config |
| `tsconfig.json` | TypeScript strict mode config |
| `eslint.config.js` | ESLint flat config |
| `playwright.config.ts` | Playwright E2E test config |

## Phase 2 — Core Database & Settings Backbone

| File | Status | Purpose |
|------|--------|---------|
| `package.json` | modified | Add `better-sqlite3` dep, `vitest` + `@electron/rebuild` devDeps, and `test` / `test:unit` / `test:unit:watch` / `rebuild` scripts |
| `vite.main.config.ts` | modified | Externalize `better-sqlite3` so the native addon is not bundled |
| `src/main/services/database-service.ts` | new | SQLite connection (`better-sqlite3`), inline migration runner, corrupt-DB recovery |
| `src/main/services/infrastructure-migration.ts` | new | Migration `001-init-infrastructure` creating `settings` and `extension_registry` tables |
| `src/main/services/settings-service.ts` | new | Namespaced KV store over SQLite with strict `namespace.key` validation and JSON serialization |
| `src/main/main.ts` | modified | Init DB + settings on `whenReady`, restore window bounds, debounced (500 ms) window-state persistence, settings IPC handlers |
| `src/preload/preload.ts` | modified | Expose `financeShell.settings.get` / `.set` over the `contextBridge` |
| `src/types/finance-shell.d.ts` | modified | Add `SettingsApi` and `FinanceShellApi.settings` typings on `window.financeShell` |
| `src/renderer/styles/layout.css` | modified | Add `body.light-theme` CSS variable overrides plus `.status-btn` / `.version-tag` styles |
| `src/renderer/index.ts` | modified | Load persisted theme + AI-panel state on `DOMContentLoaded`, wire status-bar theme toggle |
| `vitest.config.ts` | new | Vitest config scoped to `tests/unit/**/*.test.ts` |
| `tests/unit/services/database-service.test.ts` | new | DB init, migration idempotency, WAL pragma, get-before-init guard (6 tests) |
| `tests/unit/services/settings-service.test.ts` | new | KV CRUD, namespace enforcement, `getSettings(namespace)`, JSON / `undefined` edge cases (17 tests) |
| `tests/e2e/renderer-shell.spec.ts` | modified | Add status-bar theme toggle and `light-theme` class E2E tests |
