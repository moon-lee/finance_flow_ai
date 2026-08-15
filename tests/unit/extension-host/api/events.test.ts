import { describe, expect, it, vi } from 'vitest';
import { createEvents, getHostEventHandlers } from '../../../../src/extension-host/api/events';
import type { RpcClient } from '../../../../src/extension-host/api/ui';

function makeRpc(overrides: Partial<RpcClient> = {}): RpcClient {
  return {
    request: vi.fn().mockResolvedValue({ published: true }),
    notify: vi.fn(),
    ...overrides
  };
}

describe('createEvents', () => {
  it('registers handler and delivers events via hostEventHandlers', () => {
    const handlers: unknown[] = [];
    const rpc = makeRpc();

    const events = createEvents('salary-history', rpc);
    const unsub = events.on('account:created', (payload) => {
      handlers.push(payload);
    });

    const topicMap = getHostEventHandlers().get('account:created');
    expect(topicMap?.get('salary-history')).toBeDefined();

    topicMap?.get('salary-history')?.({ id: 1, name: 'Savings' });
    expect(handlers).toEqual([{ id: 1, name: 'Savings' }]);

    unsub();
    expect(getHostEventHandlers().get('account:created')?.get('salary-history')).toBeUndefined();
  });

  it('emit calls rpc.request with EventPublish', async () => {
    const rpc = makeRpc();

    const events = createEvents('salary-history', rpc);
    await events.emit('account:created', { id: 1 });

    expect(rpc.request).toHaveBeenCalledWith('event.publish', {
      extensionId: 'salary-history',
      topic: 'account:created',
      payload: { id: 1 }
    });
  });

  it('off removes handler without affecting other extensions on same topic', () => {
    const rpc = makeRpc();

    const eventsA = createEvents('salary-history', rpc);
    const eventsB = createEvents('dashboard', rpc);

    eventsA.on('test', () => {});
    eventsB.on('test', () => {});

    expect(getHostEventHandlers().get('test')?.size).toBe(2);

    const unsubA = eventsA.on('test', () => {});
    unsubA();

    expect(getHostEventHandlers().get('test')?.size).toBe(1);
    expect(getHostEventHandlers().get('test')?.get('dashboard')).toBeDefined();
  });
});
