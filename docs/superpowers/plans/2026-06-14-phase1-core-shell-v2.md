---
title: Phase 1 - Core Shell Prototype
date: 2026-06-14
status: draft
---

# Phase 1 - Core Shell Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Complete this milestone and wait for review before starting Phase 2.

**Goal:** Build a bootable Electron application with a VS Code-inspired layout: Activity Bar, Navigation Panel, tabbed Workspace, collapsible AI Panel, Status Bar, and static Command Palette.

**Architecture:** Electron shell with separate main, preload, and renderer builds. The renderer has no Node.js access and is implemented with Lit web components. The preload bridge exposes only allowlisted shell events needed by the prototype.

**Tech Stack:** Electron, TypeScript strict mode, Lit, Vite, HTML, CSS, ESLint, Playwright (optional).

> **Step labels:** `[AI]` = AI/developer writes code. `[You]` = you run or test manually.

---

## Architecture Decisions

### Decision 1: Use Separate Vite Builds for Main, Preload, and Renderer

**Choice:** Build Electron main, preload, and renderer as separate outputs:

- `dist/main/main.js`
- `dist/preload/preload.cjs`
- `dist/renderer/index.html`

**Reasoning:** Electron has different runtime constraints for each process. Keeping outputs separate makes loading paths explicit, avoids accidental renderer access to Node/Electron APIs, and reduces packaging rework in later milestones.

**Alternatives considered:**

- Single Vite config with multiple entries: simpler initially, but harder to control preload output format and renderer HTML output cleanly.
- Hand-written TypeScript compilation for main/preload: workable, but introduces a second build style beside Vite.

**Trade-off:** Slightly more configuration in Phase 1, but much less ambiguity around Electron startup and security boundaries.

### Decision 2: Manual Verification with Optional Playwright Smoke Tests

**Choice:** Use manual test units as the primary verification approach. Playwright test files are created alongside the source code for future use, but running them is optional and deferred to the user's discretion.

**Reasoning:** Phase 1 is a visual shell prototype with no backend logic, database, or extension host. Manual testing provides full coverage of the Electron boot path, layout rendering, keyboard shortcuts, and IPC bridge — all from a single `npm run start` command. Playwright files are kept in the codebase so they can be activated later without rewriting (e.g., if CI is added or regression coverage is needed).

**Alternatives considered:**

- Full automated Playwright from day one: stronger coverage, but over-engineered for a static layout prototype.
- No Playwright at all: simpler, but would require recreating test infrastructure from scratch if needed later.

**Trade-off:** Human effort per change is slightly higher during Phase 1, but the Playwright infrastructure is ready to use with `npm run test:e2e` whenever automated testing becomes valuable.

### Decision 3: Keep the Preload API Minimal and Allowlisted

**Choice:** Expose a narrow `financeShell` API with explicit events instead of generic `send(channel)` and `on(channel)` methods.

**Reasoning:** Even a prototype should not normalize arbitrary IPC channel access. Starting with an allowlisted bridge keeps the app aligned with the privacy and security goals before database or extension capabilities exist.

**Alternatives considered:**

- Generic `financeAPI.send/on`: faster to write, but too permissive and likely to be copied into later phases.
- No preload bridge in Phase 1: secure, but fails to prove the intended renderer/main boundary.

**Trade-off:** A little more boilerplate, but safer defaults.

---

## File Structure

```text
finance-flow-ai/
|-- package.json
|-- tsconfig.json
|-- eslint.config.js
|-- vite.config.ts              # Renderer dev/build config
|-- vite.main.config.ts         # Main process build config
|-- vite.preload.config.ts      # Preload build config
|-- playwright.config.ts
|-- src/
|   |-- main/
|   |   `-- main.ts
|   |-- preload/
|   |   `-- preload.ts
|   |-- renderer/
|   |   |-- index.html
|   |   |-- index.ts
|   |   |-- styles/
|   |   |   `-- layout.css
|   |   `-- components/
|   |       |-- activity-bar.ts
|   |       |-- navigation-panel.ts
|   |       |-- workspace.ts
|   |       |-- ai-panel.ts
|   |       `-- command-palette.ts
|   `-- types/
|       |-- finance-shell.d.ts
|       `-- finance.d.ts
`-- tests/
    `-- e2e/
        `-- renderer-shell.spec.ts
```

