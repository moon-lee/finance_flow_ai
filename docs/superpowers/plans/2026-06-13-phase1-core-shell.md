---
title: Phase 1 - Core Shell Prototype
date: 2026-06-13
status: draft
---

# Phase 1 - Core Shell Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bootable Electron application with VS Code-inspired layout (Activity Bar, Navigation Panel, Workspace tabs, AI Panel, Status Bar, Command Palette stub)

**Architecture:** Electron shell with isolated renderer processes, using Lit for web components and Vite for building. Layout mimics VS Code with fixed panel structure, static Command Palette display.

**Tech Stack:** Electron, TypeScript (strict mode), Lit, Vite, HTML, CSS

---

## File Structure

```
finance-flow-ai/
├── package.json              # Root project config, dependencies
├── electron-main.ts          # Main process entry point
├── electron-preload.ts       # Secure context bridge (no Node integration)
├── src/
│   ├── main/
│   │   └── main.ts           # Electron main process bootstrap
│   ├── renderer/             # UI process (no Node access)
│   │   ├── index.html        # Main window shell
│   │   ├── styles/
│   │   │   └── layout.css    # VS Code-like layout styling
│   │   └── components/
│   │       ├── activity-bar.ts       # Left sidebar icons
│   │       ├── navigation-panel.ts   # Context-aware sidebar
│   │       ├── workspace.ts          # Tabbed editor area
│   │       ├── ai-panel.ts           # Right collapsible panel
│   │       └── command-palette.ts    # VS Code-style command palette
│   └── types/
│       └── finance.d.ts      # Core API type declarations
└── tests/
    └── e2e/
        └── smoke.test.ts     # Basic app boot verification
```

---

## Task 1: Initialize Project Structure

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`

- [ ] **Step 1: Initialize npm project with base dependencies**

```bash
npm init -y
npm pkg set type="module"
npm pkg set scripts.dev="electron ."
npm pkg set scripts.build="vite build"
npm pkg set scripts.lint="eslint src --ext .ts"
npm pkg set scripts.typecheck="tsc --noEmit"
```

- [ ] **Step 2: Install dependencies**

```bash
npm install -D typescript vite electron @types/node @types/electron
npm install -D lit concurrently wait-on
npm install -D @typescript-eslint/eslint-parser @typescript-eslint/eslint-plugin
npm install -D vitest @vitest/coverage-v8
```

- [ ] **Step 3: Create tsconfig.json**

Create `tsconfig.json`:

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
    "rootDir": "./src",
    "outDir": "./dist",
    "declaration": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "tests"]
}
```

- [ ] **Step 4: Create vite.config.ts**

Create `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  },
  server: {
    port: 5173
  }
});
```

- [ ] **Step 5: Commit initialization**

```bash
git add package.json tsconfig.json vite.config.ts
git commit -m "chore: initialize project with Electron, TypeScript, Vite, Lit"
```

---

## Task 2: Create Electron Main Process

**Files:**
- Create: `src/main/main.ts`
- Create: `electron-main.ts`

- [ ] **Step 1: Write main process bootstrap test**

Create `tests/unit/main.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('Main Process', () => {
  it('should create BrowserWindow on app ready', () => {
    // Test that createWindow function exists
    expect(typeof createWindow).toBe('function');
  });

  it('should configure preload script path', () => {
    const config = getWindowConfig();
    expect(config.webPreferences?.preload).toContain('preload.js');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest tests/unit/main.test.ts -v
# Expected: FAIL (createWindow not defined)
```

- [ ] **Step 3: Create Electron main process**

Create `src/main/main.ts`:

```typescript
import { app, BrowserWindow } from 'electron';
import { join } from 'path';

export function getWindowConfig() {
  return {
    webPreferences: {
      preload: join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
}

export function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    ...getWindowConfig(),
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 }
  });

  mainWindow.loadFile(join(__dirname, '../index.html'));

  return mainWindow;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
```

- [ ] **Step 4: Create electron-main.ts entry point**

Create `electron-main.ts`:

```typescript
import { app } from 'electron';

// This file is the actual entry point referenced in package.json
// It re-exports the main process logic
export * from './src/main/main.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest tests/unit/main.test.ts -v
# Expected: PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/main/main.ts electron-main.ts tests/unit/main.test.ts
git commit -m "feat: add Electron main process bootstrap"
```

