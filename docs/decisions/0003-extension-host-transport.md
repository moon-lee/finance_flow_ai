# ADR-0003: Extension Host Transport — Electron `utilityProcess.fork` + JSON-RPC 2.0

**Status:** Accepted
**Date:** 2026-06-30
**Context:** Phase 3 — Extension Host & IPC Scaffolding (`docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md`)

## Context

The project vision (`docs/project_vision.md`) requires extensions to execute inside a separate Node.js background process — the Extension Host — with the UI process (Main) and the extension code physically isolated. Phase 3 is the first milestone that introduces this process boundary.

Two architectural choices were tied together:

1. **How to spawn the Extension Host process.** Options considered: Electron `utilityProcess.fork`, Node `child_process.fork`, or run extensions in a hidden BrowserWindow.
2. **What wire format to use for Main ↔ Host traffic.** Options considered: raw `postMessage` with ad-hoc envelopes, JSON-RPC 2.0, or a third-party library.

These choices are interdependent because the spawn mechanism determines the available message primitives.

The vision (`project_vision.md:78`) pins the wire format: *"Desktop Framework — Electron — Security & IPC: Node.js integration disabled in renderers, process isolation via `contextBridge` preload scripts, and IPC communication via Electron `MessagePortMain` / JSON-RPC."* This pins the wire format to JSON-RPC but leaves the spawn mechanism open.

## Decision

Use Electron `utilityProcess.fork(modulePath, args, options)` to spawn the Extension Host. Exchange JSON-RPC 2.0 envelopes over the structured-clone MessagePort that `utilityProcess.fork()` exposes.

Hand-roll a ~50-line envelope helper (`src/extension-host/json-rpc.ts`) rather than pull in `@vscode/jsonrpc` or similar. The protocol surface is small and explicit envelopes double as the contract both processes import.

Bundle the Host entry point (`src/extension-host/host.ts`) to `dist/extension-host/host.js` via a fourth Vite config (`vite.extension-host.config.ts`), externalizing `electron`, `node:*` built-ins, and `better-sqlite3`. This keeps the Host's import graph isolated from Main and Renderer.

## Consequences

- Extensions cannot crash the shell. Killing the `utilityProcess` is detectable via the `'exit'` event and the shell stays alive (verified manually in Phase 3 Test Unit 5).
- Cross-extension access is *structurally* impossible. The vision's "Do Not Break Other Extensions" rule (`project_vision.md:48` — "Direct in-process imports, shared global state, and direct database cross-writes between extensions are strictly forbidden") is enforced by the process boundary, not by convention. Every cross-extension call must flow through `finance.commands.execute()`, which routes through Main.
- Standard JSON-RPC error codes plus a few platform-specific ones are available out of the box: `ParseError`, `InvalidRequest`, `MethodNotFound`, `InvalidParams`, `InternalError`, `ExtensionNotFound`, `ExtensionAlreadyActivated`, `ActivationEventUnknown`.
- One extra Vite build output (`dist/extension-host/host.js`) to maintain. Mitigated by following the established Phase 1 pattern (separate Vite configs per process).
- A protocol violation (Host sending an unsolicited request to Main) is silently dropped in Phase 3. Phase 4+ may add explicit error responses for protocol violations.

## Alternatives considered

- **`child_process.fork` + Node IPC** — simpler conceptually, but no `MessagePort` primitive, no Electron lifecycle integration, no sandbox defaults. Lifecycle management (kill on app quit) becomes manual.
- **Hidden BrowserWindow with `nodeIntegration: true`** — vision-rejected (`project_vision.md` mandates `nodeIntegration: false` in renderers for security).
- **In-process extension execution (`require()` extension code in Main)** — kills crash isolation and violates the vision's "Extension Host is a separate Node.js background process" requirement.
- **`@vscode/jsonrpc` library** — appealing for protocol correctness, but adds a dependency for what is genuinely a thin envelope format.
- **Binary RPC (MessagePack / CBOR)** — premature optimization for Phase 3's traffic volume; text-based JSON-RPC is debuggable in logs.

## Revisit triggers

Reconsider this transport choice when **any** of the following becomes true:

- More than ~50 distinct RPC methods accumulate (hand-rolled envelopes start to feel like an ad-hoc framework).
- Multiple Extension Hosts run concurrently (one per extension, rather than one Host hosting all extensions).
- Extension-to-extension direct calls (without routing through Main) become a requirement.
- Binary payloads exceed a few KB per message (JSON-RPC overhead becomes a bottleneck).
- The Phase 4+ migration to canonical `import * as finance from 'finance'` requires a different module loading strategy.

## Related

- Plan: `docs/superpowers/plans/2026-06-30-phase3-extension-host-ipc.md` (Decisions 1 and 2)
- Code: `src/extension-host/host.ts` (process entry), `src/extension-host/json-rpc.ts` (envelope helpers), `src/main/services/extension-ipc.ts` (Main-side transport)
- Vision: `project_vision.md:78` (transport pinned to JSON-RPC); `project_vision.md:48` (cross-extension rule enforced by this boundary)
- ADR-0002: Inline Migration Runner (precedent for hand-rolled, minimal-dependency approach)
