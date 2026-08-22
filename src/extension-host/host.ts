/**
 * Extension Host process entry point.
 *
 * Lifecycle:
 *   1. utilityProcess.fork spawns this file with the resolved dist path.
 *   2. Main sends `host.initialize` with the validated manifest list and
 *      a structured-clone MessagePort for future bidirectional RPC.
 *   3. We activate any extension whose `activationEvents` include `*`.
 *   4. We sit idle, handling RPC requests, until Main sends a shutdown
 *      notification or kills the process.
 *
 * Crash isolation: if this process dies, Main detects it via the
 * `utilityProcess` 'exit' event and surfaces a status-bar message. The
 * shell keeps running with extensions disabled.
 */

import { finance, createFinance } from './api/index';
import { getHostEventHandlers } from './api/events';
import { ExtensionLogger } from './api/logger';
import {
  isRequest,
  isNotification,
  makeRequestId,
  RpcErrorCode,
  type JsonRpcRequest,
  type JsonRpcNotification,
  type JsonRpcResponse
} from '../shared/json-rpc';
import { RPC_METHOD } from '../shared/json-rpc-methods';
import type { FinanceExtensionManifest } from '../types/finance';

declare const process: NodeJS.Process & {
  // Electron exposes the parent IPC channel here when launched via utilityProcess.fork.
  parentPort: {
    on(event: 'message', listener: (msg: unknown) => void): void;
    postMessage(message: unknown): void;
  } | null;
};

const parentPort = process.parentPort;
const _origLog = console.log.bind(console);
const _origError = console.error.bind(console);
const _origWarn = console.warn.bind(console);
const hostLogger = new ExtensionLogger('host', {
  log: _origLog,
  error: _origError,
  warn: _origWarn,
});

if (!parentPort) {
  // Defensive: this file must be launched via utilityProcess, not node directly.
  hostLogger.error('Extension Host must be launched via Electron utilityProcess.fork()');
  process.exit(1);
}

function forwardLog(level: 'log' | 'error' | 'warn', args: unknown[]): void {
  hostLogger[level === 'log' ? 'info' : level](...args);
}

console.log = (...args: unknown[]) => { _origLog(...args); forwardLog('log', args); };
console.error = (...args: unknown[]) => { _origError(...args); forwardLog('error', args); };
console.warn = (...args: unknown[]) => { _origWarn(...args); forwardLog('warn', args); };

interface ActiveExtension {
  manifest: FinanceExtensionManifest;
  moduleUrl?: string;
  // Cached at activation so the shutdown handler can call deactivate() without
  // re-loading the module. The bundled extension is ESM; require()-ing it
  // throws ERR_REQUIRE_ESM. See [Review fix §HOST-1].
  module?: {
    activate?: (finance: unknown) => unknown | Promise<unknown>;
    deactivate?: () => unknown | Promise<unknown>;
  };
}

const activeExtensions = new Map<string, ActiveExtension>();

/**
 * Phase 7 Task 10 — graceful shutdown state.
 *
 * `shuttingDown` is set when Main sends `host.shutdown`. While true:
 * - New JSON-RPC requests are rejected immediately with a shutting-down error.
 * - `handleNotification` waits for `activeRequestCount` to reach 0 before
 *   deactivating extensions and sending `host.shutdown.complete` back to Main.
 */
let shuttingDown = false;
let activeRequestCount = 0;

function waitForActiveRequests(): Promise<void> {
  return new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (activeRequestCount === 0) {
        clearInterval(interval);
        resolve();
      }
    }, 10);
  });
}

function handleHostEventNotify(notification: JsonRpcNotification): void {
  const { topic, payload } = notification.params as { topic: string; payload: unknown };
  const subscribers = getHostEventHandlers().get(topic);
  if (!subscribers) return;
  for (const handler of subscribers.values()) {
    try {
      handler(payload);
    } catch (err) {
      hostLogger.error(`[host] event handler threw for topic "${topic}":`, err);
    }
  }
}

