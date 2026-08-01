import { utilityProcess, type UtilityProcess } from 'electron';
import {
  isRequest,
  makeRequestId,
  RpcErrorCode,
  type JsonRpcRequest,
  type JsonRpcResponse
} from '../../shared/json-rpc';
import { RPC_METHOD } from '../../shared/json-rpc-methods';
import { resolveHostBundlePath } from '../../shared/extension-paths';
import type { FinanceExtensionManifest } from '../../types/finance';
import type { DAOService, QueryObject } from './dao-service';
import { getSetting, setSetting } from './settings-service';
import { DomainServiceRegistry } from './domain-service-registry';

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

/**
 * [Fix] One log entry forwarded from the Host. Mirrors the producer shape
 * in `src/extension-host/host.ts` (the wrapper there stringifies each arg
 * before posting, so consumers can rely on `args` being an array of strings).
 */
export interface HostLogEntry {
  level: 'log' | 'error' | 'warn';
  args: string[];
}

export interface ExtensionIPCOptions {
  /** Path to the bundled Host entry. Defaults to `resolveHostBundlePath()`. */
  hostPath?: string;
  /** Request timeout in ms. Defaults to 10_000. */
  requestTimeoutMs?: number;
}

/**
 * Phase 4 Task 14 — a request from an extension (running in the Host) to
 * have Main mount a WebviewPanel for one of its contributed views.
 * `extensionId` is the calling extension; `viewId` is the contributed
 * view id (e.g. `salary-history`, `dashboard`); `mountData` is an opaque
 * payload the extension wants forwarded to the panel (e.g. aggregator data).
 *
 * Phase 5 rename: `componentTag` → `viewId`. The Host still sends the
 * old field name during the transition; `handleUiMount` normalises it.
 */
export interface UiMountRequest {
  extensionId: string;
  viewId: string;
  mountData?: Record<string, unknown>;
  bundleUrl?: string;
  /**
   * Backward-compat alias used by the Phase 4 Host. If `viewId` is absent
   * the handler falls back to `componentTag`.
   */
  componentTag?: string;
}

/**
 * Phase 4 Task 16 — a namespaced settings request from an extension. Main
 * enforces that `key` begins with `<extensionId>.` before touching the
 * settings service, so an extension can only read/write its own keys.
 */
export interface ExtensionSettingRequest {
  extensionId: string;
  key: string;
  value?: unknown;
}

export class ExtensionIPC {
  private process: UtilityProcess | null = null;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly listeners = new Set<(msg: unknown) => void>();
  private readonly statusListeners = new Set<(status: HostStatus) => void>();
  /**
   * [Fix] Subscribers for `host.log` notifications from the Host. Main
   * forwards each entry to the Renderer via the `extensions:host-log`
   * IPC channel so Host logs (including extension `console.log` calls)
   * appear in the DevTools console with a `[host]` prefix. See
   * `src/extension-host/host.ts` for the producer side.
   */
  private readonly logListeners = new Set<(entry: HostLogEntry) => void>();
  /**
   * Phase 4 Task 14 — callback invoked when an extension requests a UI
   * mount (`extension.ui-mount`). Main registers this so it can forward the
   * request to the Renderer over `webContents.send('extensions:ui-mount')`.
   */
  private uiHandler: {
    onMountRequested(extensionId: string, viewId: string, mountData?: object): void;
    onFocusRequested(panelId: string): void;
    onUiEvent(webContentsId: number, eventName: string, detail: unknown): void;
    onSetDirty(extensionId: string, dirty: boolean): void;
    onAutoSaveDraft(extensionId: string): Promise<void>;
    onBeforeUnmount(extensionId: string): Promise<void>;
  } | null = null;
  private panelNavigateHandler: {
    onNavigate(extensionId: string, view: string, mountData?: object): void;
  } | null = null;
  private readonly requestTimeoutMs: number;
  private readonly hostPath: string;
  private initialManifests: FinanceExtensionManifest[] = [];
  private crashed = false;
  private shuttingDown = false;
  private restartPromise: Promise<void> | null = null;
  /**
   * Phase 4 Task 6.3 — the DAO service is injected by Main after
   * `TableSchemaRegistry` has been populated with shared + extension
   * tables. The handlers registered in `setDAOService` accept incoming
   * `extension.readTable` / `extension.writeTable` requests from the
   * Host and dispatch to the DAO. Until `setDAOService` runs, those
   * methods return a clear "DAO not wired" error so misconfiguration
   * surfaces loudly during boot rather than as silent query failures.
   */
  private dao: DAOService | null = null;
  private domainServiceRegistry: DomainServiceRegistry | null = null;

