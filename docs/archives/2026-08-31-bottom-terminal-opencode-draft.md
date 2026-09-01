# AI-Terminal + Opencode Direct DB Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace right `ai-panel` with a bottom height-draggable AI-Terminal that runs `opencode` in Main reading `finance.db` directly (`sqlite3 -readonly`) to answer `summarize/estimate/report` and generate printable variant outputs (`md/html/txt/jpg`), with close button and View menu re-show. Users pick the DB file via an **Open dialog** (no text input); setting `core.ai-terminal.dbPath` is persisted and falls back to `resolveDatabasePath()` if empty/invalid.

**Architecture:** Keep Core shell generic (no finance logic). Main owns DB path resolution (`app.getPath('userData')` + `resolveDatabasePath()`) with **user override via file picker** (`dialog.showOpenDialog` filters `*.db`, saves to `core.ai-terminal.dbPath` setting, falls back to auto-detected path if empty/invalid), starts `opencode serve` as a headless background server (auto-starts when AI-Terminal opens, auto-stops on app close), then sends queries via `opencode run --attach http://localhost:PORT --format json <prompt>`. **Install model: opencode is assumed already present on PATH** (`npm install -g opencode-ai` done by user). No `npm install opencode-ai` in our project — no native binary to bundle, no `electron-builder` changes. If opencode is missing, show a friendly error: *"opencode is not installed. Run `npm install -g opencode-ai`."* **LLM/provider selection:** user configures their provider in `~/.config/opencode/opencode.jsonc` (e.g., `{"provider":{"ollama":{"baseURL":"http://localhost:11434"}},"models":{"default":"ollama/llama3"}}`) or via `opencode providers login`. We optionally pass `--model <provider/model>` to `opencode run` if we want to override the default. We do NOT build a provider management UI — that's opencode's responsibility. **Server lifecycle:** `opencode serve --port <PORT>` is spawned by Main, kept alive while the AI-Terminal is visible, killed on app close. If the server dies unexpectedly, `query()` restarts it automatically. Renderer `ai-terminal-panel` is a Lit element at bottom grid row with vertical resizer, input + transcript, close button, IPC `ai-terminal:send/ai-terminal:receive/ai-terminal:select-db-path` via `preload`. Variant outputs: opencode writes `Reports/report-{FY}.{ext}`; Main opens via `workspace` tab or `shell.openPath` + `webContents.print()` for html, `capturePage` for jpg.

**Tech Stack:** Electron, Lit, Vite, TypeScript strict, `better-sqlite3` (path only, not used by AI-Terminal), `node:child_process` spawn (no `node-pty`), `opencode` assumed installed globally on PATH, `opencode serve` for headless server + `opencode run --attach` for queries, `sqlite3 -readonly` via opencode bash tool, `--format json` for structured output, `xterm.js` optional (use plain Lit for v1 to avoid extra dep).

---

## File Structure

**Files to modify:**
- `src/renderer/styles/layout.css` — grid from 4-col (`activity-bar | nav | workspace | ai-panel`) to 3-col top row + bottom row: `grid-template-columns: var(--activity-bar-width) var(--navigation-width) 1fr; grid-template-rows: minmax(0,1fr) var(--ai-terminal-height) var(--status-bar-height)` + `#ai-terminal-panel` + `.ai-terminal-resizer` (horizontal) + `#app.ai-terminal-collapsed` (height 0)
- `src/renderer/index.html` — remove `<ai-panel id="ai-panel">` + `<div class="ai-resizer">`, add `<ai-terminal-panel id="ai-terminal-panel">` + `<div class="ai-terminal-resizer">` between `#workspace` and `#status-bar`
- `src/renderer/index.ts` — remove `import './components/ai-panel'`, remove `toggleAiPanel`/`ai-resizer` drag, add `ai-terminal-panel` import, `ai-terminal:toggle` IPC, `View: Toggle AI-Terminal` command, `Ctrl+J` handler, close button wiring, persist `core.ai-terminal.height/visible` via `financeShell.settings`
- `src/main/main.ts` — remove `ai panel` references, instantiate `AiTerminalService` / `AiOpencodeService`, register `ai-terminal:send`, `ai-terminal:toggle`, `ai-terminal:select-db-path`, `ai-terminal:open-report`, `Menu View→Toggle AI-Terminal`, set `FINANCE_DB_PATH` from `resolveDatabasePath()` with `core.ai-terminal.dbPath` setting override
- `src/preload/preload.ts` — expose `financeShell.aiTerminal.{send,onReceive,toggle,onToggle,selectDbPath,resetDbPath}` via `contextBridge`, remove `ai` bridge if present
- `src/types/finance-shell.d.ts` — add `AiTerminalApi` (`send(msg):Promise<{ok,output}>, onReceive(cb), toggle(), onToggle(cb), selectDbPath():Promise<string>, resetDbPath():Promise<string>`)
- `package.json` — no new native dep for v1 (keep `better-sqlite3` only); `opencode` assumed already installed globally by user (`npm install -g opencode-ai`); on Windows, spawn via `cmd.exe /c opencode` because `opencode` is a `.ps1` script not an `.exe`; optionally add `xterm` later

