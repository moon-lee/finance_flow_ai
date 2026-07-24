import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createServices } from '../../../../src/extension-host/api/services';
import { RPC_METHOD } from '../../../../src/shared/json-rpc-methods';

function makeMockRpc() {
  const calls: Array<{ method: string; params: unknown }> = [];
  return {
    calls,
    async request<T = unknown>(method: string, params?: unknown): Promise<T> {
      calls.push({ method, params });
      return undefined as T;
    }
  };
}

describe('Finance.services Host proxy', () => {
  let rpc: ReturnType<typeof makeMockRpc>;
  let services: ReturnType<typeof createServices>;

  beforeEach(() => {
    rpc = makeMockRpc();
    services = createServices('salary-history', rpc);
  });

  it('invoke() sends correct RPC method name', async () => {
    await services.invoke('pay', 'getSummary', { year: '2026' });

    expect(rpc.calls).toHaveLength(1);
    expect(rpc.calls[0].method).toBe(RPC_METHOD.DomainServiceInvoke);
  });

  it('register() sends correct RPC with service name', async () => {
    services.register('pay', { getSummary: vi.fn() });

    expect(rpc.calls).toHaveLength(1);
    expect(rpc.calls[0].method).toBe(RPC_METHOD.DomainServiceInvoke);
    expect(rpc.calls[0].params).toMatchObject({
      extensionId: 'salary-history',
      serviceName: 'pay',
      method: '__register'
    });
  });

  it('unregister() sends correct RPC', async () => {
    services.unregister('pay');

    expect(rpc.calls).toHaveLength(1);
    expect(rpc.calls[0].method).toBe(RPC_METHOD.DomainServiceInvoke);
    expect(rpc.calls[0].params).toMatchObject({
      extensionId: 'salary-history',
      serviceName: 'pay',
      method: '__unregister'
    });
  });

  it('invoke() returns the response from RPC', async () => {
    rpc = makeMockRpc();
    const mockRpc: typeof rpc = {
      calls: rpc.calls,
      async request<T = unknown>(method: string, params?: unknown): Promise<T> {
        rpc.calls.push({ method, params });
        return { gross: 5000 } as T;
      }
    };
    services = createServices('salary-history', mockRpc);

    const result = await services.invoke<{ gross: number }>('pay', 'getSummary');

    expect(result).toEqual({ gross: 5000 });
  });
});
