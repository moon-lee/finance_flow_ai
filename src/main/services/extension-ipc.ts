import { utilityProcess, type UtilityProcess } from 'electron';
import {
  isRequest,
  makeRequestId,
  RpcErrorCode,
  type JsonRpcRequest,
  type JsonRpcResponse
} from '../../shared/json-rpc';
import { resolveHostBundlePath } from '../../shared/extension-paths';
import type { FinanceExtensionManifest } from '../../types/finance';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Lifecycle events emitted by the IPC transport. Subscribers (typically Main)
 * forward these to the Renderer as `extensions:host-status` notifications so a
 * status-bar UI can show when extensions are unavailable.
 */
export type HostStatus =
  | { status: 'starting' }
  | { status: 'ready' }
  | { status: 'crashed'; exitCode: number | null }
  | { status: 'restarting' }
  | { status: 'restart-failed'; error: string };

export interface ExtensionIPCOptions {
  /** Path to the bundled Host entry. Defaults to `resolveHostBundlePath()`. */
  hostPath?: string;
  /** Request timeout in ms. Defaults to 10_000. */
  requestTimeoutMs?: number;
}

export class ExtensionIPC {
  private process: UtilityProcess | null = null;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly listeners = new Set<(msg: unknown) => void>();
  private readonly statusListeners = new Set<(status: HostStatus) => void>();
  private readonly requestTimeoutMs: number;
  private readonly hostPath: string;
  private initialManifests: FinanceExtensionManifest[] = [];
  private crashed = false;
  private shuttingDown = false;
  private restartPromise: Promise<void> | null = null;

  constructor(options: ExtensionIPCOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.hostPath = options.hostPath ?? resolveHostBundlePath();
  }

  /**
   * Start the Extension Host and send it the initial manifest list.
   * Safe to call on first start and to drive automatic re-spawn after a crash.
   */
  async start(initialManifests: FinanceExtensionManifest[]): Promise<void> {
    if (this.process && !this.crashed) return;
    if (this.restartPromise) return this.restartPromise;

    this.initialManifests = initialManifests;
    this.crashed = false;
    this.emitStatus({ status: 'starting' });

    const doStart = async (): Promise<void> => {
      this.process = utilityProcess.fork(this.hostPath, [], {
        serviceName: 'finance-extension-host',
        stdio: 'inherit'
      });

      this.process.on('message', (msg: unknown) => this.handleMessage(msg));
      this.process.on('exit', (code) => this.handleExit(code));

      // Wait for the Host to announce readiness.
      await new Promise<void>((resolveReady, rejectReady) => {
        const timer = setTimeout(
          () => rejectReady(new Error('Extension Host did not become ready in time')),
          this.requestTimeoutMs
        );
        const onMessage = (msg: unknown): void => {
          if (
            typeof msg === 'object' &&
            msg !== null &&
            (msg as { method?: string }).method === 'host.ready'
          ) {
            clearTimeout(timer);
            this.process?.off('message', onMessage);
            resolveReady();
          }
        };
        this.process!.on('message', onMessage);
      });

      // Send the manifests.
      await this.request('host.initialize', { manifests: this.initialManifests });
      this.emitStatus({ status: 'ready' });
    };

    this.restartPromise = doStart().finally(() => {
      this.restartPromise = null;
    });

    try {
      await this.restartPromise;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emitStatus({ status: 'restart-failed', error: message });
      throw err;
    }
  }

