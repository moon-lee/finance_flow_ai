# ADR-0005: Cross-Extension Domain Service Registry

**Status:** Accepted
**Date:** 2026-07-18
**Context:** Phase 5 — Webview Panels, Multi-Extension UI & Cross-Extension Services (`docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md`, Decision 5).

## Context

`docs/project_vision.md:107-117` establishes a **Domain Services** layer — business logic that must be shared consistently across extensions (e.g., `TransactionService`, `AccountService`, `CategoryService`, and a `PayService` that later consumers need). Phase 4 shipped `PayService` as an **internal helper** inside the `salary-history` extension (`extensions/salary-history/src/services/pay-service.ts`) with an explicit deferral to Phase 5:

> "The `finance.services.*` cross-extension contract **does not exist** in Phase 4 — the spec lists PayService as a Phase 4 deliverable but `finance.services.*` is a Phase 5 architectural decision... The cross-extension contract lands when a second consumer needs it." — Phase 4 plan Decision 5

Phase 5 introduces the **Dashboard** extension as the first consumer of salary-history data. The Dashboard is an **Aggregator Extension** that reads Shared Financial Data (`accounts`) and reads Salary History data via a public service contract. This ADR records how the cross-extension service contract is implemented.

Three questions had to be answered:

1. **Where does the registry live?** The registry must outlive any single extension's lifecycle (an extension can crash or be disabled while another extension still tries to call its service).
2. **What is the wire shape?** The contract must avoid an explosion of JSON-RPC methods as the number of services grows.
3. **How is the public surface designed?** Phase 4 explicitly mandated designing the contract **from the consumer side** (Dashboard's needs), not deriving it from `PayService`'s internal shape.

## Decision

Implement a **Domain Service Registry** as a Core singleton in the Main process (`src/main/services/domain-service-registry.ts`). Extensions register service implementations via the Host-side `finance.services.register(serviceName, impl)` API, which forwards to Main. Extensions call services via `finance.services.invoke(serviceName, method, params)`, which Main routes to the most recently activated registered implementation.

### Registry shape

```ts
class DomainServiceRegistry {
  register(serviceName: string, extensionId: string, impl: DomainServiceImpl): void;
  unregister(serviceName: string, extensionId: string): void;
  invoke(serviceName: string, method: string, params: unknown, callerExtensionId: string): Promise<unknown>;
}
```

- Multiple extensions may register under the same `serviceName`. Resolution is by `serviceName`; the **most recently activated** extension's implementation wins for that name.
- A disabled extension's implementation is automatically unavailable because its activation (and therefore its `register` call) is gated by `extensionRegistry.isEnabled()`. Calling a missing service returns `null` (graceful degradation per `project_vision.md:48`).
- A service call that throws returns `null`; the error is logged but not propagated to the caller.

### Wire shape

A single JSON-RPC method handles all domain-service traffic:

- Method: `domain.service.invoke`
- Request params: `{ callerExtensionId, serviceName, method, params }`
- Response: `{ result }` (success) or typed error `{ error: { code, message, data } }`
- Error code: `ServiceNotFound` (-32014) if no implementation is registered.

This keeps the JSON-RPC catalogue small as services are added. Type safety is enforced at the TypeScript layer via the `FinanceApi.services` interface.

### Phase 5 public surface (`finance.services.pay.*`)

The first service is `pay`, registered by the `salary-history` extension. Its public surface is designed from **what the Dashboard extension needs**:

```ts
export interface PublicPayService {
  getYearToDateSummary(financialYearStart: string, asOfDate?: string): Promise<YtdSummary | null>;
  getMonthlySeries(financialYearStart: string): Promise<MonthlyPoint[] | null>;
  getLastPayslip(): Promise<PaySlip | null>;
  getCurrentRate(): Promise<RateRow | null>;
}
```

Each method is implemented by the `extensions/salary-history/src/services/public-pay-adapter.ts` module, which wraps the internal `PayService` and returns JSON-safe values.

## Consequences

**Positive:**

- Extensions can share domain logic without direct in-process imports, satisfying `project_vision.md:48`.
- The registry lives in Main, so it survives Host crashes and re-spawns.
- A single JSON-RPC method keeps the protocol catalogue small.
- The public contract is consumer-driven (Dashboard), not derived from internal helper methods.
- `null` returns on missing services make callers degrade gracefully.

**Negative / costs:**

- All service calls are async (JSON-RPC). Synchronous services are not supported.
- "Most recently activated wins" is order-dependent; two extensions registering the same `serviceName` could produce surprising behaviour.
- A service call that throws returns `null`, which may hide real bugs if callers do not log the absence of expected data.

## Alternatives considered

- **Typed per-service JSON-RPC methods** (`domain.pay.getYearToDateSummary`, `domain.budget.getSummary`, etc.). Rejected because the method catalogue would grow linearly with the number of services and methods.
- **Direct extension-to-extension Host calls.** Rejected — violates `project_vision.md:48` ("Direct in-process imports, shared global state, and direct database cross-writes between extensions are strictly forbidden").
- **Reuse `finance.commands.execute` for services.** Rejected because commands are fire-and-forget user actions; services are request/response programmatic calls with different error-handling and audit needs.
- **Expose the internal `PayService` directly as `finance.services.pay.*`.** Rejected per Phase 4 Decision 5's design note: the public surface is designed from the consumer side, not derived from the internal helper.

## Revisit triggers

Reconsider this design when **any** of the following becomes true:

- Two extensions register the same `serviceName` with conflicting semantics and the "most recently activated wins" rule becomes a problem. Likely trigger: Phase 8 marketplace with competing extensions implementing the same service.
- An extension needs synchronous service calls (sub-millisecond latency). The JSON-RPC layer forces async; a same-process fast path may be needed.
- Service versioning is required (e.g., `pay` v1 vs v2).
- The registry becomes a hot path (>1000 calls/sec). A per-call cache keyed on `(serviceName, method, params)` may be warranted.

## Related

- Plan: `docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md` (Decision 5, Task 7, Task 8, Task 9)
- Code (planned): `src/main/services/domain-service-registry.ts`, `src/extension-host/api/services.ts`, `extensions/salary-history/src/services/public-pay-adapter.ts`
- Vision: `project_vision.md:107-117` (Domain Services layer); `project_vision.md:48` (Do Not Break Other Extensions)
- ADR-0003: Extension Host Transport (the JSON-RPC layer used by the registry)
- ADR-0004: Extension Entry Architecture (the bundled extensions that host the service implementations)
