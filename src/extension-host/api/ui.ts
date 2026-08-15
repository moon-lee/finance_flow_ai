/**
 * Phase 5 Task 2.7 — per-extension `ui` surface.
 *
 * Exposes `requestMount`, `setDirty`, `autoSaveDraft`, and
 * `onBeforeUnmount`. The first three route over RPC; the last stores
 * callbacks locally so the Host can call them before the panel is
 * destroyed (lazy-unmount lifecycle, Stage 4).
 */

import { RPC_METHOD } from '../../shared/json-rpc-methods';

export interface UiApi {
  requestMount: (viewId: string, mountData?: object) => Promise<void>;
  navigatePanel: (view: string, mountData?: object) => Promise<void>;
  setDirty: (dirty: boolean) => void;
  autoSaveDraft: () => Promise<void>;
  onBeforeUnmount: (callback: () => Promise<void>) => void;
}

export interface RpcClient {
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
  notify(method: string, params?: unknown): void;
}

/** Per-extension unmount callback lists keyed by extensionId. */
const unmountCallbacks = new Map<string, Array<() => Promise<void>>>();

/**
 * Build the `finance.ui` surface for one specific extension.
 *
 * @param extensionId The calling extension's id.
 * @param rpc         The Host→Main RPC client.
 */
export function createUi(extensionId: string, rpc: RpcClient): UiApi {
  if (!unmountCallbacks.has(extensionId)) {
    unmountCallbacks.set(extensionId, []);
  }

  return {
    async requestMount(viewId: string, mountData?: object): Promise<void> {
      await rpc.request(RPC_METHOD.ExtensionUiMount, {
        extensionId,
        componentTag: viewId,
        mountData
      });
    },

    async navigatePanel(view: string, mountData?: object): Promise<void> {
      await rpc.request(RPC_METHOD.ExtensionNavigatePanel, {
        extensionId,
        view,
        mountData
      });
    },

    setDirty(dirty: boolean): void {
      rpc.request(RPC_METHOD.ExtensionUiSetDirty, { extensionId, dirty });
    },

    async autoSaveDraft(): Promise<void> {
      await rpc.request(RPC_METHOD.ExtensionUiAutoSaveDraft, { extensionId });
    },

    onBeforeUnmount(callback: () => Promise<void>): void {
      unmountCallbacks.get(extensionId)!.push(callback);
    }
  };
}

/**
 * Retrieve the pending unmount callbacks for an extension. Used by the
 * Host lifecycle manager when a panel is being torn down.
 *
 * @returns A copy of the callback list (safe to iterate after clearing).
 */
export function drainUnmountCallbacks(extensionId: string): Array<() => Promise<void>> {
  const cbs = unmountCallbacks.get(extensionId) ?? [];
  unmountCallbacks.set(extensionId, []);
  return cbs;
}
