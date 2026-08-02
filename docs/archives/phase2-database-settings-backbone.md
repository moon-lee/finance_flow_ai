---
title: Phase 2 - Core Database & Settings Backbone
date: 2026-06-20
status: completed
completed: 2026-06-21
---

# Phase 2 — Core Database & Settings Backbone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Complete this milestone and wait for review before starting Phase 3.

**Goal:** Add SQLite database initialization, a namespaced settings service, and window-state persistence so the app boots and restores preferences (theme, AI panel state, window bounds) automatically. Phase 2 uses Electron's default `userData` location for `finance.db`; custom database directory/path selection is explicitly deferred.

**Architecture:** All database access lives in the Electron main process using `better-sqlite3` (native SQLite driver). The Settings Service wraps a `settings` SQLite table as a namespaced KV store, serializing values as JSON. A simple inline migration system tracks schema versions in a `migration_log` table. IPC handlers expose settings to the renderer through the secure preload bridge. The renderer loads persisted preferences after DOM content is ready and applies them (theme CSS class, AI panel collapsed state, status bar theme toggle). The main process resolves the database path through a small helper that currently returns `join(app.getPath('userData'), 'finance.db')`; a future bootstrap config file can be read there before SQLite is opened, avoiding the circular dependency of storing the database path inside the same database.

**Tech Stack:** better-sqlite3 (native SQLite), Vite (main process bundler with native module externalization), Lit (renderer components), Electron IPC (settings bridge).

---

## Architecture Decisions

### Decision 1: Inline Migrations Instead of Umzug

**Choice:** Define migrations as a typed array of `{ name, up }` objects with a simple runner that checks `migration_log` table.

**Reasoning:** Phase 2 creates exactly one migration (infrastructure tables). Umzug is useful for rollback and multi-version management but adds a dependency and configuration overhead for a single initial migration. The inline runner handles `CREATE TABLE IF NOT EXISTS` idempotently, applies each migration and its `migration_log` insert inside one SQLite transaction, and records each migration in the log table only after the migration succeeds. We can adopt Umzug in Phase 4 when extension schemas need versioned migrations.

**Trade-off:** Slightly more code to write now, but zero dependency overhead and trivial to replace later.

> Recorded as [ADR-0002](docs/decisions/0002-inline-migrations.md).

### Decision 2: Serialize Settings Values as JSON Strings

**Choice:** Store all setting values as JSON text in a single TEXT column. TypeScript generics on `get<T>()` deserialize on read.

**Reasoning:** Supports booleans, numbers, strings, objects, and arrays without schema changes. The settings table is a simple KV store — lightweight and flexible for Phase 2's needs.

**Trade-off:** No per-key type enforcement at the DB layer. Zod validation is applied at the application boundary in later phases.

### Decision 3: Debounced Window State Persistence

**Choice:** Save window bounds on a 500ms debounced timer for `resize`/`move` events, plus a synchronous save on `close`.

**Reasoning:** Avoids hammering the DB with writes during active resizing. The debounce ensures the final steady-state position is saved, while the close handler guarantees no data loss.

**Trade-off:** If the process is killed (not closed), the last ~500ms of resize events may be lost. Acceptable for Phase 2.

### Decision 4: Theme via CSS Class on `<body>`

**Choice:** Define light-theme CSS variable overrides under `body.light-theme`. The renderer loads the persisted theme on startup and applies the class.

**Reasoning:** No JS framework overhead for theming. CSS custom properties cascade naturally. Switching themes is a single class toggle, and the persisted value is just `'dark'` or `'light'`.

**Trade-off:** All theme variables must be duplicated per theme. With only 2 themes (dark, light), this is manageable.

### Decision 5: Strict Namespace Enforcement at the Storage Layer

**Choice:** The Settings Service validates every key against a set of registered namespace prefixes. `core` is registered at startup. All keys must follow `namespace.key` format — bare keys are rejected. `undefined` values are rejected explicitly. `JSON.parse` failures return `undefined` instead of throwing. Phase 2 exposes only core settings through renderer IPC; future extension settings must use a caller-bound settings facade, not raw cross-namespace key access.

**Reasoning:** The project vision requires structural impossibility of cross-extension access (docs/project_vision.md:49-53). Service-level namespace validation prevents accidental bare or unknown keys in Phase 2. It is a foundation for isolation, not the complete extension security boundary; Phase 4 must bind each extension caller to its own namespace before exposing settings APIs to the extension host.

**Trade-off:** Slightly more code in the service, and one more facade will be needed when extensions arrive. That extra boundary keeps Phase 2 simple while avoiding the false guarantee that any caller holding `getSetting(key)` can be safely trusted with arbitrary namespaces.

---

## File Structure

```
src/
├── main/
│   ├── main.ts                            # Modified: init DB, settings, window state, IPC
│   └── services/
│       ├── database-service.ts             # New: SQLite connection, migration runner
│       └── settings-service.ts             # New: namespaced KV store over SQLite
├── preload/
│   └── preload.ts                         # Modified: add settings IPC methods
├── renderer/
│   ├── index.ts                           # Modified: load theme, AI state from settings
│   └── styles/
│       └── layout.css                     # Modified: add light-theme CSS variables, status-btn
└── types/
    └── finance-shell.d.ts                # Modified: add settings API types

tests/
├── unit/
│   └── services/
│       ├── database-service.test.ts       # New: DB init, migration edge cases
│       └── settings-service.test.ts       # New: KV get/set/delete, JSON round-trip
└── e2e/
    └── renderer-shell.spec.ts             # Modified: add settings IPC, theme tests
```

---

## Task 1: Install Database Dependencies

**Files:**
- Modify: `package.json`

- [x] **Step 1: Install better-sqlite3 and dev dependencies**

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3 vitest @electron/rebuild
```

- [x] **Step 2: Add rebuild and test scripts**

```bash
npm pkg set scripts.rebuild="electron-rebuild"
npm pkg set scripts.test:unit="vitest run"
npm pkg set scripts.test:unit:watch="vitest"
npm pkg set scripts.test="npm run test:unit"
```

> **Why the rebuild prefix?** `@electron/rebuild` (Task 1 step 1) compiles `better-sqlite3` against Electron's Node ABI. Vitest runs under the *system* Node. If there is a `NODE_MODULE_VERSION` mismatch error, developers can run `npm run rebuild` to recompile the native binary for Electron.

After running these commands, the following 4 scripts are **added** to `package.json` (all scripts from Phase 1 remain unchanged):

```json
{
  "scripts": {
    "test": "npm run test:unit",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "rebuild": "electron-rebuild"
  }
}
```

- [x] **Step 3: Verify better-sqlite3 works in Node.js**

```bash
node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)'); console.log('better-sqlite3 OK'); db.close();"
```

Expected output: `better-sqlite3 OK`

- [x] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add better-sqlite3, vitest, electron-rebuild"
```

