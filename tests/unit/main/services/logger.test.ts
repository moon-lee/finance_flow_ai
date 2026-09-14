import { describe, expect, it, vi } from 'vitest';
import { LoggerImpl, createLogger, type LogPayload } from '../../../../src/main/services/logger';

function createBus() {
  const handler = vi.fn<(payload: unknown) => void>();
  const subs = new Map<string, Array<(payload: unknown) => void>>();
  return {
    subscribe(_topic: string, fn: (payload: unknown) => void) {
      const list = subs.get(_topic) ?? [];
      list.push(fn);
      subs.set(_topic, list);
      return () => {
        const current = subs.get(_topic) ?? [];
        subs.set(_topic, current.filter((h) => h !== fn));
      };
    },
    publish(topic: string, payload: unknown) {
      for (const fn of subs.get(topic) ?? []) fn(payload);
    },
    handler,
  };
}

describe('LoggerImpl', () => {
  it('does not publish below minLevel', () => {
    const bus = createBus();
    const logger = new LoggerImpl(null, 'warn');
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info('should be hidden');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('publishes info to event bus with correct payload', () => {
    const bus = createBus();
    const logger = new LoggerImpl(bus as any, 'info');
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info('hello world', 'renderer');
    expect(spy).toHaveBeenCalledTimes(1);
    const [message] = spy.mock.calls[0];
    expect(message).toContain('[renderer]');
    expect(message).toContain('hello world');
    bus.handler(expect.objectContaining({ level: 'info', message: 'hello world', context: 'renderer' } as LogPayload));
  });

  it('maps error level to error log', () => {
    const bus = createBus();
    const logger = new LoggerImpl(bus as any, 'info');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    logger.error('failed', err);
    expect(spy).toHaveBeenCalledTimes(1);
    const [message, secondArg] = spy.mock.calls[0];
    expect(message).toContain('failed');
    expect(secondArg).toBe(err);
  });

  it('defaults context to main when not provided', () => {
    const bus = createBus();
    const logger = new LoggerImpl(bus as any, 'info');
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.log('plain message');
    const calls = spy.mock.calls.filter(([msg]) => (msg as string).includes('plain message'));
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect((calls[0][0] as string)).toContain('plain message');
  });

  it('includes caller file and line in payload', () => {
    const bus = createBus();
    const logger = new LoggerImpl(bus as any, 'info');
    const payloads: LogPayload[] = [];
    bus.subscribe('log.info', (p) => payloads.push(p as LogPayload));
    logger.info('with caller');
    expect(payloads[0].file).toBeTruthy();
    expect(typeof payloads[0].line).toBe('number');
  });

  it('appends file:line suffix to console output', () => {
    const bus = createBus();
    const logger = new LoggerImpl(bus as any, 'info');
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info('with caller');
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/:(\d+)$/),
      '',
    );
    spy.mockRestore();
  });

  it('emits canonical line with timestamp + level and publishes preserved fields', () => {
    const published: Array<{ topic: string; payload: unknown }> = [];
    const fakeBus = { publish: (t: string, p: unknown) => { published.push({ topic: t, payload: p }); } };
    const logger = new LoggerImpl(fakeBus as never, 'debug');
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info('hello', 'myctx');
    expect(spy).toHaveBeenCalledTimes(1);
    const [line] = spy.mock.calls[0];
    expect(line as string).toMatch(/\d{4}-\d{2}-\d{2}T.*\[INFO\].*\[myctx\].*hello/);
    spy.mockRestore();
    expect(published.length).toBe(1);
    expect(published[0].topic).toBe('log.info');
    const p = published[0].payload as Record<string, unknown>;
    expect(p.message).toBe('hello');
    expect(p.context).toBe('myctx');
    expect(typeof p.timestamp).toBe('number');
  });
});
