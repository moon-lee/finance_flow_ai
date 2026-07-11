/**
 * Tests for `src/extension-host/api/db.ts` — the Host-side DAO accessor
 * that extension code reaches via `finance.db.table(...).find({...})` etc.
 *
 * Per Phase 4 plan Task 7, the Phase 3 empty-queryable stub is replaced
 * with a real implementation that calls into Main via JSON-RPC. The
 * accessor is constructed per-extension (so the calling extension's id
 * is bound at instantiation time and sent on every RPC) and accepts an
 * injected RPC client so unit tests can stub the transport without
 * spawning a real `utilityProcess`.
 *
 * Per the plan: 8 tests minimum. This file ships 12 covering the
 * six DAO methods (find/findOne/count/insert/update/delete) plus four
 * typed-error propagation cases and two payload-shape assertions.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDb,
  TableAccessDeniedError,
  TableNotFoundError,
  SharedTableReadOnlyError,
  ValidationFailedError
} from '../../../../src/extension-host/api/db';
import { RPC_METHOD } from '../../../../src/shared/json-rpc-methods';

/**
 * Mock RPC client. Records every call so tests can assert on the
 * request payload, and returns a programmable `response` or rejects
 * with a programmable `error` so typed-error propagation can be
 * exercised end-to-end.
 */
interface MockRpcCall {
  method: string;
  params: unknown;
}

interface MockRpcClient {
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
  calls: MockRpcCall[];
}

function makeMockRpc(
  responder: (method: string, params: unknown) => unknown | Error
): MockRpcClient {
  const calls: MockRpcCall[] = [];
  return {
    calls,
    async request<T>(method: string, params?: unknown): Promise<T> {
      calls.push({ method, params });
      const result = responder(method, params);
      if (result instanceof Error) {
        throw result;
      }
      return result as T;
    }
  };
}

/**
 * Build a JSON-RPC-shaped error mirroring what Main's `dispatchHostRequest`
 * posts back to the Host: `{ code, message, data: { name } }`. The Host's
 * `requestMain` reconstructs an `Error` from this envelope; the db
 * accessor then maps the `name` back to a typed error class.
 */
function makeRpcError(name: string, code: number, message: string): Error {
  // Simulate the Host-side reconstruction that happens inside
  // requestMain (host.ts): the resulting Error has `name` set to the
  // data.name from the JSON-RPC envelope, and message suffixed with
  // the JSON-RPC code.
  const err = new Error(`${message} (code ${code})`);
  err.name = name;
  return err;
}

