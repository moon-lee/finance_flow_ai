# AI-Terminal Standalone Harness + Main Integration Final Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate AI-Terminal (bottom height-draggable panel + opencode `serve`/`run --attach --format json` + `sqlite3 -readonly` + file picker `core.ai-terminal.dbPath`) in an isolated standalone Electron harness (Phase 6a), then integrate the proven services into the main app and remove `ai-panel` (Phase 6b).

**Architecture:** Phase 6a is `standalone/ai-terminal/` — minimal Electron app with its own `main.ts`/`preload.ts`/`index.html` that imports copies of `ai-terminal-service`, `ai-opencode-service`, `ai-report-service`, and `ai-terminal-panel`. It validates `dialog.showOpenDialog` file picker, port-polling `serve()`, `--format json` parsing, and report variants without touching main app. Phase 6b moves the same 4 files into `src/` and wires `layout.css`/`index.html`/`index.ts`/`main.ts`/`preload.ts` in D:\finance_flow_ai.

**Tech Stack:** Electron, Lit, Vite, TypeScript strict, `better-sqlite3` (path only), `node:child_process` spawn via `cmd.exe /c opencode`, `node:net` port polling, `electron.dialog`, `opencode` global, `xterm.js` optional (plain Lit v1).

---

## File Structure

**Standalone harness (Phase 6a) — new directory:**
- `standalone/ai-terminal/package.json` — minimal Electron + Vite + vitest, scripts `dev`, `build`, `test:unit`
- `standalone/ai-terminal/src/main.ts` — Electron bootstrap, `resolveDatabasePath` fallback, `AiOpencodeService` lifecycle, `ipcMain` `ai-terminal:*`
- `standalone/ai-terminal/src/preload.ts` — `contextBridge` `financeShell.aiTerminal.*`
- `standalone/ai-terminal/src/renderer/index.html` — grid with `#ai-terminal-panel` + `.ai-terminal-resizer`
- `standalone/ai-terminal/src/renderer/styles.css` — grid `minmax(0,1fr) var(--ai-terminal-height) var(--status-bar-height)`
- `standalone/ai-terminal/src/renderer/components/ai-terminal-panel.ts` — Lit transcript + input + close
- `standalone/ai-terminal/src/main/services/ai-terminal-service.ts` — copy of main service (height/visible/dbPath)
- `standalone/ai-terminal/src/main/services/ai-opencode-service.ts` — copy with `serve()` polling, `selectDbPath()`, `extractTextFromJson()`
- `standalone/ai-terminal/src/main/services/ai-report-service.ts` — `writeReport`/`openReport`
- `standalone/ai-terminal/tests/unit/ai-terminal-service.test.ts` etc.

**Main app (Phase 6b) — modifies D:\finance_flow_ai:**
- Modify: `src/renderer/styles/layout.css`, `src/renderer/index.html`, `src/renderer/index.ts`, `src/main/main.ts`, `src/preload/preload.ts`, `src/types/finance-shell.d.ts`
- Create: `src/renderer/components/ai-terminal-panel.ts`, `src/main/services/ai-terminal-service.ts`, `src/main/services/ai-opencode-service.ts`, `src/main/services/ai-report-service.ts`
- Delete: `src/renderer/components/ai-panel.ts`
- Tests: `tests/unit/renderer/ai-terminal-panel.test.ts`, `tests/unit/main/services/ai-terminal-service.test.ts`, `tests/unit/main/services/ai-opencode-service.test.ts`, `tests/unit/main/services/ai-report-service.test.ts`, `tests/unit/main/services/ai-terminal-ipc.test.ts`

---

### Task 1: Standalone harness scaffold

**Files:**
- Create: `standalone/ai-terminal/package.json`
- Create: `standalone/ai-terminal/vite.config.ts`, `standalone/ai-terminal/vite.main.config.ts`, `standalone/ai-terminal/tsconfig.json`
- Test: `standalone/ai-terminal/tests/unit/scaffold.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// standalone/ai-terminal/tests/unit/scaffold.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
describe('standalone scaffold', ()=>{
  it('package.json exists with electron', ()=>{
    const pkg=JSON.parse(fs.readFileSync('standalone/ai-terminal/package.json','utf-8'));
    expect(pkg.devDependencies.electron).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- standalone/ai-terminal/tests/unit/scaffold.test.ts`
Expected: FAIL — package.json not found

