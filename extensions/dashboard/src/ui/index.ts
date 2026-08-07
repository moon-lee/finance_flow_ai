/**
 * Phase 5 Task 9 — register Dashboard UI custom elements.
 *
 * The Extension Host runs in a Node `utilityProcess` with no DOM, so
 * Lit components MUST NOT be loaded there. The Renderer (browser)
 * calls this once per mount and awaits it before creating an element.
 */

import { DashboardView } from './dashboard-view.js';
import './reorder-cards-modal.js';

export async function registerUIComponents(): Promise<void> {
  if (typeof HTMLElement === 'undefined') return;
  customElements.define('dashboard-view', DashboardView);
}
