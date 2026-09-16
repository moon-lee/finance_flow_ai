---
version: 0.1.0
created: 2026-09-16
last_updated: 2026-09-16T12:00:00+10:00
status: approved
---

# Pay Latest-Net Adapter — Design

Consumer-driven addition to the `pay` domain service: expose the newest
payslip's net figure so Budget can show latest net next to average net
for weekly income.

## 1. API shape

`pay.getLatestNet(): Promise<{ net: number; pay_date: string } | null>`

New method on `PublicPayService` in
`extensions/salary-history/src/services/public-pay-adapter.ts`, next to
`getPayslipStats`. Returns the newest payslip's net + date (e.g.
`{ net: 1327.73, pay_date: '2026-09-10' }`), `null` when empty or on
error — same graceful contract as its siblings. No registration,
manifest, or panel changes needed; dispatch is method-name based so
existing consumers (Dashboard, Budget) are untouched.

## 2. Implementation

Single method body in `createPublicPayAdapter`, mirroring
`getLastPayslip`'s sort but projecting to two fields:

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

Plus the interface line on `PublicPayService`. Newest `pay_date` wins;
non-numeric net is treated as missing.

## 3. Testing & rollout

- **Unit test** in `tests/unit/extensions/salary-history/` mirroring the
  existing adapter tests: seeded payslips →
  `getLatestNet()` returns newest `{ net, pay_date }`; empty table →
  `null`.
- **No consumer changes** in this spec — Budget keeps using `avgNet`
  until a follow-up wires latest-net into `incomeWeekly`.
- **Rollout:** Salary rebuilds via the app's `build:extensions`; no
  version bump needed on Budget since the `pay` contract only gains a
  method.

## Self-review

- No placeholders; all paths, methods, and contracts named exactly.
- Consistent: null-on-empty/error matches every sibling method; JSON-safe
  return (number + ISO string); Decision 5 consumer-driven surface.
- Scope: single method + interface line + one test file. No registration,
  manifest, panel, or consumer changes.
- Unambiguous: sort key (`pay_date` desc), rounding (2dp), missing-data
  behavior (null) all explicit.