  constructor(options: ExtensionIPCOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.hostPath = options.hostPath ?? resolveHostBundlePath();
  }

  /**
   * Start the Extension Host and send it the initial manifest list.
   * Safe to call on first start and to drive automatic re-spawn after a crash.
   */
  async start(initialManifests: FinanceExtensionManifest[]): Promise<void> {
    console.log('[extension-ipc] start() called', { manifestCount: initialManifests.length, isRunning: this.isRunning() });
    if (this.process && !this.crashed) return;
    if (this.restartPromise) return this.restartPromise;

    this.initialManifests = initialManifests;
    this.crashed = false;
    this.emitStatus({ status: 'starting' });

    const doStart = async (): Promise<void> => {
      console.log('[extension-ipc] forking host process');
      this.process = utilityProcess.fork(this.hostPath, [], {
        serviceName: 'finance-extension-host',
        stdio: 'inherit'
      });

      // Operational telemetry: one line per spawn, so manual testing can
      // verify the Host is reused across click sequences (not re-spawned).
      // Visible in the main-process terminal (not forwarded to Renderer;
      // the `[host log]` mirror is reserved for Host-side logs).
      //
      // Must run in the 'spawn' event handler because Electron populates
      // `UtilityProcess.pid` asynchronously — the handle is returned
      // synchronously by `fork()` but `pid` is undefined until the child
      // actually starts. Logging here would otherwise print `pid=undefined`.
      this.process.once('spawn', () => {
        console.log(`[extension-ipc] host spawned, pid=${this.process!.pid}`);
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
    // [Fix] Mirror the crash into the main-process terminal so manual
    // testers can see Test Unit 5 step 6's expected log line without
    // having DevTools open. The renderer-side `[host status]` line
    // covers the in-app case; this covers the headless/SSH case.
    console.error(`[extension-ipc] Extension Host exited unexpectedly (code ${code})`);
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

  /**
   * [Fix] Subscribe to `host.log` notifications forwarded from the Host.
   * Used by Main to mirror Host stdout into the Renderer DevTools console.
   * Returns an unsubscribe function.
   */
  onHostLog(listener: (entry: HostLogEntry) => void): () => void {
    this.logListeners.add(listener);
    return () => {
      this.logListeners.delete(listener);
    };
  }

  private emitLog(entry: HostLogEntry): void {
    for (const listener of this.logListeners) {
      try {
        listener(entry);
      } catch (err) {
        console.error('[extension-ipc] log listener threw:', err);
      }
    }
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

  /**
   * Phase 4 Task 6.3 — inject the DAO service so `extension.readTable` /
   * `extension.writeTable` requests from the Host are dispatched to the
   * real `DAOService`. Must be called before `start()` if any extension
   * is expected to access the database. Idempotent: calling twice with
   * the same DAO is a no-op; calling twice with different DAOs replaces
   * the binding (used by tests that swap the underlying SQLite handle).
   */
  setDAOService(dao: DAOService): void {
    this.dao = dao;
  }

  /**
   * Phase 5 Task 7 — inject the domain service registry so
   * `domain.service.invoke` requests from the Host are dispatched to the
   * real `DomainServiceRegistry`. Must be called before `start()`.
   */
  setDomainServiceRegistry(registry: DomainServiceRegistry): void {
    this.domainServiceRegistry = registry;
  }

  /**
   * Panel navigation — inject a handler so `extension.navigatePanel` RPC
   * from the Host can forward the navigation request to WebviewPanelManager.
   */
  setPanelNavigateHandler(handler: {
    onNavigate(extensionId: string, view: string, mountData?: object): void;
  } | null): void {
    this.panelNavigateHandler = handler;
  }

  /**
   * Handle `extension.navigatePanel` from the Host. Finds the panel by
   * extensionId and sends a `panel:navigate` IPC to its WebContentsView.
   */
  handleNavigatePanel(params: unknown): { navigated: boolean } {
    if (!this.panelNavigateHandler) {
      console.warn('[extension-ipc] handleNavigatePanel: panelNavigateHandler is null — dropped');
      return { navigated: false };
    }
    const { extensionId, view, mountData } = params as {
      extensionId: string;
      view: string;
      mountData?: object;
    };
    console.log('[extension-ipc] handleNavigatePanel:', { extensionId, view });
    this.panelNavigateHandler.onNavigate(extensionId, view, mountData);
    return { navigated: true };
  }

  /**
   * Phase 5 Task 2 — register the panel UI handler. Called by Main so
   * that when an extension requests a mount (`extension.ui-mount`), Main
   * can forward it to `WebviewPanelManager`. Returns an unsubscribe function.
   */
  setUIHandler(handler: {
    onMountRequested(extensionId: string, viewId: string, mountData?: object): void;
    onFocusRequested(panelId: string): void;
    onUiEvent(webContentsId: number, eventName: string, detail: unknown): void;
    onSetDirty(extensionId: string, dirty: boolean): void;
    onAutoSaveDraft(extensionId: string): Promise<void>;
    onBeforeUnmount(extensionId: string): Promise<void>;
  } | null): () => void {
    this.uiHandler = handler;
    return () => {
      if (this.uiHandler === handler) this.uiHandler = null;
    };
  }

  /**
   * Phase 5 Task 2 — invoked by `dispatchHostRequest` when the Host
   * forwards an `extension.ui-mount` request. Normalises the legacy
   * `componentTag` field to `viewId` and delegates to the panel UI handler.
   */
  handleUiMount(params: unknown): void {
    if (!this.uiHandler) {
      console.warn('[extension-ipc] handleUiMount: uiHandler is null — mount request dropped');
      return;
    }
    const { extensionId, viewId, componentTag, mountData } = params as UiMountRequest;
    const resolvedViewId = viewId ?? componentTag ?? 'unknown';
    console.log('[extension-ipc] handleUiMount: resolvedViewId:', resolvedViewId, 'extensionId:', extensionId);
    this.uiHandler.onMountRequested(extensionId, resolvedViewId, mountData as object | undefined);
  }

  handleUiSetDirty(params: unknown): { ok: true } {
    const { extensionId, dirty } = params as { extensionId: string; dirty: boolean };
    console.log(`[extension-ipc] handleUiSetDirty: ${extensionId} dirty=${dirty}`);
    if (!this.uiHandler) {
      console.warn('[extension-ipc] handleUiSetDirty: uiHandler is null — dropped');
      return { ok: true };
    }
    this.uiHandler.onSetDirty(extensionId, dirty);
    return { ok: true };
  }

  async handleUiAutoSaveDraft(params: unknown): Promise<{ ok: true }> {
    const { extensionId } = params as { extensionId: string };
    console.log(`[extension-ipc] handleUiAutoSaveDraft: ${extensionId}`);
    if (!this.uiHandler) {
      console.warn('[extension-ipc] handleUiAutoSaveDraft: uiHandler is null — dropped');
      return { ok: true };
    }
    await this.uiHandler.onAutoSaveDraft(extensionId);
    return { ok: true };
  }

  /**
   * Phase 4 Task 16 — read an extension-scoped setting. Enforces that the
   * key is namespaced to the calling extension before delegating to the
   * settings service. Returns `{ value }` (value may be `undefined`).
   */
  handleGetSetting(params: unknown): { value: unknown } {
    const { extensionId, key } = params as ExtensionSettingRequest;
    this.assertExtensionKey(extensionId, key);
    return { value: getSetting(key) };
  }

  /**
   * Phase 4 Task 16 — write an extension-scoped setting. Enforces the same
   * namespace rule as `handleGetSetting` so an extension cannot touch
   * another extension's (or Core's) keys.
   */
  handleSetSetting(params: unknown): { ok: true } {
    const { extensionId, key, value } = params as ExtensionSettingRequest;
    this.assertExtensionKey(extensionId, key);
    setSetting(key, value);
    return { ok: true };
  }

  /**
   * Phase 4 Task 6.3 — namespace guard for extension settings. The settings
   * service stores keys verbatim; this prevents an extension from reading
   * or writing a key outside its `<extensionId>.` prefix (e.g. salary-history
   * cannot set `tax.financialYearStart`). Throws on violation.
   */
  private assertExtensionKey(extensionId: string, key: string): void {
    if (!key.startsWith(`${extensionId}.`)) {
      throw new Error(
        `Setting key "${key}" is outside the extension's namespace "${extensionId}."`
      );
    }
  }

  /**
   * Phase 5 Task 7 — handle `domain.service.invoke` from the Host.
   *
   * Payload shape (Decision 5):
   *   `{ callerExtensionId, serviceName, method, params }`
   *
   * The registry routes by `serviceName` and dispatches to the most
   * recently registered implementation. `register` / `unregister` are
   * also sent through this method with `method` = `__register` /
   * `__unregister`.
   */
  handleDomainServiceInvoke(payload: unknown): unknown {
    if (!this.domainServiceRegistry) {
      throw new Error('ExtensionIPC.handleDomainServiceInvoke: DomainServiceRegistry not wired. Call setDomainServiceRegistry() first.');
    }
    const { callerExtensionId, serviceName, method, params } = payload as {
      callerExtensionId: string;
      serviceName: string;
      method: string;
      params: unknown;
    };

    if (method === '__register') {
      // The Host sends this when an extension calls `finance.services.register`.
      // We don't receive the impl on Main — the Host holds it. We just ack.
      return { registered: true };
    }
    if (method === '__unregister') {
      this.domainServiceRegistry.unregister(serviceName, callerExtensionId);
      return { unregistered: true };
    }

    return this.domainServiceRegistry.invoke(serviceName, method, params);
  }

  /**
   * Phase 4 Task 6.3 — handle `extension.readTable` from the Host.
   *
   * Payload shape (Decision 6):
   *   `{ extensionId: string, table: string, op: 'find' | 'findOne' | 'count', query: QueryObject }`
   *
   * Response envelope:
   *   - `find`    → `{ rows: object[] }`
   *   - `findOne` → `{ row: object | null }`
   *   - `count`   → `{ count: number }`
   *
   * The DAO service already serialises Date → ISO-8601 internally
   * (see Decision 3 `serializeRow` and the DAOService `find` path), so
   * the response is safe to send across the MessagePort without further
   * conversion. Typed DAO errors (`TableAccessDeniedError`,
   * `TableNotFoundError`, `ValidationFailedError`,
   * `SharedTableReadOnlyError`) propagate with their `code` field intact
   * so the Host-side bridge can map them to client-side error types.
   *
   * Exposed publicly for unit tests; production callers should send a
   * JSON-RPC request whose method is `RPC_METHOD.ExtensionReadTable`
   * and whose payload matches the shape above.
   */
  handleReadTable(params: unknown): unknown {
    if (!this.dao) {
      throw new Error('ExtensionIPC.handleReadTable: DAOService not wired. Call setDAOService() first.');
    }
    const { extensionId, table, op, query, options } = params as {
      extensionId: string;
      table: string;
      op: 'find' | 'findOne' | 'count';
      query?: QueryObject;
      options?: Record<string, unknown>;
    };
    const safeQuery: QueryObject = query ?? {};
    // Normalise operator envelope: callers send `$join`/`$orderBy`/`$limit`/`$offset`
    // (per Decision 4 / Task 6), DAO expects un-prefixed `join`/`orderBy`/`limit`/`offset`.
    const daoOptions: Record<string, unknown> = {};
    if (options) {
      if (options.$join) daoOptions.join = options.$join;
      if (options.$orderBy) daoOptions.orderBy = options.$orderBy;
      if (options.$limit !== undefined) daoOptions.limit = options.$limit;
      if (options.$offset !== undefined) daoOptions.offset = options.$offset;
    }
    switch (op) {
      case 'find':
        return { rows: this.dao.find(extensionId, table, safeQuery, daoOptions) };
      case 'findOne':
        return { row: this.dao.findOne(extensionId, table, safeQuery, daoOptions) };
      case 'count':
        return { count: this.dao.count(extensionId, table, safeQuery) };
      default:
        throw new Error(`ExtensionIPC.handleReadTable: unknown op '${op}'`);
    }
  }

  /**
   * Phase 4 Task 6.3 — handle `extension.writeTable` from the Host.
   *
   * Payload shape (Decision 6):
   *   - `insert`: `{ extensionId, table, op: 'insert', payload: object }`
   *   - `update`: `{ extensionId, table, op: 'update', payload: object, where: object }`
   *   - `delete`: `{ extensionId, table, op: 'delete', where: object }`
   *
   * Response envelope:
   *   - `insert` → `{ row: object, affected: 1 }`
   *   - `update` → `{ affected: number }`
   *   - `delete` → `{ affected: number }`
   *
   * Typed DAO errors propagate with their `code` field intact, same as
   * `handleReadTable`.
   */
  handleWriteTable(params: unknown): unknown {
    if (!this.dao) {
      throw new Error('ExtensionIPC.handleWriteTable: DAOService not wired. Call setDAOService() first.');
    }
    const { extensionId, table, op, payload, where } = params as {
      extensionId: string;
      table: string;
      op: 'insert' | 'update' | 'delete';
      payload?: Record<string, unknown>;
      where?: QueryObject;
    };
    switch (op) {
      case 'insert':
        return {
          row: this.dao.insert(extensionId, table, payload ?? {}),
          affected: 1
        };
      case 'update':
        return {
          affected: this.dao.update(extensionId, table, where ?? {}, payload ?? {})
        };
      case 'delete':
        return {
          affected: this.dao.delete(extensionId, table, where ?? {})
        };
      default:
        throw new Error(`ExtensionIPC.handleWriteTable: unknown op '${op}'`);
    }
  }

  /**
   * Phase 4 Task 6.3 — dispatch a JSON-RPC request received from the
   * Host to the appropriate DAO handler. Posts the response (success
   * envelope `{ result }` or typed-error envelope `{ error }`) back to
   * the Host over the same MessagePort.
   *
   * Error mapping (Decision 6 + Task 6.3 contract):
   *   - Typed DAO errors (`TableAccessDeniedError` / `TableNotFoundError` /
   *     `SharedTableReadOnlyError` / `ValidationFailedError`) carry a
   *     numeric `code` matching one of the JSON-RPC error codes defined
   *     in `shared/json-rpc.ts`. Forward `code` + `message` + `name`
   *     (as `data`) so the Host can reconstruct the typed error and
   *     surface it to extension code as the right class.
   *   - Unknown method → `MethodNotFound` (-32601).
   *   - Unhandled error → `InternalError` (-32603).
   *
   * Idempotent w.r.t. crashes: the Host re-spawns on next interaction
   * (see `ensureRunning`), so a request that races a crash returns a
   * `restart-failed` status notification rather than a response — the
   * Host's pending-request map rejects with the same error and the
   * extension sees a thrown rejection from its DAO call.
   */
  private async dispatchHostRequest(req: JsonRpcRequest): Promise<void> {
    if (!this.process) {
      return; // process gone; nothing to post to
    }
    try {
      let result: unknown;
      switch (req.method) {
        case RPC_METHOD.ExtensionReadTable:
          result = this.handleReadTable(req.params);
          break;
        case RPC_METHOD.ExtensionWriteTable:
          result = this.handleWriteTable(req.params);
          break;
        case RPC_METHOD.ExtensionUiMount:
          // Phase 4 Task 14 — extension wants the Renderer to mount a
          // custom element. Forward to Main's UI handler; respond ack.
          this.handleUiMount(req.params);
          result = { mounted: true };
          break;
        case RPC_METHOD.ExtensionGetSetting:
          result = this.handleGetSetting(req.params);
          break;
        case RPC_METHOD.ExtensionSetSetting:
          result = this.handleSetSetting(req.params);
          break;
        case RPC_METHOD.DomainServiceInvoke:
            result = await this.handleDomainServiceInvoke(req.params);
          break;
        case RPC_METHOD.ExtensionNavigatePanel:
          result = await this.handleNavigatePanel(req.params);
          break;
        case RPC_METHOD.ExtensionUiSetDirty:
          result = await this.handleUiSetDirty(req.params);
          break;
        case RPC_METHOD.ExtensionUiAutoSaveDraft:
          result = await this.handleUiAutoSaveDraft(req.params);
          break;
        default:
          this.process.postMessage({
            jsonrpc: '2.0',
            id: req.id,
            error: {
              code: RpcErrorCode.MethodNotFound,
              message: `Unknown method from Host: ${req.method}`
            }
          });
          return;
      }
      this.process.postMessage({ jsonrpc: '2.0', id: req.id, result });
    } catch (err) {
      // Typed DAO errors carry their own `code`; surface it as the JSON-RPC
      // error code so the Host can reconstruct the typed error class.
      const code =
        typeof (err as { code?: unknown }).code === 'number'
          ? (err as { code: number }).code
          : RpcErrorCode.InternalError;
      const message = err instanceof Error ? err.message : String(err);
      const data =
        err instanceof Error ? { name: err.name, message } : { message };
      this.process.postMessage({
        jsonrpc: '2.0',
        id: req.id,
        error: { code, message, data }
      });
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
      // Phase 4 Task 6.3: Main now receives requests FROM the Host for the
      // two Phase 4 RPC methods (`extension.readTable` / `extension.writeTable`).
      // The Host forwards extension DAO calls (origin: finance.db.table(...)
      // in extension code) to Main because the DB lives in Main. Dispatch
      // to the registered handler, then post the response (success or
      // typed-error envelope) back to the Host so the calling extension
      // receives its result. Any other method is a protocol violation
      // (Phase 3 had no Host→Main requests at all).
      void this.dispatchHostRequest(msg);
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
    // Notification — route by method.
    // [Fix] `host.log` is consumed by Main (mirrored to Renderer DevTools) and
    // is intentionally NOT forwarded to the generic `listeners` Set, which is
    // reserved for app-level notifications like `extension.activated`.
    if (typeof msg === 'object' && msg !== null && (msg as { method?: string }).method === 'host.log') {
      const params = (msg as { params: HostLogEntry }).params;
      if (params && (params.level === 'log' || params.level === 'error' || params.level === 'warn') && Array.isArray(params.args)) {
        this.emitLog({ level: params.level, args: params.args });
      }
      return;
    }
    // Notification — forward to listeners (used for `extension.activated` etc.).
    for (const listener of this.listeners) listener(msg);
  }
}
