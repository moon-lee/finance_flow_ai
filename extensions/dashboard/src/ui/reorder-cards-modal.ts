/**
 * Phase 7 Task 3 — Reorder dashboard cards modal (Lit element).
 *
 * Lists the 4 dashboard card IDs with up/down arrows. The first row's
 * up arrow and the last row's down arrow are disabled; the first row
 * gets a green left border, the last a purple border. "Reset to
 * default" restores the canonical 4-card order. On save the new
 * order is emitted via a `card-order-change` CustomEvent (detail: the
 * `string[]` array). The orchestrator persists it via
 * `finance.settings.set('dashboard.cardOrder', JSON.stringify(order))`.
 */

import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { CANONICAL_CARD_ORDER, type CardId } from '../orchestrator.js';
import { sharedStyles } from '../styles/shared-styles.js';

const CARD_LABELS: Record<string, string> = {
  'net-worth': 'Net Worth',
  'ytd-salary': 'Year-to-Date Salary',
  'last-payslip': 'Last Payslip',
  'accounts-summary': 'Accounts Summary',
  'pay-summary': 'Pay Summary',
  'todo-summary': 'Todo Summary',
};

@customElement('reorder-cards-modal')
export class ReorderCardsModal extends LitElement {
  static styles = [
    sharedStyles,
    css`
      .item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 6px 10px;
        border: 1px solid var(--ff-bg-input, #3c3c3c);
        border-left: 4px solid var(--ff-bg-input, #3c3c3c);
        border-radius: 4px;
        margin-bottom: 6px;
      }
      .item.first {
        border-left-color: var(--ff-teal, #4ec9b0);
      }
      .item.last {
        border-left-color: #c586c0;
      }
      .item .label {
        flex: 1;
      }
      .up {
        background: var(--ff-accent, #007acc);
        color: var(--ff-text-strong, #fff);
      }
      .down {
        background: var(--ff-accent-hover, #6da3d6);
        color: var(--ff-text-strong, #fff);
      }
    `,
  ];

  @property({ type: Array })
  cardOrder: CardId[] = [...CANONICAL_CARD_ORDER];

  @state()
  private _order: CardId[] = [...this.cardOrder];

  connectedCallback(): void {
    super.connectedCallback();
    this._order = [...this.cardOrder];
  }

  private _move(index: number, dir: -1 | 1): void {
    const target = index + dir;
    if (target < 0 || target >= this._order.length) return;
    const next = this._order.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    this._order = next;
  }

  private _onSave(): void {
    this.dispatchEvent(
      new CustomEvent('card-order-change', {
        detail: this._order,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onReset(): void {
    this._order = [...CANONICAL_CARD_ORDER];
  }

  private _onCancel(): void {
    this.dispatchEvent(
      new CustomEvent('card-order-cancel', { bubbles: true, composed: true }),
    );
  }

  private _renderItem(id: CardId, index: number): unknown {
    const isFirst = index === 0;
    const isLast = index === this._order.length - 1;
    return html`
      <div class="item ${isFirst ? 'first' : ''} ${isLast ? 'last' : ''}" data-testid="card-item" data-id="${id}">
        <span class="label" data-testid="card-label">${CARD_LABELS[id] ?? id}</span>
        <button class="up" data-testid="up-${id}" ?disabled="${isFirst}" @click="${() => this._move(index, -1)}">▲</button>
        <button class="down" data-testid="down-${id}" ?disabled="${isLast}" @click="${() => this._move(index, 1)}">▼</button>
      </div>
    `;
  }

  render(): unknown {
    return html`
      <div class="backdrop" data-testid="reorder-backdrop">
        <div class="modal" role="dialog" aria-label="Reorder cards" data-testid="reorder-modal">
          <h2 data-testid="reorder-title">Reorder Cards</h2>
          ${this._order.map((id, i) => this._renderItem(id, i))}
          <div class="actions">
            <button class="ghost" data-testid="cancel" @click="${this._onCancel}">Cancel</button>
            <button class="ghost" data-testid="reset" @click="${this._onReset}">Reset to default</button>
            <button class="primary" data-testid="save" @click="${this._onSave}">Save</button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'reorder-cards-modal': ReorderCardsModal;
  }
}
