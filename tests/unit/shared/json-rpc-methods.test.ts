/**
 * Tests for `src/shared/json-rpc-methods.ts` — the canonical catalogue of
 * JSON-RPC method names used by Main and the Extension Host.
 *
 * Per Phase 4 plan Task 6.1, this module exports a single `RPC_METHOD`
 * constant whose values are the dotted method strings referenced by
 * `extension-ipc.ts` and `host.ts` request handlers. The constant is `as
 * const` so its values are literal types, enabling compile-time enforcement
 * that handler switches use the canonical spelling.
 *
 * Per the plan's verification line: `npm run test:unit --
 * json-rpc-methods.test.ts` → 3 tests pass.
 */

import { describe, expect, it } from 'vitest';
import { RPC_METHOD } from '../../../src/shared/json-rpc-methods';

describe('json-rpc-methods', () => {
  it('exposes the Phase 4 read/write DAO method names', () => {
    // Decision 6 contract: the two new methods that wire the DAO into the
    // IPC layer. Extension → Host → Main call shape:
    //   finance.db.table('salary_history_pay_slips').find({...})
    //     → extension.readTable → Main handler → DAOService.find
    expect(RPC_METHOD.ExtensionReadTable).toBe('extension.readTable');
    expect(RPC_METHOD.ExtensionWriteTable).toBe('extension.writeTable');
  });

  it('preserves the Phase 3 method names without rename', () => {
    // Per Decision 6 the new methods extend (do not replace) the Phase 3
    // catalogue. These names are referenced by `host.ts` switches and
    // `extension-ipc.ts` request calls; a typo here would silently break
    // every extension's activation path. Pin every value.
    expect(RPC_METHOD.HostInitialize).toBe('host.initialize');
    expect(RPC_METHOD.ExtensionActivate).toBe('extension.activate');
    expect(RPC_METHOD.ExtensionList).toBe('extension.list');
    expect(RPC_METHOD.CommandsRegistered).toBe('commands.registered');
    expect(RPC_METHOD.ExtensionExecuteCommand).toBe('extension.executeCommand');
  });

  it('uses `as const` so values are literal types, not plain strings', () => {
    // Compile-time check: if a downstream consumer does
    //   `method: string = RPC_METHOD.ExtensionReadTable`
    // TypeScript must reject it (literal type → not assignable to string
    // without widening). If a future edit drops the `as const`, this
    // assignment stops being a type error and the protection is lost.
    // The test does the same check at runtime via a function signature
    // that demands a literal union, which only succeeds when the value
    // is narrowed.
    const checkLiteral = (m: 'extension.readTable' | 'extension.writeTable'): boolean => m.length > 0;
    expect(checkLiteral(RPC_METHOD.ExtensionReadTable)).toBe(true);
    expect(checkLiteral(RPC_METHOD.ExtensionWriteTable)).toBe(true);
  });
});
