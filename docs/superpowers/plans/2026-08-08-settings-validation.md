---
title: Settings Input Validation & Format Display Implementation Plan
date: 2026-08-08
last_updated: 2026-08-08T15:35:00+10:00
status: implementation completed
target_version: 0.9.0
spec_source: docs/superpowers/specs/2026-08-08-settings-validation-design.md
---

# Settings Input Validation & Format Display

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-input format hints (placeholder + helper text) and block-write validation to formatted settings inputs in the Settings screen, for both Core and extension-declared settings.

**Architecture:** Renderer-only change in `src/renderer/components/settings-screen.ts` for Core, plus a shared manifest-schema + type extension so extensions can declare `pattern`/`formatHint`/`placeholder`. Formatted inputs get `pattern` (RegExp) + `formatHint` metadata; on blur the value is normalized then checked against the pattern; invalid values are not committed, an inline error renders, and the error clears on input. `core.financialYear.start` gains a new `formatFinanceYearStart` normalizer so it becomes a validated, format-annotated input. Extension configs compile string patterns to RegExp and validate identically (no auto-formatting — extensions can't declare JS `format` functions).

**Tech Stack:** Lit (LitElement), TypeScript, Vitest + happy-dom.

---

### Task 1: Add format-annotated input validation to the Settings screen

**Files:**
- Modify: `src/renderer/components/settings-screen.ts`
- Test: `tests/unit/renderer/settings-screen.test.ts`

- [x] **Step 1: Write the failing tests**

Append the following tests to `tests/unit/renderer/settings-screen.test.ts` (before the final closing of the `SettingsScreen financial year dropdown (Task 2)` describe block's scope — add new describe blocks after it):

```ts
describe('formatFinanceYearStart', () => {
  it('formats 4 consecutive digits to MM-DD', () => {
    expect(formatFinanceYearStart('0701')).toBe('07-01');
  });

  it('pads single-digit month and day', () => {
    expect(formatFinanceYearStart('7-1')).toBe('07-01');
  });

  it('leaves an MM-DD value unchanged', () => {
    expect(formatFinanceYearStart('07-01')).toBe('07-01');
  });

  it('trims surrounding whitespace', () => {
    expect(formatFinanceYearStart('  07-01  ')).toBe('07-01');
  });

  it('returns unrecognized input unchanged', () => {
    expect(formatFinanceYearStart('hello')).toBe('hello');
  });
});

describe('SettingsScreen formatted input validation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    mockShell();
  });

  it('renders placeholder and helper text for the FY current input', async () => {
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const input = el.shadowRoot!.querySelector('.setting-control input[data-testid="input-core.financialYear.current"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input!.placeholder).toBe('2025-2026');
    const helper = el.shadowRoot!.querySelector('.setting-helper[data-testid="helper-core.financialYear.current"]');
    expect(helper?.textContent).toContain('Format: YYYY-YYYY');
  });

  it('renders placeholder and helper text for the FY start input', async () => {
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const input = el.shadowRoot!.querySelector('.setting-control input[data-testid="input-core.financialYear.start"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input!.placeholder).toBe('07-01');
    const helper = el.shadowRoot!.querySelector('.setting-helper[data-testid="helper-core.financialYear.start"]');
    expect(helper?.textContent).toContain('Format: MM-DD');
  });

  it('blocks committing an invalid FY value and shows an error', async () => {
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const setMock = (window as unknown as { financeShell: { settings: { set: ReturnType<typeof vi.fn> } } }).financeShell.settings.set;
    const input = el.shadowRoot!.querySelector('.setting-control input[data-testid="input-core.financialYear.current"]') as HTMLInputElement | null;
    input!.value = 'not-a-year';
    input!.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 0));

    expect(setMock).not.toHaveBeenCalledWith('core.financialYear.current', 'not-a-year');
    const error = el.shadowRoot!.querySelector('.setting-error[data-testid="error-core.financialYear.current"]');
    expect(error).not.toBeNull();
    expect(input!.getAttribute('aria-invalid')).toBe('true');
  });

  it('commits a valid formatted FY value', async () => {
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const setMock = (window as unknown as { financeShell: { settings: { set: ReturnType<typeof vi.fn> } } }).financeShell.settings.set;
    const input = el.shadowRoot!.querySelector('.setting-control input[data-testid="input-core.financialYear.current"]') as HTMLInputElement | null;
    input!.value = '20252026';
    input!.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 350));

    expect(setMock).toHaveBeenCalledWith('core.financialYear.current', '2025-2026');
    const error = el.shadowRoot!.querySelector('.setting-error[data-testid="error-core.financialYear.current"]');
    expect(error).toBeNull();
  });

  it('clears the error state on subsequent input', async () => {
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const input = el.shadowRoot!.querySelector('.setting-control input[data-testid="input-core.financialYear.current"]') as HTMLInputElement | null;
    input!.value = 'garbage';
    input!.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 0));
    expect(el.shadowRoot!.querySelector('.setting-error')).not.toBeNull();

    input!.value = '20';
    input!.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 0));
    expect(el.shadowRoot!.querySelector('.setting-error')).toBeNull();
  });

  it('normalizes and commits a valid FY start value', async () => {
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const setMock = (window as unknown as { financeShell: { settings: { set: ReturnType<typeof vi.fn> } } }).financeShell.settings.set;
    const input = el.shadowRoot!.querySelector('.setting-control input[data-testid="input-core.financialYear.start"]') as HTMLInputElement | null;
    input!.value = '7-1';
    input!.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 350));

    expect(setMock).toHaveBeenCalledWith('core.financialYear.start', '07-01');
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/renderer/settings-screen.test.ts`
Expected: FAIL — `formatFinanceYearStart is not exported`, and the render tests fail because `data-testid` attributes / helper text do not exist yet.

- [x] **Step 3: Update the item metadata interface and CORE_SETTINGS**

In `src/renderer/components/settings-screen.ts`, change the `ExtensionSettings.items[]` element type and `_renderControl` signature type from:

```ts
interface ExtensionSettings {
  extensionId: string;
  displayName: string;
  items: Array<{
    key: string;
    type: string;
    label: string;
    default?: unknown;
    enumOptions?: string[];
    format?: (raw: string) => string;
  }>;
}
```

to:

```ts
interface ExtensionSettings {
  extensionId: string;
  displayName: string;
  items: Array<{
    key: string;
    type: string;
    label: string;
    default?: unknown;
    enumOptions?: string[];
    format?: (raw: string) => string;
    pattern?: RegExp;
    formatHint?: string;
  }>;
}
```

- [x] **Step 4: Add the `formatFinanceYearStart` normalizer**

In `src/renderer/components/settings-screen.ts`, after the `formatFinanceYear` function (line 51), add:

```ts
/**
 * Normalize a user-typed financial-year start into `MM-DD`.
 * Accepts `0701` (4 consecutive digits), `7-1` (single-digit month/day),
 * and `07-01`. Anything unrecognized is returned unchanged.
 */
export function formatFinanceYearStart(raw: string): string {
  const s = raw.trim();
  if (/^\d{2}-\d{2}$/.test(s)) return s;

  const digits = /^(\d{2})(\d{2})$/.exec(s);
  if (digits) return `${digits[1]}-${digits[2]}`;

  const parts = /^(\d{1,2})-(\d{1,2})$/.exec(s);
  if (parts) {
    const pad = (n: string) => n.padStart(2, '0');
    return `${pad(parts[1])}-${pad(parts[2])}`;
  }

  return s;
}
```

- [x] **Step 5: Update CORE_SETTINGS for the two formatted inputs**

In `src/renderer/components/settings-screen.ts`, replace the first two `CORE_SETTINGS.items` entries:

```ts
const CORE_SETTINGS: ExtensionSettings = {
  extensionId: 'core',
  displayName: 'Core',
  items: [
    { key: 'core.financialYear.current', type: 'string', label: 'Current financial year context (format YYYY-YYYY). Dashboard YTD, payslip filters, and reports use this value.', default: computeCurrentFinancialYear(), format: formatFinanceYear },
    { key: 'core.financialYear.start', type: 'string', label: 'Month and day the financial year starts. Used to compute FY labels from dates.', default: '07-01' },
```

with:

```ts
const CORE_SETTINGS: ExtensionSettings = {
  extensionId: 'core',
  displayName: 'Core',
  items: [
    { key: 'core.financialYear.current', type: 'string', label: 'Current financial year context (format YYYY-YYYY). Dashboard YTD, payslip filters, and reports use this value.', default: computeCurrentFinancialYear(), format: formatFinanceYear, pattern: /^\d{4}-\d{4}$/, formatHint: 'YYYY-YYYY' },
    { key: 'core.financialYear.start', type: 'string', label: 'Month and day the financial year starts. Used to compute FY labels from dates.', default: '07-01', format: formatFinanceYearStart, pattern: /^\d{2}-\d{2}$/, formatHint: 'MM-DD' },
```

- [x] **Step 6: Add error state field and CSS**

In `src/renderer/components/settings-screen.ts`:

(a) After the `_values` state field (line 306), add:

```ts
  @state()
  private _errors = new Map<string, string>();
```

(b) In the static styles block, after the `.action-btn:hover` rule (line 290), add:

```css
    .setting-helper {
      font-size: 11px;
      color: #858585;
      margin-top: 4px;
      font-family: "SF Mono", Consolas, monospace;
    }

    .setting-helper.invalid {
      color: #f48771;
    }

    .setting-control input.invalid,
    .setting-control textarea.invalid {
      border-color: #f48771;
      outline: 1px solid #f48771;
    }
```

- [x] **Step 7: Add validation logic to `_renderControl`**

In `src/renderer/components/settings-screen.ts`:

(a) Change the `_renderControl` signature type to include the new fields:

```ts
  private _renderControl(item: { key: string; type: string; label: string; default?: unknown; enumOptions?: string[]; format?: (raw: string) => string; pattern?: RegExp; formatHint?: string }) {
```

(b) Add helper methods before `_renderControl`:

```ts
  private _formatValue(item: { key: string; format?: (raw: string) => string; default?: unknown }, value: unknown): string {
    const raw = value !== undefined ? String(value) : String(item.default ?? '');
    return item.format ? item.format(raw) : raw;
  }

  private _validateFormatted(item: { key: string; pattern?: RegExp; formatHint?: string }, formatted: string): string | null {
    if (!item.pattern) return null;
    return item.pattern.test(formatted) ? null : `Value must match format ${item.formatHint ?? String(item.pattern)}`;
  }
```

(c) In `_renderControl`, in the number input branch's `@change` handler, nothing changes. For the final string/text `return html\`...\`` branch (line 469-480), replace it with:

```ts
    const isFormatted = Boolean(item.format);
    const placeholder = isFormatted && item.formatHint ? this._defaultPlaceholder(item) : '';
    const error = this._errors.get(item.key) ?? null;
    const helperText = isFormatted && item.formatHint ? `Format: ${item.formatHint}` : '';
    const fieldId = `input-${item.key}`;
    const helperId = `helper-${item.key}`;
    const errorId = `error-${item.key}`;
    return html`
      <input
        id="${fieldId}"
        data-testid="${fieldId}"
        type="text"
        placeholder="${placeholder}"
        .value=${this._formatValue(item, value)}
        ?aria-invalid=${error !== null}
        aria-describedby=${isFormatted ? (error ? `${helperId} ${errorId}` : helperId) : null}
        class=${error !== null ? 'invalid' : ''}
        @input=${() => {
          if (this._errors.has(item.key)) {
            this._errors.delete(item.key);
            this.requestUpdate();
          }
        }}
        @change=${(e: Event) => {
          const target = e.target as HTMLInputElement;
          const raw = target.value;
          const formatted = item.format ? item.format(raw) : raw;
          target.value = formatted;
          if (item.pattern) {
            const err = this._validateFormatted(item, formatted);
            if (err) {
              this._errors.set(item.key, err);
              this.requestUpdate();
              return;
            }
          }
          this._errors.delete(item.key);
          this._commit(item.key, formatted);
        }}
      />
      ${isFormatted && helperText ? html`<div class="setting-helper" data-testid="${helperId}" id="${helperId}">${helperText}</div>` : ''}
      ${error ? html`<div class="setting-helper invalid" data-testid="${errorId}" id="${errorId}" role="alert">${error}</div>` : ''}
    `;
```

(d) Add the `_defaultPlaceholder` helper:

```ts
  private _defaultPlaceholder(item: { formatHint?: string }): string {
    if (item.formatHint === 'YYYY-YYYY') return '2025-2026';
    if (item.formatHint === 'MM-DD') return '07-01';
    return '';
  }
```

Note: `aria-describedby=${... : null}` renders no attribute when null — acceptable for a non-formatted plain string input. The test asserts on the formatted inputs only.

- [x] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/renderer/settings-screen.test.ts`
Expected: PASS — all existing + new tests pass.

- [x] **Step 9: Run typecheck and lint**

Run: `npm run typecheck`
Expected: PASS — no errors.

Run: `npm run lint`
Expected: PASS — no new errors.

- [ ] **Step 10: Commit — SKIPPED.** AGENTS.md rule 6: never `git commit` without explicit user permission. Awaiting user go-ahead.

```bash
git add src/renderer/components/settings-screen.ts tests/unit/renderer/settings-screen.test.ts docs/superpowers/specs/2026-08-08-settings-validation-design.md
git commit -m "feat: validate and annotate formatted settings inputs"
```

---

### Task 2: Update project documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/file-reference.md`
- Modify: `docs/superpowers/plans/2026-08-02-phase7-production-polish.md`

- [x] **Step 1: Update CHANGELOG.md**

Under the `### Changed` subsection of the current unreleased header, append a bullet:

```markdown
- **Formatted settings inputs now validate and show format hints** (`src/renderer/components/settings-screen.ts`, `src/extension-host/manifest-schema.ts`, `src/types/finance.d.ts`, `tests/unit/renderer/settings-screen.test.ts`, `tests/unit/extension-host/manifest-schema.test.ts`, `extensions/salary-history/package.json`, `extensions/dashboard/package.json`). Inputs with format/pattern metadata render a placeholder example plus persistent `Format: <hint>` helper text, and invalid values are blocked from being saved with an inline error (`aria-invalid`, `aria-describedby`). `core.financialYear.current` gains a `YYYY-YYYY` pattern; `core.financialYear.start` gains a new `formatFinanceYearStart()` normalizer (`0701` → `07-01`, `7-1` → `07-01`) and an `MM-DD` pattern. Extension manifests may now declare `pattern`/`formatHint`/`placeholder` on configuration contributions (validated at load; malformed patterns reject the manifest), and the `salary-history` + `dashboard` financial-year/tax-year string settings carry `MM-DD` / `YYYY-YYYY` hints. Per spec `docs/superpowers/specs/2026-08-08-settings-validation-design.md`.
```

- [x] **Step 2: Update `docs/file-reference.md`**

Add or update a row for the spec:

```markdown
| `docs/superpowers/specs/2026-08-08-settings-validation-design.md` | new | Design for formatted-input validation + format hints in the Settings screen. |
```

- [x] **Step 3: Update the Phase 7 plan's frontmatter and Task 2 record**

In `docs/superpowers/plans/2026-08-02-phase7-production-polish.md`, update `last_updated` to `2026-08-08T12:45:00+10:00` and add a bullet under the task record noting the validation/format behavior landed.

- [x] **Step 4: Verify**

Run: `npm run typecheck`
Expected: PASS — no errors.

Run: `npm run lint`
Expected: PASS — no new errors.

- [ ] **Step 5: Commit — SKIPPED.** AGENTS.md rule 6: never `git commit` without explicit user permission. Awaiting user go-ahead.

```bash
git add CHANGELOG.md docs/file-reference.md docs/superpowers/plans/2026-08-02-phase7-production-polish.md
git commit -m "docs: record settings input validation work"
```

---

### Task 3: Manifest schema + renderer support for extension-declared patterns

**Files:**
- Modify: `src/extension-host/manifest-schema.ts`
- Modify: `src/types/finance.d.ts`
- Modify: `src/renderer/components/settings-screen.ts`
- Test: `tests/unit/extension-host/manifest-schema.test.ts`
- Test: `tests/unit/renderer/settings-screen.test.ts`

- [x] **Step 1: Write the failing tests**

In `tests/unit/extension-host/manifest-schema.test.ts`, add a describe block:

```ts
describe('configuration contribution format metadata', () => {
  const baseManifest = {
    id: 'test-ext',
    displayName: 'Test Ext',
    version: '0.1.0',
    activationEvents: ['onStartup'],
    main: 'src/main.ts',
    contributions: {
      configuration: [
        { key: 'test-ext.start', type: 'string', label: 'Start date', pattern: '^\\d{2}-\\d{2}$', formatHint: 'MM-DD', placeholder: '07-01' },
      ],
    },
  };

  it('accepts pattern/formatHint/placeholder on a configuration contribution', () => {
    const result = validateManifest(baseManifest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.contributions.configuration![0]).toMatchObject({
        pattern: '^\\d{2}-\\d{2}$',
        formatHint: 'MM-DD',
        placeholder: '07-01',
      });
    }
  });

  it('rejects a configuration contribution with an invalid pattern regex', () => {
    const result = validateManifest({
      ...baseManifest,
      contributions: {
        configuration: [
          { key: 'test-ext.start', type: 'string', label: 'Start date', pattern: '[' },
        ],
      },
    });
    expect(result.ok).toBe(false);
  });

  it('accepts a configuration contribution without pattern fields (backward compatible)', () => {
    const result = validateManifest({
      ...baseManifest,
      contributions: {
        configuration: [
          { key: 'test-ext.currency', type: 'string', label: 'Currency', default: 'AUD' },
        ],
      },
    });
    expect(result.ok).toBe(true);
  });
});
```

In `tests/unit/renderer/settings-screen.test.ts`, add a test inside the existing `SettingsScreen formatted input validation` describe block (or a new one with the same `beforeEach`):

```ts
  it('validates an extension config item declared with a string pattern', async () => {
    (window as unknown as { financeShell: { extensions: { list: ReturnType<typeof vi.fn> } } }).financeShell.extensions.list.mockResolvedValue({
      configuration: [
        { extensionId: 'salary-history', configuration: { key: 'salary-history.financialYearStart', type: 'string', label: 'FY Start', pattern: '^\\d{2}-\\d{2}$', formatHint: 'MM-DD', placeholder: '07-01' } },
      ],
    });
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const setMock = (window as unknown as { financeShell: { settings: { set: ReturnType<typeof vi.fn> } } }).financeShell.settings.set;
    const input = el.shadowRoot!.querySelector('.setting-control input[data-testid="input-salary-history.financialYearStart"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input!.placeholder).toBe('07-01');

    input!.value = 'invalid';
    input!.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 0));

    expect(setMock).not.toHaveBeenCalledWith('salary-history.financialYearStart', 'invalid');
    const error = el.shadowRoot!.querySelector('.setting-error[data-testid="error-salary-history.financialYearStart"]');
    expect(error).not.toBeNull();
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/extension-host/manifest-schema.test.ts tests/unit/renderer/settings-screen.test.ts`
Expected: FAIL — manifest schema rejects unknown `pattern` fields (Zod strips unknown keys), and the renderer test fails because extension config items don't carry pattern metadata through.

- [x] **Step 3: Add fields to `ManifestConfigurationContribution`**

In `src/types/finance.d.ts`, extend `ManifestConfigurationContribution` (lines 80-88):

```ts
export interface ManifestConfigurationContribution {
  /** Full settings key in `extensionId.localKey` form. */
  key: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'object';
  label: string;
  default?: unknown;
  /** Required for `enum` type. */
  enumOptions?: string[];
  /** Full-string RegExp the value must match (string inputs). */
  pattern?: string;
  /** Human-readable expected format, shown as helper text (e.g. `MM-DD`). */
  formatHint?: string;
  /** Example value shown as the input placeholder. */
  placeholder?: string;
}
```

- [x] **Step 4: Add fields to the configuration Zod schema**

In `src/extension-host/manifest-schema.ts`, change `configurationContributionSchema` (lines 33-42) from:

```ts
export const configurationContributionSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+\.[a-zA-Z0-9.-]+$/, 'configuration key must be "<extensionId>.<localKey>"'),
  type: z.enum(['string', 'number', 'boolean', 'enum', 'object']),
  label: z.string().min(1),
  default: z.unknown().optional(),
  enumOptions: z.array(z.string()).optional()
}).refine(
  (cfg) => cfg.type !== 'enum' || (cfg.enumOptions && cfg.enumOptions.length > 0),
  { message: 'enum type requires enumOptions', path: ['enumOptions'] }
);
```

to:

```ts
export const configurationContributionSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+\.[a-zA-Z0-9.-]+$/, 'configuration key must be "<extensionId>.<localKey>"'),
  type: z.enum(['string', 'number', 'boolean', 'enum', 'object']),
  label: z.string().min(1),
  default: z.unknown().optional(),
  enumOptions: z.array(z.string()).optional(),
  pattern: z.string().optional(),
  formatHint: z.string().optional(),
  placeholder: z.string().optional()
}).refine(
  (cfg) => cfg.type !== 'enum' || (cfg.enumOptions && cfg.enumOptions.length > 0),
  { message: 'enum type requires enumOptions', path: ['enumOptions'] }
).refine(
  (cfg) => cfg.pattern === undefined || isValidRegex(cfg.pattern),
  { message: 'pattern must be a valid regular expression', path: ['pattern'] }
);
```

Add this helper above `configurationContributionSchema`:

```ts
function isValidRegex(source: string): boolean {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}
```

- [x] **Step 5: Update the renderer item shape and `_loadSettings`**

In `src/renderer/components/settings-screen.ts`:

(a) Change `pattern?: RegExp` to `pattern?: RegExp | string` in the `ExtensionSettings.items[]` element type, and add `placeholder?: string`:

```ts
  items: Array<{
    key: string;
    type: string;
    label: string;
    default?: unknown;
    enumOptions?: string[];
    format?: (raw: string) => string;
    pattern?: RegExp | string;
    formatHint?: string;
    placeholder?: string;
  }>;
```

(b) In `_loadSettings`, when pushing extension config items into `grouped`, preserve the new fields. Find the code that does `existing.items.push(item.configuration)` (line ~393) and change the normalization so each item carries through `pattern`/`formatHint`/`placeholder`:

```ts
      for (const item of configs) {
        const configItem: ExtensionSettings['items'][number] = {
          key: item.configuration.key,
          type: item.configuration.type,
          label: item.configuration.label,
          default: item.configuration.default,
          enumOptions: item.configuration.enumOptions,
          pattern: item.configuration.pattern,
          formatHint: item.configuration.formatHint,
          placeholder: item.configuration.placeholder,
        };
        const existing = grouped.get(item.extensionId);
        if (existing) {
          existing.items.push(configItem);
        } else {
          grouped.set(item.extensionId, {
            extensionId: item.extensionId,
            displayName: item.extensionId,
            items: [configItem],
          });
        }
        keys.push(item.configuration.key);
      }
```

(c) Add `placeholder?: string` to the `_renderControl` signature and the `_formatValue` / `_validateFormatted` / `_defaultPlaceholder` param types, and update `_defaultPlaceholder` to prefer an explicit `placeholder`:

```ts
  private _renderControl(item: { key: string; type: string; label: string; default?: unknown; enumOptions?: string[]; format?: (raw: string) => string; pattern?: RegExp | string; formatHint?: string; placeholder?: string }) {
```

```ts
  private _validateFormatted(item: { key: string; pattern?: RegExp; formatHint?: string }, formatted: string): string | null {
    if (!item.pattern) return null;
    return item.pattern.test(formatted) ? null : `Value must match format ${item.formatHint ?? String(item.pattern)}`;
  }
```

```ts
  private _defaultPlaceholder(item: { formatHint?: string; placeholder?: string }): string {
    if (item.placeholder) return item.placeholder;
    if (item.formatHint === 'YYYY-YYYY') return '2025-2026';
    if (item.formatHint === 'MM-DD') return '07-01';
    return '';
  }
```

(d) Update `isFormatted` so extension items (which have `pattern`/`formatHint` but no `format` function) are treated as formatted. In the string/text branch of `_renderControl`, change:

```ts
    const isFormatted = Boolean(item.format);
```

to:

```ts
    const isFormatted = Boolean(item.format || item.pattern || item.formatHint);
```

(e) In the same branch, compile a string `pattern` to `RegExp` before validation. Change the `@change` handler's validation block from:

```ts
          if (item.pattern) {
            const err = this._validateFormatted(item, formatted);
            if (err) {
              this._setError(item.key, err);
              return;
            }
          }
```

to:

```ts
          const pattern = typeof item.pattern === 'string' ? new RegExp(item.pattern) : item.pattern;
          if (pattern) {
            const err = this._validateFormatted({ ...item, pattern }, formatted);
            if (err) {
              this._setError(item.key, err);
              return;
            }
          }
```

Note: `_validateFormatted` already accepts `pattern?: RegExp`; passing the compiled `RegExp` keeps it type-safe. The manifest schema guarantees string patterns compile, so `new RegExp` cannot throw for manifest-declared patterns.

- [x] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/extension-host/manifest-schema.test.ts tests/unit/renderer/settings-screen.test.ts`
Expected: PASS — all tests pass.

- [x] **Step 7: Run typecheck and lint**

Run: `npm run typecheck`
Expected: PASS — no errors.

Run: `npm run lint`
Expected: PASS — no new errors.

- [x] **Step 8: Commit — SKIPPED (as instructed).** AGENTS.md rule 6 requires explicit user permission.

**SKIP — do NOT commit.** AGENTS.md rule 6 requires explicit user permission.

---

### Task 4: Add format metadata to extension manifests

**Files:**
- Modify: `extensions/salary-history/package.json`
- Modify: `extensions/dashboard/package.json`

- [x] **Step 1: Update `extensions/salary-history/package.json`**

In the `contributions.configuration` array, replace the four string entries with:

```json
      "configuration": [
        { "key": "salary-history.defaultCurrency", "type": "string", "label": "Default Currency", "default": "AUD", "pattern": "^[A-Z]{3}$", "formatHint": "AAA", "placeholder": "AUD" },
        { "key": "salary-history.financialYearStart", "type": "string", "label": "Financial Year Start (MM-DD)", "default": "07-01", "pattern": "^\\d{2}-\\d{2}$", "formatHint": "MM-DD", "placeholder": "07-01" },
        { "key": "salary-history.paygToleranceDollars", "type": "number", "label": "PAYG Tolerance ($)", "default": 5.0 },
        { "key": "salary-history.paygTaxYear", "type": "string", "label": "PAYG Tax Year", "default": "2026-2027", "pattern": "^\\d{4}-\\d{4}$", "formatHint": "YYYY-YYYY", "placeholder": "2025-2026" },
        { "key": "salary-history.financeYear", "type": "string", "label": "Financial Year", "default": "", "pattern": "^\\d{4}-\\d{4}$", "formatHint": "YYYY-YYYY", "placeholder": "2025-2026" }
      ]
```

- [x] **Step 2: Update `extensions/dashboard/package.json`**

In the `contributions.configuration` array, replace the two string entries with:

```json
      "configuration": [
        {
          "key": "dashboard.financialYearStart",
          "type": "string",
          "label": "Financial year start (MM-DD)",
          "default": "07-01",
          "pattern": "^\\d{2}-\\d{2}$",
          "formatHint": "MM-DD",
          "placeholder": "07-01"
        },
        {
          "key": "dashboard.financeYear",
          "type": "string",
          "label": "Financial year label override (e.g. 2025-2026). Empty = auto-compute.",
          "default": "",
          "pattern": "^\\d{4}-\\d{4}$",
          "formatHint": "YYYY-YYYY",
          "placeholder": "2025-2026"
        }
      ]
```

- [x] **Step 3: Verify manifests validate**

Run: `npx vitest run tests/unit/extension-host/manifest-schema.test.ts tests/unit/services/extension-loader.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS — no errors.

Run: `npm run lint`
Expected: PASS — no new errors.

- [x] **Step 4: Commit — SKIPPED (as instructed).** AGENTS.md rule 6 requires explicit user permission.

**SKIP — do NOT commit.** AGENTS.md rule 6 requires explicit user permission.
