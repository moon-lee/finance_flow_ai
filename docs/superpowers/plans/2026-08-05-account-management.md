# Phase 7 — Account Management

> **Goal:** Replace the one-off `account-seed-modal` pattern with a formal, Core-owned account management system. By the end of Phase 7, accounts are CRUD-managed through a dedicated workspace view, the first-run gate is Core-owned, and extensions consume accounts through the existing shared-table read path only.

---

## Prerequisites

- Task 0 complete (`OverlayCoordinator` extracted)
- Task 1 complete (Settings workspace view wired; `__settings__` mount path works)
- `accounts` table exists (`003-shared-accounts` migration)
- `financeShell.accounts.create` and `financeShell.accounts.count` bridges exist in both preloads
- `AccountsApi` typed in `finance-shell.d.ts`

---

## Current State Audit

| Layer | File | Behavior |
|---|---|---|
| DB schema | `infrastructure-migration.ts:57-70` | `accounts` table: `id`, `name`, `institution`, `is_active` (default 1), `created_at` |
| Manifest | `shared-data-tables.ts:252-287` | Declares `accounts` as Platform-owned shared table; extensions can read but not write |
| Main IPC | `main.ts:543-567` | `accounts:create` — direct SQL INSERT, validates non-empty name, returns `{ id }` |
| Main IPC | `main.ts:571-574` | `accounts:count` — `SELECT COUNT(*) FROM accounts` |
| Main renderer preload | `preload.ts:11-17` | Exposes `financeShell.accounts.create` and `financeShell.accounts.count` |
| Panel preload | `panel-preload.ts:56-57` | Same two methods exposed inside `WebContentsView` panels |
| Types | `finance-shell.d.ts:93-100` | `AccountsApi` with `create(input)` and `count()` |
| Seed modal | `extensions/salary-history/src/ui/accounts-seed-modal.ts` | Lit element — name/institution inputs, dispatches `account-create` |
| Orchestrator | `extensions/salary-history/src/orchestrator.ts:60-68` | `_resolveSeedView()` checks `accounts.count()` on mount; if 0, shows seed modal |
| Orchestrator | `orchestrator.ts:179-188` | `_onAccountCreate` calls `financeShell.accounts.create`, then navigates to `payslip-form` |
| Bootstrap | `panel-bootstrap.ts:38-40` | Forwards `account-seed-skip` and `account-seed-cancel` to Main via `uiEvent` |

**Verified behaviors:**

- `accounts:create` bypasses the DAO's `SharedTableReadOnly` enforcement deliberately — it's a trusted Core path with input validation (`main.ts:546-552`)
- The seed modal is wired only into `salary-history`'s orchestrator — not a Core-level first-run check
- `notifyOpenDashboardAfterAccountChange()` fires after insert to refresh open Dashboard panels
- No `accounts:update`, `accounts:delete`, or `accounts:list` IPC exists yet
- The `accounts` table has no `account_type`, `opening_balance`, or other richer columns yet

---

## Task 7: Account Management

**What:** Introduce a Core-owned account management workspace view with full CRUD, replace the one-off seed modal with a Core-level first-run gate, and expose a complete `AccountsApi` bridge.

**Why this matters today:** Account creation is currently triggered only by the salary-history extension's first-run seed modal. There is no way to list, edit, or deactivate accounts after creation. The first-run check lives in extension code, so disabling salary-history also disables the only account-creation path. A Core-owned manager makes accounts a first-class platform resource.

**Files to modify:**

- `src/main/main.ts` — add `accounts:list`, `accounts:update`, `accounts:delete` IPC handlers
- `src/types/finance-shell.d.ts` — extend `AccountsApi`
- `src/preload/preload.ts` — expose new `accounts.*` methods
- `src/preload/panel-preload.ts` — expose new `accounts.*` methods inside panels
- `src/renderer/components/navigation-panel.ts` — add Accounts nav item
- `src/renderer/index.ts` — wire `__accounts__` view into workspace
- `src/renderer/components/accounts-manager.ts` — new LitElement for account CRUD
- `extensions/salary-history/src/orchestrator.ts` — remove `_resolveSeedView()` and `_onAccountCreate`/`_onSeedDismiss` seed logic
- `extensions/salary-history/src/ui/accounts-seed-modal.ts` — deleted
- `extensions/salary-history/src/ui/index.ts` — remove modal import
- `extensions/salary-history/package.json` — remove `account-seed-*` from `allowedUiEvents`

**Files created:**

- `src/renderer/components/accounts-manager.ts`
- `tests/unit/main/services/account-management.test.ts`
- `tests/unit/renderer/accounts-manager.test.ts`

---

### Implementation Approach

#### Part A: Extend Core account IPC + preload bridges

Add three new handlers in `src/main/main.ts` beside the existing `accounts:create` and `accounts:count`:

1. `accounts:list` — `SELECT id, name, institution, is_active, created_at FROM accounts ORDER BY created_at DESC`
2. `accounts:update` — `UPDATE accounts SET name=?, institution=?, is_active=? WHERE id=?`; validate `id` exists and `name` is non-empty
3. `accounts:delete` — `DELETE FROM accounts WHERE id=?`; guard against deleting the last active account; warn if referenced by `salary_history_pay_slips.account_id` but allow (historical payslips retain FK)

Expose all four methods (`list`, `create`, `update`, `delete`) plus `count` in both `preload.ts` and `panel-preload.ts`, and update `AccountsApi` in `finance-shell.d.ts`.

