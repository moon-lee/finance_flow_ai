/**
 * Phase 4 Task 7 — Host-side DAO accessor.
 *
 * The Phase 3 stub (`table(name) → empty QueryChain`) is replaced with a
 * real implementation that forwards every call to Main via JSON-RPC.
 * The accessor is constructed per-extension (so the calling extension's
 * id is bound at instantiation time and sent on every RPC) and accepts
 * an injected `DbRpcClient` so unit tests can stub the transport without
 * spawning a real `utilityProcess`.
 *
 * ## Architecture
 *
 *   Extension code (running in the Host via dynamic import)
 *     ↓ `finance.db.table('salary_history_pay_slips').find({ account_id: 1 })`
 *   `createDb(extensionId, rpc)` accessor (this file)
 *     ↓ `await rpc.request('extension.readTable', { extensionId, table, op: 'find', query })`
 *   Main process (`ExtensionIPC.dispatchHostRequest` → `DAOService.find`)
 *     ↓ result rows
 *   Accessor returns plain serialisable objects (no Date / BigInt)
 *
 * The Host process runs the extension code, but the SQLite database lives
 * in Main (per `project_vision.md:99`). Every DAO call therefore crosses
 * the IPC boundary; we expose that crossing as a single async hop rather
 * than buffering results in JS memory.
 *
 * ## Typed error propagation
 *
 * Main's `dispatchHostRequest` maps the four DAO error classes
 * (`TableAccessDeniedError` / `TableNotFoundError` /
 * `SharedTableReadOnlyError` / `ValidationFailedError`) to JSON-RPC error
 * responses carrying `{ code, message, data: { name } }`. The Host's
 * `requestMain` (host.ts) reconstructs a generic `Error` from that
 * envelope with `err.name` set to the typed-error class name. This file
 * defines mirror classes (same `name`, same `code`) so extension code
 * can do `instanceof TableAccessDeniedError` to pattern-match the cause.
 *
 * The mirror classes are intentionally NOT the same JS class as the
 * Main-side classes — they're separate definitions in separate processes.
 * They match by `name` (which is what `instanceof` ultimately checks
 * through the prototype chain after construction via the constructor
 * registered in `ERROR_CLASS_BY_NAME`). Extension code that wants
 * cross-process error matching should use `err.name` rather than
 * `err instanceof SomeMainSideClass` — the latter would never be true.
 */

import { RPC_METHOD } from '../../shared/json-rpc-methods';

// ---------------------------------------------------------------------------
// Typed error classes (mirror of src/main/services/dao-service.ts)
// ---------------------------------------------------------------------------

/** Extension tried to access a table it doesn't own (and that isn't shared). */
export class TableAccessDeniedError extends Error {
  readonly code = -32011;
  constructor(message?: string) {
    super(message ?? 'DAOService: table access denied');
    this.name = 'TableAccessDeniedError';
  }
}

/** Table name is not registered in the schema registry. */
export class TableNotFoundError extends Error {
  readonly code = -32010;
  constructor(message?: string) {
    super(message ?? 'DAOService: table not found');
    this.name = 'TableNotFoundError';
  }
}

/** Extension tried to write to a Shared Financial Data table. */
export class SharedTableReadOnlyError extends Error {
  readonly code = -32013;
  constructor(message?: string) {
    super(message ?? 'DAOService: shared table is read-only');
    this.name = 'SharedTableReadOnlyError';
  }
}

/** Zod validation rejected the payload. */
export class ValidationFailedError extends Error {
  readonly code = -32012;
  constructor(message?: string) {
    super(message ?? 'DAOService: validation failed');
    this.name = 'ValidationFailedError';
  }
}

/**
 * Map from Main-side typed error name → Host-side mirror class. Used by
 * `reconstructTypedError` to wrap a generic `Error` (reconstructed by
 * the Host's `requestMain`) in the matching typed class so extension
 * code can pattern-match via `instanceof`.
 */
const ERROR_CLASS_BY_NAME: Record<string, new (message?: string) => Error> = {
  TableAccessDeniedError,
  TableNotFoundError,
  SharedTableReadOnlyError,
  ValidationFailedError
};

/**
 * If the error's `name` matches a known typed DAO error, return a new
 * instance of that class with the original message. Otherwise return
 * the error unchanged. This is the Host-side counterpart of Main's
 * `dispatchHostRequest` typed-error mapping.
 */
