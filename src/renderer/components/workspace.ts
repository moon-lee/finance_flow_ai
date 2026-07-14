import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('workspace-panel')
export class WorkspacePanel extends LitElement {
  static styles = css`
    :host {
      display: grid;
      grid-template-rows: 36px minmax(0, 1fr);
      min-width: 0;
      min-height: 0;
      height: 100%;
    }

    .tabs {
      display: flex;
      min-width: 0;
      border-bottom: 1px solid #3c3c3c;
      background: #252526;
    }

    .tab {
      display: flex;
      align-items: center;
      min-width: 140px;
      max-width: 220px;
      padding: 0 12px;
      border-right: 1px solid #3c3c3c;
      background: #1e1e1e;
      color: #ffffff;
      font-size: 13px;
    }

    .content {
      display: grid;
      place-items: center;
      min-height: 0;
      padding: 24px;
    }

    .empty-state {
      color: #9a9a9a;
      font-size: 14px;
    }
  `;

  render() {
    return html`
      <div class="tabs" role="tablist">
        <div class="tab" role="tab" aria-selected="true">Dashboard</div>
      </div>
      <main class="content">
        <slot>
          <div class="empty-state">Select a view from the Activity Bar</div>
        </slot>
      </main>
    `;
  }
}
