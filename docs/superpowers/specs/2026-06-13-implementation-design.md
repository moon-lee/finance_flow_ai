---
title: Finance Flow AI - Implementation Design
date: 2026-06-13
status: active
---

# Implementation Design

## Architecture Approach

**Vertical Slice Model**: Complete a working Salary History (first extension) before building other extensions. Each extension owns its private data tables with no cross-extension dependencies initially.

## Implementation Phases (Sequential, Each Delivers Working Software)

### ✅ Phase 1: Core Shell Prototype (Complete — 0.5 Days)
- Electron scaffold with Activity Bar, Navigation Panel, Workspace tabs, AI Panel
- Mock static layout to validate UI/UX before wiring logic
- **Deliverable**: Bootable Electron app with styled panels and static Command Palette

### Phase 2: Database & Settings Backbone (Est: 2 – 3 Days)
- SQLite connection with infrastructure tables only (extension registry, migration log, settings)
- Settings service: app-wide preferences, window state, theme
- **Deliverable**: App persisting UI preferences and loading last window state

### Phase 3: Extension Host & IPC Foundation (Est: 5 – 7 Days)
- Spawn isolated Node.js child process for extensions
- MessagePortMain/IPC communication channel
- Manifest parser reading `package.json` contributions
- **Deliverable**: Extension loader spawning process successfully

### Phase 4: Salary History Extension (Vertical Slice) + Domain Services (Est: 4 – 6 Days)
- Shared Financial Data schemas: Accounts, PaySlips, Deductions
- `finance.db.table()` API for typed table access (no raw SQL)
- **Domain Services:** PayService for payslip validation/aggregation, DeductionService for work-related expense tracking
- Extension UI: payslip entry form, salary history list, deduction tracking
- **Deliverable**: Fully functional salary history UI with persistent storage

### Phase 5: WebviewPanels & Multi-Extension UI (Est: 4 – 6 Days)
- Split-screen support, tab management
- Dashboard extension (aggregator, reads Shared Data via Domain Services)
- Navigation providers for sidebar trees
- **Deliverable**: Multiple tabs with live charts in Dashboard, Domain Services consumed consistently

### Phase 6: AI Assistant (Deferred until Phase 5 Complete) (Est: 3 – 5 Days)
- Ollama integration (default local only)
- Context building from Shared Financial Data
- Tool registry for extension-registered functions
- **Deliverable**: Chat panel with read-only data queries to local LLM

### Phase 7: Production Polish (Est: 3 – 4 Days)
- Database migrations, backup/restore, encryption
- Keyboard shortcuts, customizable settings
- Theme system, accessibility
- **Deliverable**: Stable release with backup/export capability

### Phase 8: Extension Ecosystem (Est: 3 – 5 Days)
- Extension packaging tooling (`finance.d.ts` type definitions)
- Dependency resolution, version management, digital signing
- **Deliverable**: Published extension SDK and installer

## Development Time Estimation

Based on a single full-time developer or agent working sequentially, the project is estimated to take **6 to 8 weeks (30 to 43 business days)**, including a buffer for integration testing and platform-specific compilation checks.

| Phase | Deliverable | Est. Time | Complexity |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Core Shell Prototype | 1.5 – 2 Days | Low |
| **Phase 2** | Database & Settings Backbone | 2 – 3 Days | Medium |
| **Phase 3** | Extension Host & IPC Foundation | 5 – 7 Days | High |
| **Phase 4** | Salary History Extension (Slice) | 4 – 6 Days | Medium |
| **Phase 5** | WebviewPanels & Multi-Extension UI | 4 – 6 Days | High |
| **Phase 6** | AI Assistant (Local-first) | 3 – 5 Days | Medium |
| **Phase 7** | Production Polish & Encryption | 3 – 4 Days | Medium |
| **Phase 8** | Extension Ecosystem & SDK | 3 – 5 Days | High |
| **Buffer** | Integration, build debugging, platform adjustments | 4 – 5 Days | - |
| **Total** | **Sleek Desktop Finance Workspace** | **30 – 43 Days** | **High** |

### Key Complexity & Risk Drivers
- **Multi-Process IPC Boundary (Phase 3 & 5)**: Routing JSON-RPC requests across isolated Node process wrappers and sandboxed Webview iframes.
- **Dynamic Split layouts (Phase 5)**: Managing dynamic UI pane state without restarting iframe browser threads.
- **Cross-Platform Installers (Phase 8)**: Handling code-signing certificates and platform installers for Windows and macOS.


## Key Technical Decisions

- **No raw SQL in extensions** - only `finance.db.table('name').find()/insert()/update()` to enforce security boundaries
- **Graceful degradation** - missing extensions return `null`, never throw or crash
- **Shared Data ownership** - Platform layer owns Accounts/Transactions/Categories, extensions have read-only access
- **AI deferred** - no cloud providers until Phase 6; local-first with opt-in only

## Success Criteria

Each phase completes with:
1. Working Electron app that boots without errors
2. TypeScript compiles in strict mode
3. All existing tests pass
4. Deliverable matches specification above