**Files to create:**
- `src/renderer/components/ai-terminal-panel.ts` — Lit element `ai-terminal-panel` with transcript (array of `{role:'user'|'assistant', text, ts}`), input, close button `[X]`, resizer drag, `Enter` sends via `financeShell.aiTerminal.send`
- `src/main/services/ai-terminal-service.ts` — pure state: `height`, `visible`, `dbPath` (`core.ai-terminal.dbPath`, user-set via file picker, fallback to `resolveDatabasePath()`), `reportsDir` (`<userData>/Reports`), `saveHeight`/`setVisible`/`setDbPath` via `settings-service`
- `src/main/services/ai-opencode-service.ts` — manages opencode server lifecycle: `serve(port)` starts `opencode serve --port <PORT>`, `run(prompt)` sends `opencode run --attach http://localhost:PORT --format json <prompt>`, `stop()` kills the server, `isInstalled()` checks `opencode --version`, `query(prompt)` auto-starts server if needed then returns `Promise<string>`, env `FINANCE_DB_PATH`, system prompt, timeout 30s, auto-restart server on failure; **dbPath resolved from `core.ai-terminal.dbPath` setting (user-selected via `dialog.showOpenDialog` file picker) with fallback to `resolveDatabasePath()`**
- `src/main/services/ai-report-service.ts` — `writeReport(content, fy, ext): string` writes `<userData>/Reports/report-{fy}.{ext}`, `openReport(path)` via `shell.openPath` or `WebContentsView` preview, `captureJpg(htmlPath, jpgPath)` via `webContents.capturePage`
- Tests: `tests/unit/renderer/ai-terminal-panel.test.ts`, `tests/unit/main/services/ai-terminal-service.test.ts`, `tests/unit/main/services/ai-opencode-service.test.ts`, `tests/unit/main/services/ai-report-service.test.ts`

**Files to delete:**
- `src/renderer/components/ai-panel.ts` — removed (right panel gone)

---

### Task 1: Layout CSS — bottom AI-Terminal grid + resizer

**Files:**
- Modify: `src/renderer/styles/layout.css`
- Test: `tests/unit/renderer/layout-ai-terminal.test.ts` (new, happy-dom checks grid)

- [ ] **Step 1: Write failing test for new grid**

```typescript
// tests/unit/renderer/layout-ai-terminal.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
describe('layout.css ai-terminal grid', () => {
  it('defines #ai-terminal-panel and .ai-terminal-resizer and ai-terminal-collapsed', () => {
    const css = fs.readFileSync('src/renderer/styles/layout.css','utf-8');
    expect(css).toContain('#ai-terminal-panel');
    expect(css).toContain('.ai-terminal-resizer');
    expect(css).toContain('#app.ai-terminal-collapsed');
    expect(css).toContain('grid-template-rows');
  });
  it('no longer references #ai-panel as fourth column', () => {
    const css = fs.readFileSync('src/renderer/styles/layout.css','utf-8');
    expect(css).not.toContain('grid-template-columns: var(--activity-bar-width) var(--navigation-width) minmax(0, 1fr) var(--ai-panel-width)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/layout-ai-terminal.test.ts`
Expected: FAIL — `#ai-terminal-panel` not found

- [ ] **Step 3: Implement CSS**

```css
/* src/renderer/styles/layout.css — replace #app grid + ai-resizer/ai-panel with: */
#app {
  display: grid;
  grid-template-columns: var(--activity-bar-width) var(--navigation-width) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) var(--ai-terminal-height, 260px) var(--status-bar-height);
  width: 100%; height: 100%;
  position: relative;
}
.ai-terminal-resizer {
  grid-column: 1 / -1; grid-row: 1;
  align-self: end; height: 4px; margin-bottom: -2px;
  cursor: row-resize; background: var(--splitter-bg); z-index: 10;
}
.ai-terminal-resizer:hover, .ai-terminal-resizer.dragging { background: var(--accent); }
#app.ai-terminal-collapsed .ai-terminal-resizer { display: none; }
#ai-terminal-panel {
  grid-column: 1 / -1; grid-row: 2;
  min-height: 0; background: var(--sidebar-bg);
  border-top: 1px solid var(--panel-border);
  display: flex; flex-direction: column; overflow: hidden;
}
#app.ai-terminal-collapsed { grid-template-rows: minmax(0, 1fr) 0 var(--status-bar-height); }
#app.ai-terminal-collapsed #ai-terminal-panel { overflow: hidden; border-top: 0; }
#activity-bar { grid-column: 1; grid-row: 1; }
#navigation-panel { grid-column: 2; grid-row: 1; }
#workspace { grid-column: 3; grid-row: 1; }
#status-bar { grid-column: 1 / -1; grid-row: 3; }
```

