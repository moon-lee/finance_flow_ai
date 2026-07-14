/**
 * Phase 4 Task 14.6 — host element for an extension's mounted UI.
 *
 * Receives `extensionId` + `componentTag` (plus optional `mountData`) and
 * realises the mount: it dynamically imports the extension bundle (which
 * registers the custom element as a side effect), builds a renderer-side
 * `finance` proxy, creates the element, injects `finance` + `mountData`,
 * and slots it in. The Host process has no DOM, so the actual rendering
 * can only happen here, in the Renderer.
 *
 * The dynamic import is wrapped in try/catch: if the bundle is unavailable
 * (e.g. dev server without a pre-built bundle) the failure is logged rather
 * than crashing the app shell.
 */

import { LitElement, html } from 'lit';
import { createFinance } from '../create-finance';

export class SalaryHistoryView extends LitElement {
  static properties = {
    extensionId: { type: String },
    componentTag: { type: String },
    mountData: { attribute: false }
  };

  extensionId = '';
  componentTag = '';
  mountData: Record<string, unknown> = {};

  updated(changed: Map<string, unknown>): void {
    if (changed.has('extensionId') || changed.has('componentTag') || changed.has('mountData')) {
      void this.mountChild();
    }
  }

  private async mountChild(): Promise<void> {
    if (!this.extensionId || !this.componentTag) return;
    try {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const bundleUrl = `${base}extensions/${this.extensionId}.js`;
      // Side-effect import registers the custom element (registerUIComponents).
      await import(/* @vite-ignore */ bundleUrl);

      const child = document.createElement(this.componentTag);
      (child as unknown as { finance: unknown }).finance = createFinance(this.extensionId);
      if (this.mountData && (child as unknown as { mountData?: unknown }).mountData !== undefined) {
        (child as unknown as { mountData: unknown }).mountData = this.mountData;
      }

      const existing = this.querySelector('[data-ext-root]');
      if (existing) existing.remove();
      child.setAttribute('data-ext-root', '');
      this.appendChild(child);
    } catch (err) {
      console.error(`[renderer] failed to mount ${this.extensionId}/${this.componentTag}:`, err);
    }
  }

  render() {
    return html`<slot></slot>`;
  }
}

customElements.define('salary-history-view', SalaryHistoryView);
