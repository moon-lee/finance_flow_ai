import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../../src/main/services/event-bus';

describe('EventBus', () => {
  it('publishes to subscribers', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe('test', handler, 'renderer');
    bus.publish('test', { hello: 'world' });
    expect(handler).toHaveBeenCalledWith({ hello: 'world' });
  });

  it('excludes source when requested', () => {
    const bus = new EventBus();
    const rendererHandler = vi.fn();
    const hostHandler = vi.fn();
    bus.subscribe('test', rendererHandler, 'renderer');
    bus.subscribe('test', hostHandler, 'host');
    bus.publish('test', { hello: 'world' }, 'renderer');
    expect(rendererHandler).not.toHaveBeenCalled();
    expect(hostHandler).toHaveBeenCalledWith({ hello: 'world' });
  });

  it('unsubscribe removes handler', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.subscribe('test', handler, 'renderer');
    unsub();
    bus.publish('test', { hello: 'world' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('hasSubscribers returns false when empty', () => {
    const bus = new EventBus();
    expect(bus.hasSubscribers('test')).toBe(false);
  });

  it('hasSubscribers returns true when subscribed', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe('test', handler, 'renderer');
    expect(bus.hasSubscribers('test')).toBe(true);
  });

  it('multiple handlers on same topic all fire', () => {
    const bus = new EventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bus.subscribe('test', handler1, 'renderer');
    bus.subscribe('test', handler2, 'host');
    bus.publish('test', { hello: 'world' });
    expect(handler1).toHaveBeenCalledWith({ hello: 'world' });
    expect(handler2).toHaveBeenCalledWith({ hello: 'world' });
  });
});
