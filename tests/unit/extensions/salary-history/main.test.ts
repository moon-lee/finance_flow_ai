// @vitest-environment happy-dom
/**
 * Phase 4 Task 12 — unit tests for the salary-history extension entry point.
 *
 * Verifies `activate` against an in-memory `FinanceApi` stub: it does NOT
 * seed a default rate row (the user must add their own rates — no fabricated
 * salary data) and registers exactly the two Decision 17 commands. The UI
 * mount (Task 14) is out of scope, so the command handlers are not executed
 * here.
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
  it('does not seed a default rate row when rate history is empty and registers both commands', async () => {
    const { finance, registered, store } = makeFinance();
    await activate(finance);

    expect(store['salary_history_rate_history']).toHaveLength(0);
    expect(registered.map((r) => r.id)).toEqual([
      'salary.show-pay-history',
      'salary.show-pay-rate-history',
    ]);
  });

  it('leaves an existing rate row untouched', async () => {
    const { finance, store } = makeFinance();
    store['salary_history_rate_history'].push({
      id: 1,
      effective_from: '2020-01-01',
      effective_to: null,
    });

    await activate(finance);

    expect(store['salary_history_rate_history']).toHaveLength(1);
  });

  it('declares a single salary view activated onView:salary', async () => {
    const pkg = (await import('node:fs')).readFileSync(
      'extensions/salary-history/package.json',
      'utf8',
    );
    const manifest = JSON.parse(pkg).financeExtension;
    expect(manifest.contributions.views).toEqual([
      { id: 'salary', name: 'Salary', icon: 'assets/icon.svg' },
    ]);
    expect(manifest.activationEvents).toEqual(['onView:salary']);
    expect(manifest.contributions.commands.map((c: { id: string }) => c.id)).toEqual([
      'salary.show-pay-history',
      'salary.show-pay-rate-history',
    ]);
  });

  it('commands requestMount the single salary panel with child view', async () => {
    const { finance } = makeFinance();
    const mounts: { tag: string; data: Record<string, unknown> }[] = [];
    (finance as unknown as { ui: unknown }).ui = {
      requestMount: async (tag: string, data: Record<string, unknown>) => {
        mounts.push({ tag, data });
      },
    };
    (finance as unknown as { settings: unknown }).settings = {
      get: async (k: string) =>
        k === 'core.defaultCurrency' ? 'AUD' : k === 'core.financialYear.start' ? '07-01' : '',
    };
    const handlers = new Map<string, () => Promise<void> | void>();
    (finance as unknown as { commands: unknown }).commands = {
      registerCommand: (id: string, _t: string, h: () => Promise<void> | void) => {
        handlers.set(id, h);
      },
      execute: async () => null,
    };
    (finance as unknown as { services: unknown }).services = {
      register: () => {},
      unregister: () => {},
    };
    await activate(finance);
    await handlers.get('salary.show-pay-history')!();
    await handlers.get('salary.show-pay-rate-history')!();
    expect(mounts[0].tag).toBe('salary');
    expect(mounts[0].data.view).toBe('payslip-list');
    expect(mounts[1].tag).toBe('salary');
    expect(mounts[1].data.view).toBe('pay-rate-history-view');
  });
});
