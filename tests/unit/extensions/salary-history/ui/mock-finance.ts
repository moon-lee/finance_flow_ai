// @vitest-environment happy-dom
/**
 * Shared mock `FinanceApi` for the salary-history UI component tests.
 *
 * The extension's per-extension `finance` API surface the Lit components
 * read from. We stub `db.table(name)` to return canned data per
 * table name and record nothing — the components must not perform writes
 * through this object (writes are dispatched as CustomEvents).
 */

import type { FinanceApi } from 'finance';

export interface MockFinanceOptions {
  paySlips?: unknown[];
  rates?: unknown[];
  accounts?: unknown[];
}

export function makeMockFinance(opts: MockFinanceOptions = {}): FinanceApi {
  const rates = opts.rates ?? [];
  const accounts = opts.accounts ?? [];
  const paySlips = opts.paySlips ?? [];

  const table = (name: string) => ({
    find: async (): Promise<unknown[]> => {
      if (name.includes('rate')) return rates;
      if (name === 'accounts') return accounts;
      return paySlips;
    },
    findOne: async (q?: Record<string, unknown>): Promise<unknown | null> => {
      if (name.includes('rate')) {
        const current = (rates as { effective_to: string | null }[]).find(
          (r) => r.effective_to === null,
        );
        if (q && q.effective_to === null) return current ?? null;
        return (rates as unknown[])[0] ?? null;
      }
      return (paySlips as unknown[])[0] ?? null;
    },
    count: async (): Promise<number> => paySlips.length,
    insert: async (p: unknown): Promise<unknown> => ({ id: 1, ...(p as object) }),
    update: async (): Promise<number> => 1,
    delete: async (): Promise<number> => 1,
  });

  return {
    db: { table },
    commands: { registerCommand() {}, execute: async () => ({}) },
    ai: { registerTool() {} },
  } as unknown as FinanceApi;
}
