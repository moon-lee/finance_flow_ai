# Architecture Decision Records

This directory captures important architectural decisions: what was decided, why, and what would trigger revisiting it.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0002](0002-inline-migrations.md) | Inline Migration Runner Instead of Umzug | Accepted | 2026-06-20 |
| [0003](0003-extension-host-transport.md) | Extension Host Transport — `utilityProcess.fork` + JSON-RPC 2.0 | Accepted | 2026-06-30 |
| [0004](0004-extension-entry-bundling.md) | Extension Entry Architecture — Build-Time Bundling | Accepted | 2026-07-03 |
| [0005](0005-domain-service-registry.md) | Cross-Extension Domain Service Registry | Accepted | 2026-07-18 |

## Conventions

- ADRs are numbered sequentially (`NNNN-short-name.md`).
- Status values: `Proposed`, `Accepted`, `Deprecated`, `Superseded by NNNN`.
- Each ADR ends with a "Revisit triggers" section so future agents know when to reconsider.