---

## Task 1: Initialize Project Structure

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `vite.config.ts`
- Create: `vite.main.config.ts`
- Create: `vite.preload.config.ts`

- [ ] **[AI] Step 1: Initialize npm project**

```bash
npm init -y
npm pkg set type="module"
npm pkg set main="dist/main/main.js"
```

- [ ] **[AI] Step 2: Install dependencies**

```bash
npm install lit
npm install -D typescript vite electron @types/node
npm install -D concurrently wait-on cross-env nodemon
npm install -D eslint @eslint/js typescript-eslint globals
npm install -D @playwright/test
```

- [ ] **[AI] Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "rootDir": ".",
    "outDir": "./dist",
    "declaration": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"]
  },
  "include": ["src/**/*", "tests/**/*", "*.config.ts", "eslint.config.js"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **[AI] Step 4: Create `eslint.config.js`**

```javascript
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**']
  }
);
```

- [ ] **[AI] Step 5: Create `vite.config.ts` for renderer**

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: './index.html'
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  }
});
```

- [ ] **[AI] Step 6: Create `vite.main.config.ts` for Electron main**

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
      external: ['electron', 'node:path', 'node:url']
    }
  }
});
```

- [ ] **[AI] Step 7: Create `vite.preload.config.ts` for Electron preload**

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/preload',
    emptyOutDir: true,
    lib: {
      entry: 'src/preload/preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.cjs'
    },
    rollupOptions: {
      external: ['electron']
    }
  }
});
```

- [ ] **[AI] Step 8: Add scripts to `package.json`**

```bash
npm pkg set scripts.dev="concurrently -k \"npm:dev:main\" \"npm:dev:preload\" \"npm:dev:renderer\" \"npm:start:dev\""
npm pkg set scripts.dev:main="vite build --config vite.main.config.ts --watch"
npm pkg set scripts.dev:preload="vite build --config vite.preload.config.ts --watch"
npm pkg set scripts.dev:renderer="vite --config vite.config.ts"
npm pkg set scripts.start:dev="wait-on http://127.0.0.1:5173 dist/main/main.js dist/preload/preload.cjs && cross-env ELECTRON_RENDERER_URL=http://127.0.0.1:5173 nodemon --watch dist/main/main.js --exec \"electron dist/main/main.js\""
npm pkg set scripts.start="npm run build && electron dist/main/main.js"
npm pkg set scripts.build="npm run build:main && npm run build:preload && npm run build:renderer"
npm pkg set scripts.build:main="vite build --config vite.main.config.ts"
npm pkg set scripts.build:preload="vite build --config vite.preload.config.ts"
npm pkg set scripts.build:renderer="vite build --config vite.config.ts"
npm pkg set scripts.typecheck="tsc --noEmit"
npm pkg set scripts.lint="eslint ."
npm pkg set scripts.test:e2e="playwright test"
```

- [ ] **[AI] Step 9: Commit initialization**

```bash
git add package.json package-lock.json tsconfig.json eslint.config.js vite.config.ts vite.main.config.ts vite.preload.config.ts
git commit -m "chore: initialize Electron TypeScript Vite shell"
```

---

## Task 2: Create Electron Main Process

**Files:**

- Create: `src/main/main.ts`

- [ ] **[AI] Step 1: Create Electron main process**

`src/main/main.ts`:

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mainDir = fileURLToPath(new URL('.', import.meta.url));
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;

function resolvePreloadPath(): string {
  return join(mainDir, '../preload/preload.cjs');
}

function resolveRendererIndex(): string {
  return join(mainDir, '../renderer/index.html');
}

export async function createWindow(): Promise<BrowserWindow> {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#1e1e1e',
    title: 'Finance Flow AI',
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (rendererDevUrl) {
    await mainWindow.loadURL(rendererDevUrl);
  } else {
    await mainWindow.loadFile(resolveRendererIndex());
  }

  return mainWindow;
}

ipcMain.handle('shell:get-version', () => app.getVersion());

app.whenReady().then(() => {
  void createWindow();

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
```

