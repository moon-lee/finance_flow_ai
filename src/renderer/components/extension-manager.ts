/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { LitElement, html, css } from "lit";
import { rendererLogger } from "../logger";

export class ExtensionManager extends LitElement {
  static override styles = css`
    :host {
      display: block;
      padding: 16px;
      color: var(--text-primary);
    }
    .badge {
      background: var(--badge-inactive-bg);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
    }
  `;

  private extensions: Array<{
    id: string;
    displayName: string;
    version: string;
    source: string;
    enabled: boolean;
  }> = [];
  private pendingDeleteId: string | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    (window as any).financeShell?.extensions
      ?.managerList?.()
      .then((list: any[]) => {
        this.extensions = list;
        this.requestUpdate();
      });
  }

  override render() {
    return html`<h2>Extensions</h2>
      <div>
        <button @click=${() => this._pickFolder()}>Install Folder</button>
        <button @click=${() => this._pickZip()}>Install Zip</button>
      </div>
      <div style="margin-top:12px; color: var(--text-secondary)">
        Restart the app for changes to take effect.
      </div>
      <ul>
        ${this.extensions.map(
          (e) =>
            html`<li>
              ${e.displayName} v${e.version}
              <span class="badge">${e.source}</span>
              <button data-toggle=${e.id} @click=${() => this._toggle(e)}>
                ${e.enabled ? "Disable" : "Enable"}
              </button>
              ${e.source === "user"
                ? html`<button
                    data-uninstall=${e.id}
                    @click=${() => this._uninstall(e.id)}
                  >
                    Uninstall
                  </button>`
                : ""}
              ${e.source === "user"
                ? this.pendingDeleteId === e.id
                  ? html`<span
                      >Confirm delete ${e.id}?
                      <button
                        data-confirm=${e.id}
                        @click=${() => this._confirm(e.id)}
                      >
                        Yes</button
                      ><button @click=${() => this._cancel()}>No</button></span
                    >`
                  : html`<button
                      data-delete=${e.id}
                      @click=${() => this._askDelete(e.id)}
                    >
                      Delete Data
                    </button>`
                : ""}
            </li>`,
        )}
      </ul>`;
  }
  private _toast(msg: {
    type: "info" | "warning" | "error";
    title: string;
    message: string;
    duration?: number;
  }) {
    const duration = msg.duration ?? (msg.type === "info" ? 8000 : 6000);
    const tc = document.querySelector("toast-container") as any;
    if (tc?.showToast) tc.showToast({ ...msg, duration });
    else console.log(`[extensions] ${msg.title}: ${msg.message}`);
    // also write to log file via structured logger (eventBus → LogFileService)
    const level =
      msg.type === "error" ? "error" : msg.type === "warning" ? "warn" : "info";
    if (level === "error")
      rendererLogger.error(`${msg.title}: ${msg.message}`, "extensions");
    else if (level === "warn")
      rendererLogger.warn(`${msg.title}: ${msg.message}`, "extensions");
    else rendererLogger.info(`${msg.title}: ${msg.message}`, "extensions");
  }

  private async _pickFolder() {
    const p = await (window as any).financeShell?.extensions?.pickFolder?.();
    if (!p) return;
    const res: any = await (window as any).financeShell.extensions.install(p);
    if (res?.ok) {
      setTimeout(() => (window as any).financeShell?.restartApp?.(), 200);
    } else {
      this._toast({
        type: "error",
        title: "Install failed",
        message: res?.reason ?? "Unknown error",
      });
    }
  }

  private async _pickZip() {
    const p = await (window as any).financeShell?.extensions?.pickZip?.();
    if (!p) return;
    const res: any = await (window as any).financeShell.extensions.install(p);
    if (res?.ok) {
      setTimeout(() => (window as any).financeShell?.restartApp?.(), 200);
    } else {
      this._toast({
        type: "error",
        title: "Install failed",
        message: res?.reason ?? "Unknown error",
      });
    }
  }

  private async _toggle(e: any) {
    const next = !e.enabled;
    await (window as any).financeShell.extensions.setEnabled(e.id, next);
    e.enabled = next;

    if (!next) {
      const prefix = `panel-${e.id}-`;
      const raw = localStorage.getItem("core.workspace.layout");
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          if (saved && Array.isArray(saved.tabs)) {
            saved.tabs = (saved.tabs as any[]).filter(
              (t: any) => !String(t.panelId).startsWith(prefix),
            );
            if (!saved.tabs.some((t: any) => t.panelId === saved.activePanelId))
              saved.activePanelId = saved.tabs[0]?.panelId ?? "";
            localStorage.setItem(
              "core.workspace.layout",
              JSON.stringify(saved),
            );
          }
        } catch (err) {
          rendererLogger.warn("Disable cleanup failed", err as Error);
        }
      }
    }
    setTimeout(() => (window as any).financeShell?.restartApp?.(), 200);
    this.requestUpdate();
  }

  private async _uninstall(id: string) {
    const res: any = await (window as any).financeShell.extensions.uninstall(
      id,
    );
    if (res?.ok) {
      setTimeout(() => (window as any).financeShell?.restartApp?.(), 200);
    } else if (res?.reason) {
      this._toast({
        type: "error",
        title: "Uninstall failed",
        message: res.reason,
      });
    } else {
      // legacy null success
      setTimeout(() => (window as any).financeShell?.restartApp?.(), 200);
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

  private async _delete(id: string) {
    return this._askDelete(id);
  }
  
  private async _confirm(id: string) {
    this.pendingDeleteId = null;
    const res: any = await (window as any).financeShell.extensions.deleteData(
      id,
    );
    if (res?.ok || res === null) {
      setTimeout(() => (window as any).financeShell?.restartApp?.(), 200);
    } else if (res?.reason) {
      this._toast({
        type: "error",
        title: "Delete failed",
        message: res.reason,
      });
    }
    this.requestUpdate();
  }
}
customElements.define("extension-manager", ExtensionManager);