function reconstructTypedError(err: unknown): Error {
  if (err instanceof Error) {
    const Cls = ERROR_CLASS_BY_NAME[err.name];
    if (Cls) {
      const typed = new Cls(err.message);
      return typed;
    }
    return err;
  }
  return new Error(String(err));
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Minimal RPC client surface required by the db accessor. The Host
 * production code passes a wrapper around `requestMain` from host.ts;
 * tests pass a stub that records calls and returns programmable
 * responses.
 */
export interface DbRpcClient {
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
}

/** Returned by `db.table(name)`. All methods are async (cross-process). */
export interface TableAccessor {
  find(query?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  findOne(query?: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  count(query?: Record<string, unknown>): Promise<number>;
  insert(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(
    where: Record<string, unknown>,
    payload: Record<string, unknown>
  ): Promise<number>;
  delete(where: Record<string, unknown>): Promise<number>;
}

/** The `db` surface on `finance`. */
export interface DbAccessor {
  table(name: string): TableAccessor;
}

// ---------------------------------------------------------------------------
// createDb factory
// ---------------------------------------------------------------------------

/**
 * Build the per-extension DAO accessor.
 *
 * @param extensionId The id of the calling extension (e.g. `'salary-history'`).
 *                    Sent on every RPC so Main's DAO can enforce namespace
 *                    isolation (Decision 1).
 * @param rpc         The RPC client used to reach Main. Production passes
 *                    a wrapper around `requestMain`; tests pass a stub.
 * @returns A `DbAccessor` whose `.table(name)` returns a `TableAccessor`
 *          whose methods each send one `extension.readTable` /
 *          `extension.writeTable` RPC and unpack the response envelope.
 */
export function createDb(extensionId: string, rpc: DbRpcClient): DbAccessor {
  return {
    table(name: string): TableAccessor {
      return {
        async find(query: Record<string, unknown> = {}) {
          try {
            const result = await rpc.request<{ rows: Record<string, unknown>[] }>(
              RPC_METHOD.ExtensionReadTable,
              { extensionId, table: name, op: 'find', query }
            );
            return result.rows;
          } catch (err) {
            throw reconstructTypedError(err);
          }
        },

        async findOne(query: Record<string, unknown> = {}) {
          try {
            const result = await rpc.request<{ row: Record<string, unknown> | null }>(
              RPC_METHOD.ExtensionReadTable,
              { extensionId, table: name, op: 'findOne', query }
            );
            return result.row;
          } catch (err) {
            throw reconstructTypedError(err);
          }
        },

        async count(query: Record<string, unknown> = {}) {
          try {
            const result = await rpc.request<{ count: number }>(
              RPC_METHOD.ExtensionReadTable,
              { extensionId, table: name, op: 'count', query }
            );
            return result.count;
          } catch (err) {
            throw reconstructTypedError(err);
          }
        },

        async insert(payload: Record<string, unknown>) {
          try {
            const result = await rpc.request<{ row: Record<string, unknown>; affected: number }>(
              RPC_METHOD.ExtensionWriteTable,
              { extensionId, table: name, op: 'insert', payload }
            );
            return result.row;
          } catch (err) {
            throw reconstructTypedError(err);
          }
        },

        async update(where: Record<string, unknown>, payload: Record<string, unknown>) {
          try {
            const result = await rpc.request<{ affected: number }>(
              RPC_METHOD.ExtensionWriteTable,
              { extensionId, table: name, op: 'update', where, payload }
            );
            return result.affected;
          } catch (err) {
            throw reconstructTypedError(err);
          }
        },

        async delete(where: Record<string, unknown>) {
          try {
            const result = await rpc.request<{ affected: number }>(
              RPC_METHOD.ExtensionWriteTable,
              { extensionId, table: name, op: 'delete', where }
            );
            return result.affected;
          } catch (err) {
            throw reconstructTypedError(err);
          }
        }
      };
    }
  };
}

/**
 * Wrap an RPC client so any `Error` it throws is mapped through
 * `reconstructTypedError` before reaching the caller. Exported so
 * `api/index.ts` and `host.ts` can compose it once around the raw
 * RPC client rather than wrapping every individual accessor method.
 *
 * If the caller prefers to receive the raw `Error` (e.g. for logging
 * the original envelope), they can skip this wrapper — the db
 * accessor's typed-error mapping happens automatically inside the
 * accessor methods because they call `reconstructTypedError` on every
 * catch.
 */
export function withTypedErrors(rpc: DbRpcClient): DbRpcClient {
  return {
    async request<T>(method: string, params?: unknown): Promise<T> {
      try {
        return await rpc.request<T>(method, params);
      } catch (err) {
        throw reconstructTypedError(err);
      }
    }
  };
}
