/**
 * Phase 4 Task 14 — renderer-side `FinanceApi` used when mounting an
 * extension's UI element into the workspace.
 *
 * The Lit component runs in the Renderer (the only process with a DOM), so
 * its `finance.db` calls must proxy to Main. The `extensions:read-table` /
 * `extensions:write-table` IPC channels delegate to the same DAO service
 * the Extension Host uses, so reads/writes behave identically whether the
 * code runs in the Host or the Renderer. The DAO envelope (`{ rows }` /
 * `{ row }` / `{ count }` / `{ row, affected }` / `{ affected }`) is
 * unwrapped to the array / object / number the components expect (the unit
 * tests' mock `finance` returns the unwrapped shape, which the components
 * were written against).
 *
 * Writes are normally dispatched as CustomEvents instead (the extension
 * command handlers own writes), so the `commands` / `ai` surfaces here are
 * no-op stubs.
 */

import type { FinanceApi } from '../types/finance';

export function createFinance(extensionId: string): FinanceApi {
  const shell = window.financeShell;
  const read = (table: string, op: string, query?: unknown): Promise<unknown> =>
    shell.extensions.readTable({ extensionId, table, op, query });
  const write = (
    table: string,
    op: string,
    payload?: unknown,
    where?: unknown
  ): Promise<unknown> => shell.extensions.writeTable({ extensionId, table, op, payload, where });

  const finance = {
    db: {
      table: (name: string) => ({
        find: (query?: Record<string, unknown>): Promise<unknown[]> =>
          read(name, 'find', query).then((r) => (r as { rows: unknown[] }).rows),
        findOne: (query?: Record<string, unknown>): Promise<unknown> =>
          read(name, 'findOne', query).then((r) => (r as { row: unknown }).row),
        count: (query?: Record<string, unknown>): Promise<number> =>
          read(name, 'count', query).then((r) => (r as { count: number }).count),
        insert: (payload: Record<string, unknown>): Promise<unknown> =>
          write(name, 'insert', payload).then((r) => (r as { row: unknown }).row),
        update: (where: Record<string, unknown>, payload: Record<string, unknown>): Promise<number> =>
          write(name, 'update', payload, where).then((r) => (r as { affected: number }).affected),
        delete: (where?: Record<string, unknown>): Promise<number> =>
          write(name, 'delete', where).then((r) => (r as { affected: number }).affected)
      })
    },
    commands: { registerCommand: () => {}, execute: async () => null },
    ai: { registerTool: () => {} }
  };

  return finance as unknown as FinanceApi;
}
