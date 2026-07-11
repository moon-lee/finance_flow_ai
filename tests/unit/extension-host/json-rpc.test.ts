import { describe, it, expect } from 'vitest';
import {
  isRequest,
  isNotification,
  makeRequestId,
  RpcErrorCode
} from '../../../src/shared/json-rpc';

describe('JSON-RPC envelopes', () => {
  it('isRequest accepts a valid request', () => {
    expect(isRequest({ jsonrpc: '2.0', id: 1, method: 'host.initialize' })).toBe(true);
  });

  it('isRequest rejects a notification (no id)', () => {
    expect(isRequest({ jsonrpc: '2.0', method: 'host.ready' })).toBe(false);
  });

  it('isRequest rejects a response', () => {
    expect(isRequest({ jsonrpc: '2.0', id: 1, result: {} })).toBe(false);
  });

  it('isRequest rejects non-objects', () => {
    expect(isRequest('hello')).toBe(false);
    expect(isRequest(null)).toBe(false);
    expect(isRequest(undefined)).toBe(false);
  });

  it('isNotification accepts a notification', () => {
    expect(isNotification({ jsonrpc: '2.0', method: 'host.ready' })).toBe(true);
  });

  it('isNotification rejects a request', () => {
    expect(isNotification({ jsonrpc: '2.0', id: 1, method: 'foo' })).toBe(false);
  });

  it('makeRequestId produces unique increasing ids', () => {
    const a = makeRequestId();
    const b = makeRequestId();
    const c = makeRequestId();
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

// Phase 4 Decision 6: extensions reach the DAO through two new RPC methods
// (`extension.readTable` / `extension.writeTable`). Four typed errors map to
// the DAO's error classes (TableNotFoundError / TableAccessDeniedError /
// ValidationFailedError / SharedTableReadOnlyError) so the Host's finance.db
// surface can distinguish them in client-side error handling.
describe('RPC error codes (Phase 4 DAO additions)', () => {
  it('TableNotFound is -32010', () => {
    // Maps to `TableNotFoundError` in src/main/services/dao-service.ts.
    expect(RpcErrorCode.TableNotFound).toBe(-32010);
  });

  it('TableAccessDenied is -32011', () => {
    // Maps to `TableAccessDeniedError` (caller extension does not own the
    // table AND it is not on the Shared Financial Data allowlist).
    expect(RpcErrorCode.TableAccessDenied).toBe(-32011);
  });

  it('ValidationFailed is -32012', () => {
    // Maps to `ValidationFailedError` (Zod rejected the payload against the
    // table's generated insert/update schema).
    expect(RpcErrorCode.ValidationFailed).toBe(-32012);
  });

  it('SharedTableReadOnly is -32013', () => {
    // Maps to `SharedTableReadOnlyError` (extension tried to write a
    // platform-owned table on the Shared Financial Data allowlist).
    expect(RpcErrorCode.SharedTableReadOnly).toBe(-32013);
  });
});
