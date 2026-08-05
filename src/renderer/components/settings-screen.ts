import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

interface ExtensionSettings {
  extensionId: string;
  displayName: string;
  items: Array<{
    key: string;
    type: string;
    label: string;
    default?: unknown;
    enumOptions?: string[];
  }>;
}

const CORE_SETTINGS: ExtensionSettings = {
  extensionId: 'core',
  displayName: 'Core',
  items: [
    { key: 'core.financialYear.current', type: 'enum', label: 'Current financial year context. Dashboard YTD, payslip filters, and reports use this value.', default: 'auto-detected', enumOptions: ['2026-2027', '2025-2026', '2024-2025'] },
    { key: 'core.financialYear.start', type: 'string', label: 'Month and day the financial year starts. Used to compute FY labels from dates.', default: '07-01' },
    { key: 'core.theme', type: 'enum', label: 'Application color theme.', default: 'dark', enumOptions: ['dark', 'light'] },
    { key: 'core.workspace.defaultView', type: 'string', label: 'Extension view to activate on startup. Requires the extension to declare onStartup.', default: 'dashboard' }
  ]
};

@customElement('settings-screen')
export class SettingsScreen extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1e1e1e;
      color: #d4d4d4;
      font-size: 14px;
      line-height: 1.5;
      padding: 24px;
      box-sizing: border-box;
    }

    .settings-body {
      flex: 1;
      min-width: 0;
      min-height: 0;
      overflow-y: auto;
    }

    .settings-header {
      margin-bottom: 24px;
    }

    .settings-header h1 {
      font-size: 20px;
      font-weight: 600;
      color: #ffffff;
      margin: 0 0 4px;
    }

    .settings-header .subtitle {
      color: #858585;
      font-size: 13px;
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
      border: 1px solid #3e3e3e;
      border-radius: 3px;
      background: #3c3c3c;
      color: #d4d4d4;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      box-sizing: border-box;
    }

    .search-bar input:focus {
      border-color: #007acc;
      outline: 1px solid #007acc;
    }

    .search-bar input::placeholder {
      color: #858585;
    }

    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: #858585;
      pointer-events: none;
      font-size: 14px;
    }

    .settings-section {
      background: #252526;
      border: 1px solid #3e3e3e;
      border-radius: 6px;
      margin-bottom: 16px;
      overflow: hidden;
    }

    .settings-section-header {
      padding: 12px 16px;
      background: #2d2d30;
      border-bottom: 1px solid #3e3e3e;
      font-size: 13px;
      font-weight: 600;
      color: #ffffff;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    }

    .settings-section-header:hover {
      background: #2a2a2a;
    }

    .badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 3px;
      background: #3c3c3c;
      color: #858585;
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
      padding: 10px 0;
      border-bottom: 1px solid #2a2a2a;
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
      font-size: 13px;
      color: #4ec9b0;
      margin-bottom: 2px;
    }

    .setting-desc {
      font-size: 12px;
      color: #858585;
    }

    .setting-default {
      font-size: 11px;
      color: #858585;
      margin-top: 4px;
    }

    .setting-default code {
      background: #1e1e1e;
      padding: 1px 4px;
      border-radius: 2px;
      font-size: 11px;
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
      background: #3c3c3c;
      border: 1px solid #3e3e3e;
      color: #d4d4d4;
      padding: 6px 10px;
      border-radius: 3px;
      font-family: inherit;
      font-size: 13px;
      box-sizing: border-box;
    }

    .setting-control input:focus,
    .setting-control select:focus,
    .setting-control textarea:focus {
      outline: 1px solid #007acc;
      border-color: #007acc;
    }

    .setting-control textarea {
      min-height: 80px;
      font-family: "SF Mono", Consolas, monospace;
      font-size: 12px;
      resize: vertical;
    }

    .setting-control input[type="checkbox"] {
      accent-color: #007acc;
      width: 16px;
      height: 16px;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .toggle-label {
      font-size: 12px;
      color: #858585;
    }

    .action-btn {
      background: #3c3c3c;
      color: #d4d4d4;
      border: 1px solid #3e3e3e;
      padding: 6px 12px;
      border-radius: 3px;
      font-size: 12px;
      cursor: pointer;
      font-family: inherit;
    }

    .action-btn:hover {
      border-color: #007acc;
    }

    .error {
      color: #f48771;
      font-size: 13px;
      margin-top: 8px;
    }

    .empty-state {
      text-align: center;
      padding: 80px 24px;
      color: #858585;
    }

    .empty-state h3 {
      font-size: 16px;
      font-weight: 500;
      color: #d4d4d4;
      margin: 0 0 8px;
    }

    .empty-state p {
      font-size: 13px;
      margin: 0;
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

  private _debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  connectedCallback() {
    super.connectedCallback();
    this._loadSettings();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    for (const timer of this._debounceTimers.values()) {
      clearTimeout(timer);
    }
    this._debounceTimers.clear();
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
    try {
      const list = await window.financeShell?.extensions.list();
      const configs = list?.configuration ?? [];
      const grouped = new Map<string, ExtensionSettings>();
      for (const item of configs) {
        const existing = grouped.get(item.extensionId);
        if (existing) {
          existing.items.push(item.configuration);
        } else {
          grouped.set(item.extensionId, {
            extensionId: item.extensionId,
            displayName: item.extensionId,
            items: [item.configuration],
          });
        }
      }
      this._sections = [CORE_SETTINGS, ...Array.from(grouped.values())];
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load settings';
    } finally {
      this._loading = false;
    }
  }

  private _currentValue(key: string): unknown {
    return window.financeShell?.settings?.get(key) ?? undefined;
  }

  private _commit(key: string, value: unknown) {
    const existing = this._debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this._debounceTimers.delete(key);
      try {
        window.financeShell?.settings?.set(key, value);
      } catch (err) {
        console.error(`[settings] failed to set ${key}:`, err);
      }
    }, 300);
    this._debounceTimers.set(key, timer);
  }

  private _toggleSection(section: ExtensionSettings) {
    const el = this.renderRoot.querySelector(`[data-section="${section.extensionId}"]`) as HTMLElement | null;
    el?.classList.toggle('collapsed');
  }

  private _renderControl(item: { key: string; type: string; label: string; default?: unknown; enumOptions?: string[] }) {
    const value = this._currentValue(item.key);

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
          type="number"
          .value=${value !== undefined ? String(value) : String(item.default ?? '')}
          @change=${(e: Event) => {
            const raw = (e.target as HTMLInputElement).value;
            const num = raw === '' ? NaN : Number(raw);
            this._commit(item.key, Number.isNaN(num) ? raw : num);
          }}
        />
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
              console.warn(`[settings] invalid JSON for ${item.key}`);
            }
          }}
        ></textarea>
      `;
    }

    return html`
      <input
        type="text"
        .value=${value !== undefined ? String(value) : String(item.default ?? '')}
        @change=${(e: Event) => this._commit(item.key, (e.target as HTMLInputElement).value)}
      />
    `;
  }

  render() {
    if (this._loading) {
      return html`
        <div class="settings-header">
          <h1>Settings</h1>
          <p class="subtitle">Loading...</p>
        </div>
      `;
    }
    if (this._error) {
      return html`
        <div class="settings-header">
          <h1>Settings</h1>
          <p class="subtitle error">${this._error}</p>
        </div>
      `;
    }

    const filtered = this._getFilteredSections();

    if (filtered.length === 0 && this._searchQuery) {
      return html`
        <div class="settings-header">
          <h1>Settings</h1>
          <p class="subtitle">Configure Dashboard, Salary History, and Core preferences</p>
        </div>
        <div class="search-bar">
          <span class="search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search settings..."
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
        <h1>Settings</h1>
        <p class="subtitle">Configure Dashboard, Salary History, and Core preferences</p>
      </div>
      <div class="search-bar">
        <span class="search-icon">⌕</span>
        <input
          type="text"
          placeholder="Search settings..."
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
                  ${item.default !== undefined ? html`<div class="setting-default">Default: <code>${JSON.stringify(item.default)}</code></div>` : ''}
                </div>
                <div class="setting-control">
                  ${this._renderControl(item)}
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
