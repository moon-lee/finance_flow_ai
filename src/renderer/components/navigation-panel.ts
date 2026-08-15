import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

export interface NavItem {
  extensionId: string;
  id: string;
  label: string;
  command: string;
  group?: string;
  icon?: string;
}

@customElement('navigation-panel')
export class NavigationPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 8px 0;
    }

    .nav-header {
      padding: 4px 16px 8px;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text-primary);
    }

    .nav-group-label {
      color: var(--text-tertiary);
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      padding: 12px 16px 4px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      color: var(--text-primary);
      cursor: pointer;
      font-size: 13px;
      border-left: 3px solid transparent;
      margin-bottom: 4px;
    }

    .nav-item:hover {
      background: var(--section-header-hover-bg);
    }

    .nav-item.active {
      background: var(--tab-bg);
      border-left-color: var(--accent);
      color: var(--text-primary);
    }

    .nav-icon {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--btn-secondary-bg);
      border-radius: 3px;
      font-size: 12px;
      font-weight: 700;
      color: var(--tab-icon-inactive-text);
      flex-shrink: 0;
    }

    .nav-item.active .nav-icon {
      background: var(--tab-icon-active-bg);
      color: var(--tab-active-text);
    }
  `;

  private _currentView = 'Dashboard';
  private _currentExtensionId = '';
  private _activeCommand = '';
  private _items: NavItem[] = [];

  setView(view: string, extensionId?: string) {
    this._currentView = view;
    this._currentExtensionId = extensionId ?? '';
    if (view === '__settings__' || view === '__accounts__' || view === '__shortcuts__') {
      this._activeCommand = view;
    }
    this.requestUpdate();
  }

  setNavigation(items: NavItem[]) {
    this._items = items;
    this.requestUpdate();
  }

  private _onNav(cmd: string) {
    if (!cmd) return;
    this._activeCommand = cmd;
    if (cmd === '__settings__') {
      this.dispatchEvent(new CustomEvent('view-changed', {
        detail: { view: '__settings__', source: 'core' },
        bubbles: true,
        composed: true,
      }));
      return;
    }
    if (cmd === '__accounts__') {
      this.dispatchEvent(new CustomEvent('view-changed', {
        detail: { view: '__accounts__', source: 'core' },
        bubbles: true,
        composed: true,
      }));
      return;
    }
    if (cmd === '__shortcuts__') {
      this.dispatchEvent(new CustomEvent('view-changed', {
        detail: { view: '__shortcuts__', source: 'core' },
        bubbles: true,
        composed: true,
      }));
      return;
    }
    this.dispatchEvent(new CustomEvent('command-selected', {
      detail: { command: cmd, extensionCommand: true },
      bubbles: true,
      composed: true,
    }));
  }

  private _isActive(item: { command: string }): boolean {
    if (!this._activeCommand) return false;
    if (!item.command.startsWith('__')) return false;
    return item.command === this._activeCommand;
  }

  private static readonly _coreItems: NavItem[] = [
    { extensionId: 'core', id: 'app-preferences', label: 'App Preferences', command: '__settings__', group: 'Settings' },
    { extensionId: 'core', id: 'accounts', label: 'Accounts', command: '__accounts__', group: 'Settings' },
    { extensionId: 'core', id: 'keyboard-shortcuts', label: 'Keyboard Shortcuts', command: '__shortcuts__', group: 'Settings' },
  ];

  private _groupedItems(): Map<string | undefined, NavItem[]> {
    const groups = new Map<string | undefined, NavItem[]>();
    for (const item of this._items) {
      const g = groups.get(item.group) ?? [];
      g.push(item);
      groups.set(item.group, g);
    }
    return groups;
  }

  private _getVisibleItems(): NavItem[] {
    if (this._currentView === '__settings__' || this._currentView === '__accounts__' || this._currentView === '__shortcuts__') {
      return [...NavigationPanel._coreItems];
    }
    if (this._currentExtensionId) {
      return this._items.filter(item => item.extensionId === this._currentExtensionId);
    }
    return this._items;
  }

  render() {
    const grouped = this._getVisibleItems().reduce<Map<string | undefined, NavItem[]>>((map, item) => {
      const g = map.get(item.group) ?? [];
      g.push(item);
      map.set(item.group, g);
      return map;
    }, new Map());
    const sections = Array.from(grouped.entries()).map(([group, items]) => {
      const title = group ?? 'General';
      const children = items.map(item => html`
        <div class="${'nav-item' + (this._isActive(item) ? ' active' : '')}" data-testid="nav-${item.id}" @click="${() => this._onNav(item.command)}">
          <span class="nav-icon">${item.label.split(' ')[1]?.charAt(0).toUpperCase() ?? item.label.charAt(0).toUpperCase()}</span>
          <span>${item.label}</span>
        </div>
      `);
      return html`
        <div class="nav-section">
          <div class="nav-group-label">${title}</div>
          ${children}
        </div>
      `;
    });

    return html`
      <div class="nav-header">Explorer</div>
      ${sections}
      <div class="nav-section">
        <div class="nav-group-label">Recent</div>
        <div class="nav-item">No recent items</div>
      </div>
    `;
  }
}