describe('createDb (Phase 4 Task 7)', () => {
  let rpc: MockRpcClient;
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    rpc = makeMockRpc(() => ({}));
    db = createDb('salary-history', rpc);
  });

  it('table().find() calls extension.readTable with op=find and returns rows', async () => {
    rpc = makeMockRpc((method) => {
      if (method === RPC_METHOD.ExtensionReadTable) {
        return { rows: [{ id: 1, gross: 5000 }, { id: 2, gross: 5200 }] };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    db = createDb('salary-history', rpc);

    const rows = await db.table('salary_history_pay_slips').find({ account_id: 1 });

    expect(rows).toEqual([{ id: 1, gross: 5000 }, { id: 2, gross: 5200 }]);
    expect(rpc.calls).toHaveLength(1);
    expect(rpc.calls[0].method).toBe(RPC_METHOD.ExtensionReadTable);
    expect(rpc.calls[0].params).toEqual({
      extensionId: 'salary-history',
      table: 'salary_history_pay_slips',
      op: 'find',
      query: { account_id: 1 }
    });
  });

  it('table().findOne() returns the row when present', async () => {
    rpc = makeMockRpc(() => ({ row: { id: 7, gross: 5000 } }));
    db = createDb('salary-history', rpc);

    const row = await db.table('salary_history_pay_slips').findOne({ id: 7 });

    expect(row).toEqual({ id: 7, gross: 5000 });
    expect(rpc.calls[0].params).toMatchObject({
      extensionId: 'salary-history',
      table: 'salary_history_pay_slips',
      op: 'findOne',
      query: { id: 7 }
    });
  });

  it('table().findOne() returns null when the RPC returns { row: null }', async () => {
    rpc = makeMockRpc(() => ({ row: null }));
    db = createDb('salary-history', rpc);

    const row = await db.table('accounts').findOne({ name: 'nonexistent' });

    expect(row).toBeNull();
  });

  it('table().count() returns the count from { count }', async () => {
    rpc = makeMockRpc(() => ({ count: 42 }));
    db = createDb('salary-history', rpc);

    const count = await db.table('salary_history_pay_slips').count({ account_id: 1 });

    expect(count).toBe(42);
    expect(rpc.calls[0].params).toMatchObject({
      op: 'count',
      query: { account_id: 1 }
    });
  });

  it('table().insert() calls extension.writeTable with op=insert and returns the inserted row', async () => {
    rpc = makeMockRpc(() => ({ row: { id: 99, gross: 5500 }, affected: 1 }));
    db = createDb('salary-history', rpc);

    const row = await db.table('salary_history_pay_slips').insert({
      account_id: 1,
      gross: 5500
    });

    expect(row).toEqual({ id: 99, gross: 5500 });
    expect(rpc.calls[0].method).toBe(RPC_METHOD.ExtensionWriteTable);
    expect(rpc.calls[0].params).toEqual({
      extensionId: 'salary-history',
      table: 'salary_history_pay_slips',
      op: 'insert',
      payload: { account_id: 1, gross: 5500 }
    });
  });

  it('table().update() calls extension.writeTable with op=update and returns affected count', async () => {
    rpc = makeMockRpc(() => ({ affected: 1 }));
    db = createDb('salary-history', rpc);

    const affected = await db
      .table('salary_history_pay_slips')
      .update({ id: 7 }, { gross: 5500 });

    expect(affected).toBe(1);
    expect(rpc.calls[0].params).toEqual({
      extensionId: 'salary-history',
      table: 'salary_history_pay_slips',
      op: 'update',
      where: { id: 7 },
      payload: { gross: 5500 }
    });
  });

  it('table().delete() calls extension.writeTable with op=delete and returns affected count', async () => {
    rpc = makeMockRpc(() => ({ affected: 1 }));
    db = createDb('salary-history', rpc);

    const affected = await db.table('salary_history_pay_slips').delete({ id: 7 });

    expect(affected).toBe(1);
    expect(rpc.calls[0].params).toEqual({
      extensionId: 'salary-history',
      table: 'salary_history_pay_slips',
      op: 'delete',
      where: { id: 7 }
    });
  });

  it('propagates TableAccessDeniedError reconstructed from RPC error name', async () => {
    rpc = makeMockRpc(() =>
      makeRpcError('TableAccessDeniedError', -32011, "extension 'tax-stub' cannot access table 'salary_history_pay_slips'")
    );
    db = createDb('tax-stub', rpc);

    await expect(
      db.table('salary_history_pay_slips').find({})
    ).rejects.toBeInstanceOf(TableAccessDeniedError);
  });

  it('propagates TableNotFoundError reconstructed from RPC error name', async () => {
    rpc = makeMockRpc(() =>
      makeRpcError('TableNotFoundError', -32010, "table 'unknown_table' is not registered")
    );
    db = createDb('salary-history', rpc);

    await expect(
      db.table('unknown_table').find({})
    ).rejects.toBeInstanceOf(TableNotFoundError);
  });

  it('propagates SharedTableReadOnlyError reconstructed from RPC error name', async () => {
    rpc = makeMockRpc(() =>
      makeRpcError('SharedTableReadOnlyError', -32013, "shared table 'accounts' is read-only for extension 'salary-history'")
    );
    db = createDb('salary-history', rpc);

    await expect(
      db.table('accounts').insert({ name: 'evil', is_active: true })
    ).rejects.toBeInstanceOf(SharedTableReadOnlyError);
  });

  it('propagates ValidationFailedError reconstructed from RPC error name', async () => {
    rpc = makeMockRpc(() =>
      makeRpcError('ValidationFailedError', -32012, "validation failed for table 'salary_history_pay_slips': gross must be >= 0")
    );
    db = createDb('salary-history', rpc);

    await expect(
      db.table('salary_history_pay_slips').insert({ gross: -100 })
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it('binds the extensionId at construction so every payload carries it', async () => {
    // Two db accessors with different extension ids must produce payloads
    // with different extensionId fields. This pins the per-extension
    // binding (Decision 1 / Decision 5: the DAO's namespace enforcement
    // is keyed on the caller extension id).
    const rpcA = makeMockRpc(() => ({ rows: [] }));
    const rpcB = makeMockRpc(() => ({ rows: [] }));
    const dbA = createDb('salary-history', rpcA);
    const dbB = createDb('budget', rpcB);

    await dbA.table('salary_history_pay_slips').find({});
    await dbB.table('budget_items').find({});

    expect((rpcA.calls[0].params as { extensionId: string }).extensionId).toBe('salary-history');
    expect((rpcB.calls[0].params as { extensionId: string }).extensionId).toBe('budget');
    expect((rpcA.calls[0].params as { table: string }).table).toBe('salary_history_pay_slips');
    expect((rpcB.calls[0].params as { table: string }).table).toBe('budget_items');
  });
});
