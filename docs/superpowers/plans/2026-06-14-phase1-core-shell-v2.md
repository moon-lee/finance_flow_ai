---
title: Phase 1 - Core Shell Prototype
date: 2026-06-14
status: draft
---

# Phase 1 - Core Shell Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bootable Electron application with VS Code-inspired layout (Activity Bar, Navigation Panel, Workspace tabs, AI Panel, Status Bar, Command Palette stub)

**Architecture:** Electron shell with isolated renderer processes, using Lit for web components and Vite for building. Layout mimics VS Code with fixed panel structure.

**Tech Stack:** Electron, TypeScript (strict mode), Lit, Vite, HTML, CSS

---

## File Structure

```
finance-flow-ai/
├── package.json              # Root project config
├── tsconfig.json           # TypeScript config
├── vite.config.ts          # Renderer build config
├── vite.main.config.ts     # Main process build config
├── src/
│   ├── main/
│   │   └── main.ts         # Electron main process
│   ├── preload/
│   │   └── preload.ts      # Secure context bridge
│   ├── renderer/           # UI process (no Node access)
│   │   ├── index.html      # Main window shell
│   │   ├── index.ts        # Component entry point
│   │   ├── styles/
│   │   │   └── layout.css  # VS Code-like layout
│   │   └── components/
│   │       ├── activity-bar.ts
│   │       ├── navigation-panel.ts
│   │       ├── workspace.ts
│   │       ├── ai-panel.ts
│   │       └── command-palette.ts
│   └── types/
│       └── finance.d.ts    # Core API types
└── tests/
    ├── e2e/
    │   └── smoke.test.ts   # App boot verification
    └── fixtures/
        └── test-setup.ts   # Test environment setup
```

---

## Task 1: Initialize Project Structure

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vite.main.config.ts`

- [ ] **Step 1: Initialize npm project with base dependencies**

```bash
npm init -y
npm pkg set type="module"
```

- [ ] **Step 2: Install dependencies**

```bash
npm install -D typescript vite electron @types/node @types/electron
npm install -D lit concurrently wait-on
npm install -D @typescript-eslint/eslint-parser @typescript-eslint/eslint-plugin
npm install -D vitest @vitest/coverage-v8
npm install -D @playwright/experimental-ct lit
```

- [ ] **Step 3: Create tsconfig.json**

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
    "rootDir": ".",
    "outDir": "./dist",
    "declaration": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 4: Create vite.config.ts (Renderer)**

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
    rollupOptions: {
      input: { main: './index.html' }
    }
  },
  server: { port: 5173 }
});
```

- [ ] **Step 5: Create vite.main.config.ts (Main Process)**

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: {
    outDir: './dist',
    lib: {
      entry: './main/main.ts',
      formats: ['es'],
      fileName: 'main'
    },
    rollupOptions: {
      external: ['electron']
    }
  }
});
```

- [ ] **Step 6: Add build scripts to package.json**

```bash
npm pkg set scripts.dev="concurrently \"npm:dev:main\" \"npm:dev:renderer\""
npm pkg set scripts.dev:main="vite build --config vite.main.config.ts --watch"
npm pkg set scripts.dev:renderer="vite build --config vite.config.ts --watch"
npm pkg set scripts.start="wait-on http://localhost:5173 && electron ."
npm pkg set scripts.build="npm run build:main && npm run build:renderer"
npm pkg set scripts.build:main="vite build --config vite.main.config.ts"
npm pkg set scripts.build:renderer="vite build --config vite.config.ts"
npm pkg set scripts.typecheck="tsc --noEmit"
npm pkg set scripts.lint="eslint src --ext .ts"
```

- [ ] **Step 7: Commit initialization**

```bash
git add package.json tsconfig.json vite.config.ts vite.main.config.ts
git commit -m "chore: initialize project with Electron, TypeScript, Vite, Lit"
```

---

## Task 2: Create Electron Main Process

**Files:**
- Create: `src/main/main.ts`
- Create: `electron-main.ts`

- [ ] **Step 1: Create Electron main process**

`src/main/main.ts`:

```typescript
import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 }
  });

  mainWindow.loadFile(join(__dirname, 'index.html'));
  return mainWindow;
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 2: Create electron-main.ts entry point**

`electron-main.ts`:

```typescript
export * from './src/main/main.js';
```

- [ ] **Step 3: Commit main process**

```bash
git add src/main/main.ts electron-main.ts
git commit -m "feat: add Electron main process bootstrap"
```

---

## Task 3: Create Secure Preload Script

**Files:**
- Create: `src/preload/preload.ts`

- [ ] **Step 1: Create preload script**

