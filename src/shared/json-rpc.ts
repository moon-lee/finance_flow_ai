/**
 * Minimal JSON-RPC 2.0 envelope types shared by Main and Extension Host.
 * Both processes import from this module; it is bundled into both builds.
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: number;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: number;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

// Standard JSON-RPC error codes plus a few platform-specific ones.
//
// Phase 4 Decision 6 adds four DAO-related codes. They follow the
// existing platform-error range (-32000..-32099) so they are visually
// distinguishable from the spec-defined JSON-RPC codes (-32700..-32603)
// and from the Phase 3 platform codes (-32001..-32003). The DAO service
// throws typed error classes (`TableNotFoundError`, `TableAccessDeniedError`,
// `ValidationFailedError`, `SharedTableReadOnlyError`) whose `code` field
// matches these constants; the IPC handler in `extension-ipc.ts` reads
// `err.code` and emits the matching `RpcErrorCode` over the wire.
export const RpcErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ExtensionNotFound: -32001,
  ExtensionAlreadyActivated: -32002,
  ActivationEventUnknown: -32003,
  // Phase 4 additions — see Decision 6 and src/main/services/dao-service.ts.
  TableNotFound: -32010,
  TableAccessDenied: -32011,
  ValidationFailed: -32012,
  SharedTableReadOnly: -32013
} as const;

let nextId = 1;
export function makeRequestId(): number {
  return nextId++;
}

export function isRequest(value: unknown): value is JsonRpcRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
    typeof (value as { id?: unknown }).id === 'number' &&
    typeof (value as { method?: unknown }).method === 'string'
  );
}

export function isNotification(value: unknown): value is JsonRpcNotification {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
    typeof (value as { method?: unknown }).method === 'string' &&
    (value as { id?: unknown }).id === undefined
  );
}