#### Part B: Core-level first-run gate

Move the first-run account check from `salary-history`'s orchestrator into Core:

1. In `src/renderer/index.ts`, on `DOMContentLoaded` (or when the workspace first mounts), call `financeShell.accounts.count()`.
2. If count is 0 and no view is active, dispatch `view-changed` to `__accounts__` so the accounts manager opens automatically.
3. This removes the coupling between salary-history activation and account creation. Disabling salary-history no longer blocks first-run onboarding.

#### Part C: Build `accounts-manager.ts`

Create `src/renderer/components/accounts-manager.ts` as a LitElement workspace view:

- **List mode:** renders all accounts as rows with name, institution, active badge, created date, and action buttons (Edit, Deactivate/Activate, Delete)
- **Form mode:** inline edit/create form with name (required), institution (optional), active toggle
- **Empty state:** when `accounts` is empty, show a centered "Create your first account" prompt that opens the form
- **Delete guard:** refuse to delete the last active account with a clear message
- **Data flow:** reads via `financeShell.accounts.list()`, writes via `financeShell.accounts.create/update/delete`
- **Styling:** follow the existing dark Obsidian theme from `layout.css` and the settings-screen pattern

Wire it into the workspace:

- `navigation-panel.ts`: add `{ extensionId: 'core', id: 'accounts', label: 'Accounts', command: '__accounts__', group: 'General' }` to `_coreItems`
- `renderer/index.ts`: in the `view-changed` handler, mount `accounts-manager` into `#workspace` when `view === '__accounts__'`

#### Part D: Remove the one-off seed modal

1. Delete `extensions/salary-history/src/ui/accounts-seed-modal.ts`
2. In `extensions/salary-history/src/ui/index.ts`, remove the `import './accounts-seed-modal.js'` line
3. In `extensions/salary-history/src/orchestrator.ts`:
   - Remove `_resolveSeedView()` (lines 60-68)
   - Remove `_onAccountCreate` (lines 179-188)
   - Remove `_onSeedDismiss` (lines 190-192)
   - Remove the `account-create`, `account-seed-skip`, and `account-seed-cancel` event bindings from `_bindEvents()`
4. In `extensions/salary-history/package.json`, remove `account-seed-skip` and `account-seed-cancel` from `allowedUiEvents`
5. In `src/main/resources/panel-bootstrap.ts`, remove `account-seed-skip` and `account-seed-cancel` from `FORWARDED_EVENTS`

---

### Verification

1. Fresh DB (`rm finance.db` → restart) → app opens Accounts view automatically (Core first-run gate)
2. Accounts view shows empty state with "Create your first account" prompt
3. Create account → row appears in list with active badge and correct timestamps
4. Edit account → name/institution update in place
5. Deactivate account → badge changes to inactive; row remains visible
6. Reactivate account → badge changes back to active
7. Attempt to delete last active account → guard message shown, delete blocked
8. Delete inactive account → row removed
9. Restart app → accounts persist and reload
10. Disable salary-history extension → first-run account gate still works (no dependency on extension)
11. Dashboard + Salary History panels still read `accounts` via `finance.db.table('accounts')` — unaffected
12. New payslip form's account dropdown reflects active/inactive status (if wired to `accounts` table)

---

### Unit Tests

**New tests in `tests/unit/main/services/account-management.test.ts`:**

- `accounts:list returns all accounts sorted by created_at DESC`
- `accounts:create inserts a new account and returns { id }`
- `accounts:create rejects empty name`
- `accounts:update modifies name, institution, and is_active`
- `accounts:update rejects empty name`
- `accounts:delete removes the account`
- `accounts:delete blocks deleting the last active account`
- `accounts:count returns the correct count after create/delete`

**New tests in `tests/unit/renderer/accounts-manager.test.ts`:**

- `renders empty state when no accounts exist`
- `renders account rows with name, institution, active badge, and actions`
- `create account submits form and refreshes list`
- `edit account updates row in place`
- `deactivate/activate toggle works`
- `delete blocks last active account`
- `delete removes inactive account`

Run: `npm run test -- tests/unit/main/services/account-management.test.ts tests/unit/renderer/accounts-manager.test.ts`
Expected: All new tests pass; all existing tests still pass.

---

### Typecheck + lint

Run: `npm run typecheck`
Expected: PASS — no errors.

Run: `npm run lint`
Expected: PASS — no new errors.

---

## Architectural Notes for Future Phases

1. **Account ownership stays Core.** Extensions read via `finance.db.table('accounts')`; all writes go through `financeShell.accounts.*`. No extension ever receives write access to the shared table.
2. **Schema extension point.** When richer account data is needed (`account_type`, `opening_balance`, etc.), extend the `SHARED_TABLE_MANIFESTS.accounts.columns` array in `shared-data-tables.ts` and add a migration. The DAO, preload, and UI layers pick up new columns automatically.
3. **First-run gate is Core's responsibility.** The pattern established here — Core checks `accounts.count()` on first mount and routes to `__accounts__` — is the template for any future shared-resource first-run checks (e.g., default categories, opening balances).
4. **No duplicate event forwarding.** `panel-bootstrap.ts` already documents why the bootstrap-level `account-create` listener was removed. The same rule applies to any future account events: the Core-owned view owns the events, not the panel bootstrap.

---

## Deferred to Phase 8+

- Multi-account selection in payslip form
- Account transfer/link UI
- Account deletion with cascading history preservation policy
- Account import from bank export files
- `account_type` / `opening_balance` schema extensions
