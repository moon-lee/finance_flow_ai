/**
 * The `finance` aggregate API surface extensions import.
 *
 * Phase 4 split: commands and ai remain module-level singletons (they
 * have no per-extension state — any extension can execute any command,
 * any extension can register a tool). `db` is now per-extension because
 * the DAO's namespace enforcement (Decision 1) is keyed on the calling
 * extension's id. Use `createFinance(extensionId, rpc)` to build a
 * per-extension `FinanceApi` that bundles a db accessor bound to that
 * extension.
 *
 * The `finance` singleton is kept for code paths that need only the
 * cross-cutting surfaces (commands / ai) without a caller-bound db —
 * currently the Host's `extension.executeCommand` proxy handler
 * (host.ts). Extension code never sees the singleton; it always
 * receives the per-extension `FinanceApi` as the `activate(finance)`
 * parameter (see host.ts#activateExtension).
 */

import * as commandsApi from './commands';
import * as aiApi from './ai';
import { createDb, type DbAccessor, type DbRpcClient } from './db';
import { createServices, type ServicesApi } from './services';
import { createUi, type UiApi, type RpcClient } from './ui';
import { RPC_METHOD } from '../../shared/json-rpc-methods';

// ---------------------------------------------------------------------------
// Per-extension factory
// ---------------------------------------------------------------------------

/**
 * Build the `finance` API surface for one specific extension. Pass the
 * result to `activate(finance)` so extension code can call
 * `finance.db.table(...).find(...)` etc. with the caller's id bound
 * at construction time (the DAO service in Main uses this id to
 * enforce namespace isolation per Decision 1).
 *
 * @param extensionId The id of the extension that will receive this
 *                    `FinanceApi` (e.g. `'salary-history'`).
 * @param rpc         The Host→Main RPC client. Production passes a
 *                    wrapper around `requestMain` from host.ts; tests
 *                    pass a stub.
 */
export function createFinance(extensionId: string, rpc: DbRpcClient & RpcClient): FinanceApi {
  const services = createServices(extensionId, rpc);
  const ui = createUi(extensionId, rpc);
  return {
    db: createDb(extensionId, rpc),
    commands: {
      registerCommand: commandsApi.registerCommand,
      execute: commandsApi.executeCommand
    },
    ai: {
      registerTool: aiApi.registerTool
    },
    services,
    ui,
    settings: {
      get: async (key: string) => {
        const res = (await rpc.request(RPC_METHOD.ExtensionGetSetting, { extensionId, key })) as {
          value: unknown;
        };
        return res.value;
      },
      set: (key: string, value: unknown) =>
        rpc.request(RPC_METHOD.ExtensionSetSetting, { extensionId, key, value })
    }
  };
}

// ---------------------------------------------------------------------------
// Singleton (commands + ai only)
// ---------------------------------------------------------------------------

/**
 * Module-level `finance` singleton for code paths that do not need a
 * per-extension db binding (e.g. the Host's `extension.executeCommand`
 * proxy handler in host.ts). Extension code never accesses this
 * directly; it always uses the per-extension object passed to its
 * `activate(finance)` parameter.
 *
 * `db` is intentionally omitted: there is no "current extension"
 * context at the module level, so calling `finance.db.table(...)` from
 * here would have no caller id to bind. The per-extension
 * `createFinance` factory is the only supported way to get a db
 * accessor.
 */
export const finance = {
  commands: {
    registerCommand: commandsApi.registerCommand,
    execute: commandsApi.executeCommand
  },
  ai: {
    registerTool: aiApi.registerTool
  }
} as const;

// ---------------------------------------------------------------------------
// Public type contract
// ---------------------------------------------------------------------------

/**
 * The full `FinanceApi` shape extensions consume. Mirrors the shape
 * declared in `src/types/finance.d.ts` (the canonical `FinanceApi`
 * type for extension authors). Kept structurally compatible so the
 * type-only SDK (Phase 4 Decision 9) matches what `createFinance`
 * actually returns.
 */
export interface FinanceApi {
  db: DbAccessor;
  commands: {
    registerCommand: typeof commandsApi.registerCommand;
    execute: typeof commandsApi.executeCommand;
  };
  ai: {
    registerTool: typeof aiApi.registerTool;
  };
  services: ServicesApi;
  /**
    * Phase 5 Task 2.7 — extension UI surface: requestMount, setDirty,
    * autoSaveDraft, onBeforeUnmount. Optional for legacy/test mocks.
    */
  ui?: UiApi;
  /**
    * Phase 4 Task 16 — extension-scoped settings read/write. Keys are
    * namespace-prefixed by Main (`<extensionId>.`), so an extension can
    * only touch its own settings. Optional for the same reason as `ui`.
    */
  settings?: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
}