- [ ] **[AI] Step 2: Commit main process**

```bash
git add src/main/main.ts
git commit -m "feat: add Electron main process bootstrap"
```

---

## Task 3: Create Secure Preload Script and Shell Types

**Files:**

- Create: `src/preload/preload.ts`
- Create: `src/types/finance-shell.d.ts`
- Create: `src/types/finance.d.ts`

- [ ] **[AI] Step 1: Create preload script**

`src/preload/preload.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron';

const shellApi = {
  getVersion: async (): Promise<string> => ipcRenderer.invoke('shell:get-version') as Promise<string>
};

contextBridge.exposeInMainWorld('financeShell', shellApi);
```

- [ ] **[AI] Step 2: Create renderer global type declarations**

`src/types/finance-shell.d.ts`:

```typescript
export interface FinanceShellApi {
  getVersion: () => Promise<string>;
}

declare global {
  interface Window {
    financeShell: FinanceShellApi;
  }
}
```

`src/types/finance.d.ts`:

```typescript
/**
 * Placeholder for the future public Finance extension API.
 *
 * Phase 1 intentionally does not expose extension APIs. This file reserves the
 * package contract location that later milestones will expand.
 */
export {};
```

- [ ] **[AI] Step 3: Commit preload**

```bash
git add src/preload/preload.ts src/types/finance-shell.d.ts src/types/finance.d.ts
git commit -m "feat: add allowlisted preload bridge"
```

---

## Task 4: Create HTML Shell and CSS Layout

**Files:**

- Create: `src/renderer/index.html`
- Create: `src/renderer/styles/layout.css`

- [ ] **[AI] Step 1: Create `index.html`**

`src/renderer/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Finance Flow AI</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="./styles/layout.css" />
  </head>
  <body>
    <div id="app">
      <activity-bar id="activity-bar"></activity-bar>
      <navigation-panel id="navigation-panel"></navigation-panel>
      <workspace-panel id="workspace"></workspace-panel>
      <ai-panel id="ai-panel"></ai-panel>
      <status-bar id="status-bar">
        <span class="status-item">Ready</span>
      </status-bar>
    </div>
    <command-palette id="command-palette" class="hidden"></command-palette>
    <script type="module" src="./index.ts"></script>
  </body>
</html>
```

- [ ] **[AI] Step 2: Create `layout.css`**

`src/renderer/styles/layout.css`:

```css
:root {
  --activity-bar-width: 56px;
  --navigation-width: 260px;
  --ai-panel-width: 320px;
  --status-bar-height: 26px;

  /* Sleek Obsidian Dark Theme */
  --activity-bar-bg: #090d16;
  --sidebar-bg: #0f172a;
  --workspace-bg: #0b0f19;
  --panel-border: rgba(255, 255, 255, 0.08);
  --accent: #6366f1;
  --accent-gradient: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);

  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
}

* {
  box-sizing: border-box;
}

html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--workspace-bg);
  color: var(--text-secondary);
  overflow: hidden;
}

#app {
  display: grid;
  grid-template-columns: var(--activity-bar-width) var(--navigation-width) minmax(0, 1fr) var(--ai-panel-width);
  grid-template-rows: minmax(0, 1fr) var(--status-bar-height);
  width: 100%;
  height: 100%;
  transition: grid-template-columns 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

#activity-bar {
  grid-column: 1;
  grid-row: 1;
  background: var(--activity-bar-bg);
}

#navigation-panel {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--panel-border);
}

#workspace {
  grid-column: 3;
  grid-row: 1;
  min-width: 0;
  min-height: 0;
  background: var(--workspace-bg);
}

#ai-panel {
  grid-column: 4;
  grid-row: 1;
  min-width: 0;
  background: var(--sidebar-bg);
  border-left: 1px solid var(--panel-border);
}

#app.ai-collapsed {
  grid-template-columns: var(--activity-bar-width) var(--navigation-width) minmax(0, 1fr) 0;
}

#app.ai-collapsed #ai-panel {
  overflow: hidden;
  border-left: 0;
}

#status-bar {
  grid-column: 1 / -1;
  grid-row: 2;
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0 12px;
  background: var(--accent);
  color: #ffffff;
  font-size: 12px;
}

#command-palette {
  position: fixed;
  top: 64px;
  left: 50%;
  z-index: 1000;
  width: min(640px, calc(100vw - 32px));
  max-height: min(420px, calc(100vh - 96px));
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(12px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5);
}

#command-palette.hidden {
  display: none;
}

/* Custom Scrollbars */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #475569;
}
```

