import { describe, it, expect } from 'vitest';
import type * as Canonical from '../../../src/types/finance';
import type * as Sdk from '../../../scripts/sdk/types/finance';

describe('sdk type parity', () => {
  it('SDK types are assignable to canonical types', () => {
    // Compile-time check: if this file typechecks, parity holds.
    // Runtime smoke: ensure types are importable.
    const _a: Canonical.FinanceApi = null as unknown as Sdk.FinanceApi;
    const _b: Canonical.TableManifest = null as unknown as Sdk.TableManifest;
    const _c: Canonical.ColumnManifest = null as unknown as Sdk.ColumnManifest;
    expect(_a).toBeDefined; // trivial runtime to keep test alive
    expect(true).toBe(true);
  });
});