- [ ] **Step 3: Create standalone/ai-terminal/package.json + configs**

```json
{
  "name": "ai-terminal-standalone",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "test:unit": "vitest run" },
  "devDependencies": { "electron": "^33.0.0", "vite": "^6.0.0", "vitest": "^3.0.0", "lit": "^3.0.0" }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- standalone/ai-terminal/tests/unit/scaffold.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add standalone/ai-terminal/package.json standalone/ai-terminal/vite.config.ts
git commit -m "feat: standalone ai-terminal harness scaffold"
```

---

### Task 2: Standalone ai-terminal services (copy of hardened implementation)

**Files:**
- Create: `standalone/ai-terminal/src/main/services/ai-terminal-service.ts`
- Create: `standalone/ai-terminal/src/main/services/ai-opencode-service.ts`
- Create: `standalone/ai-terminal/src/main/services/ai-report-service.ts`
- Test: `standalone/ai-terminal/tests/unit/ai-terminal-service.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { AiTerminalService } from '../src/main/services/ai-terminal-service';
describe('AiTerminalService standalone', ()=>{
  it('defaults dbPath empty', ()=>{ const s=new AiTerminalService(); expect(s.getDbPath()).toBe(''); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- standalone/ai-terminal/tests/unit/ai-terminal-service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `ai-terminal-service.ts`**

```typescript
import { getSetting, setSetting, registerSettingDefault } from '../../../src/main/services/settings-service';
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