- [ ] **[AI] Step 3: Commit layout**

```bash
git add src/renderer/index.html src/renderer/styles/layout.css
git commit -m "feat: add VS Code-inspired shell layout"
```

---

## Task 5: Create Lit Web Components and Shell Interactions

**Files:**

- Create: `src/renderer/components/activity-bar.ts`
- Create: `src/renderer/components/navigation-panel.ts`
- Create: `src/renderer/components/workspace.ts`
- Create: `src/renderer/components/ai-panel.ts`
- Create: `src/renderer/components/command-palette.ts`
- Create: `src/renderer/index.ts`

- [ ] **[AI] Step 1: Create `activity-bar.ts`**

`src/renderer/components/activity-bar.ts`:

```typescript
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

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
  `;

  private _activeView = 'Dashboard';

  private _selectView(view: string) {
    this._activeView = view;
    this.dispatchEvent(new CustomEvent('view-changed', {
      detail: { view },
      bubbles: true,
      composed: true
    }));
    this.requestUpdate();
  }

  render() {
    return html`
      <button class="${this._activeView === 'Dashboard' ? 'active' : ''}" title="Dashboard" aria-label="Dashboard" @click="${() => this._selectView('Dashboard')}">D</button>
      <button class="${this._activeView === 'Salary' ? 'active' : ''}" title="Salary History" aria-label="Salary History" @click="${() => this._selectView('Salary')}">P</button>
      <button class="${this._activeView === 'Budget' ? 'active' : ''}" title="Budget" aria-label="Budget" @click="${() => this._selectView('Budget')}">B</button>
      <button class="${this._activeView === 'Tax' ? 'active' : ''}" title="Tax" aria-label="Tax" @click="${() => this._selectView('Tax')}">X</button>
      <button class="settings ${this._activeView === 'Settings' ? 'active' : ''}" title="Settings" aria-label="Settings" @click="${() => this._selectView('Settings')}">S</button>
    `;
  }
}
```

- [ ] **[AI] Step 2: Create `navigation-panel.ts`**

`src/renderer/components/navigation-panel.ts`:

```typescript
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('navigation-panel')
export class NavigationPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 8px;
    }

    h2 {
      margin: 6px 8px 14px;
      color: #f2f2f2;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .nav-section {
      margin-bottom: 16px;
    }

    .nav-title {
      padding: 8px 8px 4px;
      color: #a8a8a8;
      font-size: 11px;
      text-transform: uppercase;
    }

    .nav-item {
      padding: 5px 8px;
      border-radius: 4px;
      color: #d4d4d4;
      cursor: default;
      font-size: 13px;
    }

    .nav-item:hover {
      background: rgba(255, 255, 255, 0.08);
    }
  `;

  private _currentView = 'Dashboard';

  setView(view: string) {
    this._currentView = view;
    this.requestUpdate();
  }

  render() {
    return html`
      <h2>Explorer</h2>
      <div class="nav-section">
        <div class="nav-title">${this._currentView}</div>
        ${this._currentView === 'Dashboard' ? html`
          <div class="nav-item">Net Worth</div>
          <div class="nav-item">Monthly Overview</div>
        ` : this._currentView === 'Salary' ? html`
          <div class="nav-item">Pay History</div>
          <div class="nav-item">Deductions</div>
        ` : this._currentView === 'Budget' ? html`
          <div class="nav-item">Monthly Targets</div>
          <div class="nav-item">Spending Envelopes</div>
        ` : this._currentView === 'Tax' ? html`
          <div class="nav-item">Tax Workbook</div>
          <div class="nav-item">Deductions Ledger</div>
        ` : html`
          <div class="nav-item">App Preferences</div>
          <div class="nav-item">Manage Extensions</div>
        `}
      </div>
      <div class="nav-section">
        <div class="nav-title">Recent</div>
        <div class="nav-item">No recent items</div>
      </div>
    `;
  }
}
```