/**
 * Phase 4 Task 6.4 — pending Host→Main RPC requests awaiting a response.
 *
 * The Host now sends JSON-RPC *requests* to Main (not just notifications)
 * for the two Phase 4 DAO methods (`extension.readTable` /
 * `extension.writeTable`). When extension code calls `finance.db.table(...).find()`
 * inside the Host, the Host's db accessor (Task 7) calls
 * `requestMain('extension.readTable', { extensionId, ... })` and waits for
 * the response. Correlation is by JSON-RPC `id`, exactly as Main's
 * `ExtensionIPC` correlates its own outgoing requests.
 *
 * Mirrors the pending-request map on the Main side (`extension-ipc.ts`).
 * Errors from Main arrive as JSON-RPC error responses and are surfaced
 * as `Error` with the original `message` + `code` so callers can
 * pattern-match the typed DAO error classes (Task 7 will reconstruct
 * them client-side).
 */
const pendingHostRequests = new Map<number, {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}>();

/**
 * Phase 4 Task 6.4 — send a JSON-RPC request from the Host to Main and
 * wait for the matching response. Returns the `result` field on success
 * or rejects with an `Error` whose message includes the JSON-RPC error
 * code on failure. This is the Host-side counterpart of
 * `ExtensionIPC.request()` on Main.
 */
function requestMain<T = unknown>(method: string, params?: unknown): Promise<T> {
  const id = makeRequestId();
  return new Promise<T>((resolve, reject) => {
    pendingHostRequests.set(id, { resolve: resolve as (v: unknown) => void, reject });
    parentPort!.postMessage({ jsonrpc: '2.0', id, method, params });
  });
}

function send(message: unknown): void {
  parentPort!.postMessage(message);
}

function respond(id: number, result: unknown): void {
  send({ jsonrpc: '2.0', id, result });
}

function respondError(id: number, code: number, message: string, data?: unknown): void {
  send({ jsonrpc: '2.0', id, error: { code, message, data } });
}

function notify(method: string, params: unknown): void {
  send({ jsonrpc: '2.0', method, params });
}

async function handleRequest(req: JsonRpcRequest): Promise<void> {
  if (shuttingDown) {
    respondError(req.id, RpcErrorCode.InternalError, 'Extension Host is shutting down');
    return;
  }
  activeRequestCount++;
  try {
    switch (req.method) {
      case 'host.initialize': {
        const manifests = (req.params as { manifests: FinanceExtensionManifest[] }).manifests;
        hostLogger.info(`[host] received host.initialize with ${manifests.length} manifests (id=${req.id})`);
        for (const manifest of manifests) {
          activeExtensions.set(manifest.id, { manifest });
        }
        // Activate any extension that requested immediate activation.
        for (const [id, ext] of activeExtensions) {
          if (ext.manifest.activationEvents.includes('*')) {
            await activateExtension(id, '*');
          }
        }
        // Phase 5 Task 10 — activate `onStartup` extensions in dependency order
        // so service providers (e.g. salary-history) are ready before
        // default-view extensions (e.g. dashboard) activate and query services.
        const startupManifests = Array.from(activeExtensions.values())
          .filter(ext => ext.manifest.activationEvents.includes('onStartup'))
          .map(ext => ext.manifest);
        const sorted = sortByDependencies(startupManifests);
        for (const manifest of sorted) {
          await activateExtension(manifest.id, 'onStartup');
        }
        respond(req.id, { accepted: manifests.length });
        hostLogger.info(`[host] responded to host.initialize (id=${req.id})`);
        return;
      }
      case 'extension.activate': {
        const { extensionId, reason } = req.params as { extensionId: string; reason: string };
        const activated = await activateExtension(extensionId, reason);
        respond(req.id, { activated });
        return;
      }
      case 'extension.list': {
        respond(req.id, {
          extensions: Array.from(activeExtensions.values()).map((ext) => ({
            id: ext.manifest.id,
            displayName: ext.manifest.displayName,
            version: ext.manifest.version,
            active: !!ext.moduleUrl,
            activationEvents: ext.manifest.activationEvents,
            contributions: ext.manifest.contributions
          }))
        });
        return;
      }
      case 'commands.registered': {
        // Acknowledgement from Main after we've notified of a new command.
        respond(req.id, { acknowledged: true });
        return;
      }
      case 'extension.executeCommand': {
        // [Review fix §2.3] Phase 3 stub: forward to the commands registry
        // so the IPC channel is observable end-to-end. Phase 5 will swap
        // this for real execution semantics; the envelope stays the same.
        //
        // [Review observation #2 — post-review] Use the `finance.commands.execute`
        // aggregate rather than the lower-level `executeCommand` import from
        // `./api/commands`. This keeps the Host exercising the same API surface
        // extensions call, so there's exactly one canonical path. Phase 5's
        // real execution replaces this method without touching the call site.
        const { commandId, args } = req.params as { commandId: string; args: unknown[] };
        const result = await finance.commands.execute(commandId, ...args);
        respond(req.id, { executed: result !== null, result });
        return;
      }
      case RPC_METHOD.ExtensionReadTable:
      case RPC_METHOD.ExtensionWriteTable: {
        // Phase 4 Task 6.4 — proxy the DAO call to Main. The DB lives in
        // Main, so any extension → Host DAO call must hop the IPC boundary
        // to reach the DAOService. The Host forwards the request verbatim;
        // the response envelope (`{ rows }` / `{ row }` / `{ count }` /
        // `{ row, affected }` / `{ affected }`) is returned as-is to the
        // extension. Errors from Main arrive as JSON-RPC error envelopes
        // and are re-thrown here so the extension's caller sees the typed
        // DAO error code (Task 7's db accessor reconstructs the class).
        const result = await requestMain<unknown>(req.method, req.params);
        respond(req.id, result);
        return;
      }
      case RPC_METHOD.DomainServiceInvoke: {
        const result = await requestMain<unknown>(req.method, req.params);
        respond(req.id, result);
        return;
      }
      case RPC_METHOD.ExtensionNavigatePanel: {
        const result = await requestMain<unknown>(req.method, req.params);
        respond(req.id, result);
        return;
      }
      default:
        respondError(req.id, RpcErrorCode.MethodNotFound, `Unknown method: ${req.method}`);
    }
  } catch (err) {
    respondError(
      req.id,
      RpcErrorCode.InternalError,
      err instanceof Error ? err.message : String(err)
    );
  } finally {
    activeRequestCount--;
  }
}

