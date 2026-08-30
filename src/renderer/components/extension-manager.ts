import { LitElement, html, css } from "lit";
import type { ManagedExtension } from "../../types/finance-shell";
import { rendererLogger } from "../logger";
import { baseViewStyles, headerHighlightStyles } from "../styles/base-view-styles";

export class ExtensionManager extends LitElement {
  static override styles = css`
    ${baseViewStyles}
    ${headerHighlightStyles}

    :host {
      padding: 16px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      min-width: 0;
    }

    .page-header h1 {
      font-size: var(--ff-font-2xl);
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 2px;
    }

    .page-header .subtitle {
      color: var(--text-tertiary);
      font-size: var(--ff-font-md);
      margin: 0;
    }

    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      gap: 12px;
    }

    .btn {
      background: var(--btn-primary-bg);
      color: var(--btn-primary-text);
      border: none;
      padding: 7px 14px;
      border-radius: 3px;
      font-size: var(--ff-font-md);
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
    }

    .btn:hover {
      background: var(--btn-primary-hover-bg);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: var(--btn-secondary-bg);
      color: var(--btn-secondary-text);
      border: 1px solid var(--btn-secondary-border);
    }

    .btn-secondary:hover {
      border-color: var(--btn-secondary-hover-border);
    }

    .btn-danger {
      background: transparent;
      color: var(--danger-color);
      border: 1px solid var(--danger-border);
    }

    .btn-danger:hover {
      background: var(--danger-hover-bg);
      color: var(--danger-hover-text);
    }

    .btn-sm {
      padding: 5px 10px;
      font-size: var(--ff-font-xs);
    }

    .extensions-list {
      flex: 1;
      min-height: 0;
      min-width: 0;
      overflow-y: auto;
    }

    .extension-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 14px;
      background: var(--workspace-bg);
      border: 1px solid var(--input-border);
      border-radius: 6px;
      margin-bottom: 8px;
      min-width: 0;
    }

    .extension-card:hover {
      border-color: var(--btn-secondary-hover-border);
    }

    .extension-info {
      flex: 1;
      min-width: 0;
    }

    .extension-name {
      font-size: var(--ff-font-md);
      font-weight: 600;
      color: var(--text-primary);
    }

    .extension-meta {
      font-size: var(--ff-font-md);
      color: var(--text-tertiary);
      margin-top: 1px;
    }

    .badge {
      font-size: var(--ff-font-xs);
      padding: 2px 8px;
      border-radius: 3px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }

    .badge-user {
      background: var(--badge-inactive-bg);
      color: var(--badge-inactive-text);
    }

    .badge-builtin {
      background: rgba(99, 102, 241, 0.15);
      color: #818cf8;
    }

    .badge-core {
      background: rgba(78, 201, 176, 0.15);
      color: #4ec9b0;
    }

    .row-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .confirm-inline {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: var(--ff-font-md);
      color: var(--text-secondary);
    }

    .confirm-inline .btn-sm {
      padding: 4px 10px;
      font-size: var(--ff-font-xs);
    }

    .empty-state {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--text-tertiary);
      text-align: center;
      gap: 10px;
      padding: 40px 20px;
    }

    .empty-state h3 {
      font-size: var(--ff-font-lg);
      font-weight: 600;
      color: var(--text-secondary);
      margin: 0;
    }

    .empty-state p {
      font-size: var(--ff-font-md);
      margin: 0;
      max-width: 320px;
    }
  `;

