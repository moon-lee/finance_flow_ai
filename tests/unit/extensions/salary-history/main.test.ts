// @vitest-environment happy-dom
/**
 * Phase 4 Task 12 — unit tests for the salary-history extension entry point.
 *
 * Verifies `activate` against an in-memory `FinanceApi` stub: it seeds a
 * default rate row when the rate history is empty and registers exactly the
 * two Decision 17 commands. The UI mount (Task 14) is out of scope, so the
 * command handlers are not executed here.
 */

import { describe, it, expect } from 'vitest';
import { activate } from '../../../../extensions/salary-history/src/main';
import type { FinanceApi } from 'finance';

function makeFinance() {
  const store: Record<string, Record<string, unknown>[]> = {
    salary_history_rate_history: [],
  };
  const registered: { id: string; title: string }[] = [];
  const finance = {
    db: {
      table(name: string) {
        const rows = (store[name] ??= []);
        return {
          async find() {
            return rows;
          },
          async findOne(q: Record<string, unknown>) {
            return (
              rows.find((r) => Object.entries(q).every(([k, v]) => r[k] === v)) ?? null
            );
          },
          async count() {
            return rows.length;
          },
          async insert(payload: Record<string, unknown>) {
            const row = { id: rows.length + 1, ...payload };
            rows.push(row);
            return row;
          },
          async update() {
            return 1;
          },
          async delete() {
            return 1;
          },
        };
      },
    },
    commands: {
      registerCommand(id: string, title: string) {
        registered.push({ id, title });
      },
      execute: async () => null,
    },
    ai: { registerTool: () => {} },
  } as unknown as FinanceApi;
  return { finance, registered, store };
}

describe('salary-history activate (Task 12)', () => {
  it('seeds a default rate row when rate history is empty and registers both commands', async () => {
    const { finance, registered, store } = makeFinance();
    await activate(finance);

    expect(store['salary_history_rate_history']).toHaveLength(1);
    expect(registered.map((r) => r.id)).toEqual([
      'salary.show-pay-history',
      'salary.show-pay-rate-history',
    ]);
  });

  it('does not seed when a current rate row already exists', async () => {
    const { finance, store } = makeFinance();
    store['salary_history_rate_history'].push({
      id: 1,
      effective_from: '2020-01-01',
      effective_to: null,
    });

    await activate(finance);

    expect(store['salary_history_rate_history']).toHaveLength(1);
  });
});
