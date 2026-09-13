# Salary Single-Tab Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert salary-history to a single `salary` tab titled `Salary` with a Lit `salary-orchestrator`, mirroring mortgage.

**Architecture:** Single `views: [{id: salary}]` manifest; commands `requestMount('salary', {view: childTag})`; Lit orchestrator owns `view` state + `pushFinance()` + `mount-update` retarget; children unchanged.

**Tech Stack:** TypeScript strict, Lit 3, Vitest + happy-dom, Electron WebContentsView panels, `finance` type-only imports.

## Global Constraints

- TypeScript `strict: true`; no implicit `any`.
- `finance` remains type-only (`import type { FinanceApi } from 'finance'`); never bundle `finance`; never import Electron/Node APIs in extension code.
- Host (Node `utilityProcess`) stays DOM-free: `registerUIComponents()` must early-return when `typeof HTMLElement === 'undefined'`; no top-level `import './ui/index.js'` in `src/main.ts`.
- Extension id stays `salary-history`; tables stay `salary_history_*`; settings keys stay `salary-history.*` / `core.*`.
- Command IDs/titles/keybindings unchanged: `salary.show-pay-history` (`Ctrl+Alt+H`), `salary.show-pay-rate-history` (`Ctrl+Alt+R`).
- All 13 existing `allowedUiEvents` names unchanged; no new event names.
- `pay` public service (`src/services/public-pay-adapter.ts`, ADR-0005) untouched — Dashboard unaffected.
- No DAO/service/schema/child-UI logic changes; no new settings keys.
- Do not bump `package.json` version unless explicitly requested; update `CHANGELOG.md` under `Unreleased` and `docs/file-reference.md`.

---

### Task 1: Manifest single-tab identity

**Files:**
- Modify: `extensions/salary-history/package.json:10-40`
- Test: `tests/unit/extensions/salary-history/main.test.ts`

**Interfaces:**
- Consumes: existing `financeExtension.views/activationEvents/commands/navigation`.
- Produces: single view `{id: salary, name: Salary}` consumed by Activity Bar (`data-view-id="salary"`) and `view-activation.ts` (`onView:salary`).

- [ ] **Step 1: Write the failing test**

In `tests/unit/extensions/salary-history/main.test.ts`, append (before final `});`):

```ts
it('declares a single salary view activated onView:salary', async () => {
  const pkg = (await import('node:fs')).readFileSync(
    'extensions/salary-history/package.json', 'utf8',
  );
  const manifest = JSON.parse(pkg).financeExtension;
  expect(manifest.contributions.views).toEqual([
    { id: 'salary', name: 'Salary', icon: 'assets/icon.svg' },
  ]);
  expect(manifest.activationEvents).toEqual(['onView:salary']);
  expect(manifest.contributions.commands.map((c: { id: string }) => c.id)).toEqual([
    'salary.show-pay-history',
    'salary.show-pay-rate-history',
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/extensions/salary-history/main.test.ts -v`
Expected: FAIL with `expected [ { id: 'payslip-list', … } ] to deeply equal [ { id: 'salary', … } ]`.

- [ ] **Step 3: Write minimal implementation**

In `extensions/salary-history/package.json`, replace:

```json
    "activationEvents": ["onStartup", "onView:payslip-list"],
    "contributions": {
      "views": [
        {
          "id": "payslip-list",
          "name": "Pay History",
          "icon": "assets/icon.svg"
        }
      ],
```

with:

```json
    "activationEvents": ["onView:salary"],
    "contributions": {
      "views": [
        {
          "id": "salary",
          "name": "Salary",
          "icon": "assets/icon.svg"
        }
      ],
```

Leave `commands`, `navigation` (both `Pay History` + `Pay Rate History` items), `allowedUiEvents`, `configuration`, `tables` untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/extensions/salary-history/main.test.ts -v`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add extensions/salary-history/package.json tests/unit/extensions/salary-history/main.test.ts
git commit -m "feat(salary): single salary view manifest"
```

---