  /**
   * `utilityProcess` 'exit' handler. Differentiates graceful shutdown
   * (from `stop()`) from an unexpected crash, and on crash sets the
   * `crashed` flag so the next `request()` triggers re-spawn.
   */
  private handleExit(code: number | null): void {
    if (this.shuttingDown) {
      // Expected shutdown — clear the flag and do not treat as a crash.
      //
      // [Review observation #3 — post-review] Also null the process reference
      // so `isRunning()` returns false after `stop()` and the next `start()`
      // does not early-return without re-sending manifests. Without this, the
      // sequence "shutdown → start" hangs the IPC channel: `this.process`
      // still points at the dead UtilityProcess, `isRunning()` returns true,
      // `start()` short-circuits, and subsequent `request()` calls post to a
      // dead handle (silently dropped or thrown, depending on Electron's
      // behavior). The race between `stop()`'s null-check and `notify()` is
      // what surfaces this; the fix makes both paths converge on a consistent
      // "not running" state.
      this.shuttingDown = false;
      this.process = null;
      return;
    }
    const err = new Error(`Extension Host exited unexpectedly (code ${code})`);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
    this.process = null;
    this.crashed = true;
    this.emitStatus({ status: 'crashed', exitCode: code });
  }

  /**
   * Ensure the Host is running before any RPC call. If it has crashed,
   * transparently re-spawns with the same manifest list. If it has never
   * been started, throws a clear error so the caller can distinguish
   * "never started" from "crashed and retrying".
   */
  private async ensureRunning(): Promise<void> {
    if (this.process && !this.crashed) return;
    if (this.restartPromise) return this.restartPromise;
    if (!this.crashed) {
      throw new Error('ExtensionIPC not started. Call start() first.');
    }
    this.emitStatus({ status: 'restarting' });
    await this.start(this.initialManifests);
  }

  /**
   * Send an RPC request to the Extension Host. The IPC transport is a
   * generic RPC pipe — it does NOT enforce per-extension enable/disable.
   * Main-side IPC handlers are responsible for gating calls on
   * `extensionRegistry.isEnabled()` (e.g. `extensions:activate-view` does
   * this via `views().find(...)`; see Task 10). Adding an `isEnabled()`
   * check here would couple the transport to the registry and break the
   * Phase 5+ plan to add commands that are not extension-scoped.
   * *(per [Review fix §5.3] — explicit "transport does not check enable"
   *  statement in the hot-disable contract.)*
   */
  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    await this.ensureRunning();
    if (!this.process) {
      throw new Error('Extension Host unavailable after restart attempt.');
    }
    const id = makeRequestId();
    const message: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Extension Host request "${method}" timed out after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.process!.postMessage(message);
    });
  }

  notify(method: string, params?: unknown): void {
    if (!this.process || this.crashed) return;
    this.process.postMessage({ jsonrpc: '2.0', method, params });
  }

  /**
   * Subscribe to lifecycle status changes. Used by Main to forward
   * `extensions:host-status` notifications to the Renderer for a status-bar UI.
   * Returns an unsubscribe function.
   */
  onHostStatus(listener: (status: HostStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private emitStatus(status: HostStatus): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('[extension-ipc] status listener threw:', err);
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.process) return;
    this.shuttingDown = true;
    this.notify('host.shutdown');
    // Give the Host 1s to gracefully exit, then kill.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try { this.process?.kill(); } catch { /* already dead */ }
        resolve();
      }, 1_000);
      this.process!.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }

  isRunning(): boolean {
    return this.process !== null && !this.crashed;
  }

  private handleMessage(msg: unknown): void {
    if (isRequest(msg)) {
      // Main never receives requests from Host in Phase 3, only responses/notifications.
      // If we get one, treat it as a protocol violation.
      console.error('[extension-ipc] unexpected request from Host:', msg);
      return;
    }
    if (typeof msg === 'object' && msg !== null && 'id' in (msg as object)) {
      const response = msg as JsonRpcResponse;
      const pending = this.pending.get(response.id);
      if (!pending) return; // late or duplicate response
      clearTimeout(pending.timer);
      this.pending.delete(response.id);
      if ('error' in response) {
        pending.reject(new Error(`${response.error.message} (code ${response.error.code})`));
      } else {
        pending.resolve(response.result);
      }
      return;
    }
    // Notification — forward to listeners (used for `extension.activated` etc.).
    for (const listener of this.listeners) listener(msg);
  }
}
