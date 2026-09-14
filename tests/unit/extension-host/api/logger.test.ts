import { describe, expect, it, vi } from 'vitest';
import { ExtensionLogger } from '../../../../src/extension-host/api/logger';

const originalParentPort = (process as any).parentPort;

describe('ExtensionLogger', () => {
  it('logs to console with context prefix', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
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

  it('keeps info and debug distinct with timestamp and context', () => {
    const posted: unknown[] = [];
    (process as any).parentPort = { postMessage: (m: unknown) => { posted.push(m); } };
    const logger = new ExtensionLogger('salary-history', {
      log: () => {},
      error: () => {},
      warn: () => {},
    } as any);
    logger.setMinLevel('debug');
    logger.info('hello');
    logger.debug('dbg');
    expect(posted.length).toBe(2);
    const p0 = (posted[0] as { params: Record<string, unknown> }).params;
    const p1 = (posted[1] as { params: Record<string, unknown> }).params;
    expect(p0.level).toBe('info');
    expect(p1.level).toBe('debug');
    expect(p0.context).toBe('salary-history');
    expect(typeof p0.timestamp).toBe('number');
    (process as any).parentPort = originalParentPort;
  });
});
