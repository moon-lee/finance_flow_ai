import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface PaneSlot {
  panelId: string;
  label: string;
}

@customElement('split-pane')
export class SplitPane extends LitElement {
  static styles = css`
    :host {
      display: flex;
      min-width: 0;
      min-height: 0;
      flex: 1;
    }

    :host([direction='horizontal']) {
      flex-direction: row;
    }

    :host([direction='vertical']) {
      flex-direction: column;
    }

    .pane {
      flex: 1;
      min-width: 0;
      min-height: 0;
      position: relative;
      overflow: hidden;
    }

    .pane:last-child {
      flex: 1;
    }

    .splitter {
      background: var(--splitter-bg);
      z-index: 10;
    }

    :host([direction='horizontal']) .splitter {
      width: 4px;
      cursor: col-resize;
    }

    :host([direction='vertical']) .splitter {
      height: 4px;
      cursor: row-resize;
    }

    .splitter:hover,
    .splitter.dragging {
      background: var(--accent);
    }
  `;

  @property({ type: String })
  direction: 'horizontal' | 'vertical' = 'horizontal';

  @property({ type: Array })
  leftTabs: PaneSlot[] = [];

  @property({ type: String })
  leftActivePanelId = '';

  @property({ type: Array })
  rightTabs: PaneSlot[] = [];

  @property({ type: String })
  rightActivePanelId = '';

  private _dragging = false;
  private _startPos = 0;
  private _startSize = 0;

  private _getSize(element: HTMLElement): number {
    return this.direction === 'horizontal' ? element.offsetWidth : element.offsetHeight;
  }

  private _setSize(element: HTMLElement, size: number) {
    if (this.direction === 'horizontal') {
      element.style.width = `${size}px`;
    } else {
      element.style.height = `${size}px`;
    }
  }

  private _onSplitterMouseDown(event: MouseEvent) {
    this._dragging = true;
    this._startPos = this.direction === 'horizontal' ? event.clientX : event.clientY;
    const leftPane = this.renderRoot.querySelector('.pane:first-child') as HTMLElement;
    this._startSize = leftPane ? this._getSize(leftPane) : 0;
    const splitter = this.renderRoot.querySelector('.splitter') as HTMLElement;
    splitter?.classList.add('dragging');
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
    event.preventDefault();
  }

  private _onMouseMove = (event: MouseEvent) => {
    if (!this._dragging) return;
    const pos = this.direction === 'horizontal' ? event.clientX : event.clientY;
    const delta = pos - this._startPos;
    const leftPane = this.renderRoot.querySelector('.pane:first-child') as HTMLElement;
    const hostSize = this._getSize(this.renderRoot as HTMLElement);
    if (!leftPane) return;
    const newSize = Math.max(100, Math.min(this._startSize + delta, hostSize - 100));
    this._setSize(leftPane, newSize);
    this.dispatchEvent(new CustomEvent('splitter-drag', { detail: { bounds: this._getPaneBounds() }, bubbles: true, composed: true }));
  };

  private _onMouseUp = () => {
    this._dragging = false;
    const splitter = this.renderRoot.querySelector('.splitter') as HTMLElement;
    splitter?.classList.remove('dragging');
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
  };

  private _getPaneBounds() {
    const leftPane = this.renderRoot.querySelector('.pane:first-child') as HTMLElement | null;
    const rightPane = this.renderRoot.querySelector('.pane:last-child') as HTMLElement | null;
    if (!leftPane || !rightPane) return null;
    const hostRect = (this.renderRoot as HTMLElement).getBoundingClientRect();
    const leftRect = leftPane.getBoundingClientRect();
    const rightRect = rightPane.getBoundingClientRect();
    return {
      left: { x: leftRect.left - hostRect.left, y: leftRect.top - hostRect.top, width: leftRect.width, height: leftRect.height },
      right: { x: rightRect.left - hostRect.left, y: rightRect.top - hostRect.top, width: rightRect.width, height: rightRect.height }
    };
  }

  render() {
    return html`
      <div class="pane">
        <slot name="left"></slot>
      </div>
      <div class="splitter" @mousedown="${this._onSplitterMouseDown}"></div>
      <div class="pane">
        <slot name="right"></slot>
      </div>
    `;
  }
}