`src/preload/preload.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('financeAPI', {
  send: (channel: string, data: unknown) => {
    ipcRenderer.postMessage(channel, data);
  },
  on: (channel: string, func: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => func(...args));
  }
});

declare global {
  interface Window {
    financeAPI: {
      send: (channel: string, data: unknown) => void;
      on: (channel: string, func: (...args: unknown[]) => void) => void;
    };
  }
}
```

- [ ] **Step 2: Update vite.main.config.ts to include preload**

Add preload build output:

```json
// In vite.main.config.ts rollupOptions
output: {
  entryFileNames: (chunkInfo) => {
    if (chunkInfo.name === 'preload') return '[name].[ext]';
    return '[name].js';
  }
}
```

- [ ] **Step 3: Commit preload**

```bash
git add src/preload/preload.ts
git commit -m "feat: add secure preload script with contextBridge"
```

---

## Task 4: Create HTML Shell and CSS Layout

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/styles/layout.css`

- [ ] **Step 1: Create index.html**

`src/renderer/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Finance Flow AI</title>
  <link rel="stylesheet" href="./styles/layout.css">
</head>
<body>
  <div id="app">
    <activity-bar id="activity-bar"></activity-bar>
    <navigation-panel id="navigation-panel"></navigation-panel>
    <workspace id="workspace">
      <div class="empty-state">Select a view from the Activity Bar</div>
    </workspace>
    <ai-panel id="ai-panel" class="collapsed"></ai-panel>
    <status-bar id="status-bar">
      <span class="status-item">Ready</span>
    </status-bar>
  </div>
  <command-palette id="command-palette" class="hidden"></command-palette>
  <script type="module" src="./index.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Create layout CSS**

`src/renderer/styles/layout.css`:

```css
:root {
  --activity-bar-width: 48px;
  --navigation-width: 250px;
  --ai-panel-width: 320px;
  --status-bar-height: 22px;
  --sidebar-bg: #252526;
  --activity-bar-bg: #3c3c3c;
  --status-bar-bg: #007acc;
  --workspace-bg: #1e1e1e;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--workspace-bg);
  color: #cccccc;
  height: 100vh;
  overflow: hidden;
}

#app {
  display: grid;
  grid-template-columns: var(--activity-bar-width) var(--navigation-width) 1fr var(--ai-panel-width);
  grid-template-rows: 1fr var(--status-bar-height);
  height: 100vh;
}

#activity-bar { grid-column: 1; grid-row: 1 / -1; background: var(--activity-bar-bg); }
#navigation-panel { grid-column: 2; grid-row: 1 / -1; background: var(--sidebar-bg); }
#workspace { grid-column: 3; grid-row: 1 / -1; overflow: auto; padding: 16px; }
#ai-panel { grid-column: 4; grid-row: 1 / -1; background: var(--sidebar-bg); transition: transform 0.2s ease; }
#ai-panel.collapsed { transform: translateX(100%); }
#status-bar { grid-column: 2 / 4; grid-row: 2; background: var(--status-bar-bg); color: white; padding: 0 16px; display: flex; align-items: center; font-size: 12px; }
#command-palette { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 600px; background: #252526; border: 1px solid #007acc; border-radius: 4px; z-index: 1000; }
#command-palette.hidden { display: none; }
.empty-state { display: flex; align-items: center; justify-content: center; height: 100%; color: #888; font-size: 14px; }
```

- [ ] **Step 3: Commit layout**

```bash
git add src/renderer/index.html src/renderer/styles/layout.css
git commit -m "feat: add VS Code-inspired HTML layout and CSS grid structure"
```

---

## Task 5: Create Lit Web Components

**Files:**
- Create: `src/renderer/components/activity-bar.ts`
- Create: `src/renderer/components/navigation-panel.ts`
- Create: `src/renderer/components/workspace.ts`
- Create: `src/renderer/components/ai-panel.ts`
- Create: `src/renderer/components/command-palette.ts`
- Create: `src/renderer/index.ts`

- [ ] **Step 1: Create activity-bar.ts**