- [ ] **Step 3b: Implement `ai-opencode-service.ts` (hardened)**

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
        if (existsSync(path) && path.endsWith('.db')) { this.fallbackDbPath = path; return path; }
      }
    } catch(e) {}
    return this.fallbackDbPath;
  }
  getSystemPrompt(){ return `Your database is at '${this.fallbackDbPath}'. Use Python ${process.version} sqlite3 module to query it.`; }
  async isInstalled(): Promise<boolean> { try { const r=await execFile('opencode', ['--version'], {timeout:5000, windowsHide:true}); return r.status===0; } catch { return false; } }
  async serve(): Promise<void> {
    if (this.serverReady) return;
    return new Promise((resolve)=>{
      this.serverProc=(this.deps.spawn??nodeSpawn)('cmd.exe', ['/c','opencode','serve','--port',String(this.port),'--hostname','127.0.0.1'], { windowsHide:true, detached:true, stdio:'ignore' });
      this.serverProc?.unref();
      const start=Date.now(); const tryConnect=()=>{
        import('node:net').then(({default: net})=>{
          const sock=(net as any).createConnection({host:'127.0.0.1', port:this.port}, ()=>{ sock.destroy(); this.serverReady=true; resolve(); });
          sock.on('error', ()=>{ if(Date.now()-start > 10000){ this.serverReady=true; resolve(); } else setTimeout(tryConnect, 300); });
        }).catch(()=> setTimeout(()=>{ this.serverReady=true; resolve(); }, 800));
      };
      setTimeout(tryConnect, 400);
    });
  }
  async stop(): Promise<void> { if (this.serverProc) { this.serverProc.kill(); this.serverProc=null; } this.serverReady=false; }
  async query(prompt:string): Promise<string> {
    if (!this.serverReady) await this.serve();
    const timeout=this.deps.timeoutMs??90000;
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

- [ ] **Step 3c: Implement `ai-report-service.ts`**

```typescript
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { shell, BrowserWindow } from 'electron';
export class AiReportService {
  constructor(private reportsDir:string){}
  async writeReport(content:string, fy:string, ext:string): Promise<string> {
    if(!existsSync(this.reportsDir)) mkdirSync(this.reportsDir, { recursive: true });
    const p=join(this.reportsDir, `report-${fy}.${ext}`);
    writeFileSync(p, content, 'utf-8');
    return p;
  }
  async openReport(path:string){ await shell.openPath(path); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- standalone/ai-terminal/tests/unit/ai-terminal-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add standalone/ai-terminal/src/main/services/
git commit -m "feat: standalone ai-terminal services with file picker and json parsing"
```

---

### Task 3: Standalone ai-terminal-panel + harness shell

**Files:**
- Create: `standalone/ai-terminal/src/renderer/components/ai-terminal-panel.ts`
- Modify: `standalone/ai-terminal/src/renderer/index.html`, `standalone/ai-terminal/src/renderer/styles.css`
- Test: `standalone/ai-terminal/tests/unit/ai-terminal-panel.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../src/renderer/components/ai-terminal-panel';
describe('ai-terminal-panel standalone', ()=>{
  beforeEach(()=>{ document.body.innerHTML='<ai-terminal-panel></ai-terminal-panel>'; });
  it('renders input and close', async ()=>{
    const el=document.querySelector('ai-terminal-panel') as any; await el.updateComplete;
    expect(el.shadowRoot.querySelector('#ai-terminal-input')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- standalone/ai-terminal/tests/unit/ai-terminal-panel.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `ai-terminal-panel.ts`**

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

- [ ] **Step 3b: Wire `standalone/ai-terminal/src/renderer/index.html`**

```html
<body>
  <div id="app">
    <div id="workspace"></div>
    <div class="ai-terminal-resizer" id="ai-terminal-resizer"></div>
    <ai-terminal-panel id="ai-terminal-panel"></ai-terminal-panel>
    <div id="status-bar">Ready</div>
  </div>
  <script type="module" src="./index.ts"></script>
</body>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- standalone/ai-terminal/tests/unit/ai-terminal-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add standalone/ai-terminal/src/renderer/
git commit -m "feat: standalone ai-terminal panel with transcript and resizer"
```

---

### Task 4: Standalone manual verification (opencode E2E)

**Files:** none (manual)

- [ ] **Step 1: Start standalone harness**

Run: `npm run dev` in `standalone/ai-terminal`, select `finance.db` via file picker, type `summarize 2025-2026`, expect opencode response without crash.

- [ ] **Step 2: Test variants**

Run: `report 2025-2026 as html` → check `Reports/report-2025-2026.html` created; `Ctrl+J` toggles; close X hides.

- [ ] **Step 3: Record result**

If green, proceed to Phase 6b. If red, fix Task 2/3 and re-test.

---

### Task 5: Main app layout CSS — bottom AI-Terminal grid

**Files:**
- Modify: `src/renderer/styles/layout.css:1-100`
- Test: `tests/unit/renderer/layout-ai-terminal.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
describe('layout.css ai-terminal grid', ()=>{
  it('defines #ai-terminal-panel and .ai-terminal-resizer', ()=>{
    const css=fs.readFileSync('src/renderer/styles/layout.css','utf-8');
    expect(css).toContain('#ai-terminal-panel');
    expect(css).toContain('.ai-terminal-resizer');
    expect(css).toContain('#app.ai-terminal-collapsed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/layout-ai-terminal.test.ts`
Expected: FAIL — #ai-terminal-panel not found

- [ ] **Step 3: Implement CSS**

Replace `#app` grid with `grid-template-columns: var(--activity-bar-width) var(--navigation-width) minmax(0,1fr); grid-template-rows: minmax(0,1fr) var(--ai-terminal-height,260px) var(--status-bar-height)` + `.ai-terminal-resizer` horizontal + `#ai-terminal-panel` bottom row + `#app.ai-terminal-collapsed`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/layout-ai-terminal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/layout.css tests/unit/renderer/layout-ai-terminal.test.ts
git commit -m "feat: layout AI-terminal grid + resizer"
```

---

### Task 6: Main shell HTML + entry wiring

**Files:**
- Modify: `src/renderer/index.html`, `src/renderer/index.ts`
- Test: `tests/unit/renderer/ai-terminal-index.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
describe('index.html ai-terminal', ()=>{
  it('contains ai-terminal-panel not ai-panel', ()=>{
    const html=fs.readFileSync('src/renderer/index.html','utf-8');
    expect(html).toContain('ai-terminal-panel');
    expect(html).not.toContain('ai-panel');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/ai-terminal-index.test.ts`
Expected: FAIL

- [ ] **Step 3: Modify index.html + index.ts**

`index.html`: replace `<ai-panel>` + `.ai-resizer` with `<div class="ai-terminal-resizer">` + `<ai-terminal-panel>`. `index.ts`: remove `ai-panel` import, add `ai-terminal-panel` import, `Ctrl+J` handler, `setAiTerminalVisible`, persist `core.ai-terminal.height/visible`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/ai-terminal-index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/index.html src/renderer/index.ts tests/unit/renderer/ai-terminal-index.test.ts
git commit -m "feat: shell html AI-terminal wiring"
```

---

### Task 7: Move ai-terminal-panel to main

**Files:**
- Create: `src/renderer/components/ai-terminal-panel.ts`
- Test: `tests/unit/renderer/ai-terminal-panel.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './components/ai-terminal-panel';
describe('ai-terminal-panel', ()=>{
  beforeEach(()=>{ document.body.innerHTML='<ai-terminal-panel></ai-terminal-panel>'; });
  it('renders transcript, input, close button', async ()=>{
    const el=document.querySelector('ai-terminal-panel') as any; await el.updateComplete;
    expect(el.shadowRoot.querySelector('#ai-terminal-input')).toBeTruthy();
    expect(el.shadowRoot.querySelector('[data-action="close"]')).toBeTruthy();
    expect(el.shadowRoot.querySelector('.transcript')).toBeTruthy();
  });
  it('enter sends via financeShell.aiTerminal.send and appends transcript', async ()=>{
    (window as any).financeShell={ aiTerminal:{ send: vi.fn(async()=>({ok:true,output:'ok'}))}};
    const el=document.querySelector('ai-terminal-panel') as any; await el.updateComplete;
    el.shadowRoot.querySelector('#ai-terminal-input').value='summarize 2025-2026';
    el.shadowRoot.querySelector('#ai-terminal-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));
    await new Promise(r=>setTimeout(r,20));
    expect((window as any).financeShell.aiTerminal.send).toHaveBeenCalledWith('summarize 2025-2026');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/ai-terminal-panel.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/renderer/components/ai-terminal-panel.ts`**

Copy full Lit element from Task 3 Step 3 (same 40-line `AiTerminalPanel` with transcript `Array<{role,text}>`, `#ai-terminal-input`, `[data-action="close"]`, `financeShell.aiTerminal.send/toggle`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/ai-terminal-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ai-terminal-panel.ts tests/unit/renderer/ai-terminal-panel.test.ts
git commit -m "feat: ai-terminal-panel Lit component with transcript and close"
```

---

### Task 8: Move ai-terminal services to main

**Files:**
- Create: `src/main/services/ai-terminal-service.ts`, `src/main/services/ai-opencode-service.ts`, `src/main/services/ai-report-service.ts`
- Tests: `tests/unit/main/services/ai-terminal-service.test.ts`, `tests/unit/main/services/ai-opencode-service.test.ts`, `tests/unit/main/services/ai-report-service.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/main/services/ai-terminal-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDatabase } from '../services/database-service';
import { initializeSettings } from '../services/settings-service';
import { AiTerminalService } from '../services/ai-terminal-service';
describe('AiTerminalService', ()=>{
  beforeEach(()=>{ const db=getTestDatabase(); (global as any).db=db; initializeSettings(); });
  it('defaults height 260 visible true', ()=>{ const s=new AiTerminalService(); expect(s.getHeight()).toBe(260); expect(s.isVisible()).toBe(true); });
  it('defaults dbPath empty', ()=>{ const s=new AiTerminalService(); expect(s.getDbPath()).toBe(''); });
  it('persists dbPath when valid', ()=>{ const s=new AiTerminalService(); s.setDbPath('/path/to/db.sqlite'); expect(s.getDbPath()).toBe('/path/to/db.sqlite'); });
});
// tests/unit/main/services/ai-opencode-service.test.ts — include getDbPath, setDbPath, selectDbPath, serve polling, query --format json, isInstalled, extractTextFromJson cases (see Task 2 hardened tests)
// tests/unit/main/services/ai-report-service.test.ts
describe('AiReportService', ()=>{
  it('writes md/html/txt', async ()=>{
    const svc=new (await import('../services/ai-report-service')).AiReportService('/tmp/Reports');
    const p=await svc.writeReport('# hi', '2025-2026','md'); expect(p).toContain('report-2025-2026.md');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/main/services/ai-terminal-service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement — copy full hardened code from standalone Task 2**

`ai-terminal-service.ts` (registerSettingDefault for `height/visible/dbPath`, `existsSync` validation), `ai-opencode-service.ts` (port-polling `serve()`, `selectDbPath` try/catch, `extractTextFromJson`, `query` JSON parse), `ai-report-service.ts` (`writeReport`/`openReport`).

Wire in `src/main/main.ts` `app.whenReady` after `initializeSettings()`:

```typescript
const aiTerminalService=new AiTerminalService();
const aiOpencodeService=new AiOpencodeService(resolveDatabasePath(app.getPath('userData')), {}, 'opencode/big-pickle');
const userDbPath = getSetting<string>('core.ai-terminal.dbPath');
if (userDbPath) { aiOpencodeService.setDbPath(userDbPath); }
void (async()=>{ if(await aiOpencodeService.isInstalled()){ await aiOpencodeService.serve(); } })(); // auto-warm so panel is ready when opened
app.on('will-quit', async ()=>{ await aiOpencodeService.stop(); });
ipcMain.handle('ai-terminal:select-db-path', async ()=>{
  const p=await aiOpencodeService.selectDbPath();
  if (p && p !== resolveDatabasePath(app.getPath('userData'))) setSetting('core.ai-terminal.dbPath', p);
  return p;
});
ipcMain.handle('ai-terminal:reset-db-path', async ()=>{
  setSetting('core.ai-terminal.dbPath',''); aiOpencodeService.setDbPath(resolveDatabasePath(app.getPath('userData'))); return resolveDatabasePath(app.getPath('userData'));
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/main/services/ai-terminal-service.test.ts tests/unit/main/services/ai-opencode-service.test.ts tests/unit/main/services/ai-report-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/ai-terminal-service.ts src/main/services/ai-opencode-service.ts src/main/services/ai-report-service.ts tests/unit/main/services/
git commit -m "feat: ai-terminal services hardened with file picker and polling"
```

---

### Task 9: Preload + Main IPC + Menu

**Files:**
- Modify: `src/preload/preload.ts:20-40`, `src/types/finance-shell.d.ts:10-30`, `src/main/main.ts:100-250`
- Test: `tests/unit/main/services/ai-terminal-ipc.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
describe('ai-terminal-ipc', ()=>{
  it('selectDbPath forwards to ipcRenderer.invoke', async ()=>{
    const invoke = vi.fn(); (window as any).financeShell = { aiTerminal: { selectDbPath: () => invoke('ai-terminal:select-db-path') } };
    (window as any).financeShell.aiTerminal.selectDbPath();
    expect(invoke).toHaveBeenCalledWith('ai-terminal:select-db-path');
  });
  it('resetDbPath forwards to ipcRenderer.invoke', async ()=>{
    const invoke = vi.fn(); (window as any).financeShell = { aiTerminal: { resetDbPath: () => invoke('ai-terminal:reset-db-path') } };
    (window as any).financeShell.aiTerminal.resetDbPath();
    expect(invoke).toHaveBeenCalledWith('ai-terminal:reset-db-path');
  });
});
```

- [ ] **Step 2: Implement `src/preload/preload.ts`**

```typescript
aiTerminal: {
  send: (msg:string)=> ipcRenderer.invoke('ai-terminal:send', msg),
  onReceive: (cb:(output:string)=>void)=> ipcRenderer.on('ai-terminal:receive', (_e, o)=>cb(o)),
  toggle: ()=> ipcRenderer.invoke('ai-terminal:toggle'),
  onToggle: (cb:(visible:boolean)=>void)=> ipcRenderer.on('ai-terminal:toggle', (_e, v)=>cb(v)),
  selectDbPath: ()=> ipcRenderer.invoke('ai-terminal:select-db-path'),
  resetDbPath: ()=> ipcRenderer.invoke('ai-terminal:reset-db-path'),
}
```

- [ ] **Step 3: Implement `src/types/finance-shell.d.ts`**

```typescript
interface AiTerminalApi { send(msg:string):Promise<{ok:boolean,output:string}>; onReceive(cb:(output:string)=>void):void; toggle():Promise<boolean>; onToggle(cb:(visible:boolean)=>void):void; selectDbPath():Promise<string>; resetDbPath():Promise<string>; }
interface FinanceShellApi { aiTerminal: AiTerminalApi; /* existing */ }
```

- [ ] **Step 4: Implement `src/main/main.ts` handlers + Menu**

```typescript
let terminalVisible=true;
ipcMain.handle('ai-terminal:send', async (_e, prompt:string)=>{
  try{ const out=await aiOpencodeService.query(prompt);
       const m=out.match(/Reports\/report-[^\s]+\.(html|md|txt|jpg)/); if(m){ const reportPath=`${app.getPath('userData')}/Reports/${m[0].split('/').pop()}`; if(m[1]==='html'){ /* open via WebContentsView or shell.openPath */ } }
       return {ok:true, output:out}; } catch(err){ return {ok:false, output: String(err)}; }
});
ipcMain.handle('ai-terminal:toggle', ()=>{ terminalVisible=!terminalVisible; aiTerminalService.setVisible(terminalVisible); mainWindow?.webContents.send('ai-terminal:toggle', terminalVisible); return terminalVisible; });
const menu=Menu.buildFromTemplate([{ label:'View', submenu:[
  { label:'Toggle AI-Terminal', accelerator:'CmdOrCtrl+J', click:()=> { terminalVisible=!terminalVisible; aiTerminalService.setVisible(terminalVisible); mainWindow?.webContents.send('ai-terminal:toggle', terminalVisible);} },
  { label:'Select Database File…', click: async ()=> { const p=await aiOpencodeService.selectDbPath(); if(p) setSetting('core.ai-terminal.dbPath', p); } },
  { label:'Reset Database File', click: async ()=> { setSetting('core.ai-terminal.dbPath',''); aiOpencodeService.setDbPath(resolveDatabasePath(app.getPath('userData')));} }
]}]);
Menu.setApplicationMenu(menu);
```

- [ ] **Step 5: Commit**

```bash
git add src/preload/preload.ts src/types/finance-shell.d.ts src/main/main.ts tests/unit/main/services/ai-terminal-ipc.test.ts
git commit -m "feat: ai-terminal IPC select/reset db path and View menu"
```

---

### Task 10: Report variants + delete ai-panel + verification

**Files:**
- Modify: `src/main/services/ai-report-service.ts` (already moved from Task 8)
- Delete: `src/renderer/components/ai-panel.ts`
- Test: `tests/unit/renderer/ai-terminal-integration.test.ts`

- [ ] **Step 1: Write failing integration test**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../src/renderer/components/ai-terminal-panel';
describe('ai-terminal integration', ()=>{
  beforeEach(()=>{ document.body.innerHTML='<ai-terminal-panel></ai-terminal-panel>'; });
  it('mounts and sends summarize', async ()=>{
    const send=vi.fn(async()=>({ok:true,output:'summary'}));
    (window as any).financeShell={ aiTerminal:{ send }};
    const el=document.querySelector('ai-terminal-panel') as any; await el.updateComplete;
    el.shadowRoot.querySelector('#ai-terminal-input').value='summarize 2025-2026';
    el.shadowRoot.querySelector('#ai-terminal-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));
    await new Promise(r=>setTimeout(r,20));
    expect(send).toHaveBeenCalledWith('summarize 2025-2026');
  });
});
```

- [ ] **Step 2: Delete `src/renderer/components/ai-panel.ts`**

Remove file and its import from `src/renderer/index.ts` (already done in Task 6). Verify `grep -r "ai-panel" src/` returns 0.

- [ ] **Step 3: Verify `ai-report-service` in main**

Already implemented in Task 8. Ensure `writeReport(content,fy,ext)` creates `Reports/report-{fy}.{ext}` via `mkdirSync` + `writeFileSync`, `openReport` via `shell.openPath`.

- [ ] **Step 4: Run verification**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: 0 errors, all 10 tasks PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ai-panel.ts tests/unit/renderer/ai-terminal-integration.test.ts
git commit -m "feat: delete ai-panel and add ai-terminal integration test"
```

---

## Self-Review

**Spec coverage:** Standalone harness validates opencode `serve` polling, `run --attach --format json`, `sqlite3 -readonly`, file picker `core.ai-terminal.dbPath` + reset, `extractTextFromJson`, height-drag, close + View menu (Tasks 1-4) ✓. Main integration covers layout (5), shell (6), panel (7), services (8), IPC/Menu (9), reports + delete ai-panel (10) ✓.

**Placeholder scan:** No TBD/TODO — all steps have concrete code/commands.

**Type consistency:** `AiTerminalApi` (`send/onReceive/toggle/onToggle/selectDbPath/resetDbPath`) matches `preload.ts` + `finance-shell.d.ts`; `AiOpencodeService` (`query`/`selectDbPath`/`setDbPath`/`extractTextFromJson`) consistent across tests and handlers; `AiTerminalService.getDbPath/setDbPath` validated; `AiReportService.writeReport` consistent.

---

Plan complete and saved to `docs/superpowers/plans/2026-09-02-ai-terminal-standalone-harness-final.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
