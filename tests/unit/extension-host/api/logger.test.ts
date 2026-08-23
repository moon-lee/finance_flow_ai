import { describe, expect, it, vi } from 'vitest';
import { ExtensionLogger } from '../../../../src/extension-host/api/logger';

const originalParentPort = (process as any).parentPort;

describe('ExtensionLogger', () => {
  it('logs to console with context prefix', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new ExtensionLogger('salary-history');
    logger.info('activate');
    expect(spy).toHaveBeenCalledTimes(1);
    const [message] = spy.mock.calls[0];
    expect(message).toContain('[salary-history]');
    expect(message).toContain('activate');
    spy.mockRestore();
  });

  it('forwards logs via parentPort when available', () => {
    const postMessage = vi.fn();
    (process as any).parentPort = { postMessage };
    const logger = new ExtensionLogger('salary-history', {
      log: () => {},
      error: () => {},
      warn: () => {},
    } as any);
    logger.info('host event', { payload: 1 });
    expect(postMessage).toHaveBeenCalledTimes(1);
    (process as any).parentPort = originalParentPort;
  });

  it('does not throw when parentPort is unavailable', () => {
    (process as any).parentPort = null;
    const logger = new ExtensionLogger('salary-history', {
      log: () => {},
      error: () => {},
      warn: () => {},
    } as any);
    expect(() => logger.info('no parentPort')).not.toThrow();
    (process as any).parentPort = originalParentPort;
  });
});
