---
title: Phase 1 - Core Shell Prototype
date: 2026-06-14
status: draft
---

# Phase 1 - Core Shell Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Complete this milestone and wait for review before starting Phase 2.

**Goal:** Build a bootable Electron application with a VS Code-inspired layout: Activity Bar, Navigation Panel, tabbed Workspace, collapsible AI Panel, Status Bar, and static Command Palette.

**Architecture:** Electron shell with separate main, preload, and renderer builds. The renderer has no Node.js access and is implemented with Lit web components. The preload bridge exposes only allowlisted shell events needed by the prototype.

**Tech Stack:** Electron, TypeScript strict mode, Lit, Vite, HTML, CSS, ESLint, Playwright.

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

### Decision 2: Verify the Renderer Shell Before Full Electron E2E

**Choice:** Add Playwright smoke tests against the Vite renderer server, then manually verify Electron boot for Phase 1.

**Reasoning:** Phase 1 is a visual shell prototype. Browser-based smoke tests are fast and stable for layout, command palette, and panel toggle behavior. Native Electron automation can be added once the app has persistent settings and richer process behavior.

**Alternatives considered:**

- Full Electron Playwright tests immediately: stronger coverage, but higher setup cost before there is real main-process behavior to validate.

**Trade-off:** Electron boot remains manually verified in this milestone, while automated tests cover the renderer behavior most likely to regress.

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

- [ ] **Step 1: Initialize npm project**

```bash
npm init -y
npm pkg set type="module"
npm pkg set main="dist/main/main.js"
```

- [ ] **Step 2: Install dependencies**

```bash
npm install lit
npm install -D typescript vite electron @types/node
npm install -D concurrently wait-on cross-env
npm install -D eslint @eslint/js typescript-eslint globals
npm install -D vitest @vitest/coverage-v8
npm install -D @playwright/test
```

- [ ] **Step 3: Create `tsconfig.json`**

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

- [ ] **Step 4: Create `eslint.config.js`**

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

- [ ] **Step 5: Create `vite.config.ts` for renderer**

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

- [ ] **Step 6: Create `vite.main.config.ts` for Electron main**

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

- [ ] **Step 7: Create `vite.preload.config.ts` for Electron preload**

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

- [ ] **Step 8: Add scripts to `package.json`**

```bash
npm pkg set scripts.dev="concurrently -k \"npm:dev:main\" \"npm:dev:preload\" \"npm:dev:renderer\" \"npm:start:dev\""
npm pkg set scripts.dev:main="vite build --config vite.main.config.ts --watch"
npm pkg set scripts.dev:preload="vite build --config vite.preload.config.ts --watch"
npm pkg set scripts.dev:renderer="vite --config vite.config.ts"
npm pkg set scripts.start:dev="wait-on http://127.0.0.1:5173 dist/main/main.js dist/preload/preload.cjs && cross-env ELECTRON_RENDERER_URL=http://127.0.0.1:5173 electron dist/main/main.js"
npm pkg set scripts.start="npm run build && electron dist/main/main.js"
npm pkg set scripts.build="npm run build:main && npm run build:preload && npm run build:renderer"
npm pkg set scripts.build:main="vite build --config vite.main.config.ts"
npm pkg set scripts.build:preload="vite build --config vite.preload.config.ts"
npm pkg set scripts.build:renderer="vite build --config vite.config.ts"
npm pkg set scripts.typecheck="tsc --noEmit"
npm pkg set scripts.lint="eslint ."
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:e2e="playwright test"
```

- [ ] **Step 9: Commit initialization**

```bash
git add package.json package-lock.json tsconfig.json eslint.config.js vite.config.ts vite.main.config.ts vite.preload.config.ts
git commit -m "chore: initialize Electron TypeScript Vite shell"
```

---

## Task 2: Create Electron Main Process

**Files:**

- Create: `src/main/main.ts`

- [ ] **Step 1: Create Electron main process**

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

- [ ] **Step 2: Commit main process**

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

- [ ] **Step 1: Create preload script**

`src/preload/preload.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron';

const shellApi = {
  getVersion: async (): Promise<string> => ipcRenderer.invoke('shell:get-version') as Promise<string>
};

contextBridge.exposeInMainWorld('financeShell', shellApi);
```

- [ ] **Step 2: Create renderer global type declarations**

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

- [ ] **Step 3: Commit preload**

```bash
git add src/preload/preload.ts src/types/finance-shell.d.ts src/types/finance.d.ts
git commit -m "feat: add allowlisted preload bridge"
```

---

## Task 4: Create HTML Shell and CSS Layout

**Files:**

- Create: `src/renderer/index.html`
- Create: `src/renderer/styles/layout.css`

- [ ] **Step 1: Create `index.html`**

