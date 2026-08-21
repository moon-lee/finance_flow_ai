/**
 * Phase 4 Task 11.6 — Reorder form-sections modal (Lit element).
 *
 * Lists the 8 form-section IDs with up/down arrows. The first row's
 * up arrow and the last row's down arrow are disabled; the first row
 * gets a green left border, the last a purple border. "Reset to
 * default" restores the canonical 8-section order. On save the new
 * order is emitted via a `section-order-change` CustomEvent (detail: the
 * `string[]` array — singular, so the settings layer encodes it to a
 * JSON string exactly once; see Review Finding 6). The mount harness
 * persists it via `finance.settings.set('salary-history.sectionOrder', ...)`.
 */

import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { CANONICAL_SECTION_ORDER } from './payslip-form.js';
import { sharedStyles } from '../styles/shared-styles.js';

const SECTION_LABELS: Record<string, string> = {
  period: 'Period',
  totals: 'Totals',
  earnings: 'Earnings',
  deductions: 'Deductions',
  super: 'Super',
  leave: 'Leave',
  'leave-accrual': 'Leave Accrual',
  notes: 'Notes',
};

@customElement('reorder-sections-modal')
export class ReorderSectionsModal extends LitElement {
  static styles = [
    sharedStyles,
    css`
      .modal {
        width: 320px;
      }
      h2 {
        margin: 0 0 12px;
        font-size: var(--ff-font-lg);
      }
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
      button {
        padding: 3px 9px;
      }
      button:disabled {
        opacity: 0.35;
        cursor: default;
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
  sectionOrder: string[] = [...CANONICAL_SECTION_ORDER];

  @state()
  private _order: string[] = [...this.sectionOrder];

  connectedCallback(): void {
    super.connectedCallback();
    this._order = [...this.sectionOrder];
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
      new CustomEvent('section-order-change', {
        detail: this._order,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onReset(): void {
    this._order = [...CANONICAL_SECTION_ORDER];
  }

  private _onCancel(): void {
    this.dispatchEvent(
      new CustomEvent('section-order-cancel', { bubbles: true, composed: true }),
    );
  }

  private _renderItem(id: string, index: number): unknown {
    const isFirst = index === 0;
    const isLast = index === this._order.length - 1;
    return html`
      <div
        class="item ${isFirst ? 'first' : ''} ${isLast ? 'last' : ''}"
        data-testid="section-item"
        data-id="${id}"
      >
        <span class="label" data-testid="section-label">${SECTION_LABELS[id] ?? id}</span>
        <button
          class="up"
          data-testid="up-${id}"
          ?disabled="${isFirst}"
          @click="${() => this._move(index, -1)}"
        >▲</button>
        <button
          class="down"
          data-testid="down-${id}"
          ?disabled="${isLast}"
          @click="${() => this._move(index, 1)}"
        >▼</button>
      </div>
    `;
  }

  render(): unknown {
    return html`
      <div class="backdrop" data-testid="reorder-backdrop">
        <div class="modal" role="dialog" aria-label="Reorder sections" data-testid="reorder-modal">
          <h2 data-testid="reorder-title">Reorder Sections</h2>
          ${this._order.map((id, i) => this._renderItem(id, i))}
          <div class="modal-actions">
            <button
              class="ghost"
              data-testid="cancel"
              @click="${this._onCancel}"
            >Cancel</button>
            <button
              class="ghost"
              data-testid="reset"
              @click="${this._onReset}"
            >Reset to default</button>
            <button
              class="primary"
              data-testid="save"
              @click="${this._onSave}"
            >Save</button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'reorder-sections-modal': ReorderSectionsModal;
  }
}