- [ ] **[AI] Step 3: Create `workspace.ts`**

`src/renderer/components/workspace.ts`:

```typescript
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('workspace-panel')
export class WorkspacePanel extends LitElement {
  static styles = css`
    :host {
      display: grid;
      grid-template-rows: 36px minmax(0, 1fr);
      min-width: 0;
      min-height: 0;
      height: 100%;
    }

    .tabs {
      display: flex;
      min-width: 0;
      border-bottom: 1px solid #3c3c3c;
      background: #252526;
    }

    .tab {
      display: flex;
      align-items: center;
      min-width: 140px;
      max-width: 220px;
      padding: 0 12px;
      border-right: 1px solid #3c3c3c;
      background: #1e1e1e;
      color: #ffffff;
      font-size: 13px;
    }

    .content {
      display: grid;
      place-items: center;
      min-height: 0;
      padding: 24px;
    }

    .empty-state {
      color: #9a9a9a;
      font-size: 14px;
    }
  `;

  render() {
    return html`
      <div class="tabs" role="tablist">
        <div class="tab" role="tab" aria-selected="true">Dashboard</div>
      </div>
      <main class="content">
        <div class="empty-state">Select a view from the Activity Bar</div>
      </main>
    `;
  }
}
```

- [ ] **[AI] Step 4: Create `ai-panel.ts`**

`src/renderer/components/ai-panel.ts`:

```typescript
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('ai-panel')
export class AIPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 10px;
    }

    .ai-header {
      color: #f2f2f2;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .ai-content {
      flex: 1;
      min-height: 0;
      color: #c8c8c8;
      font-size: 13px;
    }
  `;

  render() {
    return html`
      <div class="ai-header">AI Assistant</div>
      <div class="ai-content">Chat panel placeholder</div>
    `;
  }
}
```

- [ ] **[AI] Step 5: Create `command-palette.ts`**

`src/renderer/components/command-palette.ts`:

```typescript
import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

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
  `;

  @state()
  private _selectedIndex = 0;

  private _items = [
    { id: 'view-dashboard', label: 'View: Dashboard' },
    { id: 'toggle-ai', label: 'View: Toggle AI Assistant' },
    { id: 'new-workspace', label: 'File: New Workspace' }
  ];

  firstUpdated() {
    this.addEventListener('keydown', this._handleKeyDown);
  }

  focusInput() {
    const input = this.shadowRoot?.querySelector('input');
    if (input) {
      input.focus();
      input.value = '';
    }
    this._selectedIndex = 0;
  }

  private _handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this._selectedIndex = (this._selectedIndex + 1) % this._items.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this._selectedIndex = (this._selectedIndex - 1 + this._items.length) % this._items.length;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this._selectItem(this._items[this._selectedIndex]);
    }
  }

  private _selectItem(item: { id: string; label: string }) {
    this.dispatchEvent(new CustomEvent('command-selected', {
      detail: { command: item.id },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    return html`
      <input aria-label="Command palette input" placeholder="Type a command..." />
      <div class="palette-list" role="listbox">
        ${this._items.map((item, index) => html`
          <div 
            class="palette-item ${index === this._selectedIndex ? 'selected' : ''}" 
            role="option"
            aria-selected="${index === this._selectedIndex}"
            @click="${() => this._selectItem(item)}"
            @mouseenter="${() => this._selectedIndex = index}"
          >
            ${item.label}
          </div>
        `)}
      </div>
    `;
  }
}
```

- [ ] **[AI] Step 6: Create `index.ts` entry point and interactions**

