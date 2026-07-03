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

import { finance } from './api/index';
import {
  isRequest,
  isNotification,
  makeRequestId,
  RpcErrorCode,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcNotification
} from '../shared/json-rpc';
import type { FinanceExtensionManifest } from '../types/finance';

declare const process: NodeJS.Process & {
  // Electron exposes the parent IPC channel here when launched via utilityProcess.fork.
  parentPort: {
    on(event: 'message', listener: (msg: unknown) => void): void;
    postMessage(message: unknown): void;
  } | null;
};

const parentPort = process.parentPort;
if (!parentPort) {
  // Defensive: this file must be launched via utilityProcess, not node directly.
  console.error('Extension Host must be launched via Electron utilityProcess.fork()');
  process.exit(1);
}

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
const pendingRequests = new Map<number, (response: JsonRpcResponse) => void>();

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
  try {
    switch (req.method) {
      case 'host.initialize': {
        const manifests = (req.params as { manifests: FinanceExtensionManifest[] }).manifests;
        for (const manifest of manifests) {
          activeExtensions.set(manifest.id, { manifest });
        }
        // Activate any extension that requested immediate activation.
        for (const [id, ext] of activeExtensions) {
          if (ext.manifest.activationEvents.includes('*')) {
            await activateExtension(id, '*');
          }
        }
        respond(req.id, { accepted: manifests.length });
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
      default:
        respondError(req.id, RpcErrorCode.MethodNotFound, `Unknown method: ${req.method}`);
    }
  } catch (err) {
    respondError(
      req.id,
      RpcErrorCode.InternalError,
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function activateExtension(extensionId: string, reason: string): Promise<boolean> {
  const ext = activeExtensions.get(extensionId);
  if (!ext) {
    console.error(`[host] activate: extension "${extensionId}" not found`);
    return false;
  }
  if (ext.moduleUrl) {
    return true; // already active
  }
  if (!ext.manifest.activationEvents.some((evt) => evt === '*' || evt === reason)) {
    console.warn(
      `[host] activate: extension "${extensionId}" has no activation event matching "${reason}"`
    );
    return false;
  }

  // [Review fix §4.1] Load the bundled extension entry from `dist/extensions/<id>.js`
  // rather than from the `extensions/` source tree. Per Decision 10 + ADR-0004,
  // extension authors write TypeScript in `extensions/<id>/src/main.ts` and the
  // build pipeline (`vite.extensions.config.ts`) produces ESM bundles in
  // `dist/extensions/`. The Host bundle lives at `dist/extension-host/host.js`,
  // so `../extensions` resolves to the project-root-relative `dist/extensions/`.
  // We use a dynamic `import()` (ESM) rather than `createRequire` because the
  // bundle is an ESM module and `require()` cannot load ESM synchronously.
  try {
    const path = await import('node:path');
    const url = await import('node:url');

    const extensionsBundleRoot = path.resolve(
      path.dirname(url.fileURLToPath(import.meta.url)),
      '..',
      'extensions'
    );
    const entryPath = path.join(extensionsBundleRoot, `${extensionId}.js`);

    const extModule = await import(url.pathToFileURL(entryPath).href);
    if (typeof extModule?.activate === 'function') {
      await extModule.activate(finance);
    }
    // Cache both the on-disk path AND the live module reference so the
    // shutdown handler can call deactivate() without re-loading (require() of
    // an ESM bundle throws ERR_REQUIRE_ESM). See [Review fix §HOST-1].
    ext.moduleUrl = entryPath;
    ext.module = extModule;
    notify('extension.activated', { extensionId, reason });
    console.log(`[host] activated "${extensionId}" via "${reason}" (loaded from ${entryPath})`);
    return true;
  } catch (err) {
    console.error(`[host] failed to activate "${extensionId}":`, err);
    return false;
  }
}

// [Follow-up §3.10] Extension Host deactivation hook cleanup
async function handleNotification(notification: JsonRpcNotification): Promise<void> {
  if (notification.method === 'host.shutdown') {
    console.log('[host] shutdown request received, deactivating extensions...');
    for (const [id, ext] of activeExtensions) {
      // Reuse the module reference cached at activation; do NOT re-load via
      // require() — the bundle is ESM and require() will throw ERR_REQUIRE_ESM.
      // See [Review fix §HOST-1].
      if (ext.module && typeof ext.module.deactivate === 'function') {
        try {
          await ext.module.deactivate();
        } catch (err) {
          console.error(`[host] failed to deactivate "${id}":`, err);
        }
      }
    }
    process.exit(0);
  }
}

parentPort.on('message', (msg: unknown) => {
  if (isRequest(msg)) {
    void handleRequest(msg);
  } else if (isNotification(msg)) {
    void handleNotification(msg);
  }
});

// Signal readiness so Main can send the manifest list.
notify('host.ready', { pid: process.pid, requestId: makeRequestId() });

console.log(`[host] Extension Host process started (pid ${process.pid})`);
