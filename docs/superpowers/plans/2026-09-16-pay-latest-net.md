# Pay Latest-Net Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `pay.getLatestNet()` to the salary-history public adapter, returning the newest payslip's `{ net, pay_date }`.

**Architecture:** Single method on `createPublicPayAdapter` in `extensions/salary-history/src/services/public-pay-adapter.ts`, mirroring `getLastPayslip`'s sort with a two-field projection. Interface line on `PublicPayService`. No registration, manifest, or consumer changes.

**Tech Stack:** TypeScript strict, Vitest, existing `listPaySlips` DAO.

## Global Constraints

- TypeScript `strict: true`; no implicit `any`.
- Null-on-empty/error, matching every sibling adapter method.
- JSON-safe return only (number + ISO date string).
- No changes to existing methods, registration, manifests, or consumers.

---

### Task 1: Adapter method + interface

**Files:**
- Modify: `extensions/salary-history/src/services/public-pay-adapter.ts`
- Test: `tests/unit/extensions/salary-history/public-pay-adapter.test.ts`

**Interfaces:**
- Consumes: `listPaySlips(finance, {})` from `../dao/pay-slips.js`.
- Produces: `getLatestNet(): Promise<{ net: number; pay_date: string } | null>` on `PublicPayService`, callable via `finance.services.invoke('pay', 'getLatestNet')`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/extensions/salary-history/public-pay-adapter.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/extensions/salary-history/public-pay-adapter.test.ts`
Expected: FAIL with "adapter.getLatestNet is not a function".

- [ ] **Step 3: Add the interface line**

In `extensions/salary-history/src/services/public-pay-adapter.ts`, add to `PublicPayService`:

```ts
  getPayslipStats(): Promise<{ avgGross: number; avgNet: number; avgPayg: number; totalCount: number } | null>;
  getLatestNet(): Promise<{ net: number; pay_date: string } | null>;
```

- [ ] **Step 4: Add the method implementation**

In the same file, add to the object returned by `createPublicPayAdapter` (after `getPayslipStats`):

```ts
    async getLatestNet(): Promise<{ net: number; pay_date: string } | null> {
      try {
        const payslips = (await listPaySlips(finance, {})) as unknown as PublicPaySlip[];
        if (!payslips.length) return null;
        payslips.sort((a, b) => b.pay_date.localeCompare(a.pay_date));
        const latest = payslips[0];
        const net = Number(latest.net ?? NaN);
        if (!Number.isFinite(net)) return null;
        return { net: Math.round(net * 100) / 100, pay_date: latest.pay_date };
      } catch (err) {
        logger.error('getLatestNet failed:', err);
        return null;
      }
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/extensions/salary-history/public-pay-adapter.test.ts`
Expected: 3 passed.

- [ ] **Step 6: Run typecheck and full salary suite**

Run: `npm run typecheck` then `npx vitest run tests/unit/extensions/salary-history`
Expected: typecheck clean, all existing + new tests pass.

- [ ] **Step 7: Commit**

```bash
git add extensions/salary-history/src/services/public-pay-adapter.ts tests/unit/extensions/salary-history/public-pay-adapter.test.ts
git commit -m "feat(pay): getLatestNet adapter method"
```

---

## Self-Review

- **Spec coverage:** API shape (§1) → Steps 3–4; implementation (§2) → Step 4 verbatim; testing & rollout (§3) → Steps 1–2, 5–6. All covered.
- **Placeholder scan:** no TBD/TODO; every step has exact paths, code, commands, expected output.
- **Type consistency:** `{ net: number; pay_date: string } | null` identical in interface, implementation, and tests.