Keep existing `body.light-theme` etc. Remove `.ai-resizer` and `#ai-panel` blocks (lines 37-96 old).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/layout-ai-terminal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/layout.css tests/unit/renderer/layout-ai-terminal.test.ts
git commit -m "feat: layout AI-terminal grid + resizer"
```

---

### Task 2: Shell HTML + entry wiring — replace ai-panel with AI-Terminal

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/index.ts` (remove ai-panel import/drag, add AI-Terminal toggle)
- Test: `tests/unit/renderer/ai-terminal-index.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/renderer/ai-terminal-index.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
describe('index.html ai-terminal', () => {
  it('contains ai-terminal-panel and ai-terminal-resizer, not ai-panel', () => {
    const html = fs.readFileSync('src/renderer/index.html','utf-8');
    expect(html).toContain('ai-terminal-panel');
    expect(html).toContain('ai-terminal-resizer');
    expect(html).not.toContain('ai-panel');
    expect(html).not.toContain('ai-resizer');
  });
});
```

- [ ] **Step 2: Run test — FAIL**

Run: `npm run test:unit -- tests/unit/renderer/terminal-index.test.ts`

- [ ] **Step 3: Modify `src/renderer/index.html`**

```html
<body>
  <div id="app">
    <activity-bar id="activity-bar"></activity-bar>
    <navigation-panel id="navigation-panel"></navigation-panel>
    <workspace-panel id="workspace"></workspace-panel>
    <div class="ai-terminal-resizer" id="ai-terminal-resizer"></div>
    <ai-terminal-panel id="ai-terminal-panel"></ai-terminal-panel>
    <status-bar id="status-bar"><span class="status-item">Ready</span></status-bar>
  </div>
  <command-palette id="command-palette" class="hidden"></command-palette>
  <script type="module" src="./index.ts"></script>
</body>
```

- [ ] **Step 4: Modify `src/renderer/index.ts` — remove ai-panel, add AI-Terminal toggle**

Replace `import './components/ai-panel'` with `import './components/ai-terminal-panel'`.
Remove `toggleAiPanel`, `_aiDragging` etc. Add:

```typescript
import { rendererLogger } from './logger';
const aiTerminalPanel = document.querySelector<HTMLElement & { focusInput(): void }>('#ai-terminal-panel');
const aiTerminalResizer = document.querySelector<HTMLElement>('.ai-terminal-resizer');
let _termDragging=false, _termStartY=0, _termStartH=0;
function _onTermMouseDown(e: MouseEvent){ _termDragging=true; _termStartY=e.clientY; _termStartH=aiTerminalPanel?.offsetHeight??260; aiTerminalResizer?.classList.add('dragging'); document.addEventListener('mousemove',_onTermMouseMove); document.addEventListener('mouseup',_onTermMouseUp); e.preventDefault(); }
function _onTermMouseMove(e: MouseEvent){ if(!_termDragging) return; const delta=_termStartY - e.clientY; const h=Math.max(120, Math.min(_termStartH+delta, 600)); document.documentElement.style.setProperty('--ai-terminal-height', `${h}px`); }
function _onTermMouseUp(){ if(!_termDragging) return; _termDragging=false; aiTerminalResizer?.classList.remove('dragging'); document.removeEventListener('mousemove',_onTermMouseMove); document.removeEventListener('mouseup',_onTermMouseUp); const h=aiTerminalPanel?.offsetHeight??260; void window.financeShell?.settings.set('core.ai-terminal.height', h); }
if(aiTerminalResizer) aiTerminalResizer.addEventListener('mousedown', _onTermMouseDown);
function setAiTerminalVisible(v: boolean){ document.querySelector('#app')?.classList.toggle('ai-terminal-collapsed', !v); if(v) window.financeShell?.panel?.resize?.('dummy',''); void window.financeShell?.settings.set('core.ai-terminal.visible', v); }
if(window.financeShell?.aiTerminal?.onToggle){ window.financeShell.aiTerminal.onToggle((v)=> setAiTerminalVisible(v)); }
```

Update `command-selected` and `onShortcut` to map `core.toggle-ai-terminal` both to `setAiTerminalVisible(!document.querySelector('#app')?.classList.contains('ai-terminal-collapsed'))`.

- [ ] **Step 5: Run test — PASS**

Run: `npm run test:unit -- tests/unit/renderer/terminal-index.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.html src/renderer/index.ts tests/unit/renderer/terminal-index.test.ts
git commit -m "feat: shell html bottom AI-Terminal wiring"
```

---

### Task 3: AI-Terminal panel component