---

## Task 3: Create Secure Preload Script

**Files:**
- Create: `src/preload.ts`

- [ ] **Step 1: Write preload security test**

Create `tests/unit/preload.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('Preload Script', () => {
  it('should expose contextBridge with no Node globals', () => {
    // Verify no Node integration in renderer context
    expect(process.contextIsolated).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest tests/unit/preload.test.ts -v
# Expected: FAIL (no preload.ts exists)
```

- [ ] **Step 3: Create preload script**

Create `src/preload.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('financeAPI', {
  // Placeholder for future IPC methods
  // Extensions will use postMessage for communication
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

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest tests/unit/preload.test.ts -v
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/preload.ts tests/unit/preload.test.ts
git commit -m "feat: add secure preload script with contextBridge"
```

---

## Task 4: Create HTML Shell and CSS Layout

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/styles/layout.css`

- [ ] **Step 1: Write layout structure test**

Create `tests/e2e/layout.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Core Shell Layout', () => {
  test('should render all VS Code-inspired panels', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    await expect(page.locator('#activity-bar')).toBeVisible();
    await expect(page.locator('#navigation-panel')).toBeVisible();
    await expect(page.locator('#workspace')).toBeVisible();
    await expect(page.locator('#ai-panel')).toBeVisible();
    await expect(page.locator('#status-bar')).toBeVisible();
  });

  test('should have command palette trigger', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await expect(page.locator('#command-palette-trigger')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest tests/e2e/layout.test.ts -v
# Expected: FAIL (no index.html exists)
```

- [ ] **Step 3: Create index.html**

Create `src/renderer/index.html`:

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

- [ ] **Step 4: Create layout CSS**

Create `src/styles/layout.css`:

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

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

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

#activity-bar {
  grid-column: 1;
  grid-row: 1 / -1;
  background: var(--activity-bar-bg);
}

#navigation-panel {
  grid-column: 2;
  grid-row: 1 / -1;
  background: var(--sidebar-bg);
}

#workspace {
  grid-column: 3;
  grid-row: 1 / -1;
  overflow: auto;
  padding: 16px;
}

#ai-panel {
  grid-column: 4;
  grid-row: 1 / -1;
  background: var(--sidebar-bg);
  transition: transform 0.2s ease;
}

#ai-panel.collapsed {
  transform: translateX(100%);
}

#status-bar {
  grid-column: 2 / 4;
  grid-row: 2;
  background: var(--status-bar-bg);
  color: white;
  padding: 0 16px;
  display: flex;
  align-items: center;
  font-size: 12px;
}

#command-palette {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 600px;
  background: #252526;
  border: 1px solid #007acc;
  border-radius: 4px;
  z-index: 1000;
}

#command-palette.hidden {
  display: none;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #888;
  font-size: 14px;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run dev & npx wait-on http://localhost:5173 && npx playwright test tests/e2e/layout.test.ts
# Expected: PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.html src/styles/layout.css tests/e2e/layout.test.ts
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

- [ ] **Step 1: Write component rendering tests**

Create `tests/unit/components.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { html, render } from 'lit';

describe('Web Components', () => {
  it('should render ActivityBar with icons', () => {
    const container = document.createElement('div');
    render(html`<activity-bar></activity-bar>`, container);
    expect(container.querySelector('activity-bar')).toBeTruthy();
  });

  it('should render CommandPalette in hidden state initially', () => {
    const container = document.createElement('div');
    render(html`<command-palette></command-palette>`, container);
    expect(container.querySelector('.hidden')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest tests/unit/components.test.ts -v
# Expected: FAIL (no components exist)
```

- [ ] **Step 3: Create activity-bar.ts component**

Create `src/renderer/components/activity-bar.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('activity-bar')
export class ActivityBar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px 0;
      gap: 8px;
    }
    .activity-item {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      cursor: pointer;
      color: #cccccc;
    }
    .activity-item:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .activity-item.active {
      color: #ffffff;
      background: #007acc;
    }
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

- [ ] **Step 4: Create navigation-panel.ts component**

Create `src/renderer/components/navigation-panel.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('navigation-panel')
export class NavigationPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      padding: 8px;
    }
    .nav-section {
      margin-bottom: 16px;
    }
    .nav-title {
      font-size: 11px;
      text-transform: uppercase;
      color: #cccccc;
      padding: 8px 12px 4px;
    }
    .nav-item {
      padding: 4px 12px;
      cursor: pointer;
      font-size: 13px;
    }
    .nav-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }
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

- [ ] **Step 5: Create workspace.ts component**

Create `src/renderer/components/workspace.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('workspace')
export class Workspace extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
  `;

  render() {
    return html`<slot></slot>`;
  }
}
```

- [ ] **Step 6: Create ai-panel.ts component**

Create `src/renderer/components/ai-panel.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('ai-panel')
export class AIPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      padding: 8px;
    }
    .ai-header {
      font-weight: 600;
      padding: 8px;
      margin-bottom: 8px;
    }
    .ai-content {
      flex: 1;
      font-size: 13px;
    }
  `;

  @property({ type: Boolean }) collapsed = false;

  render() {
    return html`
      <div class="ai-header">AI Assistant</div>
      <div class="ai-content">Chat panel placeholder</div>
    `;
  }
}
```

- [ ] **Step 7: Create command-palette.ts component**

Create `src/renderer/components/command-palette.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('command-panel')
export class CommandPalette extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      background: #252526;
      color: #cccccc;
      max-height: 400px;
    }
    .palette-input {
      padding: 12px;
      border: none;
      background: #3c3c3c;
      color: #fff;
      font-size: 14px;
    }
    .palette-input:focus {
      outline: none;
    }
    .palette-list {
      max-height: 300px;
      overflow-y: auto;
    }
    .palette-item {
      padding: 8px 12px;
      cursor: pointer;
    }
    .palette-item:hover {
      background: #007acc;
    }
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

- [ ] **Step 8: Create index.ts entry point**

Create `src/renderer/index.ts`:

```typescript
import './components/activity-bar.ts';
import './components/navigation-panel.ts';
import './components/workspace.ts';
import './components/ai-panel.ts';
import './components/command-palette.ts';
```

- [ ] **Step 9: Run test to verify it passes**

```bash
npx vitest tests/unit/components.test.ts -v
# Expected: PASS
```

- [ ] **Step 10: Commit**

```bash
git add src/renderer/components/ src/renderer/index.ts tests/unit/components.test.ts
git commit -m "feat: add Lit web components for VS Code-inspired UI panels"
```

---

## Task 6: Integrate Build Scripts and Verify Boot

**Files:**
- Modify: `package.json`
- Create: `tests/e2e/smoke.test.ts`

- [ ] **Step 1: Add build scripts to package.json**

Update `package.json`:

```json
{
  "scripts": {
    "dev": "concurrently \"npm:build:watch\" \"npm:start:electron\"",
    "build:watch": "vite build --watch",
    "start:electron": "wait-on http://localhost:5173 && electron .",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts"
  }
}
```

- [ ] **Step 2: Write smoke test**

Create `tests/e2e/smoke.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Application Smoke Test', () => {
  test('should boot and display all panels', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    // Verify all panels render
    expect(await page.locator('#activity-bar').count()).toBe(1);
    expect(await page.locator('#workspace').count()).toBe(1);
    expect(await page.locator('#ai-panel').count()).toBe(1);
    expect(await page.locator('#status-bar').count()).toBe(1);
  });

  test('should have responsive layout', async ({ page }) => {
    await page.goto('http://localhost:5173');
    const app = page.locator('#app');
    const computedStyle = await app.evaluate(el => getComputedStyle(el));
    expect(computedStyle.display).toBe('grid');
  });
});
```

- [ ] **Step 3: Run full verification**

```bash
npm run typecheck
npm run lint
# Both should complete with no errors

# Manual verification:
npm run dev
# Verify Electron window opens with correct layout
```

- [ ] **Step 4: Commit**

```bash
git add package.json tests/e2e/smoke.test.ts
git commit -m "chore: configure build scripts and add smoke tests"
```

---

## Phase 1 Deliverable Verification

- [ ] Bootable Electron app opens successfully
- [ ] Four-panel VS Code-inspired layout visible
- [ ] Command Palette component present (hidden by default)
- [ ] All TypeScript compiles in strict mode
- [ ] All tests pass (unit and e2e)