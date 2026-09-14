import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { baseViewStyles, headerHighlightStyles } from '../styles/base-view-styles';
import { overlayCoordinator } from '../overlay-coordinator';
import { rendererLogger } from '../logger';

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
    pattern?: RegExp | string;
    formatHint?: string;
    placeholder?: string;
  }>;
}

const DEFAULT_FY_START = '07-01';

/** Compute the current financial year label (e.g. `2026-2027`) containing `referenceDate`. */
export function computeCurrentFinancialYear(referenceDate?: string): string {
  const ref = referenceDate ?? new Date().toISOString().slice(0, 10);
  const [ry, rm] = ref.split('-').map(Number);
  const [sm] = DEFAULT_FY_START.split('-').map(Number);
  const startYear = rm >= sm ? ry : ry - 1;
  return `${startYear}-${startYear + 1}`;
}

/**
 * Normalize a user-typed financial year into `YYYY-YYYY`.
 * Accepts `20252026` (8 consecutive digits), `2025-2026`, and legacy `2025-26`.
 * Anything unrecognized is returned unchanged.
 */
export function formatFinanceYear(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{4}$/.test(s)) return s;

  const legacy = /^(\d{4})-(\d{2})$/.exec(s);
  if (legacy) {
    const start = Number(legacy[1]);
    const end2 = Number(legacy[2]);
    return `${start}-${Math.floor(start / 100) * 100 + end2}`;
  }

  const digits = /^(\d{4})(\d{4})$/.exec(s);
  if (digits) {
    return `${digits[1]}-${digits[2]}`;
  }

  return s;
}

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

const CORE_SETTINGS: ExtensionSettings = {
  extensionId: 'core',
  displayName: 'Core',
  items: [
    { key: 'core.financialYear.current', type: 'string', label: 'Current financial year context (format YYYY-YYYY). Dashboard YTD, payslip filters, and reports use this value.', default: computeCurrentFinancialYear(), format: formatFinanceYear, pattern: /^\d{4}-\d{4}$/, formatHint: 'YYYY-YYYY' },
    { key: 'core.financialYear.start', type: 'string', label: 'Month and day the financial year starts. Used to compute FY labels from dates.', default: '07-01', format: formatFinanceYearStart, pattern: /^\d{2}-\d{2}$/, formatHint: 'MM-DD' },
    { key: 'core.financeYear.filter', type: 'number', label: 'Number of past financial years to show in the Dashboard FY filter dropdown (including current).', default: 5, placeholder: '5' },
    { key: 'core.defaultCurrency', type: 'string', label: 'Default currency code for new payslips and monetary display.', default: 'AUD', pattern: /^[A-Z]{3}$/, formatHint: 'AAA', placeholder: 'AUD' },
    { key: 'core.theme', type: 'enum', label: 'Application color theme.', default: 'dark', enumOptions: ['dark', 'light'] },
    { key: 'core.logLevel', type: 'enum', label: 'Minimum log level. Lower levels are hidden everywhere (terminal, DevTools, log file). Takes effect immediately without restart.', default: 'info', enumOptions: ['debug', 'info', 'warn', 'error'] },
    { key: 'core.workspace.defaultView', type: 'string', label: 'Extension view to activate on startup. Requires the extension to declare onStartup.', default: 'dashboard' },
    { key: 'core.workspace.autoSaveTimeout', type: 'number', label: 'Auto-save draft timeout (milliseconds). Maximum time to wait for an extension to persist draft state before timing out. (1 second = 1000 ms)', default: 500, placeholder: '500' },
    { key: 'core.workspace.lazyUnmountTimeout', type: 'number', label: 'Lazy unmount timeout (milliseconds). Inactive panels are destroyed after this duration. Lower values free memory faster but cause more remounts when switching tabs. (1 second = 1000 ms). Set to 0 to disable.', default: 300000, placeholder: '300000' }
  ]
};