---

## Task 2: Update Vite Main Config for Native Modules

**Files:**
- Modify: `vite.main.config.ts`

`better-sqlite3` is a native Node.js addon. Vite must not bundle it — it must remain an external require.

- [x] **Step 1: Add native modules to main process externals**

`vite.main.config.ts` — add `'better-sqlite3'` to the `external` array:

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/main',
    emptyOutDir: true,
    lib: {
      entry: 'src/main/main.ts',
      formats: ['es'],
      fileName: () => 'main.js'
    },
    rollupOptions: {
      external: ['electron', 'node:path', 'node:url', 'node:fs', 'better-sqlite3']
    }
  }
});
```

- [x] **Step 2: Commit**

```bash
git add vite.main.config.ts
git commit -m "chore: externalize better-sqlite3 from Vite main build"
```

---

## Task 3: Create Database Service

**Files:**
- Create: `src/main/services/database-service.ts`

- [x] **Step 1: Create database service with migration infrastructure**

`src/main/services/database-service.ts`:

```typescript
import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { existsSync, mkdirSync, renameSync } from 'node:fs';

// Phase 2 has no rollback requirement; the `down` callback is
// intentionally omitted from the interface to keep the surface area
// honest. Revisit this if Phase 7 needs DB downgrade support.
export interface Migration {
  name: string;
  up: (db: Database.Database) => void;
}

let db: Database.Database | null = null;
let migrations: Migration[] = [];

export function registerMigration(migration: Migration): void {
  if (migrations.some(m => m.name === migration.name)) return;
  migrations.push(migration);
}

export function initializeDatabase(dbPath: string): Database.Database {
  if (db) return db;

  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Open the database and recover only from open/health-check failures.
  // Migration failures are allowed to surface: treating a bad migration
  // as corruption could replace a valid user database unnecessarily.
  try {
    db = openDatabaseWithPragmas(dbPath);
  } catch (err) {
    db = recoverUnreadableDatabase(dbPath, err);
  }

  runMigrations(db);

  return db;
}

function openDatabaseWithPragmas(dbPath: string): Database.Database {
  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  const quickCheck = database.pragma('quick_check') as { quick_check: string }[];
  if (quickCheck[0]?.quick_check !== 'ok') {
    database.close();
    throw new Error(`SQLite quick_check failed for ${dbPath}`);
  }
  return database;
}

function recoverUnreadableDatabase(dbPath: string, cause: unknown): Database.Database {
  const corruptPath = `${dbPath}.corrupt-${Date.now()}`;
  console.error(
    `Database at ${dbPath} is unreadable; renaming to ${corruptPath} and starting fresh.`,
    cause
  );
  try {
    db?.close();
  } catch {
    // db may not have opened successfully; ignore.
  }
  db = null;
  if (existsSync(dbPath)) {
    renameSync(dbPath, corruptPath);
  }
  for (const suffix of ['-wal', '-shm']) {
    const sidecarPath = `${dbPath}${suffix}`;
    if (existsSync(sidecarPath)) {
      renameSync(sidecarPath, `${corruptPath}${suffix}`);
    }
  }
  return openDatabaseWithPragmas(dbPath);
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS migration_log (
      name TEXT PRIMARY KEY,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (database.prepare('SELECT name FROM migration_log ORDER BY name').all() as { name: string }[]).map(r => r.name)
  );

  const applyMigration = database.transaction((migration: Migration) => {
    migration.up(database);
    database.prepare('INSERT INTO migration_log (name) VALUES (?)').run(migration.name);
  });

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      applyMigration(migration);
      applied.add(migration.name);
    }
  }
}

export function getDatabase(): Database.Database {
  // Guard against both null (never initialised) and a closed handle
  // (e.g. after `closeDatabase` was called, or a double-init race
  // during HMR).
  if (!db || !db.open) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

- [x] **Step 2: Commit**

```bash
git add src/main/services/database-service.ts
git commit -m "feat: add database service with inline migration runner"
```

---

## Task 4: Create Infrastructure Migration

**Files:**
- Create: `src/main/services/infrastructure-migration.ts`

- [x] **Step 1: Define the initial infrastructure migration**

`src/main/services/infrastructure-migration.ts`:

```typescript
import type { Migration } from './database-service';

export const infrastructureMigration: Migration = {
  name: '001-init-infrastructure',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS extension_registry (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        installed_at TEXT NOT NULL DEFAULT (datetime('now')),
        activated_at TEXT
      )
    `);
  }
};
```

- [x] **Step 2: Commit**

```bash
git add src/main/services/infrastructure-migration.ts
git commit -m "feat: add infrastructure migration (settings, extension_registry tables)"
```

---

## Task 5: Create Settings Service

**Files:**
- Create: `src/main/services/settings-service.ts`

- [x] **Step 1: Create the settings KV service with namespace enforcement**

`src/main/services/settings-service.ts`:

```typescript
import type Database from 'better-sqlite3';
import { getDatabase } from './database-service';

let db: Database.Database | null = null;

const registeredNamespaces = new Set<string>();

export function registerExtensionNamespace(namespace: string): void {
  if (!namespace || !/^[A-Za-z0-9-]+$/.test(namespace)) {
    throw new Error(`Namespace "${namespace}" is invalid. Use letters, numbers, or hyphens.`);
  }
  registeredNamespaces.add(namespace);
}

function validateKey(key: string): void {
  const dotIndex = key.indexOf('.');
  if (dotIndex === -1) {
    throw new Error(
      `Settings key "${key}" has no namespace prefix. ` +
      `Keys must follow the format "namespace.localKey"`
    );
  }
  const namespace = key.substring(0, dotIndex);
  const localKey = key.substring(dotIndex + 1);
  if (!localKey) {
    throw new Error(`Settings key "${key}" has an empty local key.`);
  }
  if (!registeredNamespaces.has(namespace)) {
    throw new Error(
      `Settings namespace "${namespace}" is not registered. ` +
      `Call registerExtensionNamespace("${namespace}") first.`
    );
  }
}

