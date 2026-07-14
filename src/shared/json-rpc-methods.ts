/**
 * Canonical catalogue of JSON-RPC method names used by Main and the
 * Extension Host.
 *
 * Per Phase 4 plan Decision 6, this module is the single source of truth
 * for every method name that crosses the Main↔Host boundary. Both
 * `src/main/services/extension-ipc.ts` (which initiates requests from
 * Main) and `src/extension-host/host.ts` (which handles them on the Host
 * side) import from here so a typo on one side surfaces as a compile
 * error instead of a silently dropped request at runtime.
 *
 * The `as const` declaration narrows each value to a literal type.
 * Consumers that want to gate on a specific method (e.g. a TypeScript
 * exhaustive switch) get compile-time enforcement that no string was
 * mistyped; a value like `RPC_METHOD.ExtensionReadTable` cannot be
 * assigned to a plain `string` without explicit widening.
 *
 * Phase 4 additions over the Phase 3 catalogue:
 *   - `extension.readTable` / `extension.writeTable` (Decision 6):
 *     Extensions reach the DAO via these two RPC methods. Read covers
 *     find/findOne/count; write covers insert/update/delete. The two
 *     methods are split (vs a single `dbCall`) so the audit log
 *     distinguishes reads from writes and so a Phase 5 hardening pass
 *     can gate them independently.
 */

export const RPC_METHOD = {
  // Phase 3 methods (preserved verbatim — handlers in host.ts still
  // dispatch on these literal strings).
  HostInitialize: 'host.initialize',
  ExtensionActivate: 'extension.activate',
  ExtensionList: 'extension.list',
  CommandsRegistered: 'commands.registered',
  ExtensionExecuteCommand: 'extension.executeCommand',

  // Phase 4 additions (Decision 6).
  ExtensionReadTable: 'extension.readTable',
  ExtensionWriteTable: 'extension.writeTable',

  // Phase 4 Task 14 — UI mount channel. An extension requests that Main
  // (which forwards to the Renderer) mount one of its custom elements. The
  // Host has no DOM, so the mount can only be realised in the Renderer.
  ExtensionUiMount: 'extension.ui-mount',

  // Phase 4 Task 14 — UI event back-channel (Decision 12). The Renderer
  // pushes a component-emitted CustomEvent name + detail back to the Host
  // so the extension can react (e.g. re-render, refresh a list).
  ExtensionUiEvent: 'extension.ui-event',

  // Phase 4 Task 16 — extension-scoped settings. The settings service lives
  // in Main (Phase 2), so the extension (running in the Host) reaches it
  // over the same Host→Main RPC boundary.
  ExtensionGetSetting: 'extension.getSetting',
  ExtensionSetSetting: 'extension.setSetting',
} as const;

export type RpcMethodName = (typeof RPC_METHOD)[keyof typeof RPC_METHOD];