### Task 2: main.ts single-panel mount + mount-update retarget

**Files:**
- Modify: `extensions/salary-history/src/main.ts`
- Test: `tests/unit/extensions/salary-history/main.test.ts`

**Interfaces:**
- Consumes: `finance.ui.requestMount`, `finance.settings.get('core.*')`, `createPublicPayAdapter`.
- Produces: `activate(finance, ctx)` + `registerUIComponents()` consumed by `src/main/resources/panel-bootstrap.ts` (`bundle.activate(finance, {viewId, ...mountData})` + `mount-update` dispatch).

- [ ] **Step 1: Write the failing test**

In `tests/unit/extensions/salary-history/main.test.ts`, append:

```ts
it('commands requestMount the single salary panel with child view', async () => {
  const { finance } = makeFinance();
  const mounts: { tag: string; data: Record<string, unknown> }[] = [];
  (finance as unknown as { ui: unknown }).ui = {
    requestMount: async (tag: string, data: Record<string, unknown>) => {
      mounts.push({ tag, data });
    },
  };
  (finance as unknown as { settings: unknown }).settings = {
    get: async (k: string) =>
      k === 'core.defaultCurrency' ? 'AUD' : k === 'core.financialYear.start' ? '07-01' : '',
  };
  const handlers = new Map<string, () => Promise<void> | void>();
  (finance as unknown as { commands: unknown }).commands = {
    registerCommand: (id: string, _t: string, h: () => Promise<void> | void) => {
      handlers.set(id, h);
    },
    execute: async () => null,
  };
  (finance as unknown as { services: unknown }).services = {
    register: () => {},
    unregister: () => {},
  };
  await activate(finance);
  await handlers.get('salary.show-pay-history')!();
  await handlers.get('salary.show-pay-rate-history')!();
  expect(mounts[0].tag).toBe('salary');
  expect(mounts[0].data.view).toBe('payslip-list');
  expect(mounts[1].tag).toBe('salary');
  expect(mounts[1].data.view).toBe('pay-rate-history-view');
});
```

Note: this requires exposing the existing local `makeFinance()` helper at file scope (it already exists in `main.test.ts`); reuse it, adding only the `ui`/`settings`/`services` stubs above.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/extensions/salary-history/main.test.ts -v`
Expected: FAIL with `expected 'payslip-list' to be 'salary'` (current `openView` mounts child tag directly).

- [ ] **Step 3: Write minimal implementation**

In `extensions/salary-history/src/main.ts`, replace the whole `openView`/`openPayHistory` block:

```ts
function openView(finance: FinanceApi, tag: string, mountData: Record<string, unknown> = {}): void {
  void finance.ui?.requestMount(tag, mountData);
}