export function initializeSettings(): void {
  db = getDatabase();
  registeredNamespaces.add('core');
}

export function getSetting<T = string>(key: string): T | undefined {
  if (!db) throw new Error('Settings not initialized. Call initializeSettings() first.');
  validateKey(key);
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined;
  if (!row) return undefined;
  return parseStoredValue(row.value) as T;
}

function parseStoredValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function setSetting(key: string, value: unknown): void {
  if (!db) throw new Error('Settings not initialized. Call initializeSettings() first.');
  if (value === undefined) {
    throw new Error(
      `Cannot set undefined value for settings key "${key}". ` +
      `Use deleteSetting() to remove a key.`
    );
  }
  validateKey(key);
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error(`Cannot serialize settings key "${key}".`);
  }
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, serialized);
}

export function deleteSetting(key: string): void {
  if (!db) throw new Error('Settings not initialized. Call initializeSettings() first.');
  validateKey(key);
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

export function closeSettings(): void {
  db = null;
  registeredNamespaces.clear();
}

export function getSettings(namespace: string): Record<string, unknown> {
  if (!db) throw new Error('Settings not initialized. Call initializeSettings() first.');
  if (!registeredNamespaces.has(namespace)) {
    throw new Error(`Settings namespace "${namespace}" is not registered.`);
  }
  const prefix = namespace + '.';
  const rows = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?')
    .all(prefix + '%') as { key: string; value: string }[];
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.key] = parseStoredValue(row.value);
  }
  return result;
}
```

- [x] **Step 2: Commit**

```bash
git add src/main/services/settings-service.ts
git commit -m "feat: add namespaced settings service with key validation"
```

---

## Task 6: Update Electron Main Process

**Files:**
- Modify: `src/main/main.ts`

This is the most involved task. The main process must:
1. Import and register the infrastructure migration
2. Initialize the database on app ready
3. Initialize settings
4. Create the window with saved bounds
5. Debounce window state saves on resize/move
6. Save state synchronously on close
7. Register settings IPC handlers

- [x] **Step 1: Rewrite `src/main/main.ts`**

Full file replacement:

```typescript
import { app, BrowserWindow, ipcMain, screen, dialog } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase, registerMigration, closeDatabase } from './services/database-service';
import { infrastructureMigration } from './services/infrastructure-migration';
import { initializeSettings, closeSettings, getSetting, setSetting } from './services/settings-service';

const mainDir = fileURLToPath(new URL('.', import.meta.url));
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;

let mainWindow: BrowserWindow | null = null;
let windowStateSaveTimer: ReturnType<typeof setTimeout> | null = null;
let dbClosed = false;

function resolvePreloadPath(): string {
  return join(mainDir, '../preload/preload.cjs');
}

function resolveRendererIndex(): string {
  return join(mainDir, '../renderer/index.html');
}

function resolveDatabasePath(): string {
  // Phase 2 keeps the database in Electron's default app data folder.
  // Future custom DB path support should read a tiny bootstrap config
  // here before SQLite opens; do not store the DB path only inside
  // the DB itself, because startup would not know which DB to open.
  return join(app.getPath('userData'), 'finance.db');
}

function clearWindowStateSaveTimer(): void {
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer);
    windowStateSaveTimer = null;
  }
}

function saveWindowState(): void {
  if (!mainWindow || dbClosed) return;
  const maximized = mainWindow.isMaximized();
  setSetting('core.window.maximized', maximized);
  if (!maximized) {
    const bounds = mainWindow.getBounds();
    setSetting('core.window.x', bounds.x);
    setSetting('core.window.y', bounds.y);
    setSetting('core.window.width', bounds.width);
    setSetting('core.window.height', bounds.height);
  }
}

function debouncedSaveWindowState(): void {
  if (dbClosed) return;
  clearWindowStateSaveTimer();
  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = null;
    saveWindowState();
  }, 500);
}

function resolveInitialBounds(): { width: number; height: number; x?: number; y?: number } {
  const width = getSetting<number>('core.window.width') ?? 1280;
  const height = getSetting<number>('core.window.height') ?? 820;
  const x = getSetting<number>('core.window.x');
  const y = getSetting<number>('core.window.y');

  // If no saved position, let Electron centre the window.
  if (x === undefined || y === undefined) {
    return { width, height };
  }

  // Validate that the saved rect intersects at least one currently
  // connected display work area. Otherwise the window would open
  // off-screen (e.g. saved on a monitor that is no longer attached).
  const intersects = screen.getAllDisplays().some(display => {
    const wa = display.workArea;
    return !(
      x + width <= wa.x ||
      x >= wa.x + wa.width ||
      y + height <= wa.y ||
      y >= wa.y + wa.height
    );
  });

  return intersects ? { width, height, x, y } : { width, height };
}

export async function createWindow(): Promise<BrowserWindow> {
  const bounds = resolveInitialBounds();
  const savedMaximized = getSetting<boolean>('core.window.maximized') ?? false;
  const theme = getSetting<string>('core.theme') ?? 'dark';
  const backgroundColor = theme === 'light' ? '#f8fafc' : '#1e1e1e';

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    ...(bounds.x !== undefined ? { x: bounds.x } : {}),
    ...(bounds.y !== undefined ? { y: bounds.y } : {}),
    minWidth: 960,
    minHeight: 640,
    backgroundColor: backgroundColor,
    title: 'Finance Flow AI',
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (savedMaximized) {
    mainWindow.maximize();
  }

  mainWindow.on('resize', debouncedSaveWindowState);
  mainWindow.on('move', debouncedSaveWindowState);
  mainWindow.on('close', () => {
    saveWindowState();
    clearWindowStateSaveTimer();
  });

  if (rendererDevUrl) {
    await mainWindow.loadURL(rendererDevUrl);
  } else {
    await mainWindow.loadFile(resolveRendererIndex());
  }

  return mainWindow;
}

function registerIpcHandlers(): void {
  ipcMain.handle('shell:get-version', () => app.getVersion());

  // Settings IPC handlers log service errors before returning them to
  // the renderer. `get` collapses to `undefined` because the renderer
  // treats it as "missing"; `set` rethrows so persistence failures are
  // visible to callers and tests.
  ipcMain.handle('settings:get', (_event, key: string) => {
    try {
      return getSetting(key);
    } catch (err) {
      console.error(`settings:get failed for key "${key}":`, err);
      return undefined;
    }
  });

  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    try {
      setSetting(key, value);
    } catch (err) {
      console.error(`settings:set failed for key "${key}":`, err);
      throw err;
    }
  });

}

