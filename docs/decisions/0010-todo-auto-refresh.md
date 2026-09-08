# ADR-0010: Todo Auto-Refresh via `db-changed` Fan-Out (Option A)

**Status:** Accepted
**Date:** 2026-09-09
**Context:** Dashboard todo-summary card (v1.0.4) showed stale counts until manual `dashboard.refresh`, because `finance.services.invoke('todo-list','counts')` is request/response with no change notification.

## Context

The dashboard's `buildAggregator` calls `invoke('todo-list','counts')` once per activation/refresh. Todo mutations (add/toggle/rename/delete/clear) write to `todo_list_items` through the owner's DAO and emit nothing, so the mounted dashboard card goes stale. Two transports were evaluated:

- **Option A (chosen): core `db-changed` fan-out.** Core publishes `{ extensionId, table, op }` on the global bus from `handleWriteTable` — the single choke point ALL writes funnel through (Host commands via `requestMain(ExtensionWriteTable)`; panel UI via `extensions:write-table` IPC → Host → Main). Dashboard subscribes Host-side, filters to `todo_list_items`, debounces, rebuilds, silent-pushes.
- **Option B (rejected): panel `ui-event` relay.** Would need a new view CustomEvent + bootstrap `FORWARDED_EVENTS` entry + manifest `allowedUiEvents` entry + teaching Host's `extension.ui-event` branch (today log-only) to publish — 4 files across 3 processes, plus a silent-drop allowlist failure mode. More moving parts for the same outcome.

## Decision

1. **Fill the ADR-0008 gap:** add `handleEventPublish` + `case RPC_METHOD.EventPublish` in `dispatchHostRequest` (previously `Unknown method from Host`).
2. **Fan-out on write:** `handleWriteTable` publishes `db-changed` after a successful write (fire-and-forget; never fails the write). Documented in `src/types/finance.d.ts` alongside existing core topics.
3. **Silent push channel:** new `extension.ui-push` RPC + Host `finance.ui.pushData(viewId, mountData)` (optional on all surfaces) + `ExtensionIPC.handleUiPush` → `onDataPush` UI-handler slot (optional) → `WebviewPanelManager.pushMountData` which sends `panel:mount-update` WITHOUT `showPanel` (no focus steal). Wired in both `main.ts` `setUIHandler` registrations. Panel bootstrap gets a warn-stub `pushData` so panel-side `?.` calls typecheck.
4. **Dashboard consumer:** Host-side `subscribeTodoRefresh` in `extensions/dashboard/src/main.ts` — filters `TODO_REFRESH_TABLES = {'todo_list_items'}`, 300 ms debounce, `rebuildAndPush` via `pushData('dashboard-view', freshMountData)`; unsubscribe + timer clear in `deactivate()`. Guarded by `finance.events?.on` (panels have no events surface).
5. **No changes to the external `todo-list` extension.** It is a separate project; the core fan-out covers its writes regardless of origin.
6. **Test alias fix:** `vitest.config.ts` gains the `finance-logger` alias mirroring `vite.extensions.config.ts`, fixing the pre-existing `orchestrator.test.ts` suite failure (also unblocks the new `todo-auto-refresh.test.ts`).

## Consequences

**Positive:**

- Todo card updates within ~300 ms of any mutation, user stays on the Todo List view.
- Zero coupling: dashboard doesn't import todo code; todo doesn't know dashboard exists.
- Unrelated writes (salary, accounts) never trigger a rebuild (table filter).
- Writes never fail due to eventing (publish is post-commit, guarded).

**Negative / costs:**

- Every extension-table write now publishes one bus event (local, in-process fan-out — negligible at single-user scale).
- `pushMountData` to a lazily-unmounted dashboard panel returns `false` and drops (by design — next mount rebuilds fresh).

## Revisit triggers

- A second consumer wants a different table → extend `TODO_REFRESH_TABLES`-style filter sets per consumer (no core change).
- Push volume becomes a problem (many writers) → add per-table subscription filtering in Main instead of in-consumer filtering.
- Panel-side `finance.events` becomes real → dashboard could subscribe in-panel too; Host subscription remains the source of truth (real `services.invoke`).

## Related

- ADR-0005: Domain Service Registry (`invoke` contract used by the card)
- ADR-0008: Global Event Bus (the bus this fills a route into)
- Code: `src/main/services/extension-ipc.ts` (`handleEventPublish`, `handleWriteTable` fan-out, `handleUiPush`), `src/main/services/webview-panel-manager.ts` (`pushMountData`), `src/shared/json-rpc-methods.ts` (`ExtensionUiPush`), `src/extension-host/api/ui.ts` (`pushData`), `extensions/dashboard/src/main.ts` (subscribe/rebuild/push)
- Tests: `tests/unit/main/services/extension-ipc-db-changed.test.ts`, `tests/unit/extensions/dashboard/todo-auto-refresh.test.ts`
