import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

export interface NavItem {
  extensionId: string;
  id: string;
  label: string;
  command: string;
  group?: string;
}

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
      cursor: pointer;
      font-size: 13px;
    }

    .nav-item:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    .nav-item.active {
      background: rgba(0, 122, 204, 0.18);
      color: #fff;
    }
  `;

  private _currentView = 'Dashboard';
  private _currentExtensionId = '';
  private _items: NavItem[] = [];

  setView(view: string, extensionId?: string) {
    this._currentView = view;
    this._currentExtensionId = extensionId ?? '';
    this.requestUpdate();
  }

  setNavigation(items: NavItem[]) {
    this._items = items;
    this.requestUpdate();
  }

  private _onNav(cmd: string) {
    if (!cmd) return;
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
    this.dispatchEvent(new CustomEvent('command-selected', {
      detail: { command: cmd, extensionCommand: true },
      bubbles: true,
      composed: true,
    }));
  }

  private static readonly _coreItems: NavItem[] = [
    { extensionId: 'core', id: 'accounts', label: 'Accounts', command: '__accounts__', group: 'General' },
    { extensionId: 'core', id: 'settings', label: 'Settings', command: '__settings__', group: 'General' },
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
    if (this._currentView === '__settings__' || this._currentView === '__accounts__') {
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
        <div class="nav-item" data-testid="nav-${item.id}" @click="${() => this._onNav(item.command)}">${item.label}</div>
      `);
      return html`
        <div class="nav-section">
          <div class="nav-title">${title}</div>
          ${children}
        </div>
      `;
    });

    return html`
      <h2>Explorer</h2>
      ${sections}
      <div class="nav-section">
        <div class="nav-title">Recent</div>
        <div class="nav-item">No recent items</div>
      </div>
    `;
  }
}

