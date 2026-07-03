import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

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
      cursor: default;
      font-size: 13px;
    }

    .nav-item:hover {
      background: rgba(255, 255, 255, 0.08);
    }
  `;

  private _currentView = 'Dashboard';

  /**
   * [Fix] Map extension view `id` (what the activity-bar dispatches in
   * `view-changed.detail.view`) to the view's display `name` (what this
   * component's hardcoded render branches check against). Without this,
   * clicking the `P` button sets `_currentView` to `'salary-history'`
   * which doesn't match any of the `=== 'Salary'` / `=== 'Budget'` /
   * `=== 'Tax'` branches and falls through to the generic
   * "App Preferences / Manage Extensions" section. The proper fix is
   * the data-driven NavigationProvider pattern deferred to Phase 5
   * (Self-Review §7); this mapping is the minimum change to make
   * Phase 3 Test Unit 3's "Navigation Panel updates to reflect the
   * active view" expectation pass.
   */
  private static readonly _VIEW_CONTEXT_MAP: Record<string, string> = {
    'salary-history': 'Salary',
    '__settings__': 'Settings',
  };

  setView(view: string) {
    this._currentView = NavigationPanel._VIEW_CONTEXT_MAP[view] ?? view;
    this.requestUpdate();
  }

  render() {
    return html`
      <h2>Explorer</h2>
      <div class="nav-section">
        <div class="nav-title">${this._currentView}</div>
        ${this._currentView === 'Dashboard' ? html`
          <div class="nav-item">Net Worth</div>
          <div class="nav-item">Monthly Overview</div>
        ` : this._currentView === 'Salary' ? html`
          <div class="nav-item">Pay History</div>
          <div class="nav-item">Deductions</div>
        ` : this._currentView === 'Budget' ? html`
          <div class="nav-item">Monthly Targets</div>
          <div class="nav-item">Spending Envelopes</div>
        ` : this._currentView === 'Tax' ? html`
          <div class="nav-item">Tax Workbook</div>
          <div class="nav-item">Deductions Ledger</div>
        ` : html`
          <div class="nav-item">App Preferences</div>
          <div class="nav-item">Manage Extensions</div>
        `}
      </div>
      <div class="nav-section">
        <div class="nav-title">Recent</div>
        <div class="nav-item">No recent items</div>
      </div>
    `;
  }
}
