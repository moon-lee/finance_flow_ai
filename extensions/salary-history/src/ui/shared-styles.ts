/**
 * Phase 4 Task 11 — shared UI styles for the salary-history extension.
 *
 * One source of truth for the chrome/primitives that were copy-pasted into
 * every Lit component: the colour palette as CSS custom properties, the top
 * bar + breadcrumb, the shared action buttons, the form section/field
 * primitives, and the list/table primitives. Components compose these via
 * `static styles = [sharedStyles, listStyles, css`...`]` (order matters:
 * shared first, component-unique rules last so they win the cascade) and
 * keep only their genuinely unique selectors local.
 *
 * Why: the `#007acc` / `#3e3e3e` / `#252526` literals (and the top bar,
 * breadcrumb, `.filter-btn`, `.btn-*` blocks) were duplicated across four
 * files. A palette tweak meant editing four files, and they drifted — the
 * `.filter-btn` rule existed in only one component, so reusing the class
 * elsewhere silently fell back to browser defaults. Defining them once here
 * removes that class of bug.
 *
 * The two modals (accounts-seed, reorder-sections) share `modalStyles`:
 * they use the identical dialog pattern (fixed backdrop + card + `.primary`/
 * `.ghost` action buttons + action row), so that chrome is consolidated here
 * too. Each modal keeps only its unique selectors (welcome banner, list items,
 * up/down arrows, inputs).
 */
import { css } from 'lit';

/** Palette tokens + cross-view chrome: top bar, breadcrumb, h1, action buttons. */
export const sharedStyles = css`
  :host {
    display: block;
    background: #1e1e1e;
    color: #d4d4d4;
    font: 14px/1.5 system-ui, sans-serif;

    /* Palette tokens — edit once, applies everywhere. */
    --ff-bg-base: #1e1e1e;
    --ff-bg-panel: #252526;
    --ff-bg-subpanel: #2a2a2a;
    --ff-bg-input: #3c3c3c;
    --ff-border: #3e3e3e;
    --ff-text: #d4d4d4;
    --ff-text-muted: #858585;
    --ff-text-strong: #ffffff;
    --ff-accent: #007acc;
    --ff-accent-hover: #1188dd;
    --ff-teal: #4ec9b0;
  }

  /* Top bar + breadcrumb chrome (identical across the list/form views). */
  .topbar {
    background: #252526;
    border-bottom: 1px solid #3e3e3e;
    padding: 10px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .topbar .crumb-link {
    color: #007acc;
    font-size: 13px;
    text-decoration: none;
    cursor: pointer;
  }
  .topbar .crumb-link:hover { text-decoration: underline; }
  .topbar .crumb-sep { color: #858585; }
  .topbar .crumb-current { color: #d4d4d4; font-weight: 500; }
  .topbar .spacer { flex: 1; }
  .topbar .filter-btn {
    background: #3c3c3c;
    color: #d4d4d4;
    border: 1px solid #3e3e3e;
    padding: 5px 12px;
    border-radius: 3px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }
  .topbar .filter-btn:hover { border-color: #007acc; }
  .topbar a.filter-btn { color: #d4d4d4; text-decoration: none; }

  h1 { font-size: 18px; font-weight: 600; color: #fff; margin: 0 0 4px; }

  /* Shared action buttons (Save / Cancel etc., identical in both forms). */
  .btn {
    padding: 8px 20px;
    border-radius: 3px;
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
    border: 1px solid transparent;
  }
  .btn-primary { background: #007acc; color: #fff; border-color: #007acc; }
  .btn-primary:hover { background: #1188dd; }
  .btn-secondary { background: #3c3c3c; color: #d4d4d4; border-color: #3e3e3e; }
  .btn-secondary:hover { background: #4a4a4a; }
`;

/** Shared form primitives: sectioned cards + labelled fields. */
export const formStyles = css`
  .section {
    background: #252526;
    border: 1px solid #3e3e3e;
    border-radius: 6px;
    margin-bottom: 12px;
    overflow: hidden;
  }
  .section-header {
    background: #2a2a2a;
    padding: 8px 16px;
    border-bottom: 1px solid #3e3e3e;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .section-title, h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #cccccc;
  }
  .section-badge {
    background: #3e3e3e;
    color: #858585;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 2px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .section-body { padding: 16px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px 16px; }

  .field { display: flex; flex-direction: column; gap: 4px; }
  .field-full, .field.textarea { grid-column: 1 / -1; }
  .field label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; color: #858585; }
  .field .label-sub { font-size: 10px; color: #707070; text-transform: none; letter-spacing: 0; font-weight: 400; }
  .field input, .field select, .field textarea {
    background: #3c3c3c;
    color: #d4d4d4;
    border: 1px solid #3e3e3e;
    border-radius: 3px;
    padding: 6px 10px;
    font-size: 13px;
    font-family: inherit;
    outline: none;
  }
  .field input:focus, .field select:focus, .field textarea:focus { border-color: #007acc; }
  .field input[type='number'], .field input[type='date'] { font-family: 'SF Mono', Consolas, monospace; }
  .field textarea { resize: vertical; min-height: 60px; font-family: inherit; }
  .field-changed input { border-color: #cca700; background: #3a2e0a; }
  .field-changed .label-sub { color: #ffd866; }
  .field-error { font-size: 11px; color: #f48771; margin-top: 2px; }

  .footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
`;

/** Shared list/table primitives: table chrome, inline edit links, empty state. */
export const listStyles = css`
  .table-wrap {
    background: #252526;
    border: 1px solid #3e3e3e;
    border-radius: 6px;
    overflow: hidden;
  }
  thead { background: #2a2a2a; }
  tbody tr:hover { background: #2a2a2a; }
  tbody tr:last-child td { border-bottom: none; }
  td.num { text-align: right; font-family: 'SF Mono', Consolas, monospace; }
  td.actions { text-align: right; white-space: nowrap; }
  .btn-link {
    background: transparent;
    color: #007acc;
    border: none;
    padding: 0 6px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }
  .btn-link:hover { text-decoration: underline; }
  .btn-link.danger { color: #f48771; }
  .empty { color: #9a9a9a; padding: 16px 0; }
`;

/** Shared modal primitives: fixed backdrop, dialog card, primary/ghost buttons. */
export const modalStyles = css`
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    z-index: 50;
  }
  .modal {
    width: 360px;
    background: var(--ff-bg-panel);
    border: 1px solid var(--ff-border);
    border-radius: 8px;
    padding: 20px;
    color: var(--ff-text);
    font: 13px/1.5 system-ui, sans-serif;
  }
  button {
    border: 0;
    border-radius: 4px;
    cursor: pointer;
    font: inherit;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 12px;
  }
  .primary { background: var(--ff-accent); color: var(--ff-text-strong); }
  .ghost { background: transparent; color: #94a3b8; border: 1px solid var(--ff-border); }
`;
