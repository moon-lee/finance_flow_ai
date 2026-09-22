import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { mixWithWhite } from '../../shared/theme-color';

export interface ActivityView {
  id: string;
  name: string;
  icon: string;
  iconUrl?: string;
  color?: string;
}

/** Order extension views by a saved id list. Unknown saved ids are dropped; views missing from the list append at the end in registry order. Non-array input returns views unchanged. */
export function sortActivityViews<T extends { id: string }>(views: T[], order: unknown): T[] {
  if (!Array.isArray(order)) return views.slice();
  const rank = new Map((order as unknown[]).filter((id): id is string => typeof id === 'string').map((id, i) => [id, i]));
  return views.slice().sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}

@customElement('activity-bar')
export class ActivityBar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
    }

    button {
      position: relative;
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      font: inherit;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    button:hover,
    button.active {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary);
    }

    button:hover {
      transform: scale(1.05);
    }

    button.active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 6px;
      bottom: 6px;
      width: 3px;
      background: var(--active-indicator, var(--accent));
      border-radius: 0 4px 4px 0;
      box-shadow: 0 0 8px var(--active-indicator, var(--accent));
    }

    .settings {
      margin-top: auto;
    }

    .activity-icon {
      width: 28px;
      height: 28px;
      display: block;
      object-fit: contain;
      pointer-events: none;
    }

    button.drop-before {
      box-shadow: inset 0 2px 0 var(--accent);
    }

    button.drop-after {
      box-shadow: inset 0 -2px 0 var(--accent);
    }

    .empty-hint {

    .empty-hint {
      color: var(--text-secondary);
      font-size: var(--ff-font-xs);
      margin-top: 8px;
      writing-mode: vertical-rl;
      text-orientation: mixed;
    }
  `;

  @property({ type: Array })
  views: ActivityView[] = [];

  @property({ type: String })
  activeView: string = '';

  @state()
  private _dragFrom: string | null = null;

  @state()
  private _dropKey: string | null = null;

  private _selectView(viewId: string) {
    this.activeView = viewId;
    this.dispatchEvent(new CustomEvent('view-changed', {
      detail: { view: viewId, source: 'extension' },
      bubbles: true,
      composed: true
    }));
    this.requestUpdate();
  }

  private _onDragStart(e: DragEvent, viewId: string) {
    this._dragFrom = viewId;
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', viewId);
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  private _onDragOver(e: DragEvent, viewId: string) {
    e.preventDefault();
    if (!this._dragFrom || this._dragFrom === viewId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    this._dropKey = `${after ? 'after' : 'before'}:${viewId}`;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  private _onDragLeave(e: DragEvent) {
    const to = (e as DragEvent & { relatedTarget?: Node | null }).relatedTarget;
    if (to && (e.currentTarget as HTMLElement).contains(to as Node)) return;
    this._dropKey = null;
  }

  private _onDrop(e: DragEvent, viewId: string) {
    e.preventDefault();
    const from = this._dragFrom ?? e.dataTransfer?.getData('text/plain') ?? '';
    this._dragFrom = null;
    this._dropKey = null;
    if (!from || from === viewId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    this.dispatchEvent(new CustomEvent('activity-reorder', { detail: { fromViewId: from, toViewId: viewId, after }, bubbles: true, composed: true }));
  }

  private _onDragEnd() {
    this._dragFrom = null;
    this._dropKey = null;
  }

  private _onButtonKeyDown(e: KeyboardEvent, viewId: string) {
    if (!e.ctrlKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    this.dispatchEvent(new CustomEvent('activity-move', { detail: { viewId, dir: e.key === 'ArrowDown' ? 1 : -1 }, bubbles: true, composed: true }));
  }

  render() {
    const buttons = this.views.map((view) => html`
      <button
        class="${this.activeView === view.id ? 'active' : ''} ${this._dropKey === `before:${view.id}` ? 'drop-before' : ''} ${this._dropKey === `after:${view.id}` ? 'drop-after' : ''}"
        title="${view.name}"
        aria-label="${view.name}"
        data-view-id="${view.id}"
        draggable="true"
        style="${this.activeView === view.id ? `background: rgba(255, 255, 255, 0.35);${view.color ? ` --active-indicator: ${mixWithWhite(view.color, 0.35)};` : ''}` : ''}"
        @click="${(e: MouseEvent) => { if (e.isTrusted) this._selectView(view.id); }}"
        @keydown="${(e: KeyboardEvent) => this._onButtonKeyDown(e, view.id)}"
        @dragstart="${(e: DragEvent) => this._onDragStart(e, view.id)}"
        @dragover="${(e: DragEvent) => this._onDragOver(e, view.id)}"
        @dragleave="${(e: DragEvent) => this._onDragLeave(e)}"
        @drop="${(e: DragEvent) => this._onDrop(e, view.id)}"
        @dragend="${() => this._onDragEnd()}"
      >${view.iconUrl
        ? html`<img class="activity-icon" data-view-id="${view.id}" src="${view.iconUrl}" alt="" aria-hidden="true" />`
        : view.icon}</button>
    `);
    return html`
      ${buttons}
      ${this.views.length === 0 ? html`<div class="empty-hint">No extensions</div>` : ''}
      <button
        class="settings ${this.activeView === '__settings__' ? 'active' : ''}"
        title="Settings"
        aria-label="Settings"
        @click="${(e: MouseEvent) => { if (e.isTrusted) this._selectView('__settings__'); }}"
      ><img
        class="activity-icon"
        src="./icons/settings.svg"
        alt=""
        aria-hidden="true"
      /></button>
    `;
  }
}
