import { describe, expect, it, vi } from 'vitest';
import { buildAggregator, type DashboardSettings } from '../../../../extensions/dashboard/src/services/aggregator-service';

function makeMockFinance(overrides: {
  ytdSummary?: unknown;
  payslipStats?: unknown;
  todoCounts?: unknown;
} = {}): Partial<import('finance').FinanceApi> {
  return {
    db: {
      table: vi.fn().mockReturnValue({
        find: vi.fn().mockResolvedValue([])
      })
    },
    services: {
      register: vi.fn(),
      unregister: vi.fn(),
      invoke: vi.fn().mockImplementation(async (serviceName: string, method: string) => {
        if (serviceName === 'pay' && method === 'getYearToDateSummary') return overrides.ytdSummary ?? null;
        if (serviceName === 'pay' && method === 'getPayslipStats') return overrides.payslipStats ?? null;
        if (serviceName === 'todo-list' && method === 'counts') return overrides.todoCounts ?? null;
        return null;
      })
    }
  };
}

const defaultSettings: DashboardSettings = {
  financialYearStart: '2026-07-01',
  financialYearCurrent: '',
  cardOrder: ['pay-summary'],
  financeYearFilter: 5
};

describe('Dashboard aggregator service', () => {
  it('returns empty/default cards when no data sources are present', async () => {
    const finance = makeMockFinance();
    const result = await buildAggregator(finance as Parameters<typeof buildAggregator>[0], defaultSettings);

    expect(result.ytdSalary.summary).toBeNull();
    expect(result.estimatedYtd).toBeUndefined();
    expect(result.todos).toEqual({ total: null, active: null, done: null });
  });

  it('populates ytd summary + estimated projection when FY has data', async () => {
    const finance = makeMockFinance({
      ytdSummary: { gross: 60000, net: 45000, payg: 12000, count: 12 },
      payslipStats: { avgGross: 1000, avgNet: 750, avgPayg: 200 }
    });
    const result = await buildAggregator(finance as Parameters<typeof buildAggregator>[0], defaultSettings);

    expect(result.ytdSalary.summary).toEqual({ gross: 60000, net: 45000, payg: 12000, count: 12 });
    expect(result.estimatedYtd).toEqual({ gross: 52000, net: 39000, payg: 10400 });
  });

  it('populates todos when todo-list service responds', async () => {
    const finance = makeMockFinance({
      todoCounts: { total: 5, active: 2, done: 3 }
    });
    const result = await buildAggregator(finance as Parameters<typeof buildAggregator>[0], defaultSettings);

    expect(result.todos).toEqual({ total: 5, active: 2, done: 3 });
  });

  it('passes financialYearStart to service invocation', async () => {
    const finance = makeMockFinance();
    await buildAggregator(finance as Parameters<typeof buildAggregator>[0], defaultSettings);

    expect(finance.services!.invoke).toHaveBeenCalledWith(
      'pay',
      'getYearToDateSummary',
      expect.arrayContaining([
        '2026-07-01',
        expect.anything(),
        expect.anything(),
      ])
    );
  });

  it('gracefully degrades when services are undefined', async () => {
    const finance = {
      db: {
        table: vi.fn().mockReturnValue({
          find: vi.fn().mockResolvedValue([])
        })
      },
      services: undefined
    };
    const result = await buildAggregator(finance as unknown as Parameters<typeof buildAggregator>[0], defaultSettings);

    expect(result.ytdSalary.summary).toBeNull();
    expect(result.estimatedYtd).toBeUndefined();
    expect(result.todos).toEqual({ total: null, active: null, done: null });
  });

  it('only invokes the services the view renders (no wasted fetches)', async () => {
    const finance = makeMockFinance({
      ytdSummary: { gross: 60000, net: 45000, payg: 12000, count: 12 },
      payslipStats: { avgGross: 1000, avgNet: 750, avgPayg: 200 },
      todoCounts: { total: 5, active: 2, done: 3 }
    });
    await buildAggregator(finance as Parameters<typeof buildAggregator>[0], defaultSettings);

    const calls = (finance.services!.invoke as ReturnType<typeof vi.fn>).mock.calls.map(
      ([serviceName, method]) => `${serviceName}.${method}`
    );
    expect(calls.sort()).toEqual(
      ['pay.getPayslipStats', 'pay.getYearToDateSummary', 'todo-list.counts'].sort()
    );
    expect(finance.db!.table).not.toHaveBeenCalled();
  });
});