@customElement('settings-screen')
export class SettingsScreen extends LitElement {
  static styles = css`
    ${baseViewStyles}
    ${headerHighlightStyles}

    .settings-body {
      flex: 1;
      min-width: 0;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: thin;
      scrollbar-color: #5a5a5a transparent;
      scroll-behavior: smooth;
    }
    .settings-body::-webkit-scrollbar { width: 10px; }
    .settings-body::-webkit-scrollbar-track { background: transparent; }
    .settings-body::-webkit-scrollbar-thumb {
      background: #5a5a5a;
      border-radius: 5px;
      border: 2px solid transparent;
      background-clip: padding-box;
      transition: background 0.2s ease;
    }
    .settings-body::-webkit-scrollbar-thumb:hover {
      background: #6a6a6a;
      background-clip: padding-box;
    }
    .settings-body::-webkit-scrollbar-thumb:active {
      background: #007acc;
      background-clip: padding-box;
    }
    .settings-body::-webkit-scrollbar-corner { background: transparent; }

    .settings-header {
      margin-bottom: 24px;
    }

    .settings-header h1 {
      font-size: var(--ff-font-2xl);
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 4px;
    }

    .settings-header .subtitle {
      color: var(--text-tertiary);
      font-size: var(--ff-font-md);
      margin: 0;
    }

    .search-bar {
      margin-bottom: 24px;
      position: relative;
    }

    .search-bar input {
      width: 100%;
      max-width: 420px;
      padding: 8px 12px 8px 32px;
      border: 1px solid var(--input-border);
      border-radius: 3px;
      background: var(--input-bg);
      color: var(--input-text);
      font-size: var(--ff-font-md);
      font-family: inherit;
      outline: none;
      box-sizing: border-box;
    }

    .search-bar input:focus {
      border-color: var(--input-focus-border);
      outline: 1px solid var(--input-focus-border);
    }

    .search-bar input::placeholder {
      color: var(--text-tertiary);
    }

    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-tertiary);
      pointer-events: none;
      font-size: var(--ff-font-md);
    }

    .settings-section {
      background: var(--workspace-bg);
      border: 1px solid var(--input-border);
      border-radius: 6px;
      margin-bottom: 16px;
      overflow: hidden;
    }

    .settings-section-header {
      padding: 12px 16px;
      background: var(--tab-bg);
      border-bottom: 1px solid var(--input-border);
      font-size: var(--ff-font-md);
      font-weight: 600;
      color: var(--section-header-text);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    }

    .settings-section-header:hover {
      background: var(--section-header-hover-bg);
    }

    .badge {
      font-size: var(--ff-font-md);
      padding: 2px 8px;
      border-radius: 3px;
      background: var(--btn-secondary-bg);
      color: var(--text-tertiary);
      font-weight: 600;
    }

    .settings-section.collapsed .settings-section-body {
      display: none;
    }

    .settings-section.collapsed .badge::after {
      content: "collapsed";
    }

    .settings-section:not(.collapsed) .badge::after {
      content: "expanded";
    }

    .settings-section-body {
      padding: 16px;
    }

    .setting-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      padding: 15px 15px;
      border-bottom: 1px solid var(--section-row-border);
    }

    .setting-row:last-child {
      border-bottom: none;
    }

    .setting-info {
      flex: 1;
      min-width: 0;
    }

    .setting-key {
      font-family: "SF Mono", Consolas, monospace;
      font-size: var(--ff-font-md);
      color: #4ec9b0;
      margin-bottom: 2px;
    }

    .setting-desc {
      font-size: var(--ff-font-md);
      color: var(--text-tertiary);
    }

    .setting-default {
      font-size: var(--ff-font-md);
      color: var(--text-tertiary);
      margin-top: 4px;
    }

    .setting-default code {
      background: var(--code-bg);
      padding: 1px 4px;
      border-radius: 2px;
      font-size: var(--ff-font-md);
    }

    .setting-control {
      flex-shrink: 0;
      width: 280px;
    }

    .setting-control input[type="text"],
    .setting-control input[type="number"],
    .setting-control select,
    .setting-control textarea {
      width: 100%;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--input-text);
      padding: 6px 10px;
      border-radius: 3px;
      font-family: inherit;
      font-size: var(--ff-font-md);
      box-sizing: border-box;
    }

    .setting-control input:focus,
    .setting-control select:focus,
    .setting-control textarea:focus {
      outline: 1px solid var(--input-focus-border);
      border-color: var(--input-focus-border);
    }

    .setting-control textarea {
      min-height: 80px;
      font-family: "SF Mono", Consolas, monospace;
      font-size: var(--ff-font-md);
      resize: vertical;
    }

    .setting-control input[type="checkbox"] {
      accent-color: var(--input-focus-border);
      width: 16px;
      height: 16px;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .toggle-label {
      font-size: var(--ff-font-md);
      color: var(--text-tertiary);
    }

    .action-btn {
      background: var(--btn-secondary-bg);
      color: var(--btn-secondary-text);
      border: 1px solid var(--btn-secondary-border);
      padding: 6px 12px;
      border-radius: 3px;
      font-size: var(--ff-font-md);
      cursor: pointer;
      font-family: inherit;
    }

    .action-btn:hover {
      border-color: var(--btn-secondary-hover-border);
    }

    .setting-helper {
      font-size: var(--ff-font-md);
      color: var(--text-tertiary);
      margin-top: 4px;
      font-family: "SF Mono", Consolas, monospace;
    }

    .setting-helper.invalid {
      color: var(--danger-color);
    }

    .color-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .color-row input[type="color"] {
      width: 36px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--input-border);
      border-radius: 3px;
      background: var(--input-bg);
      cursor: pointer;
    }
    .color-row input[type="text"] {
      flex: 1;
    }

    .setting-control input.invalid,
    .setting-control textarea.invalid {
      border-color: var(--danger-color);
      outline: 1px solid var(--danger-color);
    }
  `;

