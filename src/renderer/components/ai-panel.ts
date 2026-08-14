import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('ai-panel')
export class AIPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 10px;
    }

    .ai-header {
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .ai-content {
      flex: 1;
      min-height: 0;
      color: var(--text-secondary);
      font-size: 14px;
    }
  `;

  render() {
    return html`
      <div class="ai-header">AI Assistant</div>
      <div class="ai-content">Chat panel placeholder</div>
    `;
  }
}
