import { RPC_METHOD } from '../../shared/json-rpc-methods';
import type { DomainServiceImpl } from '../../main/services/domain-service-registry';

export interface ServicesApi {
  register(serviceName: string, impl: DomainServiceImpl): void;
  unregister(serviceName: string): void;
  invoke<T = unknown>(serviceName: string, method: string, params?: unknown): Promise<T | null>;
}

const registered = new Map<string, DomainServiceImpl>();

export function createServices(extensionId: string, rpc: {
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
}): ServicesApi {
  return {
    register(serviceName: string, impl: DomainServiceImpl): void {
      registered.set(serviceName, impl);
      rpc.request(RPC_METHOD.DomainServiceInvoke, { extensionId, serviceName, method: '__register', params: {} });
    },
    unregister(serviceName: string): void {
      registered.delete(serviceName);
      rpc.request(RPC_METHOD.DomainServiceInvoke, { extensionId, serviceName, method: '__unregister', params: {} });
    },
    async invoke<T = unknown>(serviceName: string, method: string, params?: unknown): Promise<T | null> {
      if (method === '__register' || method === '__unregister') {
        throw new Error('invalid internal method');
      }
      const impl = registered.get(serviceName);
      if (impl) {
        const fn = impl[method];
        if (typeof fn === 'function') {
          return fn(params) as Promise<T | null>;
        }
        return null;
      }
      return rpc.request<T | null>(RPC_METHOD.DomainServiceInvoke, { extensionId, serviceName, method, params });
    }
  };
}

export function _clearServiceRegistryForTests(): void {
  registered.clear();
}