async function openPayHistory(
  finance: FinanceApi,
  mountData: Record<string, unknown>
): Promise<void> {
  openView(finance, 'payslip-list', mountData);
}
```

with:

```ts
function openView(childTag: string): () => Promise<void> {
  return async () => {
    const finance = _registeredFinance;
    if (!finance) return;
    let financialYearStart = '07-01';
    let financialYearCurrent = '';
    let defaultCurrency = 'AUD';
    try {
      const s = await finance.settings?.get('core.financialYear.start');
      if (typeof s === 'string') financialYearStart = s;
    } catch { /* default */ }
    try {
      const c = await finance.settings?.get('core.financialYear.current');
      if (typeof c === 'string') financialYearCurrent = c;
    } catch { /* default */ }
    try {
      const d = await finance.settings?.get('core.defaultCurrency');
      if (typeof d === 'string') defaultCurrency = d;
    } catch { /* default */ }
    // Single panel identity ('salary' -> tab always "Salary"); target child rides in mountData.view.
    await finance.ui?.requestMount('salary', {
      view: childTag,
      defaultCurrency,
      financialYearStart,
      financialYearCurrent,
    });
  };
}
```

Replace the two `registerCommand` calls:

```ts
finance.commands.registerCommand('salary.show-pay-history', 'View: Pay History', () =>
  openPayHistory(finance, settingsMountData).catch((e) =>
     logger.error('openPayHistory failed', e),
  ),
);
finance.commands.registerCommand('salary.show-pay-rate-history', 'View: Pay Rate History', () => {
  logger.info('mounting pay-rate-history-view');
  finance.ui?.requestMount('pay-rate-history-view', settingsMountData).catch((e) =>
     logger.error('requestMount pay-rate-history-view failed', e),
  );
});
```

with:

```ts
finance.commands.registerCommand('salary.show-pay-history', 'View: Pay History', (..._args: unknown[]) =>
  openView('payslip-list')().catch((e) =>
     logger.error('openPayHistory failed', e),
  ),
);
finance.commands.registerCommand('salary.show-pay-rate-history', 'View: Pay Rate History', (..._args: unknown[]) => {
  logger.info('mounting pay-rate-history-view');
  return openView('pay-rate-history-view')().catch((e) =>
     logger.error('requestMount pay-rate-history-view failed', e),
  );
});
```

Replace the panel-renderer branch:

```ts
if (typeof HTMLElement !== 'undefined' && document.getElementById('app')) {
  await registerUIComponents();
  const container = document.getElementById('app');
  if (container) {
    const mountData = { ...settingsMountData, ...hostMountData };
    _orchestrator = new Orchestrator(finance, container, mountData);
    await _orchestrator.init();
  }
  return;
}
```

with (mirrors `d:/finance_flow_ext/mortgage/src/main.ts`):

```ts
if (typeof window !== 'undefined') await import('./ui/index.js');
if (hostMountData && typeof (hostMountData as Record<string, unknown>).viewId === 'string') {
  // keep Host-context mountData merge compatible; panel branch below uses ctx
}
if (typeof document !== 'undefined' && document.getElementById('app')) {
  await registerUIComponents();
  const app = document.getElementById('app');
  if (app) {
    const { Orchestrator } = await import('./orchestrator.js');
    const mountData = { ...settingsMountData, ...hostMountData };
    _orchestrator = new Orchestrator(finance, app, mountData);
    await _orchestrator.init();
  }
  return;
}
```

Then change `activate` signature from `activate(finance, hostMountData?)` to `activate(finance, ctx: { viewId?: string } & Record<string, unknown> = {})` and replace `hostMountData` uses with `ctx`. Keep `_registeredFinance = finance` assignment at top (needed by `openView` closure). Keep `pay` adapter registration and `deactivate()` unchanged.

Also update the `import { Orchestrator }` at top to a type-only import (`import type { Orchestrator } ...` won't work for construction; instead remove the static import entirely since the panel branch dynamic-imports it — Host stays DOM-free).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/extensions/salary-history/main.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extensions/salary-history/src/main.ts tests/unit/extensions/salary-history/main.test.ts
git commit -m "feat(salary): single-panel mount via salary view"
```

---

### Task 3: Lit salary-orchestrator element + registration

**Files:**
- Create: `extensions/salary-history/src/ui/salary-orchestrator.ts`
- Modify: `extensions/salary-history/src/ui/index.ts`
- Test: `tests/unit/extensions/salary-history/salary-orchestrator.test.ts`

**Interfaces:**
- Consumes: child tags `payslip-list`, `pay-rate-history-view`, `payslip-form`, `rate-row-form`, `reorder-sections-modal`; `FinanceApi.settings.get('salary-history.sectionOrder')`.
- Produces: `SalaryOrchestrator` custom element `salary-orchestrator` with `init(f, mount)`, `setFinance(f)`, `navigate(tag)` consumed by `src/main.ts` panel branch + `mount-update`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/extensions/salary-history/salary-orchestrator.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { SalaryOrchestrator } from '../../../../extensions/salary-history/src/ui/salary-orchestrator';
import { makeMockFinance } from './ui/mock-finance';

function makeEl(): SalaryOrchestrator {
  const el = document.createElement('salary-orchestrator') as unknown as SalaryOrchestrator;
  document.body.appendChild(el as unknown as Node);
  return el;
}