`src/renderer/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Finance Flow AI</title>
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

- [ ] **Step 2: Create `layout.css`**

`src/renderer/styles/layout.css`:

```css
:root {
  --activity-bar-width: 48px;
  --navigation-width: 260px;
  --ai-panel-width: 320px;
  --status-bar-height: 24px;
  --activity-bar-bg: #333333;
  --sidebar-bg: #252526;
  --workspace-bg: #1e1e1e;
  --panel-border: #3c3c3c;
  --accent: #007acc;
  --text-primary: #f2f2f2;
  --text-secondary: #cccccc;
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
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
  border: 1px solid var(--accent);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
}

#command-palette.hidden {
  display: none;
}
```

- [ ] **Step 3: Commit layout**

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

- [ ] **Step 1: Create `activity-bar.ts`**

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
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: #cccccc;
      cursor: pointer;
      font: inherit;
    }

    button:hover,
    button.active {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
    }

    .settings {
      margin-top: auto;
    }
  `;

  render() {
    return html`
      <button class="active" title="Dashboard" aria-label="Dashboard">D</button>
      <button title="Transactions" aria-label="Transactions">T</button>
      <button title="Budget" aria-label="Budget">B</button>
      <button title="Tax" aria-label="Tax">X</button>
      <button class="settings" title="Settings" aria-label="Settings">S</button>
    `;
  }
}
```

- [ ] **Step 2: Create `navigation-panel.ts`**

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

  render() {
    return html`
      <h2>Explorer</h2>
      <div class="nav-section">
        <div class="nav-title">Dashboard</div>
        <div class="nav-item">Net Worth</div>
        <div class="nav-item">Monthly Overview</div>
      </div>
      <div class="nav-section">
        <div class="nav-title">Recent</div>
        <div class="nav-item">No recent items</div>
      </div>
    `;
  }
}
```

- [ ] **Step 3: Create `workspace.ts`**

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

- [ ] **Step 4: Create `ai-panel.ts`**

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

- [ ] **Step 5: Create `command-palette.ts`**

`src/renderer/components/command-palette.ts`:

```typescript
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('command-palette')
export class CommandPalette extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: 6px;
      background: #252526;
      color: #cccccc;
    }

    input {
      width: 100%;
      padding: 12px;
      border: 0;
      border-bottom: 1px solid #3c3c3c;
      background: #303031;
      color: #ffffff;
      font-size: 14px;
    }

    input:focus {
      outline: none;
    }

    .palette-list {
      max-height: 320px;
      overflow-y: auto;
      padding: 4px 0;
    }

    .palette-item {
      padding: 8px 12px;
      font-size: 13px;
    }

    .palette-item:hover {
      background: #094771;
    }
  `;

  render() {
    return html`
      <input aria-label="Command palette input" placeholder="Type a command..." />
      <div class="palette-list">
        <div class="palette-item">View: Dashboard</div>
        <div class="palette-item">View: Toggle AI Assistant</div>
        <div class="palette-item">File: New Workspace</div>
      </div>
    `;
  }
}
```

- [ ] **Step 6: Create `index.ts` entry point and interactions**

`src/renderer/index.ts`:

```typescript
import './components/activity-bar';
import './components/navigation-panel';
import './components/workspace';
import './components/ai-panel';
import './components/command-palette';

const app = document.querySelector<HTMLElement>('#app');
const commandPalette = document.querySelector<HTMLElement>('#command-palette');

function setCommandPaletteVisible(visible: boolean): void {
  commandPalette?.classList.toggle('hidden', !visible);
}

function toggleAiPanel(): void {
  app?.classList.toggle('ai-collapsed');
}

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

- [ ] **Step 7: Commit components**

```bash
git add src/renderer/components src/renderer/index.ts
git commit -m "feat: add shell components and prototype interactions"
```

---

## Task 6: E2E Smoke Tests and Verification

**Files:**

- Create: `playwright.config.ts`
- Create: `tests/e2e/renderer-shell.spec.ts`

- [ ] **Step 1: Configure Playwright**

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

- [ ] **Step 2: Create renderer smoke tests**

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

    await page.keyboard.press('Escape');
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
});
```

- [ ] **Step 3: Run automated verification**

```bash
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

- [ ] **Step 4: Manually verify Electron boot**

```bash
npm run start
```

Confirm:

- Window opens without console errors.
- Shell regions are visible.
- `Ctrl+Shift+P` opens the Command Palette.
- `Escape` closes the Command Palette.
- `Ctrl+J` collapses and restores the AI Panel.

- [ ] **Step 5: Commit tests**

```bash
git add playwright.config.ts tests/e2e/renderer-shell.spec.ts
git commit -m "test: add renderer smoke tests for core shell"
```

---

## Phase 1 Deliverable Verification

- [ ] Electron app boots with `npm run start`.
- [ ] Renderer dev shell runs with `npm run dev:renderer`.
- [ ] Activity Bar, Navigation Panel, Workspace, AI Panel, and Status Bar are visible.
- [ ] Workspace includes a static tab strip.
- [ ] Command Palette is hidden by default and can be toggled with `Ctrl+Shift+P`.
- [ ] AI Panel can be collapsed and restored with `Ctrl+J`.
- [ ] TypeScript compiles in strict mode.
- [ ] ESLint passes.
- [ ] Playwright smoke tests pass.
