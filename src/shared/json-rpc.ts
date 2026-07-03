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
export const RpcErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ExtensionNotFound: -32001,
  ExtensionAlreadyActivated: -32002,
  ActivationEventUnknown: -32003
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
