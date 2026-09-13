/**
 * Phase 4 Task 12 — UI component barrel for the salary-history extension.
 *
 * Each component self-registers its custom element via the `@customElement`
 * decorator when its module is imported (Lit's side-effect registration).
 * Importing all six modules here guarantees the elements are defined by the
 * time the extension finishes activating, so commands can create them on
 * demand (Decision 12). The actual mount into the host DOM is wired in
 * Task 14 (UI mount IPC channel); until then `registerUIComponents` exists
 * as the single import site the mount code will call.
 */

import './payslip-form.js';
import './payslip-list.js';
import './pay-rate-history-view.js';
import './rate-row-form.js';
import './reorder-sections-modal.js';
import './salary-orchestrator.js';

export function registerUIComponents(): void {
  // Custom elements are defined as a side effect of the imports above.
}