// Phase 5 Task 10 — topological sort so dependent extensions activate
// after their dependencies. Cycles are broken by original order.
//
// Phase 5 uses manifest.dependencies (Option A) — dashboard lists
// salary-history as a dependency so the pay service is registered
// before Dashboard's buildAggregator queries it.
//
// Future (Phase 8+): if many extensions provide/consume domain services,
// consider Option B: a service-provider-first sort keyed on a manifest
// field like contributes.domainServices. Split manifests into providers
// (has domainServices) vs consumers (none), topo-sort each group, and
// return [...providers, ...consumers].
function sortByDependencies(manifests: FinanceExtensionManifest[]): FinanceExtensionManifest[] {
  const byId = new Map(manifests.map(m => [m.id, m]));
  const visited = new Set<string>();
  const sorted: FinanceExtensionManifest[] = [];

  function visit(manifest: FinanceExtensionManifest): void {
    if (visited.has(manifest.id)) return;
    visited.add(manifest.id);
    for (const dep of manifest.dependencies ?? []) {
      const depManifest = byId.get(dep);
      if (depManifest) visit(depManifest);
    }
    sorted.push(manifest);
  }

  for (const manifest of manifests) visit(manifest);
  return sorted;
}

async function activateExtension(extensionId: string, reason: string): Promise<boolean> {
  hostLogger.info('[host] activateExtension called', { extensionId, reason });
  const ext = activeExtensions.get(extensionId);
  if (!ext) {
    hostLogger.error(`[host] activate: extension "${extensionId}" not found`);
    return false;
  }
  if (ext.moduleUrl) {
    hostLogger.info('[host] activate: extension already active', { extensionId });
    return true; // already active
  }
  if (!ext.manifest.activationEvents.some((evt) => evt === '*' || evt === reason)) {
    hostLogger.warn(
      `[host] activate: extension "${extensionId}" has no activation event matching "${reason}"`
    );
    return false;
  }

  hostLogger.info('[host] activate: loading bundle for', extensionId);
  try {
    const path = await import('node:path');
    const url = await import('node:url');

    const extensionsBundleRoot = path.resolve(
      path.dirname(url.fileURLToPath(import.meta.url)),
      '..',
      'extensions'
    );
    const entryPath = path.join(extensionsBundleRoot, `${extensionId}.js`);

    hostLogger.info('[host] activate: importing bundle from', entryPath);
    const extModule = await import(url.pathToFileURL(entryPath).href);
    if (typeof extModule?.activate === 'function') {
      const perExtensionFinance = createFinance(extensionId, {
        request: <T>(method: string, params?: unknown): Promise<T> =>
          requestMain<T>(method, params),
        notify: (method: string, params?: unknown): void =>
          notify(method, params)
      });
      hostLogger.info('[host] activate: calling extModule.activate for', extensionId);
      await extModule.activate(perExtensionFinance);
      hostLogger.info('[host] activate: extModule.activate returned for', extensionId);
    }
    ext.moduleUrl = entryPath;
    ext.module = extModule;
    notify('extension.activated', { extensionId, reason });
    hostLogger.info('[host] activated', { extensionId, reason });
    return true;
  } catch (err) {
    hostLogger.error(`[host] failed to activate "${extensionId}":`, err);
    return false;
  }
}