function shutdownPersistence(): void {
  dbClosed = true;
  clearWindowStateSaveTimer();
  closeSettings();
  closeDatabase();
}

registerMigration(infrastructureMigration);
registerIpcHandlers();

app.whenReady().then(() => {
  try {
    const dbPath = resolveDatabasePath();
    initializeDatabase(dbPath);
    initializeSettings();
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', shutdownPersistence);
```

- [x] **Step 2: Commit**

```bash
git add src/main/main.ts
git commit -m "feat: integrate DB, settings, window state persistence into main process"
```

---

## Task 7: Update Preload Bridge

**Files:**
- Modify: `src/preload/preload.ts`

- [x] **Step 1: Add settings IPC methods to preload bridge**

`src/preload/preload.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron';

const shellApi = {
  getVersion: async (): Promise<string> => ipcRenderer.invoke('shell:get-version') as Promise<string>,
  settings: {
    get: async (key: string): Promise<unknown> => ipcRenderer.invoke('settings:get', key),
    set: async (key: string, value: unknown): Promise<void> => { await ipcRenderer.invoke('settings:set', key, value); }
  }
};

contextBridge.exposeInMainWorld('financeShell', shellApi);
```

- [x] **Step 2: Commit**

```bash
git add src/preload/preload.ts
git commit -m "feat: add settings IPC methods to preload bridge"
```

---

## Task 8: Update Type Declarations

**Files:**
- Modify: `src/types/finance-shell.d.ts`

- [x] **Step 1: Add settings API interface**

`src/types/finance-shell.d.ts`:

```typescript
export interface SettingsApi {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
}

export interface FinanceShellApi {
  getVersion: () => Promise<string>;
  settings: SettingsApi;
}

declare global {
  interface Window {
    financeShell: FinanceShellApi;
  }
}
```

- [x] **Step 2: Commit**

```bash
git add src/types/finance-shell.d.ts
git commit -m "feat: add settings API to type declarations"
```

---

## Task 9: Add Light Theme CSS Variables

**Files:**
- Modify: `src/renderer/styles/layout.css`

- [x] **Step 1: Add light theme CSS variable overrides and status bar theme button**

Add after the `:root` block in `src/renderer/styles/layout.css`:

```css
body.light-theme {
  --activity-bar-bg: #f1f5f9;
  --sidebar-bg: #ffffff;
  --workspace-bg: #f8fafc;
  --panel-border: rgba(0, 0, 0, 0.08);
  --text-primary: #0f172a;
  --text-secondary: #475569;
}

body.light-theme #status-bar {
  color: #0f172a;
}

.status-btn {
  cursor: pointer;
  padding: 0 8px;
  border-radius: 3px;
  transition: background 0.15s ease;
}

.status-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

body.light-theme .status-btn:hover {
  background: rgba(0, 0, 0, 0.08);
}

.version-tag {
  margin-left: auto;
}
```

- [x] **Step 2: Commit**

```bash
git add src/renderer/styles/layout.css
git commit -m "feat: add light theme CSS variables and status bar theme toggle style"
```

---

## Task 10: Update Renderer for Persistence

**Files:**
- Modify: `src/renderer/index.ts`

- [x] **Step 1: Load persisted state and add theme toggle on DOMContentLoaded**

`src/renderer/index.ts` — full replacement:

```typescript
import './components/activity-bar';
import './components/navigation-panel';
import './components/workspace';
import './components/ai-panel';
import './components/command-palette';

const app = document.querySelector<HTMLElement>('#app');
const commandPalette = document.querySelector<HTMLElement & { focusInput(): void }>('#command-palette');
const navigationPanel = document.querySelector<HTMLElement & { setView(view: string): void }>('#navigation-panel');

function setCommandPaletteVisible(visible: boolean): void {
  commandPalette?.classList.toggle('hidden', !visible);
  if (visible) {
    commandPalette?.focusInput();
  }
}

function toggleAiPanel(): void {
  app?.classList.toggle('ai-collapsed');
  void window.financeShell?.settings.set('core.ui.aiCollapsed', app?.classList.contains('ai-collapsed'));
}

async function applyTheme(theme: unknown): Promise<void> {
  // Defensive: the DB could contain a non-string for "core.theme" if
  // a future migration wrote one. Fall back to dark for any value
  // other than the literal string "light" rather than corrupting UI
  // state. Accepting `unknown` here forces callers to drop unchecked
  // casts at the IPC boundary.
  if (theme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
}

async function toggleTheme(): Promise<void> {
  const isLight = document.body.classList.toggle('light-theme');
  await window.financeShell?.settings.set('core.theme', isLight ? 'light' : 'dark');
}

window.addEventListener('click', (event) => {
  if (commandPalette && !commandPalette.classList.contains('hidden')) {
    const path = event.composedPath();
    if (!path.includes(commandPalette)) {
      setCommandPaletteVisible(false);
    }
  }
});

window.addEventListener('view-changed', (event: Event) => {
  const customEvent = event as CustomEvent<{ view: string }>;
  if (navigationPanel) {
    navigationPanel.setView(customEvent.detail.view);
  }
});

window.addEventListener('command-selected', (event: Event) => {
  const customEvent = event as CustomEvent<{ command: string }>;
  const cmd = customEvent.detail.command;
  if (cmd === 'toggle-ai') {
    toggleAiPanel();
  } else if (cmd === 'view-dashboard') {
    if (navigationPanel) {
      navigationPanel.setView('Dashboard');
    }
  }
  setCommandPaletteVisible(false);
});

window.addEventListener('DOMContentLoaded', async () => {
  const version = await window.financeShell?.getVersion() ?? 'dev-browser';

  // Load persisted theme
  const theme = await window.financeShell?.settings.get('core.theme');
  if (theme !== undefined) {
    await applyTheme(theme);
  }

  // Load persisted AI panel state — strict `=== true` so a non-boolean
  // truthy value (e.g. a string from a corrupt DB row) does not
  // silently collapse the panel.
  const aiCollapsed = await window.financeShell?.settings.get('core.ui.aiCollapsed');
  if (aiCollapsed === true) {
    app?.classList.add('ai-collapsed');
  }

  // Build status bar
  const statusBar = document.querySelector('#status-bar');
  if (statusBar) {
    // Theme toggle button
    const themeBtn = document.createElement('span');
    themeBtn.className = 'status-item status-btn';
    themeBtn.dataset.action = 'toggle-theme';
    themeBtn.textContent = document.body.classList.contains('light-theme') ? '☀ Light' : '🌙 Dark';
    themeBtn.addEventListener('click', async () => {
      await toggleTheme();
      themeBtn.textContent = document.body.classList.contains('light-theme') ? '☀ Light' : '🌙 Dark';
    });
    statusBar.appendChild(themeBtn);

    // Version tag
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

  if (event.key === 'Escape') {
    setCommandPaletteVisible(false);
  }
});
```

- [x] **Step 2: Commit**

```bash
git add src/renderer/index.ts
git commit -m "feat: add theme persistence, AI panel state restore, status bar theme toggle"
```

---

## Task 11: Write Unit Tests for Services

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/unit/services/database-service.test.ts`
- Create: `tests/unit/services/settings-service.test.ts`

- [x] **Step 1: Create Vitest config**

`vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts']
  }
});
```

- [x] **Step 2: Write database service unit test**

`tests/unit/services/database-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { initializeDatabase, closeDatabase, getDatabase, registerMigration } from '../../../src/main/services/database-service';

describe('DatabaseService', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'finance-flow-test-'));
    dbPath = join(tmpDir, 'test.db');
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes an in-memory-like file database', () => {
    const db = initializeDatabase(dbPath);
    expect(db).toBeDefined();
    expect(db.open).toBe(true);
  });

  it('creates the migration_log table on init', () => {
    initializeDatabase(dbPath);
    const db = getDatabase();
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migration_log'").get();
    expect(result).toBeDefined();
  });

  it('runs registered migrations', () => {
    registerMigration({
      name: 'test-migration',
      up: (db) => {
        db.exec('CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY)');
      }
    });
    initializeDatabase(dbPath);
    const db = getDatabase();
    const logged = db.prepare("SELECT name FROM migration_log WHERE name = 'test-migration'").get() as { name: string } | undefined;
    expect(logged?.name).toBe('test-migration');
  });

  it('does not re-run already applied migrations', () => {
    let runCount = 0;
    registerMigration({
      name: 'count-migration',
      up: () => { runCount++; }
    });
    initializeDatabase(dbPath);
    closeDatabase();
    initializeDatabase(dbPath);
    expect(runCount).toBe(1);
  });

  it('throws if getDatabase is called before init', () => {
    expect(() => getDatabase()).toThrow('Database not initialized');
  });

  it('sets WAL journal mode', () => {
    initializeDatabase(dbPath);
    const db = getDatabase();
    const pragma = db.pragma('journal_mode') as { journal_mode: string }[];
    expect(pragma[0].journal_mode).toBe('wal');
  });
});
```

- [x] **Step 3: Write settings service unit test with namespace enforcement**

`tests/unit/services/settings-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { initializeDatabase, closeDatabase, getDatabase, registerMigration } from '../../../src/main/services/database-service';
import {
  initializeSettings, closeSettings, getSetting, setSetting, deleteSetting, getSettings,
  registerExtensionNamespace
} from '../../../src/main/services/settings-service';
import { infrastructureMigration } from '../../../src/main/services/infrastructure-migration';

describe('SettingsService', () => {
  let tmpDir: string;

  beforeAll(() => {
    registerMigration(infrastructureMigration);
  });

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'finance-flow-test-'));
    initializeDatabase(join(tmpDir, 'test.db'));
    initializeSettings();
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- Basic CRUD ---

  it('stores and retrieves a string value', () => {
    setSetting('core.test', 'hello');
    expect(getSetting('core.test')).toBe('hello');
  });

  it('stores and retrieves a number value', () => {
    setSetting('core.num', 42);
    expect(getSetting<number>('core.num')).toBe(42);
  });

  it('stores and retrieves a boolean value', () => {
    setSetting('core.flag', true);
    expect(getSetting<boolean>('core.flag')).toBe(true);
  });

  it('stores and retrieves an object value', () => {
    const obj = { a: 1, b: 'two' };
    setSetting('core.obj', obj);
    expect(getSetting<typeof obj>('core.obj')).toEqual(obj);
  });

  it('returns undefined for non-existent keys', () => {
    expect(getSetting('core.nonexistent')).toBeUndefined();
  });

  it('overwrites existing values', () => {
    setSetting('core.key', 'first');
    setSetting('core.key', 'second');
    expect(getSetting('core.key')).toBe('second');
  });

  it('deletes a key', () => {
    setSetting('core.key', 'value');
    deleteSetting('core.key');
    expect(getSetting('core.key')).toBeUndefined();
  });

  // --- Namespace enforcement ---

  it('rejects keys without a namespace prefix', () => {
    expect(() => setSetting('barekey', 'x')).toThrow('no namespace prefix');
    expect(() => getSetting('barekey')).toThrow('no namespace prefix');
    expect(() => deleteSetting('barekey')).toThrow('no namespace prefix');
  });

  it('rejects keys with an unregistered namespace', () => {
    expect(() => setSetting('unknown.key', 'x')).toThrow(
      'namespace "unknown" is not registered'
    );
  });

  it('allows keys after registering a custom namespace', () => {
    registerExtensionNamespace('budget');
    setSetting('budget.monthlyLimit', 2000);
    expect(getSetting<number>('budget.monthlyLimit')).toBe(2000);
  });

  it('registerExtensionNamespace rejects invalid namespaces', () => {
    expect(() => registerExtensionNamespace('a.b')).toThrow('is invalid');
  });

  // --- getSettings(namespace) ---

  it('getSettings returns only keys for the requested namespace', () => {
    setSetting('core.a', 1);
    setSetting('core.b', 2);
    registerExtensionNamespace('budget');
    setSetting('budget.x', 99);

    const coreVals = getSettings('core');
    expect(coreVals).toEqual({ 'core.a': 1, 'core.b': 2 });
    expect(coreVals).not.toHaveProperty('budget.x');
  });

  it('getSettings rejects unregistered namespace', () => {
    expect(() => getSettings('unknown')).toThrow('is not registered');
  });

  it('getSettings returns empty object when namespace has no keys', () => {
    registerExtensionNamespace('empty');
    expect(getSettings('empty')).toEqual({});
  });

  // --- Edge cases ---

  it('rejects undefined value with explicit error', () => {
    expect(() => setSetting('core.key', undefined)).toThrow(
      'Cannot set undefined value'
    );
  });

  it('returns undefined for malformed JSON in DB', () => {
    const db = getDatabase();
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('core.badjson', '{invalid');
    const result = getSetting('core.badjson');
    expect(result).toBeUndefined();
  });

  it('getSettings returns undefined for malformed JSON in DB', () => {
    const db = getDatabase();
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('core.badjson', '{invalid');
    expect(getSettings('core')).toHaveProperty('core.badjson', undefined);
  });

  it('throws if settings are not initialized', () => {
    closeSettings();
    expect(() => getSetting('core.key')).toThrow('Settings not initialized');
  });
});
```

- [x] **Step 4: Run unit tests and verify they pass**

```bash
npx vitest run
```

Expected: All tests pass (database-service: 6 tests, settings-service: 18 tests; 24 total). The `test:unit` script rebuilds `better-sqlite3` for the Node ABI before invoking Vitest (see Task 1 step 2 for rationale); the rebuild is silent and a no-op when the binary already matches.

- [x] **Step 5: Commit**

```bash
git add vitest.config.ts tests/unit/services/database-service.test.ts tests/unit/services/settings-service.test.ts
git commit -m "test: add unit tests for database and namespaced settings services"
```

---

## Task 12: Update E2E Tests

**Files:**
- Modify: `tests/e2e/renderer-shell.spec.ts`

- [x] **Step 1: Add E2E test for theme toggle UI**

`tests/e2e/renderer-shell.spec.ts` — full replacement:

```typescript
import { expect, test } from '@playwright/test';

test.describe('Phase 1 renderer shell', () => {
  test('displays the core shell regions', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#activity-bar')).toBeVisible();
    await expect(page.locator('#navigation-panel')).toBeVisible();
    await expect(page.locator('#workspace')).toBeVisible();
    await expect(page.locator('#ai-panel')).toBeVisible();
    await expect(page.locator('#status-bar')).toBeVisible();
  });

  test('uses the expected grid shell layout', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app')).toHaveCSS('display', 'grid');
  });

  test('opens and closes the command palette', async ({ page }) => {
    await page.goto('/');
    const palette = page.locator('#command-palette');
    await expect(palette).toBeHidden();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
    await expect(palette).toBeVisible();
    await expect(palette.locator('input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });

  test('closes command palette on click outside', async ({ page }) => {
    await page.goto('/');
    const palette = page.locator('#command-palette');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
    await expect(palette).toBeVisible();
    await page.mouse.click(10, 10);
    await expect(palette).toBeHidden();
  });

  test('collapses and restores the AI panel', async ({ page }) => {
    await page.goto('/');
    const app = page.locator('#app');
    await expect(app).not.toHaveClass(/ai-collapsed/);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+J' : 'Control+J');
    await expect(app).toHaveClass(/ai-collapsed/);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+J' : 'Control+J');
    await expect(app).not.toHaveClass(/ai-collapsed/);
  });

  test('switches sidebar navigation on activity bar click', async ({ page }) => {
    await page.goto('/');
    const navPanel = page.locator('#navigation-panel');
    await expect(navPanel.locator('h2')).toHaveText('Explorer');
    await expect(navPanel.locator('.nav-title').first()).toHaveText('Dashboard');
    const salaryButton = page.locator('activity-bar button').nth(1);
    await salaryButton.click();
    await expect(navPanel.locator('.nav-title').first()).toHaveText('Salary');
    await expect(navPanel.locator('.nav-item').first()).toHaveText('Pay History');
  });
});

test.describe('Phase 2 settings and theme', () => {
  // Reset persisted settings before each test so test order does not
  // matter. Without this, the second test to run may see state left by
  // the first (e.g. light-theme persisted from a prior toggle).
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await window.financeShell.settings.set('core.theme', 'dark');
      await window.financeShell.settings.set('core.ui.aiCollapsed', false);
    });
    await page.reload();
  });

  test('displays theme toggle button in status bar', async ({ page }) => {
    await page.goto('/');
    const statusBar = page.locator('#status-bar');
    const themeBtn = statusBar.locator('.status-btn[data-action="toggle-theme"]');
    await expect(themeBtn).toBeVisible();
  });

  test('toggles theme when clicking status bar button', async ({ page }) => {
    await page.goto('/');
    const body = page.locator('body');
    const themeBtn = page.locator('.status-btn[data-action="toggle-theme"]');

    // Default is dark
    await expect(body).not.toHaveClass(/light-theme/);

    // Click to toggle to light
    await themeBtn.click();
    await expect(body).toHaveClass(/light-theme/);
    await expect(themeBtn).toContainText('Light');

    // Click to toggle back to dark
    await themeBtn.click();
    await expect(body).not.toHaveClass(/light-theme/);
    await expect(themeBtn).toContainText('Dark');
  });
});
```

- [x] **Step 2: Run lint/typecheck**

```bash
npm run typecheck
npm run lint
```

- [x] **Step 3: Commit**

```bash
git add tests/e2e/renderer-shell.spec.ts
git commit -m "test: add E2E tests for theme toggle and status bar button"
```

---

## Phase 2 Deliverable Verification

### Manual Test Units

#### Test Unit 1: Database Created on Startup

| Field | Detail |
|-------|--------|
| **How to test** | Build and run the app, then inspect the user data directory |
| **Steps** | 1. Run `npm run build && npm run start` |
| | 2. Open DevTools (`Ctrl+Shift+I`) — check console for errors |
| | 3. Close the app |
| | 4. Locate the database file at Electron's userData folder |
| **Expected result** | `finance.db` exists in `%APPDATA%/Finance Flow AI/` (Windows) or `~/Library/Application Support/Finance Flow AI/` (macOS) |

| Pass/Fail | Notes |
|-----------|-------|
| **PASS** | DB created at `C:\Users\Moon\AppData\Roaming\Finance Flow AI\finance.db` (28 KB after first checkpoint). Tables present: `extension_registry`, `migration_log`, `settings`. Migration `001-init-infrastructure` recorded at `2026-06-21 06:03:32`. WAL mode active. Dev-mode userData path required adding both `productName` in `package.json` and `app.setName('Finance Flow AI')` in `main.ts` — see [Post-release Fixes](#phase-2-post-release-fixes-v041) below. |

#### Test Unit 2: Theme Persists Across Restarts

| Field | Detail |
|-------|--------|
| **How to test** | Toggle theme, restart app, confirm theme is restored |
| **Steps** | 1. Launch the app |
| | 2. Click the theme toggle button in the status bar to switch to Light theme |
| | 3. Observe the UI switches to light colors |
| | 4. Close the app |
| | 5. Relaunch the app |
| **Expected result** | App starts in Light theme (white sidebar, dark text). Theme toggle button shows "☀ Light" |

| Pass/Fail | Notes |
|-----------|-------|
| **PASS** | Manual toggling from dark → light → dark across two restarts restored `core.theme` value each time. Final DB state showed `core.theme = "dark"` (last toggle). The strict `=== "light"` guard in `applyTheme()` falls back to dark for any non-string value, so a corrupted DB row never corrupts UI state. |

#### Test Unit 3: AI Panel State Persists Across Restarts

| Field | Detail |
|-------|--------|
| **How to test** | Collapse AI panel, restart app, confirm state is restored |
| **Steps** | 1. Launch the app |
| | 2. Press `Ctrl+J` to collapse the AI panel |
| | 3. Close the app |
| | 4. Relaunch the app |
| **Expected result** | The AI panel remains collapsed on startup. Pressing `Ctrl+J` restores it |

| Pass/Fail | Notes |
|-----------|-------|
| **PASS** | `Ctrl+J` collapses the AI panel; `core.ui.aiCollapsed` written to DB on every toggle. Restart restored the saved state. The renderer's `=== true` strict guard in `DOMContentLoaded` prevents a non-boolean truthy value (e.g. `"true"` string) from collapsing the panel by accident. |

#### Test Unit 4: Window Bounds Persist Across Restarts

| Field | Detail |
|-------|--------|
| **How to test** | Resize and move the window, restart, confirm bounds are restored |
| **Steps** | 1. Launch the app |
| | 2. Resize the window to ~1024x768 and move it to the top-left corner |
| | 3. Close the app (wait 500ms after resize for debounce to fire) |
| | 4. Relaunch the app |
| **Expected result** | Window opens at the same position (top-left) and size (1024x768) saved in step 2 |

| Pass/Fail | Notes |
|-----------|-------|
| **PASS** | 500 ms debounce + synchronous `close` save produced expected row set: `core.window.x`, `core.window.y`, `core.window.width`, `core.window.height`, `core.window.maximized`. Final observed values: `x=2084, y=111, width=1482, height=895`. Restart restored the window to those bounds. The `screen.getAllDisplays().some(...)` off-screen guard correctly refused to restore to a monitor that was no longer attached. |

#### Test Unit 5: Database Persists Between Sessions

| Field | Detail |
|-------|--------|
| **How to test** | Toggle theme, restart, toggle theme again, verify settings accumulate |
| **Steps** | 1. Launch and toggle to Light theme |
| | 2. Quit and relaunch (verify Light) |
| | 3. Toggle back to Dark theme |
| | 4. Quit and relaunch (verify Dark) |
| **Expected result** | Both theme transitions persist correctly. The settings table contains `core.theme`, `core.ui.aiCollapsed`, `core.window.x`, `core.window.y`, `core.window.width`, `core.window.height`, `core.window.maximized` keys (all namespaced under `core.`) |

| Pass/Fail | Notes |
|-----------|-------|
| **PASS** | All 7 keys present, all namespaced under `core.*`. Dumped via an ad-hoc Electron probe (no commit — probe scripts are intentionally ephemeral):<br><pre>=== settings table (7 rows) ===<br>  core.theme                   = "dark"<br>  core.ui.aiCollapsed          = false<br>  core.window.height           = 895<br>  core.window.maximized        = false<br>  core.window.width            = 1482<br>  core.window.x                = 2084<br>  core.window.y                = 111</pre>Namespace enforcement held: any attempt to `setSetting('barekey', ...)` or `setSetting('unknown.key', ...)` would have thrown (covered by 18 unit tests). |

#### Test Unit 6: Existing Tests Still Pass

| Field | Detail |
|-------|--------|
| **How to test** | Run all verification commands |
| **Steps** | 1. Run `npm run typecheck` — zero errors |
| | 2. Run `npm run lint` — zero warnings |
| | 3. Run `npm run test:unit` — 24 tests pass (6 database-service, 18 settings-service) |
| **Expected result** | TypeScript strict mode, ESLint, and Vitest all pass |

| Pass/Fail | Notes |
|-----------|-------|
| **PASS** | `npm run typecheck` — clean. `npm run lint` — `ESLint: No issues found` (required adding `.gitnexus/**` to the ignore list — generated GitNexus tool file was failing with `no-undef` on Node globals from a CommonJS runner). `npm run test:unit` — **25/25 pass** (6 database-service + 1 new regression test added in 0.4.1 + 18 settings-service). Test count differs from the plan's stated 24 because the 0.4.1 data-loss fix added `does not rename on open failure (no silent data loss)`. `npm run test:unit` and `npm start` now auto-rebuild `better-sqlite3` for their respective ABI (Node for vitest, Electron for the app); the manual rebuild dance described in early CHANGELOG entries is no longer required. |

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] SQLite database file connection initialization → Task 3, Task 6
- [x] Settings Service (basic Key-Value persistence for window state and theme; database path fixed to Electron `userData` for Phase 2) → Task 5, Task 6, Task 10
- [x] Infrastructure database schemas (extension_registry, migration_log) → Task 4
- [x] Deliverable: app boots and persists preferences → All tasks verified in manual tests
- [x] Theme persistence → Task 9, Task 10
- [x] Window state persistence → Task 6
- [x] Loading preferences on startup → Task 6 (window), Task 10 (theme, AI panel)
- [x] CHANGELOG.md updated per AGENTS.md Rule 5 → each task's commit message describes its change; aggregate changelog update is done in a final commit after all tasks complete

**2. Placeholder scan:** No TBD, TODOs, "implement later", or "add error handling" without code. Every step has complete code.

**3. Type consistency:** `settings.get` returns `Promise<unknown>`, `settings.set` accepts `(key: string, value: unknown)`. `FinanceShellApi` includes `settings: SettingsApi`. `registerExtensionNamespace` and `getSettings(namespace)` are internal to main process — not exposed via IPC. All keys follow `namespace.key` format. Consistent across Tasks 5, 7, 8, 10.

> **Agent:** Tick each checkbox above as you complete the corresponding task before running manual tests.

---

## Phase 2 Post-Release Fixes (v0.4.1)

Three follow-up fixes landed the same day Phase 2 was released, all from real-world verification on Windows. Each is documented in detail in the CHANGELOG under `## [0.4.1] - 2026-06-21`; the summaries below explain *why* the plan didn't anticipate them and what the plan would do differently next time.

### Fix 1: Data-loss in corrupt-DB recovery path — `database-service.ts`

**Symptom**: First `npm start` after `npm rebuild better-sqlite3` (which switches the native binary from Electron ABI → Node ABI for the test suite) failed with `NODE_MODULE_VERSION 137 vs 146`. The recovery path renamed the perfectly valid `finance.db` to `finance.db.corrupt-<ts>` before its own re-open also failed (still ABI mismatch), so no replacement DB was created. The user's DB survived only because the rename put it under a recognisable suffix and the `.corrupt-*` files weren't yet cleaned up.

**Root cause**: The plan's `openDatabaseWithPragmas` call sat inside a broad `try { ... } catch { recoverUnreadableDatabase(...) }` in `initializeDatabase`. Recovery was supposed to fire only on `quick_check` failure (genuine corruption) but the `try` also wrapped the `new Database(path)` call, so every environmental failure (ABI mismatch, permission denied, file locked) was treated as corruption and the file was renamed.

**Fix**: Split open from integrity check. The `try` now wraps only `verifyDatabaseIntegrity(database)` (a thin wrapper around `PRAGMA quick_check`). Open failures propagate with the real error and the file is untouched. Recovery runs only when `quick_check` returns anything other than `ok`.

**Plan lesson**: Plan author should have read the plan's own Decision 5 comment about "treating a bad migration as corruption could replace a valid user database unnecessarily" and applied the same principle to the open step. The comment was correct but the code didn't match it.

**Regression test added**: `tests/unit/services/database-service.test.ts > does not rename on open failure (no silent data loss)` — injects a stub `better-sqlite3` constructor that throws on `new Ctor(path)`, asserts the error propagates and that zero `.corrupt-*` files were created. Required adding `_setDatabaseConstructorForTesting(ctor)` injection point so the test can simulate native-module failures without rebuilding the binary.

**Function rename**: `recoverUnreadableDatabase` → `renameCorruptDatabase` to reflect the narrower trigger condition. The function no longer tries to re-open inline; `initializeDatabase` recurses.

### Fix 2: UserData path mismatch in dev mode — `package.json` + `main.ts`

**Symptom**: `app.getPath('userData')` resolved to `C:\Users\Moon\AppData\Roaming\Electron\` for `npm start` (unpackaged dev launches), but Test Unit 1's "Expected result" stated `%APPDATA%/Finance Flow AI/`. Same code, different paths depending on whether the app was packaged or not.

**Root cause**: Electron uses the `productName` from `package.json` for `app.getName()` only when the binary is packaged. For `electron dist/main/main.js` (unpackaged dev launch) it defaults to the literal string `"Electron"`. The plan only mentioned the production userData path, so this discrepancy slipped past plan review.

**Fix**: Two-line change, both required:
- Add `"productName": "Finance Flow AI"` to `package.json` (covers packaged launches).
- Call `app.setName('Finance Flow AI')` immediately after the imports in `src/main/main.ts` (covers unpackaged dev launches).

Together they make `app.getPath('userData')` resolve identically in both modes. Verified post-fix: `electron dist/main/main.js` now creates `Cache/`, `GPUCache/`, `Local Storage/`, and `finance.db` under `%APPDATA%/Finance Flow AI/`.

**Data migration**: The existing DB (orphaned at `%APPDATA%/Electron/finance.db` after the data-loss bug above) was moved into the new path. Schema and migration log preserved. Documented in CHANGELOG 0.4.1 Fixed entry.

**Plan lesson**: When a plan documents a path the user is expected to verify, the plan should either (a) cross-check both dev and prod behaviour, or (b) explicitly note which mode the path applies to.

### Fix 3: Automated ABI switching in npm scripts — `package.json`

**Symptom**: After `npm start` ran successfully (Electron ABI), the next `npm run test:unit` failed with `NODE_MODULE_VERSION 146 vs 137`. The plan's Test Unit 6 step 3 (`npm run test:unit`) never mentioned the prerequisite rebuild. Users running the manual test units hit this every time they alternated between Electron and vitest.

**Root cause**: Same ABI mismatch from Fix 1, but the recovery path was wrong here too — instead of an automated toggle, the plan asked users to remember to run `npm run rebuild` before Electron and `npm rebuild better-sqlite3` before vitest. That's not realistic.

**Fix**: Wire the rebuild into the scripts that need it. New scripts:
- `scripts.rebuild = electron-rebuild --force` (the `--force` flag bypasses electron-rebuild's "is already built" cache, which was silently no-op'ing on this WSL/Windows setup)
- `scripts.rebuild:test = npm rebuild better-sqlite3`
- `scripts.test:unit = npm run rebuild:test && vitest run` (auto-rebuild for Node ABI before vitest)
- `scripts.start = npm run build && npm run rebuild && electron dist/main/main.js` (auto-rebuild for Electron ABI before launch)

Cost: ~5–10 s rebuild per command invocation. Benefit: zero manual ABI dance; both `npm run test:unit` and `npm start` work unattended.

**Plan lesson**: When a plan introduces a native-module dependency that has multiple ABIs, the plan should either (a) include scripts that handle the toggle automatically from day one, or (b) explicitly call out the rebuild step in every test/install/run instruction.

### Summary of impact on the plan's success criteria

| Original criterion | Status | Evidence |
|---|---|---|
| SQLite database connection init | ✅ Met | Test Unit 1 (DB at `%APPDATA%/Finance Flow AI/finance.db`) |
| Settings Service (window, theme, DB path) | ✅ Met | Test Units 2, 4, 5 (all `core.*` keys persisted) |
| Infrastructure DB schemas | ✅ Met | Test Unit 1 probe (`extension_registry`, `migration_log`, `settings`) |
| App boots and persists preferences | ✅ Met | All 6 manual test units pass |
| Theme persistence | ✅ Met | Test Unit 2 |
| Window state persistence | ✅ Met | Test Unit 4 |
| Loading preferences on startup | ✅ Met | Test Units 2, 3, 4 |
| TypeScript strict, ESLint, Vitest | ✅ Met | Test Unit 6 (25/25 pass after the 0.4.1 regression test) |

All criteria satisfied. Phase 2 is **complete**. Per AGENTS.md Rule 4, awaiting review before starting Phase 3 (Extension Host & IPC Foundation — see `docs/superpowers/specs/2026-06-13-implementation-design.md`).

---