  @state()
  private _sections: ExtensionSettings[] = [];

  @state()
  private _loading = true;

  @state()
  private _error: string | null = null;

  @state()
  private _searchQuery = '';

  @state()
  private _values = new Map<string, unknown>();

  @state()
  private _errors = new Map<string, string>();

  /** Manifest-declared themeColor per extension id (from `extensions:list` `themeColors`).
   *  Used as the true fallback for `.themeColor` controls so Reset shows the
   *  manifest value instead of the hand-kept `configuration[].default` copy. */
  private _manifestThemeColors = new Map<string, string>();

  private _debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  connectedCallback() {
    super.connectedCallback();
    this._loadSettings();
    overlayCoordinator.showOverlay('settings');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    for (const timer of this._debounceTimers.values()) {
      clearTimeout(timer);
    }
    this._debounceTimers.clear();
    overlayCoordinator.hideOverlay('settings');
  }

  private _getFilteredSections(): ExtensionSettings[] {
    if (!this._searchQuery.trim()) return this._sections;
    const q = this._searchQuery.toLowerCase();
    return this._sections
      .map(section => ({
        ...section,
        items: section.items.filter(item =>
          item.key.toLowerCase().includes(q) ||
          item.label.toLowerCase().includes(q) ||
          section.displayName.toLowerCase().includes(q)
        )
      }))
      .filter(section => section.items.length > 0);
  }

