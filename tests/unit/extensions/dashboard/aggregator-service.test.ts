import { describe, expect, it, vi } from 'vitest';
import { buildAggregator, type DashboardSettings } from '../../../../extensions/dashboard/src/services/aggregator-service';

function makeMockFinance(overrides: {
  accounts?: Array<Record<string, unknown>>;
  lastPayslip?: unknown;
  ytdSummary?: unknown;
  currentRate?: unknown;
} = {}): Partial<import('finance').FinanceApi> {
  return {
    db: {
      table: vi.fn().mockReturnValue({
        find: vi.fn().mockResolvedValue(overrides.accounts ?? [])
      })
    },
    services: {
      register: vi.fn(),
      unregister: vi.fn(),
      invoke: vi.fn().mockImplementation(async (serviceName: string, method: string) => {
        if (method === 'getLastPayslip') return overrides.lastPayslip ?? null;
        if (method === 'getYearToDateSummary') return overrides.ytdSummary ?? null;
        if (method === 'getCurrentRate') return overrides.currentRate ?? null;
        return null;
      })
    }
  };
}

const defaultSettings: DashboardSettings = {
  financialYearStart: '2026-07-01',
  financeYear: '',
  cardOrder: ['netWorth', 'ytdSalary', 'lastPayslip', 'accountsSummary']
};

describe('Dashboard aggregator service', () => {
  it('returns empty/default cards when no data sources are present', async () => {
    const finance = makeMockFinance();
    const result = await buildAggregator(finance as Parameters<typeof buildAggregator>[0], defaultSettings);

    expect(result.accountsSummary.count).toBe(0);
    expect(result.accountsSummary.accounts).toEqual([]);
    expect(result.accountsSummary.totalBalance).toBeNull();
    expect(result.ytdSalary.summary).toBeNull();
    expect(result.ytdSalary.currentRate).toBeNull();
    expect(result.lastPayslip.id).toBeNull();
    expect(result.netWorth.totalBalance).toBeNull();
  });

  it('sums account balances into netWorth.totalBalance', async () => {
    const finance = makeMockFinance({
      accounts: [
        { id: 1, name: 'Checking', balance: 5000 },
        { id: 2, name: 'Savings', current_balance: 15000 }
      ]
    });
    const result = await buildAggregator(finance as Parameters<typeof buildAggregator>[0], defaultSettings);

    expect(result.netWorth.totalBalance).toBe(20000);
    expect(result.accountsSummary.count).toBe(2);
    expect(result.accountsSummary.totalBalance).toBe(20000);
  });

  it('passes financialYearStart to service invocation', async () => {
    const finance = makeMockFinance();
    await buildAggregator(finance as Parameters<typeof buildAggregator>[0], defaultSettings);

    expect(finance.services!.invoke).toHaveBeenCalledWith(
      'pay',
      'getYearToDateSummary',
      { financialYearStart: '2026-07-01' }
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
    expect(result.lastPayslip.id).toBeNull();
    expect(result.netWorth.totalBalance).toBeNull();
  });

  it('populates lastPayslip card when data is present', async () => {
    const finance = makeMockFinance({
      lastPayslip: { id: 42, pay_date: '2026-06-15', gross: 6000, net: 4500, currency: 'AUD', account_id: 1 }
    });
    const result = await buildAggregator(finance as Parameters<typeof buildAggregator>[0], defaultSettings);

    expect(result.lastPayslip.id).toBe(42);
    expect(result.lastPayslip.pay_date).toBe('2026-06-15');
    expect(result.lastPayslip.gross).toBe(6000);
    expect(result.lastPayslip.net).toBe(4500);
    expect(result.lastPayslip.currency).toBe('AUD');
    expect(result.lastPayslip.account_id).toBe(1);
  });
});
