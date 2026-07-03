import { describe, it, expect } from 'vitest';
import { isRequest, isNotification, makeRequestId } from '../../../src/shared/json-rpc';

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
