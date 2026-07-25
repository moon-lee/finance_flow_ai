export interface DomainServiceImpl {
  [method: string]: (...args: unknown[]) => Promise<unknown> | unknown;
}

export class DomainServiceRegistry {
  private readonly registry = new Map<string, Map<string, DomainServiceImpl>>();

  register(serviceName: string, extensionId: string, impl: DomainServiceImpl): void {
    let inner = this.registry.get(serviceName);
    if (!inner) {
      inner = new Map();
      this.registry.set(serviceName, inner);
    }
    inner.set(extensionId, impl);
  }

  unregister(serviceName: string, extensionId: string): void {
    const inner = this.registry.get(serviceName);
    if (!inner) return;
    inner.delete(extensionId);
    if (inner.size === 0) {
      this.registry.delete(serviceName);
    }
  }

  async invoke(serviceName: string, method: string, params: unknown): Promise<unknown> {
    const inner = this.registry.get(serviceName);
    if (!inner || inner.size === 0) {
      console.warn('[services] service not found:', serviceName);
      return null;
    }
    const [, impl] = Array.from(inner.entries())[0];
    try {
      const fn = impl[method];
      if (typeof fn !== 'function') {
        throw new Error(`method "${method}" not found on service "${serviceName}"`);
      }
      const args =
        params === undefined || params === null
          ? []
          : Array.isArray(params)
            ? params
            : Object.values(params as object);
      return await fn(...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[services] service errored:', serviceName, message);
      return null;
    }
  }
}