describe('salary-orchestrator', () => {
  it('defines the salary-orchestrator element', () => {
    expect(customElements.get('salary-orchestrator')).toBe(SalaryOrchestrator as unknown as CustomElementConstructor);
  });

  it('defaults to payslip-list when mount has no view', async () => {
    document.body.innerHTML = '';
    const el = makeEl();
    await el.init(makeMockFinance(), {});
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(el.view).toBe('payslip-list');
  });

  it('honours mount.view pay-rate-history-view', async () => {
    document.body.innerHTML = '';
    const el = makeEl();
    await el.init(makeMockFinance(), { view: 'pay-rate-history-view' });
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(el.view).toBe('pay-rate-history-view');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/extensions/salary-history/salary-orchestrator.test.ts -v`
Expected: FAIL with `Failed to resolve import ... salary-orchestrator` (file does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `extensions/salary-history/src/ui/salary-orchestrator.ts` (mirrors `d:/finance_flow_ext/mortgage/src/ui/mortgage-orchestrator.ts:1-60`):

```ts
import { LitElement, css, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { ExtensionLogger } from 'finance-logger';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : (class {} as unknown as typeof LitElement);
const logger = new ExtensionLogger('salary-history');

export type SalaryTag =
  | 'payslip-list'
  | 'pay-rate-history-view'
  | 'payslip-form'
  | 'rate-row-form'
  | 'reorder-sections-modal';

export class SalaryOrchestrator extends Base {
  static override styles = typeof HTMLElement !== 'undefined' ? [sharedStyles, css`#child{flex:1;min-height:0;display:block;overflow:hidden}`] as any : [];
  finance: any = null;
  view: SalaryTag = 'payslip-list';
  mountData: Record<string, unknown> = {};
  error = '';
  sectionOrder: string[] = ['period', 'totals', 'earnings', 'deductions', 'super', 'leave', 'leave-accrual', 'notes'];

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.pushFinance();
  }

  async init(f: any, mount: Record<string, unknown> = {}): Promise<void> {
    this.finance = f;
    this.mountData = mount;
    // Target child arrives as mount.view (single-panel mounts) or legacy mount.viewId.
    const v = (mount.view ?? mount.viewId) as string | undefined;
    if (v === 'salary' || v === 'payslip-list' || v === undefined) this.view = 'payslip-list';
    else if (v === 'pay-rate-history-view') this.view = 'pay-rate-history-view';
    else if (v === 'payslip-form') this.view = 'payslip-form';
    else if (v === 'rate-row-form') this.view = 'rate-row-form';
    else if (v === 'reorder-sections-modal') this.view = 'reorder-sections-modal';
    else {
      logger.warn(`unknown salary view "${v}", defaulting to payslip-list`);
      this.view = 'payslip-list';
    }
    try {
      const saved = await f.settings?.get('salary-history.sectionOrder');
      const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
      if (Array.isArray(parsed)) this.sectionOrder = parsed as string[];
    } catch { /* keep default */ }
    await this.pushFinance();
  }

  navigate(tag: SalaryTag): void {
    this.view = tag;
    (this as any).requestUpdate?.();
    void this.pushFinance();
  }

  private child(): any {
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    return root?.querySelector('#child');
  }

  private async pushFinance(): Promise<void> {
    (this as any).requestUpdate?.();
    await Promise.resolve();
    const c = this.child() as any;
    if (c && this.finance) {
      try {
        if ('sectionOrder' in c) c.sectionOrder = [...this.sectionOrder];
        Object.assign(c, this.mountData);
        c.finance = this.finance;
      } catch { /* child without expected props */ }
      if (typeof c.setFinance === 'function') {
        try {
          await c.setFinance(this.finance);
        } catch (e: any) {
          this.error = String(e?.message || e);
        }
      }
    }
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      ${this.error ? html`<div class="view-container"><div class="view-container-inner"><p class="field-error">Error: ${this.error}</p></div></div>` : ''}
      ${this.view === 'payslip-list' ? html`<payslip-list id="child"></payslip-list>` : ''}
      ${this.view === 'pay-rate-history-view' ? html`<pay-rate-history-view id="child"></pay-rate-history-view>` : ''}
      ${this.view === 'payslip-form' ? html`<payslip-form id="child"></payslip-form>` : ''}
      ${this.view === 'rate-row-form' ? html`<rate-row-form id="child"></rate-row-form>` : ''}
      ${this.view === 'reorder-sections-modal' ? html`<reorder-sections-modal id="child"></reorder-sections-modal>` : ''}
    `;
  }
}
```

In `extensions/salary-history/src/ui/index.ts`, append:

```ts
import './salary-orchestrator.js';
```

(Barrel already imports the 5 child views; this adds the 6th side-effect registration. The `@customElement('salary-orchestrator')` decorator is intentionally NOT used here — registration happens via `customElements.define` guard below to match mortgage's `src/ui/index.ts` pattern; add to `salary-orchestrator.ts` bottom if decorator omitted:)

```ts
if (typeof customElements !== 'undefined' && !customElements.get('salary-orchestrator')) {
  customElements.define('salary-orchestrator', SalaryOrchestrator as unknown as CustomElementConstructor);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/extensions/salary-history/salary-orchestrator.test.ts -v`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add extensions/salary-history/src/ui/salary-orchestrator.ts extensions/salary-history/src/ui/index.ts tests/unit/extensions/salary-history/salary-orchestrator.test.ts
git commit -m "feat(salary): add Lit salary-orchestrator element"
```

---

### Task 4: Migrate orchestrator behavior (events + DB writes + returnTo)

**Files:**
- Modify: `extensions/salary-history/src/ui/salary-orchestrator.ts`
- Test: `tests/unit/extensions/salary-history/salary-orchestrator.test.ts`

**Interfaces:**
- Consumes: `finance.db.table('salary_history_pay_slips' | 'salary_history_rate_history')`, `finance.settings.set('salary-history.sectionOrder', ...)`.
- Produces: same 13 `allowedUiEvents` handling + `returnTo` form routing consumed by child views (no child changes).

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/extensions/salary-history/salary-orchestrator.test.ts`:

```ts
it('payslip-create inserts then returns to payslip-list', async () => {
  document.body.innerHTML = '';
  const el = makeEl();
  const finance = makeMockFinance() as unknown as {
    db: { table: (n: string) => { insert: (p: unknown) => Promise<unknown> } };
  };
  let inserted: unknown = null;
  const origTable = (finance.db.table as unknown as (n: string) => unknown);
  (finance.db as unknown as { table: unknown }).table = (n: string) => {
    const t = origTable(n) as { insert: (p: unknown) => Promise<unknown> };
    return {
      ...t,
      insert: async (p: unknown) => {
        inserted = p;
        return t.insert(p);
      },
    };
  };
  await el.init(finance as never, { view: 'payslip-form' });
  expect(el.view).toBe('payslip-form');
  el.dispatchEvent(new CustomEvent('payslip-create', { detail: { input: { gross: 100 } }, bubbles: true, composed: true }));
  await new Promise((r) => setTimeout(r, 20));
  expect(inserted).toMatchObject({ gross: 100 });
  expect(el.view).toBe('payslip-list');
});

it('rate-form-cancel returns to pay-rate-history-view', async () => {
  document.body.innerHTML = '';
  const el = makeEl();
  await el.init(makeMockFinance(), { view: 'rate-row-form' });
  el.dispatchEvent(new CustomEvent('rate-form-cancel', { bubbles: true, composed: true }));
  await new Promise((r) => setTimeout(r, 20));
  expect(el.view).toBe('pay-rate-history-view');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/extensions/salary-history/salary-orchestrator.test.ts -v`
Expected: FAIL with `expected 'payslip-form' to be 'payslip-list'` (no event handlers yet).

- [ ] **Step 3: Write minimal implementation**

Port handlers verbatim from `extensions/salary-history/src/orchestrator.ts:130-330` into `SalaryOrchestrator` as `connectedCallback` listeners + private methods, with two adaptations: (a) `this._container.addEventListener` → `this.addEventListener`; `this._container.querySelector` → `this.child()`/`this.renderRoot.querySelector`; (b) every `this.navigate('payslip-list' | 'pay-rate-history-view', ...)` after a form close becomes `this.navigate(this._returnTo)` where `_returnTo` is set on each `*-request` entry (`payslip-add-request`/`payslip-edit-request` → `'payslip-list'`; `rate-add-request`/`rate-edit-request`/`rate-view-request`/`rate-delete-request`/`rate-replace-request` → `'pay-rate-history-view'`; `reorder-sections` → modal with `_reorderReturn = 'payslip-form'`). Add fields:

```ts
private _returnTo: 'payslip-list' | 'pay-rate-history-view' = 'payslip-list';
private _editPaySlip: Record<string, unknown> | null = null;
private _rateData: Record<string, unknown> | null = null;
private _rateReadOnly = false;
private _rateError: string | null = null;
private _confirmDelete = false;
private _replaceMode = false;
```

Extend `pushFinance()` to inject one-shot props before `setFinance` (same semantics as old `_mountChild`):

```ts
if (this.view === 'payslip-form' && this._editPaySlip && 'editPaySlip' in c) c.editPaySlip = this._editPaySlip;
if (this.view === 'rate-row-form') {
  if ('rate' in c) c.rate = this._rateData;
  if ('readOnly' in c) c.readOnly = this._rateReadOnly;
  if ('rateError' in c) c.rateError = this._rateError;
  if ('confirmDelete' in c) c.confirmDelete = this._confirmDelete;
  if ('replaceMode' in c) c.replaceMode = this._replaceMode;
}
```

and clear them after inject (`this._editPaySlip = null; this._rateData = null; ...`). Keep `_failRateWrite` inline-error path, querying `this.renderRoot.querySelector('rate-row-form')` for the live form. Keep `host-navigate` listener mapping `{view, mountData}` → `void this.init(this.finance, {view, ...mountData})`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/extensions/salary-history/salary-orchestrator.test.ts -v`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add extensions/salary-history/src/ui/salary-orchestrator.ts tests/unit/extensions/salary-history/salary-orchestrator.test.ts
git commit -m "feat(salary): migrate orchestrator events into Lit element"
```

---

### Task 5: Delete old orchestrator + rewire main.ts to Lit element

**Files:**
- Delete: `extensions/salary-history/src/orchestrator.ts`
- Modify: `extensions/salary-history/src/main.ts`
- Modify: `tests/unit/extensions/salary-history/orchestrator.test.ts` (delete or rewrite as alias — see below)
- Test: `tests/unit/extensions/salary-history/salary-orchestrator.test.ts`

**Interfaces:**
- Consumes: `SalaryOrchestrator.init/setFinance` (Task 3–4).
- Produces: panel branch with `mount-update` listener (consumed by `panel-bootstrap.ts` `onMountUpdate`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/extensions/salary-history/salary-orchestrator.test.ts (append)
it('has no legacy plain-class orchestrator module', async () => {
  const fs = await import('node:fs');
  expect(fs.existsSync('extensions/salary-history/src/orchestrator.ts')).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/extensions/salary-history/salary-orchestrator.test.ts -v`
Expected: FAIL with `expected true to be false` (legacy file still exists).

- [ ] **Step 3: Write minimal implementation**

Delete `extensions/salary-history/src/orchestrator.ts`:

```bash
git rm extensions/salary-history/src/orchestrator.ts
```

In `extensions/salary-history/src/main.ts`, replace the panel branch dynamic import + `_orchestrator` typing:

```ts
import type { SalaryOrchestrator } from './ui/salary-orchestrator.js';
let _orchestrator: SalaryOrchestrator | null = null;
```

Panel branch (final shape, mirrors mortgage):

```ts
if (typeof window !== 'undefined') await import('./ui/index.js');
if (ctx.viewId && typeof document !== 'undefined') {
  const app = document.getElementById('app');
  if (app) {
    const { SalaryOrchestrator } = await import('./ui/salary-orchestrator.js');
    const el = document.createElement('salary-orchestrator') as unknown as SalaryOrchestrator;
    void SalaryOrchestrator;
    app.innerHTML = '';
    app.appendChild(el as unknown as Node);
    const baseData = { viewId: ctx.viewId, ...(ctx as Record<string, unknown>) };
    queueMicrotask(() => void el.init(finance, baseData));
    setTimeout(() => {
      if ((el as unknown as { finance: unknown }).finance == null) void el.setFinance(finance);
    }, 50);
    app.addEventListener('mount-update', (e: Event) => {
      const detail = (e as CustomEvent).detail as Record<string, unknown>;
      void el.init(finance, { ...baseData, ...(detail ?? {}) });
    });
    _orchestrator = el;
  }
  return;
}
```

`deactivate()` drops `_orchestrator.destroy()` (Lit element needs no unbind; keep `services.unregister('pay')`).

Delete `tests/unit/extensions/salary-history/orchestrator.test.ts` (its `accounts-seed-modal` expectations describe a view that never shipped — no `accounts-seed-modal` component exists in `src/ui/`; coverage is superseded by `salary-orchestrator.test.ts`):

```bash
git rm tests/unit/extensions/salary-history/orchestrator.test.ts
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/extensions/salary-history/ -v`
Expected: PASS (all suites; legacy suite gone).

- [ ] **Step 5: Commit**

```bash
git add -A extensions/salary-history/src/main.ts tests/unit/extensions/salary-history/
git commit -m "refactor(salary): replace plain orchestrator with Lit element"
```

---

### Task 6: Cross-extension refs + e2e selector updates

**Files:**
- Modify: `extensions/dashboard/src/orchestrator.ts:222`
- Modify: `tests/e2e/extension-host.spec.ts:22-27,54`
- Test: `tests/unit/extensions/dashboard/orchestrator.test.ts`

**Interfaces:**
- Consumes: salary command IDs (unchanged).
- Produces: Dashboard `pay-summary` card opening the single `salary` tab; e2e pinning Activity Bar `data-view-id="salary"`.

- [ ] **Step 1: Write the failing test**

In `tests/e2e/extension-host.spec.ts`, update the Activity Bar assertion now (test-first):

```ts
const buttons = page.locator('activity-bar button[data-view-id="salary"]');
await expect(buttons).toHaveCount(1);
await expect(buttons).toHaveAttribute('title', 'Salary');
```

Run cannot pass until the manifest (Task 1) + rebuilt bundle land; the unit gate for this task is the Dashboard card-source test below. Append to `tests/unit/extensions/dashboard/orchestrator.test.ts`:

```ts
it('pay-summary card points at the single salary view', async () => {
  const { Orchestrator } = await import('../../../../extensions/dashboard/src/orchestrator');
  const sources = (Orchestrator as unknown as { _CARD_SOURCES?: Record<string, { viewId: string; commandId: string }> })._CARD_SOURCES;
  if (sources) expect(sources['pay-summary'].viewId).toBe('salary');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/extensions/dashboard/orchestrator.test.ts -v`
Expected: FAIL with `expected 'payslip-list' to be 'salary'`.

- [ ] **Step 3: Write minimal implementation**

In `extensions/dashboard/src/orchestrator.ts:222`, replace:

```ts
'pay-summary': { viewId: 'payslip-list', commandId: 'salary.show-pay-history' },
```

with:

```ts
'pay-summary': { viewId: 'salary', commandId: 'salary.show-pay-history' },
```

In `tests/e2e/extension-host.spec.ts`, replace `data-view-id="salary-history"` → `data-view-id="salary"`, title `'Salary'` (already `'Salary'`), and `activateView('salary-history')` → `activateView('salary')`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/extensions/dashboard/orchestrator.test.ts tests/unit/extensions/salary-history/ -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extensions/dashboard/src/orchestrator.ts tests/e2e/extension-host.spec.ts tests/unit/extensions/dashboard/orchestrator.test.ts
git commit -m "feat(salary): point dashboard card at single salary tab"
```

---

### Task 7: Verification + docs (typecheck, full suite, CHANGELOG)

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/file-reference.md`
- Test: full `vitest` + `tsc --noEmit`

**Interfaces:**
- Consumes: all Tasks 1–6 output.
- Produces: green suite + changelog entry per `AGENTS.md §5`.

- [ ] **Step 1: Write the failing test**

No new test code — the gate is the existing suite. Record baseline:

```bash
npx tsc --noEmit
```

Expected before this task: PASS already (Tasks 1–6 kept it green); this task's "failing" gate is the missing CHANGELOG entry:

```bash
git diff --name-only | grep -q CHANGELOG.md && echo "changelog present" || echo "CHANGELOG MISSING"
```

Expected: `CHANGELOG MISSING`.

- [ ] **Step 2: Run full unit suite**

Run: `npx vitest run tests/unit/extensions/salary-history/ tests/unit/extensions/dashboard/ -v`
Expected: PASS (all suites, no legacy `orchestrator.test.ts`).

- [ ] **Step 3: Write minimal implementation (docs)**

In `CHANGELOG.md`, under a new `## [Unreleased]` section (or the topmost unreleased block if present):

```markdown
### Changed

- **Salary History unified into a single Salary tab** (`extensions/salary-history/package.json`, `extensions/salary-history/src/main.ts`, `extensions/salary-history/src/ui/salary-orchestrator.ts`, `extensions/salary-history/src/ui/index.ts`, `extensions/dashboard/src/orchestrator.ts`). One Activity Bar view (`salary`, title `Salary`, `onView:salary`); both `Pay History` / `Pay Rate History` commands retarget the open panel via `mount-update` instead of opening separate tabs; plain `src/orchestrator.ts` replaced by Lit `salary-orchestrator` (view state + `pushFinance` + caller `returnTo`), mirroring `mortgage`.
```

In `docs/file-reference.md`, under the salary-history rows: remove `src/orchestrator.ts`, add `src/ui/salary-orchestrator.ts` (Lit host, owns navigation + mountData, injects finance into child views). Keep frontmatter `version: 1.1.4` and `last_updated` in sync with `package.json#version` per `AGENTS.md §5` (do not bump the version yourself; if `package.json#version` differs, match it).

- [ ] **Step 4: Run verification**

Run: `npx tsc --noEmit`
Expected: PASS with no output.

Run: `npx vitest run tests/unit/extension-host/manifest-schema.test.ts tests/unit/services/extension-registry.test.ts -v`
Expected: PASS (manifest still validates: `salary` matches `^[a-z0-9-]+$`, icon asset path unchanged).

Manual (dev panel, not automated): `npm run dev` → one `Salary` tab; both sidebar items retarget in place; payslip/rate forms and reorder modal round-trip; reload preserves `salary-history.sectionOrder`.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md docs/file-reference.md
git commit -m "docs: changelog for salary single-tab unification"
```

---

## Self-Review

- **Spec coverage:** §1 manifest → Task 1; §2 mount flow → Task 2 + Task 5; §3 Lit orchestrator → Task 3 + Task 4; §4 nav/returnTo → Task 4 + Task 5 (`mount-update`); §5 testing/rollout → Task 6 + Task 7. All covered.
- **Placeholder scan:** no TBD/TODO; every step has exact paths, code, commands, expected output.
- **Type consistency:** `SalaryTag` union used by `view`/`navigate`/`_returnTo` throughout; `init(f, mount)` / `setFinance(f)` signatures match mortgage + `main.ts` call sites; `viewId: 'salary'` consistent across manifest, dashboard fallback, and e2e.