  private extensions: ManagedExtension[] = [];
  private pendingDeleteId: string | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    window.financeShell?.extensions
      ?.managerList?.()
      .then((list: ManagedExtension[]) => {
        this.extensions = list;
        this.requestUpdate();
      });
  }

  override render() {
    return html`
      <div class="page-header">
        <div>
          <h1>Extensions</h1>
          <p class="subtitle">Manage installed extensions and plugins</p>
        </div>
      </div>

      <div class="toolbar">
        <span style="color: var(--text-tertiary); font-size: var(--ff-font-md);">${this.extensions.length} extension${this.extensions.length === 1 ? '' : 's'}</span>
        <div class="toolbar-actions">
          <button class="btn btn-secondary" @click="${this._pickFolder}">Install Folder</button>
          <button class="btn btn-secondary" @click="${this._pickZip}">Install Zip</button>
        </div>
      </div>

      <div class="extensions-list">
        ${this.extensions.length === 0 ? html`
          <div class="empty-state">
            <h3>No extensions installed</h3>
            <p>Install an extension from a folder or zip archive to get started.</p>
          </div>
        ` : this.extensions.map((e: ManagedExtension) => html`
          <div class="extension-card">
            <div class="extension-info">
              <div class="extension-name">${e.displayName} v${e.version}</div>
              <div class="extension-meta">${e.source === 'user' ? 'User installed' : e.source === 'built-in' ? 'Built-in' : 'Core'}</div>
            </div>
            <span class="badge ${e.source === 'user' ? 'badge-user' : e.source === 'built-in' ? 'badge-builtin' : 'badge-core'}">${e.source}</span>
            <div class="row-actions">
              <button class="btn btn-secondary btn-sm" @click=${() => this._toggle(e)}>
                ${e.enabled ? "Disable" : "Enable"}
              </button>
              ${e.source === "user"
                ? html`<button
                    class="btn btn-secondary btn-sm"
                    @click=${() => this._uninstall(e.id)}
                  >
                    Uninstall
                  </button>`
                : ""}
              ${e.source === "user"
                ? this.pendingDeleteId === e.id
                  ? html`<span class="confirm-inline">
                      Delete data?
                      <button
                        class="btn btn-danger btn-sm"
                        @click=${() => this._confirm(e.id)}
                      >
                        Yes</button
                      ><button class="btn btn-secondary btn-sm" @click="${this._cancel}">No</button></span
                    >`
                  : html`<button
                      class="btn btn-danger btn-sm"
                      @click=${() => this._askDelete(e.id)}
                    >
                      Delete Data
                    </button>`
                : ""}
            </div>
          </div>
        `)}
      </div>
    `;
  }

  private async _pickFolder() {
    const p = await window.financeShell?.extensions?.pickFolder?.();
    if (!p) return;
    const res = await window.financeShell.extensions.install(p);
    if (res?.ok) {
      setTimeout(() => window.financeShell?.restartApp?.(), 200);
    } else {
      rendererLogger.error(
        `Install failed: ${res?.reason ?? "Unknown error"}`,
        "extensions",
      );
    }
  }

  private async _pickZip() {
    const p = await window.financeShell?.extensions?.pickZip?.();
    if (!p) return;
    const res = await window.financeShell.extensions.install(p);
    if (res?.ok) {
      setTimeout(() => window.financeShell?.restartApp?.(), 200);
    } else {
      rendererLogger.error(
        `Install failed: ${res?.reason ?? "Unknown error"}`,
        "extensions",
      );
    }
  }

  private _pruneWorkspaceTabs(id: string): void {
    const prefix = `panel-${id}-`;
    const raw = localStorage.getItem("core.workspace.layout");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { tabs?: Array<{ panelId?: string }>; activePanelId?: string };
      if (!saved?.tabs) return;
      saved.tabs = saved.tabs.filter((t) => !String(t.panelId).startsWith(prefix));
      if (!saved.tabs.some((t) => t.panelId === saved.activePanelId)) saved.activePanelId = saved.tabs[0]?.panelId ?? "";
      localStorage.setItem("core.workspace.layout", JSON.stringify(saved));
    } catch (err) {
      rendererLogger.warn("Workspace layout prune failed", err as Error);
    }
  }

  private async _toggle(e: ManagedExtension) {
    const next = !e.enabled;
    await window.financeShell.extensions.setEnabled(e.id, next);
    e.enabled = next;

    if (!next) this._pruneWorkspaceTabs(e.id);
    setTimeout(() => window.financeShell?.restartApp?.(), 200);
    this.requestUpdate();
  }

  private async _uninstall(id: string) {
    const res = await window.financeShell.extensions.uninstall(id);
    if (res?.ok) {
      this._pruneWorkspaceTabs(id);
      setTimeout(() => window.financeShell?.restartApp?.(), 200);
    } else if (res?.reason) {
      rendererLogger.error(`Uninstall failed: ${res.reason}`, "extensions");
    } else {
      // legacy null success
      this._pruneWorkspaceTabs(id);
      setTimeout(() => window.financeShell?.restartApp?.(), 200);
    }
  }

  private _askDelete(id: string) {
    this.pendingDeleteId = id;
    this.requestUpdate();
  }

  private _cancel() {
    this.pendingDeleteId = null;
    this.requestUpdate();
  }

  private async _confirm(id: string) {
    this.pendingDeleteId = null;
    const res = await window.financeShell.extensions.deleteData(id);
    if (res?.ok || res === null) {
      this._pruneWorkspaceTabs(id);
      setTimeout(() => window.financeShell?.restartApp?.(), 200);
    } else if (res?.reason) {
      rendererLogger.error(`Delete failed: ${res.reason}`, "extensions");
    }
    this.requestUpdate();
  }
}
customElements.define("extension-manager", ExtensionManager);