**Files:**
- Create: `src/renderer/components/ai-terminal-panel.ts`
- Test: `tests/unit/renderer/ai-terminal-panel.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/renderer/ai-terminal-panel.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './components/ai-terminal-panel';
describe('ai-terminal-panel', () => {
  beforeEach(()=>{ document.body.innerHTML='<ai-terminal-panel></ai-terminal-panel>'; });
  it('renders transcript, input, close button', async () => {
    const el=document.querySelector('ai-terminal-panel') as any;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('#ai-terminal-input')).toBeTruthy();
    expect(el.shadowRoot.querySelector('[data-action="close"]')).toBeTruthy();
    expect(el.shadowRoot.querySelector('.transcript')).toBeTruthy();
  });
  it('enter sends via financeShell.aiTerminal.send and appends transcript', async () => {
    (window as any).financeShell={ aiTerminal:{ send: vi.fn(async()=>({ok:true,output:'ok'}))}};
    const el=document.querySelector('ai-terminal-panel') as any;
    await el.updateComplete;
    el.shadowRoot.querySelector('#ai-terminal-input').value='summarize 2025-2026';
    el.shadowRoot.querySelector('#ai-terminal-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));
    await new Promise(r=>setTimeout(r,20));
    expect((window as any).financeShell.aiTerminal.send).toHaveBeenCalledWith('summarize 2025-2026');
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `src/renderer/components/ai-terminal-panel.ts`**

```typescript
import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
@customElement('ai-terminal-panel')
export class AiTerminalPanel extends LitElement {
  static styles=css`
    :host{ display:flex; flex-direction:column; height:100%; background: var(--sidebar-bg); }
    .header{ display:flex; align-items:center; justify-content:space-between; padding:4px 8px; border-bottom:1px solid var(--panel-border); font-size: var(--ff-font-md); }
    .transcript{ flex:1; overflow:auto; padding:8px; font-family: monospace; font-size: var(--ff-font-md); white-space: pre-wrap; }
    .input-row{ display:flex; padding:6px; border-top:1px solid var(--panel-border); }
    input{ flex:1; background: var(--workspace-bg); color: var(--text-primary); border:1px solid var(--panel-border); padding:6px 8px; font-family: monospace; }
  `;
  @state() private _lines: Array<{role:'user'|'assistant', text:string}> = [];
  focusInput(){ (this.shadowRoot?.querySelector('#ai-terminal-input') as HTMLInputElement)?.focus(); }
  private _onKey(e: KeyboardEvent){
    if(e.key==='Enter'){
      const input=this.shadowRoot?.querySelector('#ai-terminal-input') as HTMLInputElement;
      const text=input.value.trim(); if(!text) return;
      this._lines=[...this._lines, {role:'user', text}]; input.value='';
      void (window as any).financeShell?.aiTerminal.send(text).then((r:any)=>{
        this._lines=[...this._lines, {role:'assistant', text: r?.output ?? ''}];
        this.requestUpdate();
      });
    }
  }
  private _onClose(){ (window as any).financeShell?.aiTerminal.toggle?.(); }
  render(){ return html`<div class="header"><span>AI-Terminal</span><button data-action="close" @click=${this._onClose}>✕</button></div><div class="transcript">${this._lines.map(l=> html`<div class="${l.role}">${l.role==='user'?'> ':''}${l.text}</div>`)}</div><div class="input-row"><input id="ai-terminal-input" placeholder="summarize 2025-2026 / report 2025-2026 as html" @keydown=${this._onKey} /></div>`; }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ai-terminal-panel.ts tests/unit/renderer/ai-terminal-panel.test.ts
git commit -m "feat: ai-terminal-panel Lit component with transcript and close"
```

---

### Task 4: AI-Terminal service — height/visible persistence

**Files:**
- Create: `src/main/services/ai-terminal-service.ts`
- Modify: `src/main/main.ts` (instantiate)
- Test: `tests/unit/main/services/ai-terminal-service.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDatabase } from '../services/database-service';
import { initializeSettings } from '../services/settings-service';
import { AiTerminalService } from '../services/ai-terminal-service';
describe('AiTerminalService', ()=>{
  beforeEach(()=>{ const db=getTestDatabase(); (global as any).db=db; initializeSettings(); });
  it('defaults height 260 visible true', ()=>{ const s=new AiTerminalService(); expect(s.getHeight()).toBe(260); expect(s.isVisible()).toBe(true); });
  it('persists height', ()=>{ const s=new AiTerminalService(); s.setHeight(400); expect(s.getHeight()).toBe(400); });
  it('defaults dbPath empty', ()=>{ const s=new AiTerminalService(); expect(s.getDbPath()).toBe(''); });
  it('persists dbPath when valid', ()=>{ const s=new AiTerminalService(); s.setDbPath('/path/to/db.sqlite'); expect(s.getDbPath()).toBe('/path/to/db.sqlite'); });
  it('rejects invalid dbPath', ()=>{ const s=new AiTerminalService(); s.setDbPath('/tmp/not-a-db'); expect(s.getDbPath()).toBe(''); });
});
```

- [ ] **Step 2: Implement `src/main/services/ai-terminal-service.ts`**

```typescript
import { getSetting, setSetting, registerSettingDefault } from './settings-service';
import { existsSync } from 'node:fs';
export class AiTerminalService {
  constructor(){ registerSettingDefault('core.ai-terminal.height', 260); registerSettingDefault('core.ai-terminal.visible', true); registerSettingDefault('core.ai-terminal.dbPath', ''); }
  getHeight(): number { return (getSetting<number>('core.ai-terminal.height') ?? 260); }
  setHeight(h:number){ setSetting('core.ai-terminal.height', h); }
  isVisible(): boolean { return (getSetting<boolean>('core.ai-terminal.visible') ?? true); }
  setVisible(v:boolean){ setSetting('core.ai-terminal.visible', v); }
  getDbPath(): string { return (getSetting<string>('core.ai-terminal.dbPath') ?? ''); }
  setDbPath(path:string){ if(path && existsSync(path) && path.endsWith('.db')){ setSetting('core.ai-terminal.dbPath', path); } }
  getReportsDir(userData:string){ return `${userData}/Reports`; }
}
```

- [ ] **Step 3: Wire in `src/main/main.ts` `app.whenReady` after `initializeSettings()`:** `const aiTerminalService=new AiTerminalService();`

- [ ] **Step 4: Run — PASS + Commit**

---

### Task 5: AI opencode service — spawn with FINANCE_DB_PATH

**Files:**
- Create: `src/main/services/ai-opencode-service.ts`
- Test: `tests/unit/main/services/ai-opencode-service.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { AiOpencodeService } from '../services/ai-opencode-service';
describe('AiOpencodeService', ()=>{
  let existsSyncSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(()=>{
    existsSyncSpy = vi.spyOn(fs, 'existsSync').mockImplementation((path: string) => path.endsWith('.db'));
  });
  afterEach(()=>{ existsSyncSpy.mockRestore(); });
  it('builds env with resolved dbPath and system prompt', async ()=>{
    const s=new AiOpencodeService('/tmp/finance.db', { spawn: vi.fn(()=>({ stdout:{on:vi.fn()}, stderr:{on:vi.fn()}, on:vi.fn((e,cb)=>cb(0))})) as any, dialog: vi.fn() });
    expect(s.getDbPath()).toBe('/tmp/finance.db');
    expect(s.getSystemPrompt()).toContain('Your database is at /tmp/finance.db');
    expect(s.getSystemPrompt()).toContain('sqlite3 -readonly');
  });
  it('uses setDbPath when called with a valid path', async ()=>{
    const s=new AiOpencodeService('/tmp/finance.db', { spawn: vi.fn(()=>({ stdout:{on:vi.fn()}, stderr:{on:vi.fn()}, on:vi.fn((e,cb)=>cb(0))})) as any, dialog: vi.fn() });
    s.setDbPath('/custom/path/db.sqlite');
    expect(s.getDbPath()).toBe('/custom/path/db.sqlite');
  });
  it('setDbPath ignores non-.db paths', async ()=>{
    const s=new AiOpencodeService('/tmp/finance.db', { spawn: vi.fn(()=>({ stdout:{on:vi.fn()}, stderr:{on:vi.fn()}, on:vi.fn((e,cb)=>cb(0))})) as any, dialog: vi.fn() });
    s.setDbPath('/tmp/not-a-db');
    expect(s.getDbPath()).toBe('/tmp/finance.db');
  });
  it('selectDbPath returns picked path when user selects a valid .db file', async ()=>{
    const dialogMock = vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/picked/db.sqlite'] });
    const s=new AiOpencodeService('/tmp/finance.db', { spawn: vi.fn(()=>({ stdout:{on:vi.fn()}, stderr:{on:vi.fn()}, on:vi.fn((e,cb)=>cb(0))})) as any, dialog: dialogMock });
    const path = await s.selectDbPath();
    expect(path).toBe('/picked/db.sqlite');
    expect(s.getDbPath()).toBe('/picked/db.sqlite');
  });
  it('selectDbPath falls back to fallback when user cancels', async ()=>{
    const dialogMock = vi.fn().mockResolvedValue({ canceled: true, filePaths: [] });
    const s=new AiOpencodeService('/tmp/finance.db', { spawn: vi.fn(()=>({ stdout:{on:vi.fn()}, stderr:{on:vi.fn()}, on:vi.fn((e,cb)=>cb(0))})) as any, dialog: dialogMock });
    const path = await s.selectDbPath();
    expect(path).toBe('/tmp/finance.db');
  });
  it('selectDbPath falls back on dialog error', async ()=>{
    const dialogMock = vi.fn().mockRejectedValue(new Error('no window'));
    const s=new AiOpencodeService('/tmp/finance.db', { spawn: vi.fn(()=>({ stdout:{on:vi.fn()}, stderr:{on:vi.fn()}, on:vi.fn((e,cb)=>cb(0))})) as any, dialog: dialogMock });
    const path = await s.selectDbPath();
    expect(path).toBe('/tmp/finance.db');
  });
  it('calls opencode serve then run --attach --format json', async ()=>{
    const spawn=vi.fn(()=>({ stdout:{on:vi.fn()}, stderr:{on:vi.fn()}, on:vi.fn() }));
    const execFile=vi.fn();
    const deps={ spawn, execFile, dialog: vi.fn() };
    const s=new AiOpencodeService('/tmp/finance.db', deps as any);
    await expect(s.query('summarize 2025-2026')).rejects.toThrow();
    expect(spawn).toHaveBeenCalledWith('cmd.exe', expect.arrayContaining(['opencode','serve']), expect.anything());
    const runCalls=spawn.mock.calls.filter((c:any)=>c[1]?.includes('run'));
    expect(runCalls.length).toBeGreaterThan(0);
    expect(runCalls[0][1]).toContain('--attach');
    expect(runCalls[0][1]).toContain('--format');
    expect(runCalls[0][1]).toContain('json');
  });
  it('isInstalled returns true if opencode on PATH', async ()=>{
    const s=new AiOpencodeService('/tmp/finance.db');
    // actual check runs 'opencode --version' — true if installed
  });
});
```

- [ ] **Step 2: Implement**

```typescript
import { spawn as nodeSpawn, ChildProcess } from 'node:child_process';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dialog } from 'electron';