  private async _loadSettings() {
    this._loading = true;
    this._error = null;
    this._errors.clear();
    try {
      const list = await window.financeShell?.extensions.list();
      const configs = list?.configuration ?? [];
      const grouped = new Map<string, ExtensionSettings>();
      const keys: string[] = [];
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
      this._manifestThemeColors = new Map(
        Object.entries(list?.themeColors ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string'),
      );
      this._sections = [CORE_SETTINGS, ...Array.from(grouped.values())];
      await this._loadValues([
        ...CORE_SETTINGS.items.map((item) => item.key),
        ...keys,
      ]);
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load settings';
    } finally {
      this._loading = false;
    }
  }

  private async _loadValues(keys: string[]): Promise<void> {
    const results = await Promise.all(
      keys.map(async (key) => {
        try {
          const value = await window.financeShell?.settings?.get?.(key);
          return [key, value] as const;
        } catch {
          return [key, undefined] as const;
        }
      }),
    );
    this._values = new Map(results);
  }

  private _currentValue(key: string): unknown {
    return this._values.get(key) ?? undefined;
  }

  private async _commit(key: string, value: unknown) {
    const existing = this._debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this._debounceTimers.delete(key);
    try {
      window.financeShell?.settings?.set(key, value);
      if (key === 'core.theme') {
        if (value === 'light') document.body.classList.add('light-theme');
        else document.body.classList.remove('light-theme');
      }
    } catch (err) {
        rendererLogger.error(`failed to set ${key}`, 'settings', err as Error);
      }
    }, 300);
    this._debounceTimers.set(key, timer);
    this._values.set(key, value);
    this.requestUpdate();
  }

  private _toggleSection(section: ExtensionSettings) {
    const el = this.renderRoot.querySelector(`[data-section="${section.extensionId}"]`) as HTMLElement | null;
    el?.classList.toggle('collapsed');
  }

  private _formatValue(item: { key: string; format?: (raw: string) => string; default?: unknown }, value: unknown): string {
    const raw = value !== undefined ? String(value) : String(item.default ?? '');
    return item.format ? item.format(raw) : raw;
  }

  private _validateFormatted(item: { key: string; pattern?: RegExp; formatHint?: string }, formatted: string): string | null {
    if (!item.pattern) return null;
    return item.pattern.test(formatted) ? null : `Value must match format ${item.formatHint ?? String(item.pattern)}`;
  }

  private _setError(key: string, message: string): void {
    this._errors.set(key, message);
    this.requestUpdate();
  }

  private _clearError(key: string): void {
    if (this._errors.delete(key)) {
      this.requestUpdate();
    }
  }

  private _renderControl(item: { key: string; type: string; label: string; default?: unknown; enumOptions?: string[]; format?: (raw: string) => string; pattern?: RegExp | string; formatHint?: string; placeholder?: string }, extensionId?: string) {
    const value = this._currentValue(item.key);
    const isFormatted = Boolean(item.format || item.pattern || item.formatHint);
    const placeholder = isFormatted && item.formatHint ? this._defaultPlaceholder(item) : '';
    const error = this._errors.get(item.key) ?? null;
    const fieldId = `input-${item.key}`;
    const helperId = `helper-${item.key}`;
    const errorId = `error-${item.key}`;
    const helperText = isFormatted && item.formatHint ? `Format: ${item.formatHint}` : '';

    if (item.key.endsWith('.themeColor') || item.formatHint === '#RRGGBB') {
      // Prefer the live manifest color over the hand-kept config default copy.
      const manifestColor = extensionId ? this._manifestThemeColors.get(extensionId) : undefined;
      const raw = value !== undefined && value !== '' ? String(value) : String(manifestColor ?? item.default ?? '#6366F1');
      const fallback = String(manifestColor ?? item.default ?? '#6366F1');
      const pickerValue = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw : fallback;
      return html`
        <div class="color-row">
          <input
            type="color"
            .value=${pickerValue}
            aria-label="Pick color for ${item.key}"
            @input=${(e: Event) => {
              const color = (e.target as HTMLInputElement).value;
              const text = this.renderRoot.querySelector(`#${fieldId}`) as HTMLInputElement | null;
              if (text) text.value = color;
              this._clearError(item.key);
              this._commit(item.key, color);
            }}
          />
          <input
            id="${fieldId}"
            data-testid="${fieldId}"
            type="text"
            .value=${raw || fallback}
            placeholder="#RRGGBB"
            aria-invalid=${error !== null ? 'true' : undefined}
            class=${error !== null ? 'invalid' : ''}
            @input=${() => this._clearError(item.key)}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              const color = target.value.trim();
              if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
                this._setError(item.key, 'Value must match format #RRGGBB');
                return;
              }
              const picker = this.renderRoot.querySelector(`input[type="color"][aria-label="Pick color for ${item.key}"]`) as HTMLInputElement | null;
              if (picker) picker.value = color;
              this._clearError(item.key);
              this._commit(item.key, color);
            }}
          />
          <button
            class="action-btn"
            type="button"
            title="Reset to manifest default"
            @click=${() => {
              this._clearError(item.key);
              this._commit(item.key, '');
            }}
          >Reset</button>
        </div>
        ${helperText ? html`<div class="setting-helper" id="${helperId}">${helperText}</div>` : ''}
        ${error ? html`<div class="setting-helper setting-error invalid" id="${errorId}" role="alert">${error}</div>` : ''}
      `;
    }

    if (item.type === 'boolean') {
      return html`
        <div class="toggle-row">
          <input
            type="checkbox"
            .checked=${value !== undefined ? Boolean(value) : Boolean(item.default)}
            @change=${(e: Event) => this._commit(item.key, (e.target as HTMLInputElement).checked)}
          />
        </div>
      `;
    }

    if (item.type === 'enum') {
      const options = item.enumOptions ?? [];
      const current = value !== undefined ? String(value) : String(item.default ?? '');
      return html`
        <select
          .value=${current}
          @change=${(e: Event) => this._commit(item.key, (e.target as HTMLSelectElement).value)}
        >
          ${options.map(opt => html`<option value="${opt}" ?selected=${opt === current}>${opt}</option>`)}
        </select>
      `;
    }

    if (item.type === 'number') {
      return html`
        <input
          id="${fieldId}"
          data-testid="${fieldId}"
          type="number"
          placeholder="${placeholder}"
          .value=${value !== undefined ? String(value) : String(item.default ?? '')}
          aria-invalid=${error !== null ? 'true' : undefined}
          aria-describedby=${isFormatted ? (error ? `${helperId} ${errorId}` : helperId) : null}
          class=${error !== null ? 'invalid' : ''}
          @input=${() => {
            this._clearError(item.key);
          }}
          @change=${(e: Event) => {
            const raw = (e.target as HTMLInputElement).value;
            const num = raw === '' ? NaN : Number(raw);
            this._commit(item.key, Number.isNaN(num) ? raw : num);
          }}
        />
        ${isFormatted && helperText ? html`<div class="setting-helper" data-testid="${helperId}" id="${helperId}">${helperText}</div>` : ''}
      `;
    }

    if (item.type === 'object') {
      const current = value !== undefined ? JSON.stringify(value, null, 2) : JSON.stringify(item.default ?? null, null, 2);
      return html`
        <textarea
          .value=${current}
          @change=${(e: Event) => {
            const raw = (e.target as HTMLTextAreaElement).value;
            try {
              this._commit(item.key, JSON.parse(raw));
            } catch {
              rendererLogger.warn(`invalid JSON for ${item.key}`, 'settings');
            }
          }}
        ></textarea>
      `;
    }

    return html`
      <input
        id="${fieldId}"
        data-testid="${fieldId}"
        type="text"
        placeholder="${placeholder}"
        .value=${this._formatValue(item, value)}
        aria-invalid=${error !== null ? 'true' : undefined}
        aria-describedby=${isFormatted ? (error ? `${helperId} ${errorId}` : helperId) : null}
        class=${error !== null ? 'invalid' : ''}
        @input=${() => {
          this._clearError(item.key);
        }}
        @change=${(e: Event) => {
          const target = e.target as HTMLInputElement;
          const raw = target.value;
          const formatted = item.format ? item.format(raw) : raw;
          target.value = formatted;
          const pattern = typeof item.pattern === 'string' ? new RegExp(item.pattern) : item.pattern;
          if (pattern) {
            const err = this._validateFormatted({ ...item, pattern }, formatted);
            if (err) {
              this._setError(item.key, err);
              return;
            }
          }
          this._clearError(item.key);
          this._commit(item.key, formatted);
        }}
      />
      ${isFormatted && helperText ? html`<div class="setting-helper" data-testid="${helperId}" id="${helperId}">${helperText}</div>` : ''}
      ${error ? html`<div class="setting-helper setting-error invalid" data-testid="${errorId}" id="${errorId}" role="alert">${error}</div>` : ''}
    `;
  }

  private _defaultPlaceholder(item: { formatHint?: string; placeholder?: string }): string {
    if (item.placeholder) return item.placeholder;
    if (item.formatHint === 'YYYY-YYYY') return '2025-2026';
    if (item.formatHint === 'MM-DD') return '07-01';
    return '';
  }

  render() {
    if (this._loading) {
      return html`
        <div class="settings-header">
          <h1>App Preferences</h1>
          <p class="subtitle">Loading...</p>
        </div>
      `;
    }
    if (this._error) {
      return html`
        <div class="settings-header">
          <h1>App Preferences</h1>
          <p class="subtitle error">${this._error}</p>
        </div>
      `;
    }

    const filtered = this._getFilteredSections();

    if (filtered.length === 0 && this._searchQuery) {
      return html`
        <div class="settings-header">
          <h1>App Preferences</h1>
          <p class="subtitle">Configure Dashboard, Salary History, and Core preferences</p>
        </div>
        <div class="search-bar">
          <span class="search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search preferences..."
            .value=${this._searchQuery}
            @input=${(e: Event) => { this._searchQuery = (e.target as HTMLInputElement).value; }}
          />
        </div>
        <div class="empty-state">
          <h3>No results found</h3>
          <p>Try adjusting your search query</p>
        </div>
      `;
    }

    return html`
      <div class="settings-header">
        <h1>App Preferences</h1>
        <p class="subtitle">Configure Dashboard, Salary History, and Core preferences</p>
      </div>
      <div class="search-bar">
        <span class="search-icon">⌕</span>
        <input
          type="text"
          placeholder="Search preferences..."
          .value=${this._searchQuery}
          @input=${(e: Event) => { this._searchQuery = (e.target as HTMLInputElement).value; }}
        />
      </div>
      <div class="settings-body">
        ${filtered.map(section => html`
        <div class="settings-section" data-section="${section.extensionId}">
          <div class="settings-section-header" @click=${() => this._toggleSection(section)}>
            <span>${section.displayName}</span>
            <span class="badge"></span>
          </div>
          <div class="settings-section-body">
            ${section.items.map(item => html`
              <div class="setting-row">
                <div class="setting-info">
                  <div class="setting-key">${item.key}</div>
                  ${item.label ? html`<div class="setting-desc">${item.label}</div>` : ''}
                  ${item.default !== undefined || (item.key.endsWith('.themeColor') && this._manifestThemeColors.get(section.extensionId) !== undefined) ? html`<div class="setting-default">Default: <code>${JSON.stringify(item.key.endsWith('.themeColor') && this._manifestThemeColors.get(section.extensionId) !== undefined ? this._manifestThemeColors.get(section.extensionId) : item.default)}</code></div>` : ''}
                </div>
                <div class="setting-control">
                  ${this._renderControl(item, section.extensionId)}
                </div>
              </div>
            `)}
          </div>
        </div>
      `)}
      </div>
    `;
  }
}
