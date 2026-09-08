/**
 * Todo auto-refresh (Option A) — dashboard subscribes to `db-changed`,
 * filters to todo tables, debounces, rebuilds, and silent-pushes.
 *
 * Uses fake timers to cover the debounce without real waiting.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { activate, deactivate } from '../../../../extensions/dashboard/src/main';

function makeHostFinance(overrides: {
  todoCounts?: unknown;
  ytdSummary?: unknown;
  payslipStats?: unknown;
} = {}) {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  return {
    finance: {
      db: {
        table: vi.fn().mockReturnValue({ find: vi.fn().mockResolvedValue([]) })
      },
      commands: { registerCommand: vi.fn(), execute: vi.fn().mockResolvedValue(null) },
      ai: { registerTool: vi.fn() },
      services: {
        register: vi.fn(),
        unregister: vi.fn(),
        invoke: vi.fn().mockImplementation(async (serviceName: string, method: string) => {
          if (serviceName === 'todo-list' && method === 'counts') return overrides.todoCounts ?? { total: 5, active: 2, done: 3 };
          if (serviceName === 'pay' && method === 'getYearToDateSummary') return overrides.ytdSummary ?? null;
          if (serviceName === 'pay' && method === 'getPayslipStats') return overrides.payslipStats ?? null;
          return null;
        })
      },
      ui: { requestMount: vi.fn(), pushData: vi.fn() },
      events: {
        on: vi.fn().mockImplementation((topic: string, handler: (payload: unknown) => void) => {
          if (!handlers.has(topic)) handlers.set(topic, new Set());
          handlers.get(topic)!.add(handler);
          return () => { handlers.get(topic)?.delete(handler); };
        }),
        off: vi.fn(),
        emit: vi.fn()
      },
      settings: { get: vi.fn().mockResolvedValue(undefined), set: vi.fn().mockResolvedValue(undefined) }
    } as unknown as import('finance').FinanceApi,
    handlers
  };
}

describe('Dashboard todo auto-refresh (Option A)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    deactivate();
  });

  it('subscribes to db-changed on activate (Host context)', async () => {
    const { finance } = makeHostFinance();
    await activate(finance);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((finance.events as any).on).toHaveBeenCalledWith('db-changed', expect.any(Function));
  });

  it('silent-pushes a rebuilt aggregator when todo_list_items changes', async () => {
    const { finance, handlers } = makeHostFinance();
    await activate(finance);
    const pushData = vi.mocked(finance.ui!.pushData!);
    pushData.mockClear();

    const subs = handlers.get('db-changed');
    expect(subs?.size).toBe(1);
    for (const h of subs!) h({ extensionId: 'todo-list', table: 'todo_list_items', op: 'update' });

    await vi.advanceTimersByTimeAsync(500);

    expect(pushData).toHaveBeenCalledTimes(1);
    const [viewId, mountData] = pushData.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(viewId).toBe('dashboard-view');
    expect(mountData.aggregator).toMatchObject({ todos: { total: 5, active: 2, done: 3 } });
  });

  it('ignores writes to unrelated tables', async () => {
    const { finance, handlers } = makeHostFinance();
    await activate(finance);
    const pushData = vi.mocked(finance.ui!.pushData!);
    pushData.mockClear();

    for (const h of handlers.get('db-changed')!) {
      h({ extensionId: 'salary-history', table: 'salary_history_pay_slips', op: 'insert' });
      h({ extensionId: 'x', table: 'accounts', op: 'update' });
    }

    await vi.advanceTimersByTimeAsync(500);
    expect(pushData).not.toHaveBeenCalled();
  });

  it('debounces rapid successive writes into a single push', async () => {
    const { finance, handlers } = makeHostFinance();
    await activate(finance);
    const pushData = vi.mocked(finance.ui!.pushData!);
    pushData.mockClear();

    for (const h of handlers.get('db-changed')!) {
      h({ extensionId: 'todo-list', table: 'todo_list_items', op: 'update' });
      h({ extensionId: 'todo-list', table: 'todo_list_items', op: 'update' });
      h({ extensionId: 'todo-list', table: 'todo_list_items', op: 'delete' });
    }

    await vi.advanceTimersByTimeAsync(500);
    expect(pushData).toHaveBeenCalledTimes(1);
  });

  it('deactivate() unsubscribes so no further pushes occur', async () => {
    const { finance, handlers } = makeHostFinance();
    await activate(finance);
    deactivate();

    expect(handlers.get('db-changed')?.size ?? 0).toBe(0);
  });
});
