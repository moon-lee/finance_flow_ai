import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { baseViewStyles } from '../styles/base-view-styles';

export interface ToastPayload {
  type: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  duration?: number;
}

interface Toast extends ToastPayload {
  id: number;
  timestamp: number;
}

const DEFAULT_DURATION = 4000;
const MAX_TOASTS = 8;

@customElement('toast-container')
export class ToastContainer extends LitElement {
  static styles = css`
    ${baseViewStyles}

    :host {
      position: fixed;
      bottom: 44px;
      left: 4px;
      width: calc(var(--activity-bar-width) + var(--navigation-width) - 8px);
      max-width: calc(var(--activity-bar-width) + var(--navigation-width) - 8px);
      z-index: 9999;
      pointer-events: none;
      padding: 0;
      overflow: hidden;
      background: transparent;
      height: auto;
    }

    .toast-list {
      display: flex;
      flex-direction: column-reverse;
      gap: 8px;
      max-height: 50vh;
      overflow-y: auto;
      pointer-events: auto;
    }

    .toast-card {
      background: var(--workspace-bg);
      border: 1px solid var(--input-border);
      border-radius: 6px;
      padding: 12px 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      gap: 4px;
      animation: toast-in 0.2s ease-out;
    }

    .toast-card.error {
      border-left: 3px solid var(--status-error-bg);
    }

    .toast-card.warning {
      border-left: 3px solid var(--status-warn-bg);
    }

    .toast-card.info {
      border-left: 3px solid var(--status-info-bg);
    }

    @keyframes toast-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .toast-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .toast-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .toast-dismiss {
      background: transparent;
      border: none;
      color: var(--text-tertiary);
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      padding: 0 2px;
    }

    .toast-dismiss:hover {
      color: var(--text-primary);
    }

    .toast-message {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    .toast-time {
      font-size: 11px;
      color: var(--text-tertiary);
      margin-top: 2px;
    }
  `;

  @state()
  private _toasts: Toast[] = [];

  @state()
  private _nextId = 1;

  @state()
  private _dismissedToasts: Array<{ type: 'info' | 'warning' | 'error'; title: string; message: string; dismissedAt: number }> = [];

  private _timers = new Map<number, ReturnType<typeof setTimeout>>();
  private _unsubscribers: (() => void)[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    this._subscribeToTopics();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const timer of this._timers.values()) {
      clearTimeout(timer);
    }
    this._timers.clear();
    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers = [];
  }

  private _subscribeToTopics(): void {
    const topics = ['panel.lazy-unmount', 'panel.auto-save-failed', 'extension.host-status', 'settings.changed'];
    for (const topic of topics) {
      const unsub = window.financeShell?.events?.on(topic, (payload) => {
        this._handleEvent(topic, payload);
      });
      if (unsub) this._unsubscribers.push(unsub);
    }
  }

  showToast(toast: ToastPayload): void {
    const id = this._nextId++;
    const entry: Toast = { ...toast, id, timestamp: Date.now() };
    this._toasts = [...this._toasts, entry];
    if (this._toasts.length > MAX_TOASTS) {
      this._toasts = this._toasts.slice(this._toasts.length - MAX_TOASTS);
    }
    const duration = toast.duration ?? DEFAULT_DURATION;
    if (duration !== undefined) {
      const timer = setTimeout(() => this._dismiss(id), duration);
      this._timers.set(id, timer);
    }
  }

  private _handleEvent(topic: string, payload: unknown): void {
    if (topic === 'panel.lazy-unmount') {
      const data = payload as { panelId: string; viewId: string };
      this.showToast({
        type: 'info',
        title: 'Panel asleep',
        message: `${data.viewId} was unmounted to save memory. Click the tab to restore it.`,
        duration: 5000,
      });
    } else if (topic === 'panel.auto-save-failed') {
      const data = payload as { panelId: string; viewId: string; dirty?: boolean };
      if (!data.dirty) return;
      this.showToast({
        type: 'error',
        title: 'Auto-save timed out',
        message: `Panel "${data.viewId}" did not confirm its save in time. If you have unsaved changes, they might not have been persisted.`,
        duration: 5000,
      });
    } else if (topic === 'extension.host-status') {
      const data = payload as { status: string };
      if (data.status === 'crashed' || data.status === 'restart-failed') {
        this.showToast({
          type: 'error',
          title: 'Extension Host error',
          message: `The extension host ${data.status}. Some features may be unavailable.`,
          duration: 5000,
        });
      }
    } else if (topic === 'settings.changed') {
      const data = payload as { key?: string };
      this.showToast({
        type: 'info',
        title: 'Settings saved',
        message: data.key ? `Setting "${data.key}" updated.` : 'Settings updated.',
        duration: 3000,
      });
    }
  }

  private _notifyErrorStatus(): void {
    const last = this._dismissedToasts[0];
    const count = this._dismissedToasts.length;
    this.dispatchEvent(new CustomEvent('error-status-changed', {
      detail: {
        count,
        type: last?.type ?? null,
        message: last ? (last.type === 'error' ? last.message : last.title) : null,
      },
      bubbles: true,
      composed: true,
    }));
  }

  private _dismiss(id: number): void {
    const toast = this._toasts.find((t) => t.id === id);
    this._toasts = this._toasts.filter((t) => t.id !== id);
    const timer = this._timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this._timers.delete(id);
    }
    if (toast) {
      this._dismissedToasts = [
        { type: toast.type, title: toast.title, message: toast.message, dismissedAt: Date.now() },
        ...this._dismissedToasts,
      ];
      this._notifyErrorStatus();
    }
  }

  private _formatTime(timestamp: number): string {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  render() {
    return html`
      <div class="toast-list">
        ${this._toasts.map((toast) => html`
          <div class="toast-card ${toast.type}">
            <div class="toast-header">
              <span class="toast-title">${toast.title}</span>
              <button class="toast-dismiss" @click="${() => this._dismiss(toast.id)}">×</button>
            </div>
            <div class="toast-message">${toast.message}</div>
            <div class="toast-time">${this._formatTime(toast.timestamp)}</div>
          </div>
        `)}
      </div>
    `;
  }

  clearErrorStatus(): void {
    this._dismissedToasts = [];
    this._notifyErrorStatus();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'toast-container': ToastContainer;
  }
}