`src/renderer/components/activity-bar.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('activity-bar')
export class ActivityBar extends LitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; align-items: center; padding: 8px 0; gap: 8px; }
    .activity-item { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px; cursor: pointer; color: #cccccc; }
    .activity-item:hover { background: rgba(255, 255, 255, 0.1); }
    .activity-item.active { color: #ffffff; background: #007acc; }
  `;

  render() {
    return html`
      <div class="activity-item active" title="Dashboard">📊</div>
      <div class="activity-item" title="Transactions">💰</div>
      <div class="activity-item" title="Budget">📈</div>
      <div class="activity-item" title="Tax">📋</div>
      <div class="activity-item" title="Settings">⚙️</div>
    `;
  }
}
```

- [ ] **Step 2: Create navigation-panel.ts**

`src/renderer/components/navigation-panel.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('navigation-panel')
export class NavigationPanel extends LitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; padding: 8px; }
    .nav-section { margin-bottom: 16px; }
    .nav-title { font-size: 11px; text-transform: uppercase; color: #cccccc; padding: 8px 12px 4px; }
    .nav-item { padding: 4px 12px; cursor: pointer; font-size: 13px; }
    .nav-item:hover { background: rgba(255, 255, 255, 0.05); }
  `;

  render() {
    return html`
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

- [ ] **Step 3: Create workspace.ts, ai-panel.ts, command-palette.ts**

`src/renderer/components/workspace.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('workspace')
export class Workspace extends LitElement {
  static styles = css` :host { display: block; } `;
  render() { return html`<slot></slot>`; }
}
```

`src/renderer/components/ai-panel.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('ai-panel')
export class AIPanel extends LitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; padding: 8px; }
    .ai-header { font-weight: 600; padding: 8px; margin-bottom: 8px; }
    .ai-content { flex: 1; font-size: 13px; }
  `;
  render() {
    return html`
      <div class="ai-header">AI Assistant</div>
      <div class="ai-content">Chat panel placeholder</div>
    `;
  }
}
```

`src/renderer/components/command-palette.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('command-palette')
export class CommandPalette extends LitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; background: #252526; color: #cccccc; max-height: 400px; }
    .palette-input { padding: 12px; border: none; background: #3c3c3c; color: #fff; font-size: 14px; }
    .palette-input:focus { outline: none; }
    .palette-list { max-height: 300px; overflow-y: auto; }
    .palette-item { padding: 8px 12px; cursor: pointer; }
    .palette-item:hover { background: #007acc; }
  `;

  render() {
    return html`
      <input class="palette-input" placeholder="Type a command..." />
      <div class="palette-list">
        <div class="palette-item">File: New Transaction</div>
        <div class="palette-item">View: Dashboard</div>
        <div class="palette-item">View: Transactions</div>
      </div>
    `;
  }
}
```

- [ ] **Step 4: Create index.ts entry point**

`src/renderer/index.ts`:

```typescript
import './components/activity-bar.ts';
import './components/navigation-panel.ts';
import './components/workspace.ts';
import './components/ai-panel.ts';
import './components/command-palette.ts';
```

- [ ] **Step 5: Commit components**

```bash
git add src/renderer/components/ src/renderer/index.ts
git commit -m "feat: add Lit web components for VS Code-inspired UI panels"
```

---

## Task 6: E2E Smoke Test and Verification

**Files:**
- Create: `tests/e2e/smoke.test.ts`
- Create: `tests/fixtures/test-setup.ts`

- [ ] **Step 1: Create test setup**

`tests/fixtures/test-setup.ts`:

```typescript
// Test setup for DOM testing with Lit
import '@testing-library/jest-dom';
```

- [ ] **Step 2: Create smoke test (focus on major workflows, skip trivial UI)**

`tests/e2e/smoke.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Phase 1 Smoke Tests', () => {
  test('should boot and display all major panels', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await expect(page.locator('#activity-bar')).toBeVisible();
    await expect(page.locator('#workspace')).toBeVisible();
    await expect(page.locator('#ai-panel')).toBeVisible();
    await expect(page.locator('#status-bar')).toBeVisible();
  });

  test('layout should use CSS grid for responsive structure', async ({ page }) => {
    await page.goto('http://localhost:5173');
    const app = page.locator('#app');
    const computedStyle = await app.evaluate(el => getComputedStyle(el));
    expect(computedStyle.display).toBe('grid');
  });

  test('command palette should be hidden by default', async ({ page }) => {
    await page.goto('http://localhost:5173');
    const palette = page.locator('#command-palette');
    await expect(palette).toBeHidden();
  });
});
```

- [ ] **Step 3: Configure playwright**

Create `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { browser: 'chromium' } }],
});
```

- [ ] **Step 4: Run verification**

```bash
npm run typecheck
npm run lint
npm run start
# Verify Electron window opens with correct layout
```

- [ ] **Step 5: Commit**

```bash
git add tests/ playwright.config.ts
git commit -m "test: add smoke tests for core shell boot and layout verification"
```

---

## Phase 1 Deliverable Verification

- [ ] Bootable Electron app opens successfully
- [ ] Four-panel VS Code-inspired layout visible
- [ ] Command Palette component present (hidden by default)
- [ ] All TypeScript compiles in strict mode
- [ ] Smoke tests pass (layout and boot verification)