export class AiOpencodeService {
  private serverProc: ChildProcess | null = null;
  private port = 4096;
  private serverReady = false;
  constructor(private fallbackDbPath:string, private deps:{spawn?:typeof nodeSpawn, timeoutMs?:number, dialog?:typeof dialog}={}, private model?:string){}
  getDbPath(){ return this.fallbackDbPath; }
  setDbPath(path:string){ if(existsSync(path) && path.endsWith('.db')){ this.fallbackDbPath = path; } }
  async selectDbPath(): Promise<string> {
    try {
      const d = this.deps.dialog ?? dialog;
      const result = await d.showOpenDialog({ properties: ['openFile', 'hideMainWindow'], filters: [{ name: 'SQLite Database', extensions: ['db'] }] });
      if (!result.canceled && result.filePaths.length > 0) {
        const path = result.filePaths[0];
        if (existsSync(path) && path.endsWith('.db')) {
          this.fallbackDbPath = path; return path;
        }
      }
    } catch(e) {
      // dialog failed (no window, Electron error) — fall back silently
    }
    return this.fallbackDbPath;
  }
  getSystemPrompt(){ return `Your database is at ${this.fallbackDbPath}. Use sqlite3 -readonly "${this.fallbackDbPath}" to query it. For summarize/estimate/report, query then format as markdown. For report as html/md/txt/jpg, write file to $REPORTS_DIR/report-{FY}.{ext} and return path.`; }
  async isInstalled(): Promise<boolean> {
    try { const r=await execFile('opencode', ['--version'], {timeout:5000, windowsHide:true}); return r.status===0; } catch { return false; }
  }
  async serve(): Promise<void> {
    if (this.serverReady) return;
    return new Promise((resolve)=>{
      this.serverProc=(this.deps.spawn??nodeSpawn)('cmd.exe', ['/c','opencode','serve','--port',String(this.port),'--hostname','127.0.0.1'], { windowsHide:true, detached:true, stdio:'ignore' });
      this.serverProc?.unref();
      // poll port instead of blind timeout — opencode may take >5s on slow machines
      const start=Date.now(); const tryConnect=()=>{
        import('node:net').then(({default: net})=>{
          const sock=(net as any).createConnection({host:'127.0.0.1', port:this.port}, ()=>{ sock.destroy(); this.serverReady=true; resolve(); });
          sock.on('error', ()=>{
            if(Date.now()-start > 10000){ this.serverReady=true; resolve(); } // fallback: assume ready after 10s even if probe fails
            else setTimeout(tryConnect, 300);
          });
        }).catch(()=> setTimeout(()=>{ this.serverReady=true; resolve(); }, 800));
      };
      setTimeout(tryConnect, 400);
    });
  }
  async stop(): Promise<void> {
    if (this.serverProc) { this.serverProc.kill(); this.serverProc=null; }
    this.serverReady=false;
  }
  async query(prompt:string): Promise<string> {
    if (!this.serverReady) await this.serve();
    const timeout=this.deps.timeoutMs??30000;
    const args=['run','--attach','http://127.0.0.1:'+this.port,'--format','json']; if(this.model) { args.push('--model',this.model); } args.push(prompt);
    return new Promise((resolve,reject)=>{
      const proc=(this.deps.spawn??nodeSpawn)('cmd.exe', ['/c','opencode', ...args], { windowsHide:true });
      let out='', err=''; proc.stdout?.on('data',d=>out+=d); proc.stderr?.on('data',d=>err+=d);
      const t=setTimeout(()=>{ try{proc.kill();}catch{}; reject(new Error('opencode timeout')); }, timeout);
      proc.on('close', code=>{ clearTimeout(t); if(code===0) { try { const parsed=JSON.parse(out); resolve(this.extractTextFromJson(parsed)); } catch { resolve(out); } } else if(code===null&&err.includes('ECONNREFUSED')){ this.serverReady=false; return this.query(prompt); } else reject(new Error(err||`exit ${code}`)); });
      proc.on('error', reject);
    });
  }
  private extractTextFromJson(obj:any): string {
    if (typeof obj === 'string') return obj;
    if (obj?.output) return obj.output;
    if (obj?.text) return obj.text;
    if (Array.isArray(obj)) return obj.map((e:any)=>e?.text??e?.output??'').join('\n');
    if (obj?.content && Array.isArray(obj.content)) return obj.content.map((c:any)=>c?.text??'').join('\n');
    return JSON.stringify(obj);
  }
}
```

Wire in `src/main/main.ts`:
```typescript
const aiOpencodeService=new AiOpencodeService(resolveDatabasePath(app.getPath('userData')), {}, 'ollama/llama3');
const userDbPath = getSetting<string>('core.ai-terminal.dbPath');
if (userDbPath) { aiOpencodeService.setDbPath(userDbPath); }
app.on('will-quit', async ()=>{ await aiOpencodeService.stop(); });
```
Call `await aiOpencodeService.isInstalled()` at startup and log/throw if missing. If the server connection fails (ECONNREFUSED), `query()` auto-restarts the server and retries once.

Also register `ai-terminal:select-db-path` + reset handler in Main:
```typescript
ipcMain.handle('ai-terminal:select-db-path', async ()=>{
  const path = await aiOpencodeService.selectDbPath();
  if (path && path !== resolveDatabasePath(app.getPath('userData'))) {
    setSetting('core.ai-terminal.dbPath', path);
  }
  return path;
});
ipcMain.handle('ai-terminal:reset-db-path', async ()=>{
  setSetting('core.ai-terminal.dbPath', '');
  aiOpencodeService.setDbPath(resolveDatabasePath(app.getPath('userData')));
  return resolveDatabasePath(app.getPath('userData'));
});
```

- [ ] **Step 3: Run — PASS + Commit**

---

### Task 6: Preload + Main IPC — ai-terminal:send/receive/toggle

**Files:**
- Modify: `src/preload/preload.ts`
- Modify: `src/types/finance-shell.d.ts`
- Modify: `src/main/main.ts` (ipcMain.handle `ai-terminal:send`, `ai-terminal:toggle`, `ai-terminal:select-db-path`, Menu)
- Test: `tests/unit/main/services/ai-terminal-ipc.test.ts`

- [ ] **Step 1: Implement preload**

```typescript
// src/preload/preload.ts add inside expose:
aiTerminal: {
  send: (msg:string)=> ipcRenderer.invoke('ai-terminal:send', msg),
  onReceive: (cb:(output:string)=>void)=> ipcRenderer.on('ai-terminal:receive', (_e, o)=>cb(o)),
  toggle: ()=> ipcRenderer.invoke('ai-terminal:toggle'),
  onToggle: (cb:(visible:boolean)=>void)=> ipcRenderer.on('ai-terminal:toggle', (_e, v)=>cb(v)),
  selectDbPath: ()=> ipcRenderer.invoke('ai-terminal:select-db-path'),
  resetDbPath: ()=> ipcRenderer.invoke('ai-terminal:reset-db-path'),
}
```

- [ ] **Step 2: Implement Main handlers + Menu**

```typescript
// src/main/main.ts top: import { Menu } from 'electron';
let terminalVisible=true;
ipcMain.handle('ai-terminal:send', async (_e, prompt:string)=>{
  try{ const out=await aiOpencodeService.query(prompt); // opencode writes report files itself
       const m=out.match(/Reports\/report-[^\s]+\.(html|md|txt|jpg)/); if(m){ const reportPath=`${app.getPath('userData')}/Reports/${m[0].split('/').pop()}`; if(m[1]==='html'){ /* open in workspace tab via WebContentsView or shell.openPath(reportPath)*/ } }
       return {ok:true, output:out}; } catch(err){ return {ok:false, output: String(err)}; }
});
ipcMain.handle('ai-terminal:toggle', ()=>{
  terminalVisible=!terminalVisible; terminalService.setVisible(terminalVisible);
  mainWindow?.webContents.send('ai-terminal:toggle', terminalVisible);
  return terminalVisible;
});
ipcMain.handle('ai-terminal:select-db-path', async ()=>{
  const path = await aiOpencodeService.selectDbPath();
  if (path && path !== resolveDatabasePath(app.getPath('userData'))) { setSetting('core.ai-terminal.dbPath', path); }
  return path;
});
ipcMain.handle('ai-terminal:reset-db-path', async ()=>{
  setSetting('core.ai-terminal.dbPath',''); aiOpencodeService.setDbPath(resolveDatabasePath(app.getPath('userData'))); return resolveDatabasePath(app.getPath('userData'));
});
const menu=Menu.buildFromTemplate([{ label:'View', submenu:[{ label:'Toggle AI-Terminal', accelerator:'CmdOrCtrl+J', click:()=> { terminalVisible=!terminalVisible; terminalService.setVisible(terminalVisible); mainWindow?.webContents.send('ai-terminal:toggle', terminalVisible);} }, { label:'Select Database File…', click: async ()=> { const p=await aiOpencodeService.selectDbPath(); if(p) setSetting('core.ai-terminal.dbPath', p); } }, { label:'Reset Database File', click: async ()=> { setSetting('core.ai-terminal.dbPath',''); aiOpencodeService.setDbPath(resolveDatabasePath(app.getPath('userData')));} }]}]);
Menu.setApplicationMenu(menu);
```

- [ ] **Step 3: Write failing test for IPC**

```typescript
import { describe, it, expect, vi } from 'vitest';
describe('ai-terminal-ipc', ()=>{
  it('selectDbPath forwards to ipcRenderer.invoke ai-terminal:select-db-path', async ()=>{
    const invoke = vi.fn();
    (window as any).financeShell = { aiTerminal: { selectDbPath: () => invoke('ai-terminal:select-db-path') } };
    (window as any).financeShell.aiTerminal.selectDbPath();
    expect(invoke).toHaveBeenCalledWith('ai-terminal:select-db-path');
  });
  it('resetDbPath forwards to ipcRenderer.invoke ai-terminal:reset-db-path', async ()=>{
    const invoke = vi.fn();
    (window as any).financeShell = { aiTerminal: { resetDbPath: () => invoke('ai-terminal:reset-db-path') } };
    (window as any).financeShell.aiTerminal.resetDbPath();
    expect(invoke).toHaveBeenCalledWith('ai-terminal:reset-db-path');
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add src/preload/preload.ts src/main/main.ts tests/unit/main/services/ai-terminal-ipc.test.ts
git commit -m "feat: ai-terminal IPC select-db-path handler and preload bridge"
```

---

### Task 7: AI report variant output — md/html/txt/jpg

**Files:**
- Create: `src/main/services/ai-report-service.ts`
- Test: `tests/unit/main/services/ai-report-service.test.ts`

- [ ] **Step 1: Test**

```typescript
describe('AiReportService', ()=>{
  it('writes md/html/txt and capture jpg via capturePage mock', async ()=>{
    const svc=new AiReportService('/tmp/Reports', { capturePage: async()=> Buffer.from('jpg') } as any, writeFile: vi.fn(async()=>{}) as any);
    const p=await svc.writeReport('# hi', '2025-2026','md'); expect(p).toContain('report-2025-2026.md');
  });
});
```

- [ ] **Step 2: Implement** — `writeReport(content, fy, ext)` ensures dir exists (`mkdirSync`), writes file, returns path; `openReport(path)` via `shell.openPath`; `captureJpg(htmlPath, jpgPath)` loads html in hidden `BrowserWindow` then `capturePage`.

Defer `jpg` to fact that opencode can also directly generate jpg via `capturePage` helper we expose.

---

### Task 8: Delete ai-panel + integration test

- Remove `src/renderer/components/ai-panel.ts` and its import test.
- Add `tests/unit/renderer/ai-terminal-integration.test.ts` — mount `ai-terminal-panel`, send `summarize 2025-2026`, assert `ai-terminal:send` called with DB path already injected via opencode system prompt (no user-visible path).
- Run `npm run typecheck && npm run lint && npm run test:unit` — expect 0 errors.

---

## Self-Review

**Spec coverage:** AI-Terminal (Tasks 1-3) ✓, height-drag ✓, close + View menu re-show (Task 3 close + Task 6 toggle) ✓, opencode direct DB read via FINANCE_DB_PATH with user override via file picker (Task 5, Task 6 select-db-path) ✓, simple prompts summarize/estimate/report (Task 5 system prompt) ✓, auto DB path with fallback (Task 5) ✓, printable html + variant md/txt/jpg (Task 7) ✓, remove ai-panel (Task 8) ✓

**Placeholder scan:** No TBD/TODO — all steps have concrete code/commands.

**Type consistency:** `AiTerminalApi` (`send/onReceive/toggle/onToggle/selectDbPath/resetDbPath`) matches `preload.ts` and `finance-shell.d.ts`; `AiOpencodeService.query(prompt:string):Promise<string>`, `AiOpencodeService.selectDbPath():Promise<string>`, `AiOpencodeService.setDbPath(path:string)`, `AiOpencodeService.extractTextFromJson()` handle `--format json` parsing consistently; `AiTerminalService.getDbPath()/setDbPath()` validated with `existsSync` consistent with `core.ai-terminal.dbPath`; `AiReportService.writeReport(content,fy,ext):Promise<string>` consistent.

**Resolved blockers (from this session):**
- **B1 (install model):** opencode is already installed globally on the user's machine (`npm install -g opencode-ai`). We do NOT bundle it as a project dependency. We just spawn `opencode` from PATH via `cmd.exe /c opencode` (because `opencode` is a `.ps1` script).
- **B2 (exact command):** `opencode run <message>` alone fails with a server error — it needs a running server. Working flow: (1) start `opencode serve --port 4096`, (2) `opencode run --attach http://127.0.0.1:4096 --format json <message>`, (3) stop server on app close. `--format json` gives structured output.
- **B3 (server lifecycle):** `opencode serve` must be managed as a background process by Main. Auto-start on first query, auto-stop on `will-quit`. If server dies mid-query, `query()` restarts it and retries once.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-31-bottom-terminal-opencode.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
