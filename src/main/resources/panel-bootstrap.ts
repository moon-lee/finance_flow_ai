/**
 * Phase 5 panel renderer bootstrap.
 *
 * Served at `finance-shell://bootstrap.js` (compiled to dist/resources/).
 * Runs inside the WebContentsView panel renderer process:
 *
 *   1. Subscribes to `panel:init` (cached payload if event already fired).
 *   2. Dynamically imports the extension bundle.
 *   3. Calls `registerUIComponents()` and awaits it.
 *   4. Creates the component element matching `viewId`.
 *   5. Forwards DOM CustomEvents back to Main via `financeShell.extensions.uiEvent()`.
 *   6. Handles Core-owned events (e.g. `account-create`) via IPC.
 *   7. Appends the element to `#app`.
 */

import type { PanelFinanceShellApi } from '../../types/finance-shell';

declare const financeShell: PanelFinanceShellApi;

interface PanelPayload {
  extensionId: string;
  viewId: string;
  mountData?: Record<string, unknown>;
}

/**
 * Events dispatched by extension components that must be forwarded to Main
 * via `extensions:ui-event`. The list covers all events the salary-history
 * extension's UI components emit (per its manifest's `allowedUiEvents`).
 */
const FORWARDED_EVENTS = [
  'account-seed-skip',
  'account-seed-cancel',
  'payslip-add-request',
  'payslip-create',
  'payslip-edit-request',
  'payslip-edit',
  'payslip-cancel',
  'payslip-delete',
  'rate-add-request',
  'rate-edit-request',
  'rate-view-request',
  'rate-create',
  'rate-edit',
  'rate-form-cancel',
  'section-order-change',
];

async function mountPanelComponent(payload: PanelPayload): Promise<void> {
  const { extensionId, viewId, mountData } = payload;
  const bundleUrl = `finance-shell://extensions/${extensionId}.js`;

  try {
    const bundle = await import(bundleUrl);

    if (typeof bundle.registerUIComponents === 'function') {
      await bundle.registerUIComponents();
    }

    const tagName = viewId;
    const el = document.createElement(tagName);

    if (mountData && typeof mountData === 'object') {
      el.setAttribute('data-mount', JSON.stringify(mountData));
    }

    // --- Event forwarding to Main ---
    // Forward extension UI events so the Host can react.
    for (const eventName of FORWARDED_EVENTS) {
      el.addEventListener(eventName, ((e: Event) => {
        const detail = (e as CustomEvent).detail;
        financeShell.extensions.uiEvent(extensionId, eventName, detail);
      }) as EventListener);
    }

    // --- Core-owned event: account-create ---
    // The `accounts` table is Platform-owned and read-only for extensions
    // (Decision 4). Account creation routes through a Core IPC handler.
    el.addEventListener('account-create', (async (e: Event) => {
      const detail = (e as CustomEvent).detail as { name: string; institution: string | null } | undefined;
      if (!detail || typeof detail.name !== 'string' || detail.name.trim() === '') return;
      try {
        await financeShell.accounts.create({
          name: detail.name.trim(),
          institution: detail.institution ?? null,
        });
      } catch (err) {
        console.error('[panel bootstrap] account-create failed:', err);
      }
    }) as EventListener);

    const app = document.getElementById('app');
    if (app) {
      app.appendChild(el);
    } else {
      console.error('[panel bootstrap] #app element not found in panel template');
    }
  } catch (err) {
    console.error('[panel bootstrap] failed to mount component:', err);
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = '<p style="color:#ff6b6b;padding:1rem;">Panel failed to load. See console for details.</p>';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  financeShell.onPanelInit(async (payload: unknown) => {
    await mountPanelComponent(payload as PanelPayload);
  });
});