`src/renderer/index.ts`:

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
  const statusBar = document.querySelector('#status-bar');
  if (statusBar) {
    const versionTag = document.createElement('span');
    versionTag.className = 'status-item version-tag';
    versionTag.style.marginLeft = 'auto';
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

- [ ] **[AI] Step 7: Commit components**

```bash
git add src/renderer/components src/renderer/index.ts
git commit -m "feat: add shell components and prototype interactions"
```

---

## Task 6: Verification — Manual Test Units + Optional Playwright Smoke Tests

**Files:**

- Create: `playwright.config.ts`
- Create: `tests/e2e/renderer-shell.spec.ts`

- [ ] **[AI] Step 1: Create Playwright config**

`playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm run dev:renderer',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
```

- [ ] **[AI] Step 2: Create Playwright smoke tests**

`tests/e2e/renderer-shell.spec.ts`:

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
```

- [ ] **[You] Step 3: Build and boot the application**

```bash
npm run build
npm run start
```

Wait for the Electron window to appear. Confirm no console errors appear (open DevTools with `Ctrl+Shift+I`).

- [ ] **[You] Step 4: Run through each manual test unit below and mark pass/fail**

---

### Test Unit 1: Shell Layout Visibility

| Field | Detail |
|-------|--------|
| **How to test** | Look at the opened Electron window. Identify each region of the shell. |
| **Checklist** | |
| | 1. Far left column — **Activity Bar** with 5 icon buttons (D, P, B, X, S) is visible |
| | 2. Second column — **Navigation Panel** showing "Explorer" header is visible |
| | 3. Center area — **Workspace** with a tab bar ("Dashboard" tab) and "Select a view" text is visible |
| | 4. Right column — **AI Assistant** panel with header text is visible |
| | 5. Bottom bar — **Status Bar** with "Ready" text and version number (e.g., `v1.0.0`) is visible |
| **Expected result** | All 5 shell regions are present and properly labeled. |

| Pass/Fail | Notes |
|-----------|-------|

---

### Test Unit 2: Activity Bar Navigation

| Field | Detail |
|-------|--------|
| **How to test** | Click each button in the Activity Bar from top to bottom. |
| **Steps** | 1. Click **D** (Dashboard) — Navigation Panel shows "Dashboard" section with "Net Worth" and "Monthly Overview" |
| | 2. Click **P** (Salary History) — Navigation Panel shows "Salary" section with "Pay History" and "Deductions" |
| | 3. Click **B** (Budget) — Navigation Panel shows "Budget" section with "Monthly Targets" and "Spending Envelopes" |
| | 4. Click **X** (Tax) — Navigation Panel shows "Tax" section with "Tax Workbook" and "Deductions Ledger" |
| | 5. Click **S** (Settings) — Navigation Panel shows "Settings" section with "App Preferences" and "Manage Extensions" |
| **Expected result** | Each click updates the Navigation Panel title and items to match the selected view. The clicked button highlights (lighter background). |

| Pass/Fail | Notes |
|-----------|-------|

---

### Test Unit 3: Command Palette — Open, Auto-Focus, and Close

| Field | Detail |
|-------|--------|
| **How to test** | Press keyboard shortcuts and observe the Command Palette behavior. |
| **Steps** | 1. Press **Ctrl+Shift+P** (or Cmd+Shift+P on macOS) |
| | 2. Observe that a floating overlay appears centered near the top of the window |
| | 3. Observe that the input field inside the palette is automatically focused (cursor blinking) |
| | 4. Type a few characters to confirm the input works |
| | 5. Press **Escape** |
| **Expected result** | Palette opens on shortcut, input is auto-focused, and palette closes on Escape. |

| Pass/Fail | Notes |
|-----------|-------|

---

### Test Unit 4: Command Palette — Click-Away to Close

| Field | Detail |
|-------|--------|
| **How to test** | Open the palette, then click anywhere outside it. |
| **Steps** | 1. Press **Ctrl+Shift+P** to open the Command Palette |
| | 2. Click on the Activity Bar or Workspace area (anywhere outside the palette) |
| **Expected result** | The Command Palette closes when you click outside its boundaries. |

| Pass/Fail | Notes |
|-----------|-------|

---

### Test Unit 5: AI Panel Collapse and Restore

| Field | Detail |
|-------|--------|
| **How to test** | Press **Ctrl+J** (or Cmd+J on macOS) twice. |
| **Steps** | 1. Confirm the AI Assistant panel is visible on the right side |
| | 2. Press **Ctrl+J** — the AI panel collapses (grid column shrinks to 0) |
| | 3. Press **Ctrl+J** again — the AI panel restores to full width |
| **Expected result** | The AI Panel toggles visibility without breaking the layout. |

| Pass/Fail | Notes |
|-----------|-------|

---

### Test Unit 6: Version Display in Status Bar

| Field | Detail |
|-------|--------|
| **How to test** | Look at the far right of the Status Bar at the bottom of the window. |
| **Checklist** | |
| | 1. Status Bar shows the text `Ready` on the left |
| | 2. Status Bar shows a version tag on the right, e.g., `v0.1.0` or `v1.0.0` |
| **Expected result** | Version number is fetched via the IPC preload bridge and displayed in the Status Bar, confirming the secure bridge works end-to-end. |

| Pass/Fail | Notes |
|-----------|-------|

---

### Test Unit 7: Window Behavior

| Field | Detail |
|-------|--------|
| **How to test** | Interact with the window chrome. |
| **Checklist** | |
| | 1. Window title reads "Finance Flow AI" |
| | 2. Window can be resized (minimum ~960x640) |
| | 3. Window can be maximized, minimized, and closed |
| | 4. Background color is dark (#1e1e1e) — no white flash during load |
| **Expected result** | Standard desktop window behavior works correctly. |

| Pass/Fail | Notes |
|-----------|-------|

---

### Test Unit 8: Workspace Tab Display

| Field | Detail |
|-------|--------|
| **How to test** | Look at the top of the Workspace (center area). |
| **Checklist** | |
| | 1. A tab strip is visible with "Dashboard" as the active tab |
| | 2. Below the tab strip, text reads "Select a view from the Activity Bar" |
| **Expected result** | Static tab strip and placeholder content are visible. |

| Pass/Fail | Notes |
|-----------|-------|

---

- [ ] **[You] Step 5: Run typecheck and lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **[You] Step 6: (Optional) Run Playwright automated smoke tests**

Playwright test files are already created above. If you want automated browser verification in addition to the manual tests:

```bash
npm run test:e2e
```

This launches the Vite dev server and runs all 6 Playwright tests (layout visibility, command palette open/close, click-away, AI panel toggle, sidebar navigation) in headless Chromium.

> **Note:** Skip this step if you prefer manual-only verification. The Playwright files remain in the codebase for future CI or regression testing.

- [ ] **[AI] Step 7: Commit**

```bash
git add playwright.config.ts tests/e2e/renderer-shell.spec.ts src/renderer/components src/renderer/index.ts src/renderer/index.html src/renderer/styles/layout.css src/main/main.ts src/preload/preload.ts src/types/finance-shell.d.ts src/types/finance.d.ts
git commit -m "feat: add Phase 1 core shell prototype"
```

---

## Phase 1 Deliverable Verification

- [ ] Electron app boots with `npm run start` — no console errors (DevTools: `Ctrl+Shift+I`).
- [ ] **Test Unit 1** — All 5 shell regions visible: Activity Bar, Navigation Panel, Workspace, AI Panel, Status Bar.
- [ ] **Test Unit 2** — Activity Bar buttons switch Navigation Panel context for each view (Dashboard, Salary, Budget, Tax, Settings).
- [ ] **Test Unit 3** — `Ctrl+Shift+P` opens Command Palette with auto-focused input; `Escape` closes it.
- [ ] **Test Unit 4** — Command Palette closes on click-away.
- [ ] **Test Unit 5** — `Ctrl+J` toggles AI Panel collapse/restore.
- [ ] **Test Unit 6** — Version number displayed in Status Bar via IPC bridge.
- [ ] **Test Unit 7** — Window has correct title, min size, resize/close works, dark background.
- [ ] **Test Unit 8** — Workspace shows "Dashboard" tab and placeholder content.
- [ ] TypeScript compiles in strict mode (`npm run typecheck`).
- [ ] ESLint passes (`npm run lint`).
- [ ] (Optional) Playwright smoke tests pass (`npm run test:e2e`) — 6 automated tests cover layout, command palette, AI panel, and sidebar navigation.
