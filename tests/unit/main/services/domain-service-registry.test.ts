import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DomainServiceRegistry } from '../../../../src/main/services/domain-service-registry';

describe('DomainServiceRegistry', () => {
  let registry: DomainServiceRegistry;

  beforeEach(() => {
    registry = new DomainServiceRegistry();
  });

  it('register() stores a service', async () => {
    const impl = { getSummary: vi.fn() };
    registry.register('pay', 'salary-history', impl);
    // invoke should not return null (service exists)
    const result = await registry.invoke('pay', 'getSummary', {});
    expect(result).not.toBeNull();
  });

  it('invoke() calls the registered service implementation', async () => {
    const impl = { getSummary: vi.fn().mockResolvedValue({ gross: 5000 }) };
    registry.register('pay', 'salary-history', impl);

    const result = await registry.invoke('pay', 'getSummary', { year: '2026' });

    expect(result).toEqual({ gross: 5000 });
    expect(impl.getSummary).toHaveBeenCalledWith('2026');
  });

  it('invoke() returns null when service not registered', async () => {
    const result = await registry.invoke('nonexistent', 'method', {});
    expect(result).toBeNull();
  });

  it('invoke() returns null when service throws an error', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const impl = { getSummary: vi.fn().mockRejectedValue(new Error('db failure')) };
    registry.register('pay', 'salary-history', impl);

    const result = await registry.invoke('pay', 'getSummary', {});

    expect(result).toBeNull();
    consoleSpy.mockRestore();
  });

  it('unregister() removes the service', async () => {
    const impl = { getSummary: vi.fn() };
    registry.register('pay', 'salary-history', impl);
    registry.unregister('pay', 'salary-history');

    const result = await registry.invoke('pay', 'getSummary', {});
    expect(result).toBeNull();
  });

  it('register() with same name from different extension: first-registered wins', async () => {
    const implA = { getSummary: vi.fn().mockResolvedValue('from-A') };
    const implB = { getSummary: vi.fn().mockResolvedValue('from-B') };
    registry.register('pay', 'ext-a', implA);
    registry.register('pay', 'ext-b', implB);

    const result = await registry.invoke('pay', 'getSummary', {});

    // First-registered wins: the registry uses Map.set which overwrites,
    // but invoke picks the first entry from the inner map.
    expect(result).toBe('from-A');
  });

  it('invoke() passes params correctly', async () => {
    const impl = { calculate: vi.fn().mockResolvedValue(42) };
    registry.register('tax', 'tax-ext', impl);

    const params = { income: 80000, deductions: 10000 };
    await registry.invoke('tax', 'calculate', params);

    expect(impl.calculate).toHaveBeenCalledWith(80000, 10000);
  });

  it('invoke() returns null on missing method', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const impl = { getSummary: vi.fn() };
    registry.register('pay', 'salary-history', impl);

    const result = await registry.invoke('pay', 'nonExistentMethod', {});

    expect(result).toBeNull();
    consoleSpy.mockRestore();
  });
});
