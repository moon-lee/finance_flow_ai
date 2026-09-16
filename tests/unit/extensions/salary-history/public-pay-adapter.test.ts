import { describe, it, expect } from 'vitest';
import { createPublicPayAdapter } from '../../../../extensions/salary-history/src/services/public-pay-adapter';

function mockFinance(rows: Record<string, unknown>[]) {
  return {
    db: {
      table: () => ({
        find: async () => rows,
        findOne: async () => rows[0] ?? null,
        count: async () => rows.length,
        insert: async () => ({ id: 1 }),
        update: async () => ({ affected: 1 }),
        delete: async () => ({ affected: 1 }),
      }),
    },
  } as never;
}

describe('getLatestNet', () => {
  it('returns newest net with pay_date', async () => {
    const finance = mockFinance([
      { pay_date: '2026-09-03', net: 1287.4 },
      { pay_date: '2026-09-10', net: 1327.73 },
    ]);
    const adapter = createPublicPayAdapter(finance as never);
    await expect(adapter.getLatestNet()).resolves.toEqual({ net: 1327.73, pay_date: '2026-09-10' });
  });

  it('returns null when empty', async () => {
    const adapter = createPublicPayAdapter(mockFinance([]) as never);
    await expect(adapter.getLatestNet()).resolves.toBeNull();
  });

  it('returns null for non-numeric net', async () => {
    const adapter = createPublicPayAdapter(mockFinance([{ pay_date: '2026-09-10', net: 'oops' }]) as never);
    await expect(adapter.getLatestNet()).resolves.toBeNull();
  });
});