// [Follow-up §3.10] Extension Host deactivation hook cleanup
async function handleNotification(notification: JsonRpcNotification): Promise<void> {
  if (notification.method === 'event.notify') {
    handleHostEventNotify(notification);
    return;
  }
  if (notification.method === 'extension.ui-event') {
    // Phase 4 Task 14 (Decision 12) — a mounted extension element (running
    // in the Renderer) pushed a component-emitted event back to us. The
    // salary-history extension does not yet subscribe to these (Task 12
    // has no active ui-event listeners), so for now we observe them. The
    // `salary-history:open-view` style subscriptions will consume this
    // channel once the back-channel is wired in a later task.
    hostLogger.info('[host] ui-event received:', JSON.stringify(notification.params));
    return;
  }
  if (notification.method === RPC_METHOD.HostShutdown) {
    hostLogger.info('[host] shutdown request received, draining requests...');
    shuttingDown = true;

    // Wait for any in-flight JSON-RPC requests to complete before tearing
    // down extensions. New requests arriving after this point are rejected
    // immediately by `handleRequest`.
    await waitForActiveRequests();

      hostLogger.info('[host] requests drained, deactivating extensions...');
    for (const [id, ext] of activeExtensions) {
      if (ext.module && typeof ext.module.deactivate === 'function') {
        try {
          await ext.module.deactivate();
        } catch (err) {
          hostLogger.error(`[host] failed to deactivate "${id}":`, err);
        }
      }
    }

    // Acknowledge to Main so it can stop waiting and let the process exit
    // naturally instead of hard-killing it.
    notify(RPC_METHOD.HostShutdownComplete, {});
    process.exit(0);
  }
}

parentPort.on('message', (event: { data: unknown; ports?: unknown[] }) => {
  // Electron's `process.parentPort.on('message', ...)` delivers a MessageEvent-
  // like envelope `{ data, ports }`. The actual JSON-RPC payload is at
  // `event.data`. Main's side (`utilityProcess.on('message', ...)`) receives
  // the unwrapped message directly — that asymmetry is why `host.ready`
  // appeared to work but `host.initialize` did not.
  const msg = event.data;
  // Suppress the verbose log for routine Host→Main responses (Phase 4
  // Task 6.4): the proxy handlers fire `requestMain` for every DAO call,
  // which would flood the terminal with `[host] msg received: {"id":...}`
  // entries that don't aid debugging. Requests and notifications log a
  // method-only breadcrumb (never the full payload — `host.initialize`
  // alone carries every manifest and would otherwise dump hundreds of
  // lines; the concise count line in the handler covers that case).
  if (typeof msg === 'object' && msg !== null && 'id' in (msg as object) && !('method' in (msg as object))) {
    const response = msg as JsonRpcResponse;
    const pending = pendingHostRequests.get(response.id);
    if (pending) {
      pendingHostRequests.delete(response.id);
      if ('error' in response) {
        const data = response.error.data as { name?: string } | undefined;
        const err = new Error(`${response.error.message} (code ${response.error.code})`);
        err.name = data?.name ?? 'Error';
        pending.reject(err);
      } else {
        pending.resolve(response.result);
      }
    }
    return;
  }

  if (isRequest(msg)) {
    void handleRequest(msg);
  } else if (isNotification(msg)) {
    void handleNotification(msg);
  }
});

// Signal readiness so Main can send the manifest list.
notify('host.ready', { pid: process.pid, requestId: makeRequestId() });

hostLogger.info(`[host] Extension Host process started (pid ${process.pid})`);
