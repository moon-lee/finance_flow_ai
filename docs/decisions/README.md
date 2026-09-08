# Architecture Decision Records

This directory captures important architectural decisions: what was decided, why, and what would trigger revisiting it.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0002](0002-inline-migrations.md) | Inline Migration Runner Instead of Umzug | Accepted | 2026-06-20 |
| [0003](0003-extension-host-transport.md) | Extension Host Transport — `utilityProcess.fork` + JSON-RPC 2.0 | Accepted | 2026-06-30 |
| [0004](0004-extension-entry-bundling.md) | Extension Entry Architecture — Build-Time Bundling | Accepted | 2026-07-03 |
| [0005](0005-domain-service-registry.md) | Cross-Extension Domain Service Registry | Accepted | 2026-07-18 |
| [0006](0006-flat-workspace-layout.md) | Flat Workspace Layout Instead of Split-Tree (2-Pane Split Deferred) | Accepted | 2026-07-31 |
| [0007](0007-local-product-deployment-profile.md) | Local Product Deployment Profile | Accepted | 2026-08-15 |
| [0008](0008-global-event-bus.md) | Global Event Bus (`finance.events.*`) | Accepted | 2026-08-16 |
| [0009](0009-user-extension-installation.md) | User Extension Installation (No Digital Signing) | Accepted | 2026-08-20 |
| [0010](0010-todo-auto-refresh.md) | Todo Auto-Refresh via `db-changed` Fan-Out (Option A) | Accepted | 2026-09-09 |

## Conventions

- ADRs are numbered sequentially (`NNNN-short-name.md`).
- Status values: `Proposed`, `Accepted`, `Deprecated`, `Superseded by NNNN`.
- Each ADR ends with a "Revisit triggers" section so future agents know when to reconsider.
